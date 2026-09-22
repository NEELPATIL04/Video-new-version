"use client";

import { useState } from "react";
import { RoomEvent, Track } from "livekit-client";
import {
  Chat,
  ControlBar,
  GridLayout,
  LayoutContextProvider,
  ParticipantTile,
  RoomAudioRenderer,
  useCreateLayoutContext,
  useLocalParticipant,
  useParticipantInfo,
  useTracks,
} from "@livekit/components-react";
import { Hand } from "lucide-react";
import { isHandRaised, RaiseHandControl } from "./RaiseHandControl";
import { ReactionsControl } from "./ReactionsControl";
import { CallSidePanel } from "./CallSidePanel";
import type { Participant } from "../api";

interface VideoStageProps {
  roomId: string;
  canManage: boolean;
  isHost: boolean;
  role: Participant["role"];
}

// Composes the same building blocks <VideoConference /> uses internally
// (GridLayout, ParticipantTile, ControlBar, RoomAudioRenderer, Chat — all
// LiveKit's own, confirmed via the SDK's public type declarations AND its
// actual prefab source, not hand-rolled) directly, instead of going
// through that one sealed component. This app only needs the critical
// pieces — video tiles, audio playback, an icon-only control bar, and
// chat — not everything the prefab bundles: no auto-focus-on-screenshare
// (a screen share still works and publishes its track — see the Share
// screen button below — it just renders as a regular grid tile instead
// of auto-enlarging), no connection-state toast.
//
// Chat previously wasn't included here at all: an earlier attempt at a
// standalone chat toggle crashed trying to reach into VideoConference's
// own PRIVATE LayoutContext from outside it. Reading VideoConference's
// actual source (not just its .d.ts) showed the real pattern: it creates
// its OWN LayoutContext via useCreateLayoutContext() and wraps both its
// ControlBar (controls.chat: true) and its <Chat> in ONE
// <LayoutContextProvider> it owns — the toggle button and the panel
// share that context, never someone else's. VideoStage does exactly that
// now, so Chat is a real, working part of this composition again, not a
// missing Tier-1 feature.
//
// The whole persistent call surface lives here now: the video grid, and
// ONE tray of six controls (mic/camera/share, react, raise-hand, more,
// leave) plus chat — nothing else floats on screen by default, matching
// the agreed reference mockup's restraint principle (real polished call
// apps never show a dozen+ controls at once; everything occasional
// collapses behind a single "More" trigger). CallSidePanel owns that
// More menu + drawer; ReactionsControl owns its own toggle + popover;
// both are rendered here as tray items, not independently floating
// panels.
export function VideoStage({ roomId, canManage, isHost, role }: VideoStageProps) {
  // A webinar-mode viewer (see Room.webinarMode in schema.prisma) is
  // view-only — no camera/mic/screen-share of their own — but still an
  // interactive attendee: chat/reactions/raise-hand stay rendered
  // unconditionally below regardless of this flag (only their publish
  // rights are gated, both here in the UI and, more importantly, at the
  // LiveKit grant level — see LiveKitService.createAccessToken).
  const isViewer = role === "viewer";
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );
  const layoutContext = useCreateLayoutContext();
  const [showChat, setShowChat] = useState(false);
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
      {/* onWidgetChange mirrors ControlBar's internal chat-toggle state
          (which lives inside layoutContext.widget, not this component's
          own state) into showChat — the same pattern VideoConference's
          own source uses to decide whether to render <Chat> visible. */}
      <LayoutContextProvider value={layoutContext} onWidgetChange={(state) => setShowChat(state.showChat)}>
        <div className="video-stage-main">
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
                  keeps the real "Leave"/"Microphone"/"Camera"/"Share screen"/
                  "Chat" text nodes (and their accessible names) in the DOM;
                  the .video-stage-tray CSS below visually hides them with
                  font-size: 0 without removing them from the accessibility
                  tree, unlike display:none/visibility:hidden. */}
              <ControlBar
                variation="verbose"
                controls={{
                  chat: true,
                  microphone: !isViewer,
                  camera: !isViewer,
                  screenShare: !isViewer,
                }}
              />
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
              <CallSidePanel roomId={roomId} canManage={canManage} isHost={isHost} showChat={showChat} />
            </div>
          </div>
        </div>
        {/* Always mounted (never conditionally rendered) — matches
            VideoConference's own approach: only its CSS display toggles,
            so Chat's internal message-history state/subscription doesn't
            get torn down and rebuilt every time the panel opens/closes. */}
        <Chat className="video-stage-chat" style={{ display: showChat ? "grid" : "none" }} />
      </LayoutContextProvider>
    </div>
  );
}
