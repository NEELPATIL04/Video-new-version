"use client";

import { useCallback, useEffect, useState } from "react";

// Scopes every DOM query below to the call's own root element rather than
// the whole document — LiveKitRoom always renders `data-lk-theme` on its
// wrapping div (see CallRoom.tsx's `data-lk-theme="default"` prop), so
// this can never accidentally grab a stray <video> elsewhere on the page.
const CALL_ROOT_SELECTOR = "[data-lk-theme]";

// VideoTrack — the primitive every participant tile in VideoConference's
// GridLayout/FocusLayout is built on (confirmed by reading the actual
// shipped source, node_modules/@livekit/components-react/src/components/
// participant/VideoTrack.tsx, not just its .d.ts) — renders a bare
// <video> tagged with this class by components-core's own
// setupMediaTrack() (`${cssPrefix}-participant-media-video`, cssPrefix
// being "lk" — see components-core/src/constants.ts), plus
// data-lk-source/data-lk-local-participant attributes. That's a stable,
// SDK-owned hook to find real call video elements by, instead of a blind
// `document.querySelectorAll("video")` that could also match some
// unrelated element.
//
// There is no cleaner way to get here: VideoConference doesn't expose a
// ref, a hook, or any prop for "the currently focused/local video
// element" — it owns GridLayout/FocusLayout internally and renders
// VideoTrack itself, so a DOM query scoped by the SDK's own class/data
// attributes is the pragmatic, documented fallback (see FEATURES.md's
// Research notes for this feature).
const VIDEO_SELECTOR = "video.lk-participant-media-video";

/**
 * Whether this browser can do native Picture-in-Picture at all. Exported
 * standalone (not inlined in the component) so it's a plain function that
 * can be exercised in isolation, e.g. from a test. Browser support here is
 * real and inconsistent — see FEATURES.md's Research notes:
 *   - Chromium (Chrome/Edge): full support, `document.pictureInPictureEnabled`
 *     is `true` and stays accurate.
 *   - Firefox (72+): supports the same standard API and also sets
 *     `document.pictureInPictureEnabled`.
 *   - Safari (macOS 13.1+): supports `HTMLVideoElement.requestPictureInPicture()`
 *     too, but doesn't reliably expose `document.pictureInPictureEnabled` —
 *     a per-video capability check (`webkitSupportsPresentationMode`) would
 *     be needed to detect it there, and Safari isn't part of this
 *     project's e2e matrix (`playwright.config.ts` runs Chromium only), so
 *     that path is deliberately left as "control hides, doesn't crash"
 *     rather than a maintained webkit-specific code path — see the
 *     Research notes entry for the full reasoning.
 *   - Any browser embedded via an iframe with a restrictive
 *     `Permissions-Policy: picture-in-picture` also reports `false` here,
 *     which is exactly the case this flag exists to catch.
 */
export function isPictureInPictureSupported(): boolean {
  return typeof document !== "undefined" && document.pictureInPictureEnabled === true;
}

// Not every <video> in the grid is worth popping out — this picks the one
// worth watching while the tab is in the background:
//  1. Only considers elements with actual decoded frames (readyState/
//     videoWidth), skipping a tile whose track hasn't attached yet.
//  2. Prefers a REMOTE participant's video over the local camera preview —
//     the local tile is the one thing you already know looks like ("you"),
//     the whole point of PiP is watching everyone else while multitasking.
//  3. Among ties (e.g. a full grid with nobody pinned), picks whichever is
//     currently rendered largest on screen — that matches whatever layout
//     VideoConference is currently using (grid vs. a manually pinned
//     focus) without this component needing to know which one is active.
function findPipCandidate(): HTMLVideoElement | null {
  const root = document.querySelector(CALL_ROOT_SELECTOR);
  if (!root) return null;

  const videos = Array.from(root.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR)).filter(
    (video) => video.readyState >= 2 && video.videoWidth > 0,
  );
  if (videos.length === 0) return null;

  const remote = videos.filter((video) => video.getAttribute("data-lk-local-participant") !== "true");
  const pool = remote.length > 0 ? remote : videos;

  return pool.reduce((largest, candidate) => {
    const candidateArea = candidate.clientWidth * candidate.clientHeight;
    const largestArea = largest.clientWidth * largest.clientHeight;
    return candidateArea > largestArea ? candidate : largest;
  });
}

