"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/features/auth/store";
import { joinRoom, type JoinRoomResponse } from "@/features/rooms/api";
import { getE2eeKeyFromUrl } from "@/features/rooms/e2ee";
import { BreakoutRoomAwareCallRoom } from "@/features/rooms/components/BreakoutRoomAwareCallRoom";
import { WaitingRoom } from "@/features/rooms/components/WaitingRoom";
import { ApiError } from "@/lib/api-client";

// SSR never has fragment access at all (it isn't sent in the HTTP
// request, by design), so getE2eeKeyFromUrl()'s real answer only exists
// client-side — same "value legitimately differs between server and
// client" case as isE2EESupported() in CreateRoomForm, same fix:
// useSyncExternalStore's getServerSnapshot pins what SSR and the
// client's first hydration pass agree on, and React re-checks
// getSnapshot once actually mounted.
const noopSubscribe = () => () => {};
const getServerE2eeKey = () => null;

export default function RoomCallPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const authStatus = useAuthStore((s) => s.status);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [joinResult, setJoinResult] = useState<JoinRoomResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const e2eeKey = useSyncExternalStore(noopSubscribe, getE2eeKeyFromUrl, getServerE2eeKey);
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

  if (joinResult!.status === "waiting") {
    return <WaitingRoom roomId={id} accessToken={accessToken!} onSettled={setJoinResult} />;
  }

  if (joinResult!.status === "denied") {
    return (
      <main className="flex flex-col items-center justify-center flex-1 gap-4">
        <p className="text-sm text-red-600">The host didn&apos;t admit you to this meeting.</p>
        <button onClick={() => router.push("/rooms")} className="underline text-sm">
          Back to meetings
        </button>
      </main>
    );
  }

  // The room requires an encryption key this participant doesn't have —
  // e.g. they joined via the 9-digit code, which can't carry a URL
  // fragment, or opened a link with the fragment stripped. Refusing to
  // connect here (rather than joining with encryption silently disabled)
  // is the whole point: a mixed encrypted/unencrypted call would mean
  // this participant's media is undecryptable garbage to everyone else,
  // not a graceful degradation.
  if (joinResult!.e2eeEnabled && !e2eeKey) {
    return (
      <main className="flex flex-col items-center justify-center flex-1 gap-4">
        <p className="text-sm text-red-600">
          This meeting is end-to-end encrypted — you need the full meeting link the host
          shared, not the join code.
        </p>
        <button onClick={() => router.push("/rooms")} className="underline text-sm">
          Back to meetings
        </button>
      </main>
    );
  }

  return (
    <BreakoutRoomAwareCallRoom
      roomId={id}
      liveKitUrl={joinResult!.liveKitUrl}
      liveKitToken={joinResult!.liveKitToken}
      isHost={joinResult!.participant.role === "host"}
      e2eeKey={joinResult!.e2eeEnabled ? e2eeKey! : undefined}
    />
  );
}
