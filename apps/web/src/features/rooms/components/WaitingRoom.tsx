"use client";

import { useEffect, useRef } from "react";
import { getJoinStatus, type JoinRoomResponse } from "../api";

interface WaitingRoomProps {
  roomId: string;
  accessToken: string;
  onSettled: (result: JoinRoomResponse) => void;
}

// Polls the backend every 2s until the host admits or denies this join
// request. LiveKit is irrelevant here by design — the whole point of a
// waiting room is that the client never gets a token, let alone a live
// connection, until the backend has admittedAt actually set for them.
export function WaitingRoom({ roomId, accessToken, onSettled }: WaitingRoomProps) {
  const settledRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (settledRef.current) return;
      try {
        const result = await getJoinStatus(roomId, accessToken);
        if (result.status !== "waiting") {
          settledRef.current = true;
          clearInterval(interval);
          onSettled(result);
        }
      } catch {
        // Transient network hiccup — retry on the next tick rather than
        // treating a still-waiting participant as denied.
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [roomId, accessToken, onSettled]);

  return (
    <main className="flex flex-col items-center justify-center flex-1 gap-3">
      <p className="text-sm text-gray-600">Waiting for the host to let you in…</p>
      <p className="text-xs text-gray-400">This page will update automatically.</p>
    </main>
  );
}
