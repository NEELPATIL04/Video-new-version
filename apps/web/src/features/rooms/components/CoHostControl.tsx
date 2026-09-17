"use client";

import { useEffect, useState } from "react";
import { demoteCoHost, listParticipants, promoteToCoHost, type Participant } from "../api";
import { useAuthStore } from "@/features/auth/store";

interface CoHostControlProps {
  roomId: string;
}

// Owner-only — rendered only for the TRUE host (CallRoom gates this on
// the strict isHost, never canManage), since appointing/revoking a
// co-host is one of the few actions a co-host itself can't perform (see
// RoomsService.promoteToCoHost/demoteCoHost, both behind RoomHostGuard,
// not RoomHostOrCoHostGuard).
//
// Polls the DB-backed participant list (like WaitingRoomHostPanel, not
// HostControls' live LiveKit list) because role is authorization-facing
// state that lives in Postgres, not LiveKit metadata — see FEATURES.md's
// Research notes on why this isn't a data-channel/metadata feature the
// way raise-hand is.
export function CoHostControl({ roomId }: CoHostControlProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const result = await listParticipants(roomId, accessToken);
        if (!cancelled) setParticipants(result);
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

  // Never list the host themselves — promoting/demoting "the host" makes
  // no sense, and this panel only ever acts on OTHER participants.
  const others = participants.filter((p) => p.role !== "host");
  if (others.length === 0) return null;

  const handleToggle = async (p: Participant) => {
    if (!accessToken) return;
    setPendingUserId(p.userId);
    try {
      if (p.role === "cohost") {
        await demoteCoHost(roomId, p.userId, accessToken);
        setParticipants((prev) =>
          prev.map((x) => (x.userId === p.userId ? { ...x, role: "participant" } : x)),
        );
      } else {
        await promoteToCoHost(roomId, p.userId, accessToken);
        setParticipants((prev) =>
          prev.map((x) => (x.userId === p.userId ? { ...x, role: "cohost" } : x)),
        );
      }
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <div
      data-testid="co-host-control"
      // bottom-4 left-4 — the right-4 column is already crowded
      // (MeetingLockControl bottom-4, RaiseHandControl and
      // BackgroundEffectsControl both bottom-20, which collide with each
      // other independently of this feature). bottom-4 left-4 is the one
      // clearly unclaimed corner (WaitingRoomHostPanel is top-4 left-4,
      // NoiseCancellationControl is bottom-20 left-4).
      className="absolute bottom-4 left-4 z-10 bg-black/80 text-white rounded p-3 text-sm w-56"
    >
      <p className="font-medium mb-2">Co-hosts</p>
      <ul className="flex flex-col gap-2">
        {others.map((p) => (
          <li key={p.userId} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {p.role === "cohost" ? "⭐ " : ""}
              {p.user.name}
            </span>
            <button
              type="button"
              onClick={() => handleToggle(p)}
              disabled={pendingUserId === p.userId}
              className="text-xs underline disabled:opacity-50 shrink-0"
            >
              {p.role === "cohost" ? "Remove co-host" : "Make co-host"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
