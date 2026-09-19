"use client";

import { useEffect, useState } from "react";
import { admitParticipant, denyParticipant, listWaitingParticipants, type Participant } from "../api";
import { useAuthStore } from "@/features/auth/store";

interface WaitingRoomHostPanelProps {
  roomId: string;
}

// Host-only. Polls the waiting list independently of HostControls' live
// LiveKit participant list (useParticipants) — someone waiting to be
// admitted isn't connected to LiveKit at all yet, so there's no live
// signal to read them from; the DB is the only source of truth here.
export function WaitingRoomHostPanel({ roomId }: WaitingRoomHostPanelProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [waiting, setWaiting] = useState<Participant[]>([]);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const result = await listWaitingParticipants(roomId, accessToken);
        if (!cancelled) setWaiting(result);
      } catch {
        // Transient network hiccup — keep showing the last known list
        // rather than flashing it empty.
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId, accessToken]);

  if (waiting.length === 0) return null;

  const handleAdmit = async (userId: string) => {
    if (!accessToken) return;
    setPendingUserId(userId);
    try {
      await admitParticipant(roomId, userId, accessToken);
      setWaiting((prev) => prev.filter((p) => p.userId !== userId));
    } finally {
      setPendingUserId(null);
    }
  };

  const handleDeny = async (userId: string) => {
    if (!accessToken) return;
    setPendingUserId(userId);
    try {
      await denyParticipant(roomId, userId, accessToken);
      setWaiting((prev) => prev.filter((p) => p.userId !== userId));
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <div data-testid="waiting-room-host-panel" className="text-sm mt-4 pt-4 border-t border-white/10">
      <p className="font-medium mb-2">Waiting room ({waiting.length})</p>
      <ul className="flex flex-col gap-2">
        {waiting.map((p) => (
          <li key={p.userId} className="flex items-center justify-between gap-2">
            <span className="truncate">{p.user.name}</span>
            <span className="flex gap-1 shrink-0">
              <button
                onClick={() => handleAdmit(p.userId)}
                disabled={pendingUserId === p.userId}
                className="text-xs underline disabled:opacity-50"
              >
                Admit
              </button>
              <button
                onClick={() => handleDeny(p.userId)}
                disabled={pendingUserId === p.userId}
                className="text-xs underline text-danger disabled:opacity-50"
              >
                Deny
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
