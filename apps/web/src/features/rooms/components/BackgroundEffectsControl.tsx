"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import type { LocalVideoTrack } from "livekit-client";
import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
  type BackgroundProcessorWrapper,
  type SwitchBackgroundProcessorOptions,
} from "@livekit/track-processors";
import { BACKGROUND_PRESETS } from "../backgroundEffects";

type Selection = { mode: "none" } | { mode: "blur" } | { mode: "image"; imagePath: string };

// Per-participant, purely local effect — everyone controls their own
// camera, so unlike HostControls this renders for every participant, not
// just the host. Rendered via a client-only dynamic import (see CallRoom)
// since @livekit/track-processors pulls in MediaPipe's WASM segmentation
// model, which touches browser-only APIs and is heavy enough that it's
// not worth bundling into the initial page load for everyone regardless.
export function BackgroundEffectsControl() {
  const { cameraTrack } = useLocalParticipant();
  const [supported] = useState(() => supportsBackgroundProcessors());
  const [selection, setSelection] = useState<Selection>({ mode: "none" });
  const [error, setError] = useState<string | null>(null);
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);

  // Re-applies whatever's currently selected whenever the camera track
  // becomes available — covers both the initial publish and a
  // re-publish after toggling the camera off and back on, and lets
  // someone pick an effect before their camera is even on.
  useEffect(() => {
    const track = cameraTrack?.track as LocalVideoTrack | undefined;
    if (!track || !supported) return;

    (async () => {
      try {
        if (selection.mode === "none") {
          if (processorRef.current) {
            await track.stopProcessor();
            processorRef.current = null;
          }
          setError(null);
          return;
        }

        const options: SwitchBackgroundProcessorOptions =
          selection.mode === "blur"
            ? { mode: "background-blur", blurRadius: 10 }
            : { mode: "virtual-background", imagePath: selection.imagePath };

        if (!processorRef.current) {
          processorRef.current = BackgroundProcessor(options);
          await track.setProcessor(processorRef.current);
        } else {
          await processorRef.current.switchTo(options);
        }
        setError(null);
      } catch (err) {
        // The segmentation model loads from a CDN at runtime
        // (@mediapipe/tasks-vision) — this fails on a blocked/unreachable
        // network without ever throwing anywhere else visible, so surface
        // it here rather than let the effect silently do nothing.
        console.error("Background effect failed to apply", err);
        setError("Couldn't load background effects — check your connection and try again.");
      }
    })();
  }, [cameraTrack, selection, supported]);

  // Not every browser supports the insertable-streams/WebGL path this
  // needs — say so rather than vanish with zero explanation.
  if (!supported) {
    return (
      <p className="text-xs text-secondary">
        Background effects aren&apos;t supported in this browser.
      </p>
    );
  }

  const isSelected = (candidate: Selection) =>
    candidate.mode === selection.mode &&
    (candidate.mode !== "image" || (selection as { imagePath: string }).imagePath === candidate.imagePath);

  // Ember marks the currently-selected preset — an active/selected state,
  // the same rule used everywhere else in this UI (previously font-weight
  // only, with no color at all).
  const optionClass = (selected: boolean) =>
    `text-xs underline ${selected ? "text-ember" : ""}`;

  return (
    <div className="text-sm">
      <p className="font-medium mb-2">Background</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSelection({ mode: "none" })} className={optionClass(isSelected({ mode: "none" }))}>
          None
        </button>
        <button onClick={() => setSelection({ mode: "blur" })} className={optionClass(isSelected({ mode: "blur" }))}>
          Blur
        </button>
        {BACKGROUND_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => setSelection({ mode: "image", imagePath: preset.imagePath })}
            className={optionClass(isSelected({ mode: "image", imagePath: preset.imagePath }))}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
