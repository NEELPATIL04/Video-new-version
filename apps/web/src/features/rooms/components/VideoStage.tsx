"use client";

import { RoomEvent, Track } from "livekit-client";
import {
  ControlBar,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipantInfo,
  useTracks,
} from "@livekit/components-react";
import { Hand } from "lucide-react";
import { isHandRaised, RaiseHandControl } from "./RaiseHandControl";
import { ReactionsControl } from "./ReactionsControl";
import { CallSidePanel } from "./CallSidePanel";

interface VideoStageProps {
  roomId: string;
  canManage: boolean;
  isHost: boolean;
}

// Composes the same building blocks <VideoConference /> uses internally
// (GridLayout, ParticipantTile, ControlBar, RoomAudioRenderer — all
// LiveKit's own, confirmed via the SDK's public type declarations, not
// hand-rolled) directly, instead of going through that one sealed
// component. This app only needs the critical piece — video tiles, audio
// playback, and an icon-only control bar — not everything the prefab
// bundles: no chat panel (the exact thing that crashed trying to reach
// into VideoConference's own private LayoutContext from outside),
// no auto-focus-on-screenshare (a screen share still works and publishes
// its track — see the Share screen button below — it just renders as a
// regular grid tile instead of auto-enlarging), no connection-state toast.
//
// The whole persistent call surface lives here now: the video grid, and
// ONE tray of six controls (mic/camera/share, react, raise-hand, more,
// leave) — nothing else floats on screen by default, matching the agreed
// reference mockup's restraint principle (real polished call apps never
// show a dozen+ controls at once; everything occasional collapses behind
// a single "More" trigger). CallSidePanel owns that More menu + drawer;
// ReactionsControl owns its own toggle + popover; both are rendered here
// as tray items, not independently floating panels.
export function VideoStage({ roomId, canManage, isHost }: VideoStageProps) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );
  const { localParticipant } = useLocalParticipant();
  // NOT localParticipant.metadata read directly off useLocalParticipant's
  // result — that hook only re-renders on track/permission events (mute,
  // camera, screen-share), never on ParticipantMetadataChanged (confirmed
  // by reading the SDK's own source), so this button would stay visually
  // stale after a click until some UNRELATED re-render happened to catch
  // up (e.g. toggling the mic) — a real bug a user reported live.
  // useParticipantInfo subscribes to that event specifically.
  const { metadata } = useParticipantInfo({ participant: localParticipant });
  const raised = isHandRaised(metadata);

  return (
    <div className="video-stage">
      <div className="video-stage-grid">
        <GridLayout tracks={tracks}>
          <ParticipantTile />
        </GridLayout>
      </div>
      <RoomAudioRenderer />
      <div className="video-stage-tray">
        {/* One shared pill shell — every tray item (ControlBar's own
            buttons, reactions, raise-hand, the More trigger) sits inside
            this same container, so nothing reads as a detached circle
            floating next to the pill. order: 99 on .lk-disconnect-button
            (globals.css) pushes Leave visually to the very end despite
            ControlBar rendering it right after mic/camera/share in the
            DOM — matches the agreed mockup's exact button order without
            needing a second, separately-rendered disconnect button. */}
        <div className="video-stage-tray-pill">
          {/* variation="verbose" (not "minimal") is deliberate: ControlBar
              doesn't expose a way to pass an aria-label through to its
              internal DisconnectButton/TrackToggle, so "minimal" (icon
              only, no text node at all) leaves the Leave/Microphone/
              Camera buttons with NO accessible name — a real regression
              that broke every e2e spec's `getByRole("button",
              {name:/Leave/i})` connection check on first attempt. Verbose
              keeps the real "Leave"/"Microphone"/"Camera"/"Share screen"
              text nodes (and their accessible names) in the DOM; the
              .video-stage-tray CSS below visually hides them with
              font-size: 0 without removing them from the accessibility
              tree, unlike display:none/visibility:hidden. */}
          <ControlBar variation="verbose" controls={{ chat: false }} />
          <ReactionsControl />
          <div className="tray-item-with-popover">
            {/* Reads/writes the exact same localParticipant.metadata
                RaiseHandControl's own list below does — LiveKit's own
                useLocalParticipant hook re-renders both on any metadata
                change, so the two stay in sync without any shared React
                state. Ember marks "raised," matching this app's one
                established rule for active/needs-attention states. */}
            <button
              type="button"
              aria-label={raised ? "Lower hand" : "Raise hand"}
              aria-pressed={raised}
              onClick={() => localParticipant.setMetadata(JSON.stringify({ handRaised: !raised }))}
              className={`tray-button ${raised ? "tray-button-active" : ""}`}
            >
              {/* A real icon-library glyph (lucide-react), not a
                  hand-drawn path — matches ControlBar's own icon style
                  (currentColor line icons) reliably, unlike a native
                  emoji character or a freehand SVG attempt. */}
              <Hand size={20} />
            </button>
            {/* Auto-appears (no separate toggle) whenever someone else's
                hand is up — RaiseHandControl itself already returns null
                when the list is empty, so this is a no-op the rest of the
                time. */}
            <div className="tray-popover-anchor">
              <RaiseHandControl roomId={roomId} canManage={canManage} />
            </div>
          </div>
          <div className="tray-divider" />
          <CallSidePanel roomId={roomId} canManage={canManage} isHost={isHost} />
        </div>
      </div>
    </div>
  );
}
