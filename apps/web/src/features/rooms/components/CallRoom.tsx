"use client";

import { useRouter } from "next/navigation";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";

interface CallRoomProps {
  liveKitUrl: string;
  liveKitToken: string;
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
export function CallRoom({ liveKitUrl, liveKitToken }: CallRoomProps) {
  const router = useRouter();

  return (
    <LiveKitRoom
      serverUrl={liveKitUrl}
      token={liveKitToken}
      connect
      data-lk-theme="default"
      style={{ height: "100vh" }}
      onDisconnected={() => router.push("/rooms")}
    >
      <VideoConference />
    </LiveKitRoom>
  );
}
