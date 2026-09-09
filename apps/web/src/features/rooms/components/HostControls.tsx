"use client";

import { useState } from "react";
import { useParticipants } from "@livekit/components-react";
import { muteParticipant, removeParticipant } from "../api";
import { useAuthStore } from "@/features/auth/store";

interface HostControlsProps {
  roomId: string;
}

// Rendered only for the host (CallRoom gates this). Reads the LIVE
// participant list from LiveKit itself (useParticipants), not our DB's
// /participants endpoint — the DB view can lag a few hundred ms behind an
// actual join/leave, and a host managing a live call needs to act on who
// is really in the room right now.
export function HostControls({ roomId }: HostControlsProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const participants = useParticipants();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const others = participants.filter((p) => !p.isLocal);
  if (others.length === 0) return null;

  const handleMute = async (identity: string) => {
    if (!accessToken) return;
    setPendingId(identity);
    try {
      await muteParticipant(roomId, identity, accessToken);
    } finally {
      setPendingId(null);
    }
  };

  const handleRemove = async (identity: string) => {
    if (!accessToken) return;
    setPendingId(identity);
    try {
      await removeParticipant(roomId, identity, accessToken);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="absolute top-4 right-4 z-10 bg-black/80 text-white rounded p-3 text-sm w-56">
      <p className="font-medium mb-2">Host controls</p>
      <ul className="flex flex-col gap-2">
        {others.map((p) => (
          <li key={p.identity} className="flex items-center justify-between gap-2">
            <span className="truncate">{p.name ?? p.identity}</span>
            <span className="flex gap-1 shrink-0">
              <button
                onClick={() => handleMute(p.identity)}
                disabled={pendingId === p.identity}
                className="text-xs underline disabled:opacity-50"
              >
                Mute
              </button>
              <button
                onClick={() => handleRemove(p.identity)}
                disabled={pendingId === p.identity}
                className="text-xs underline text-red-400 disabled:opacity-50"
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