// Floating control, rendered for every participant (not host-gated) —
// picture-in-picture is a personal viewing preference, not a call-wide
// action, the same category as BackgroundEffectsControl/
// NoiseCancellationControl rather than MeetingLockControl. No
// dynamic()/ssr:false import needed here (unlike those two — see
// CallRoom): this only calls standard browser DOM/PiP APIs directly at
// click time, there's no third-party WASM/worker dependency touching
// browser-only globals at import time.
export function PictureInPictureControl() {
  const [supported] = useState(() => isPictureInPictureSupported());
  // Lazily reads any already-active PiP state at mount (e.g. after a fast
  // refresh during development) — computed in the initializer rather than
  // set from inside the effect below, so the effect only ever subscribes
  // to future changes instead of also synchronously updating state on
  // its first run.
  const [active, setActive] = useState(
    () => typeof document !== "undefined" && document.pictureInPictureElement != null,
  );
  const [error, setError] = useState<string | null>(null);

  // The browser can leave PiP on its own — the user closes the floating
  // window directly, or the tab navigates/reloads — without this
  // component's own button ever being clicked again. Listening at the
  // document level (capture phase — these two events don't bubble, but
  // capture still traverses down to the target regardless of that) keeps
  // `active` from drifting out of sync with reality.
  useEffect(() => {
    if (!supported) return;

    const handleEnter = () => setActive(true);
    const handleLeave = () => setActive(false);
    document.addEventListener("enterpictureinpicture", handleEnter, true);
    document.addEventListener("leavepictureinpicture", handleLeave, true);
    return () => {
      document.removeEventListener("enterpictureinpicture", handleEnter, true);
      document.removeEventListener("leavepictureinpicture", handleLeave, true);
    };
  }, [supported]);

  const handleToggle = useCallback(async () => {
    setError(null);
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }

      const video = findPipCandidate();
      if (!video) {
        setError("No active video to show yet — turn on a camera or wait for someone to join.");
        return;
      }
      if (video.disablePictureInPicture) {
        setError("Picture-in-picture is disabled for this video.");
        return;
      }

      await video.requestPictureInPicture();
    } catch (err) {
      // A real, user-visible failure mode, not a hypothetical one: the OS
      // or browser can refuse this call for reasons outside this app's
      // control (another PiP window already open, a permissions policy
      // blocking it, the tab losing focus at the wrong moment) — surface
      // it rather than let the click silently do nothing, matching how
      // BackgroundEffectsControl/NoiseCancellationControl handle their
      // own runtime failure modes.
      console.error("Picture-in-picture failed", err);
      setError("Couldn't open picture-in-picture. Your browser may have blocked it.");
    }
  }, []);

  // document.pictureInPictureEnabled can be false for reasons entirely
  // outside this app's control (older Firefox/Safari, an iframe embed
  // with a restrictive Permissions-Policy) — say so rather than vanish
  // with zero explanation, same pattern as BackgroundEffectsControl/
  // NoiseCancellationControl's own unsupported-browser case.
  if (!supported) {
    return (
      <div className="absolute bottom-4 left-4 z-10 bg-black/80 text-white rounded p-3 text-xs w-56">
        Picture-in-picture isn&apos;t supported in this browser.
      </div>
    );
  }

  return (
    <div
      data-testid="picture-in-picture-control"
      className="absolute bottom-4 left-4 z-10 bg-black/80 text-white rounded p-3 text-sm"
    >
      <button type="button" onClick={handleToggle} className="text-xs underline">
        {active ? "Exit picture-in-picture" : "Picture-in-picture"}
      </button>
      {error && <p className="text-xs text-red-400 mt-2 w-48">{error}</p>}
    </div>
  );
}
