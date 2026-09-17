"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DisconnectReason } from "livekit-client";
import { CallRoom } from "./CallRoom";
import { getMyBreakoutAssignment, getJoinStatus, type MyBreakoutAssignment } from "../api";
import { useAuthStore } from "@/features/auth/store";

interface BreakoutRoomAwareCallRoomProps {
  roomId: string;
  isHost: boolean;
  liveKitUrl: string;
  liveKitToken: string;
  e2eeKey?: string;
}

interface ActiveConnection {
  kind: "main" | "breakout";
  liveKitUrl: string;
  liveKitToken: string;
  breakoutRoomId?: string;
  label?: string;
}

// A breakout room is just another ordinary LiveKit room (see
// FEATURES.md's Research notes) — moving a participant into, and back out
// of, one means fully disconnecting from one LiveKit Room object and
// connecting to a different one, not something LiveKitRoom can do by
// swapping props on a live connection. Remounting CallRoom with a fresh
// `key` on every switch is the simplest correct way to get that clean
// disconnect/reconnect from @livekit/components-react.
//
// How does a participant who is ALREADY connected to the main call find
// out the host assigned them to a breakout, or later ended breakouts?
// This is the same "how does a connected client learn about a
// host-initiated change" problem meeting-lock and raise-hand's own
// research notes already worked through, but the fire-and-forget option
// (a LiveKit data-channel broadcast, like ReactionsControl) is a much
// worse fit here than it was for either of those: a dropped/missed
// reaction is invisible, and a participant who reconnects after a
// meeting-lock toggle was never affected at all. Missing a breakout
// assignment here would silently strand a participant in the main room
// with no way to ever receive their access token — not a cosmetic miss,
// a broken feature for that one person. Polling (the same tool
// WaitingRoom already uses for "has the host acted yet") guarantees
// eventual consistency regardless of a transient drop, at the cost of a
// few seconds of latency — the same tradeoff the waiting room already
// accepts for admit/deny.
export function BreakoutRoomAwareCallRoom({
  roomId,
  isHost,
  liveKitUrl,
  liveKitToken,
  e2eeKey,
}: BreakoutRoomAwareCallRoomProps) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [active, setActive] = useState<ActiveConnection>({
    kind: "main",
    liveKitUrl,
    liveKitToken,
  });
  // Tracks the last breakout room id this client actually acted on, so a
  // poll returning the SAME assignment repeatedly doesn't force a
  // needless reconnect on every tick — only a genuine transition
  // (none -> assigned, or assigned -> none) should ever touch `active`.
  const lastBreakoutRoomIdRef = useRef<string | null>(null);

  // Shared by the poll's "none" branch AND handleBreakoutDisconnected
  // below — both are "get back to the main room" and must resolve the
  // exact same way (a fresh main-room token via the ordinary reconnect
  // path, RoomsService.getParticipantStatus via getJoinStatus), not two
  // slightly different ways of doing the same thing.
  const reconnectToMain = useCallback(async () => {
    if (!accessToken) return;
    lastBreakoutRoomIdRef.current = null;
    try {
      const back = await getJoinStatus(roomId, accessToken);
      if (back.status === "admitted") {
        setActive({ kind: "main", liveKitUrl: back.liveKitUrl, liveKitToken: back.liveKitToken });
      }
    } catch {
      // Try again on the next poll tick.
    }
  }, [roomId, accessToken]);

  // The host never moves into a breakout room in v1 (see FEATURES.md's
  // Research notes — host movement between rooms is a documented stretch
  // goal, not built here), so there's nothing for the host's own client
  // to poll for.
  useEffect(() => {
    if (isHost || !accessToken) return;
    let cancelled = false;

    const poll = async () => {
      let result: MyBreakoutAssignment;
      try {
        result = await getMyBreakoutAssignment(roomId, accessToken);
      } catch {
        return; // transient network hiccup — try again next tick
      }
      if (cancelled) return;

      if (
        result.status === "assigned" &&
        result.breakoutRoomId !== lastBreakoutRoomIdRef.current
      ) {
        lastBreakoutRoomIdRef.current = result.breakoutRoomId;
        setActive({
          kind: "breakout",
          liveKitUrl: result.liveKitUrl,
          liveKitToken: result.liveKitToken,
          breakoutRoomId: result.breakoutRoomId,
          label: result.label,
        });
      } else if (result.status === "none" && lastBreakoutRoomIdRef.current !== null) {
        // Breakouts ended (or this assignment was cleared) — see
        // reconnectToMain's own comment.
        await reconnectToMain();
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId, accessToken, isHost, reconnectToMain]);

  // The breakout LiveKit room itself gets deleted server-side the moment
  // the host ends breakouts (LiveKitService.deleteBreakoutRoom) — that
  // forcibly disconnects this participant from it immediately, well
  // before the 3s poll above would otherwise have noticed. Without this,
  // CallRoom's default onDisconnected (router.push("/rooms")) would win
  // that race and boot this participant out of the meeting entirely,
  // instead of reconnecting them to the main room like it's supposed to.
  // DisconnectReason.ROOM_DELETED is specifically LiveKit telling us
  // "this room is gone", as opposed to the participant genuinely clicking
  // Leave or being removed — either of which should still exit to
  // /rooms, same as the main connection's default behavior.
  const handleBreakoutDisconnected = useCallback(
    (reason?: DisconnectReason) => {
      if (reason === DisconnectReason.ROOM_DELETED) {
        void reconnectToMain();
      } else {
        router.push("/rooms");
      }
    },
    [reconnectToMain, router],
  );

  return (
    <>
      {active.kind === "breakout" && (
        <div
          data-testid="breakout-room-banner"
          className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-indigo-700/90 text-white text-xs rounded px-3 py-1"
        >
          Breakout room: {active.label}
        </div>
      )}
      <CallRoom
        // Forces a full unmount/remount of LiveKitRoom on every switch —
        // see this component's own top comment for why that's the
        // correct way to move between two entirely separate LiveKit
        // rooms, rather than a prop change on a live connection.
        key={active.kind === "breakout" ? `breakout:${active.breakoutRoomId}` : "main"}
        roomId={roomId}
        liveKitUrl={active.liveKitUrl}
        liveKitToken={active.liveKitToken}
        isHost={isHost}
        // E2EE has no key-distribution story for a breakout room (see
        // BreakoutRoomsService.createBreakoutRooms' own refusal for
        // e2eeEnabled rooms) — this is only ever reached for a
        // non-encrypted room in the first place, but e2eeKey is scoped to
        // the main connection regardless, on principle.
        e2eeKey={active.kind === "main" ? e2eeKey : undefined}
        // Only the breakout connection needs the override — see
        // handleBreakoutDisconnected's own comment. The main connection
        // keeps CallRoom's default (any disconnect exits to /rooms).
        onDisconnected={active.kind === "breakout" ? handleBreakoutDisconnected : undefined}
      />
    </>
  );
}
