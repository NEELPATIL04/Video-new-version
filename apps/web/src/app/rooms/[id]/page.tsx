"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/features/auth/store";
import { joinRoom, type JoinRoomResponse } from "@/features/rooms/api";
import { CallRoom } from "@/features/rooms/components/CallRoom";
import { ApiError } from "@/lib/api-client";

export default function RoomCallPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const authStatus = useAuthStore((s) => s.status);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [joinResult, setJoinResult] = useState<JoinRoomResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Joining is NOT idempotent from LiveKit's perspective: each call mints a
  // fresh access token under the same identity, and a second concurrent
  // connection with that identity gets treated as a duplicate session and
  // disconnected. A plain useEffect (or useQuery, which we used here
  // originally) fires more than once — on mount, on React Strict Mode's
  // dev-only double-invoke, on any re-render that changes a dependency —
  // so this ref is the guard that makes the join call fire exactly once
  // per page visit regardless.
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    if (authStatus === "anonymous") router.push("/login");
  }, [authStatus, router]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !accessToken) return;
    if (hasJoinedRef.current) return;
    hasJoinedRef.current = true;

    joinRoom(id, accessToken)
      .then(setJoinResult)
      .catch((err) => {
        hasJoinedRef.current = false;
        setError(err instanceof ApiError ? err.message : "Couldn't join this meeting");
      });
  }, [authStatus, accessToken, id]);

  if (authStatus !== "authenticated" || (!joinResult && !error)) {
    return (
      <main className="flex items-center justify-center flex-1">
        <p className="text-sm text-gray-500">Joining meeting...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex flex-col items-center justify-center flex-1 gap-4">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={() => router.push("/rooms")} className="underline text-sm">
          Back to meetings
        </button>
      </main>
    );
  }

  return (
    <CallRoom
      roomId={id}
      liveKitUrl={joinResult!.liveKitUrl}
      liveKitToken={joinResult!.liveKitToken}
      isHost={joinResult!.participant.role === "host"}
    />
  );
}
