"use client";

import { useRouter } from "next/navigation";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import { HostControls } from "./HostControls";
import { WaitingRoomHostPanel } from "./WaitingRoomHostPanel";

interface CallRoomProps {
  roomId: string;
  liveKitUrl: string;
  liveKitToken: string;
  isHost: boolean;
}

// Thin wrapper around LiveKit's own pre-built VideoConference prefab — grid
// layout, screen share, chat, and controls all come from the SDK. We don't
// hand-roll any of that (DEV_STANDARDS.md §9: use official SDKs, don't
// reimplement what they already solve).
//
// audio/video are deliberately NOT set to `true` here. When they are,
// LiveKitRoom tries to acquire the camera/mic as part of the connect
// handshake itself and treats a permission denial as a connection
// failure — so anyone who declines the browser permission prompt (a very
// normal thing to do) gets silently disconnected from the room entirely,
// not just joined without media. Leaving them unset connects the room
// signaling regardless of device permissions; VideoConference's own
// control bar lets the participant turn camera/mic on afterward once
// they've granted access.
export function CallRoom({ roomId, liveKitUrl, liveKitToken, isHost }: CallRoomProps) {
  const router = useRouter();

  return (
    <LiveKitRoom
      serverUrl={liveKitUrl}
      token={liveKitToken}
      connect
      data-lk-theme="default"
      style={{ height: "100vh", position: "relative" }}
      onDisconnected={() => router.push("/rooms")}
    >
      <VideoConference />
      {/* Inside LiveKitRoom's context so HostControls can read the live
          participant list — HostControls itself gates rendering when no
          one else has joined yet, but the isHost check happens here so a
          non-host never even mounts a component with mute/remove actions.
          WaitingRoomHostPanel doesn't need LiveKit's context (it polls
          the DB directly, since a waiting participant isn't connected to
          LiveKit at all yet) but lives alongside the other host-only
          overlays for the same reason. */}
      {isHost && (
        <>
          <HostControls roomId={roomId} />
          <WaitingRoomHostPanel roomId={roomId} />
        </>
      )}
    </LiveKitRoom>
  );
}
