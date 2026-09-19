"use client";

import { useEffect, useState } from "react";
import { useParticipants } from "@livekit/components-react";
import {
  createBreakoutRooms,
  endBreakoutRooms,
  listBreakoutRooms,
  type BreakoutRoom,
} from "../api";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";

interface BreakoutRoomsHostPanelProps {
  roomId: string;
}

const MAX_ROOMS = 10;

// Host-only, same floating-panel pattern as HostControls/
// WaitingRoomHostPanel/MeetingLockControl. v1 is manual assignment only
// (see FEATURES.md's Research notes) — the host picks a room count, taps
// which numbered room each currently-connected participant goes into,
// then submits the whole split as one request. There's no per-participant
// "assign" endpoint to keep this simple: the host builds the full split
// client-side first (free to change their mind before submitting) and
// commits it in one call, the same "don't build it until there's a real
// second use case" reasoning DEV_STANDARDS.md asks for.
//
// Reads the LIVE participant list from LiveKit (useParticipants), same
// reasoning as HostControls — the DB view can lag behind who's actually
// in the call right now, and assigning someone who already left doesn't
// make sense.
export function BreakoutRoomsHostPanel({ roomId }: BreakoutRoomsHostPanelProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const participants = useParticipants();
  const others = participants.filter((p) => !p.isLocal);

  // null = not loaded yet; [] = loaded, no active breakout rooms.
  const [activeRooms, setActiveRooms] = useState<BreakoutRoom[] | null>(null);
  const [roomCount, setRoomCount] = useState(2);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Polls purely to keep the "who's in which room" display fresh — the
  // host already knows immediately about their OWN create/end actions
  // (the response is used directly, see handleCreate/handleEnd below);
  // this is for staying in sync with reality over time, same "freshness,
  // not correctness" role WaitingRoomHostPanel's own poll plays.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const rooms = await listBreakoutRooms(roomId, accessToken);
        if (!cancelled) setActiveRooms(rooms);
      } catch {
        // Transient network hiccup — keep showing the last known state.
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId, accessToken]);

  if (!accessToken || activeRooms === null) return null;

  const toggleAssignment = (identity: string, room: number) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (next[identity] === room) delete next[identity];
      else next[identity] = room;
      return next;
    });
  };

  const handleCreate = async () => {
    setPending(true);
    setError(null);
    try {
      const rooms = Array.from({ length: roomCount }, (_, i) => {
        const n = i + 1;
        return {
          label: `Room ${n}`,
          participantUserIds: others
            .filter((p) => assignments[p.identity] === n)
            .map((p) => p.identity),
        };
      });
      const created = await createBreakoutRooms(roomId, rooms, accessToken);
      setAssignments({});
      // Reflect the split immediately rather than waiting for the next
      // 5s poll tick — built from the same `others` list just submitted,
      // so the names line up without a second round trip.
      setActiveRooms(
        created.map((r) => ({
          id: r.id,
          label: r.label,
          participants: r.participantUserIds.map((userId) => ({
            userId,
            user: { name: others.find((p) => p.identity === userId)?.name ?? userId },
          })),
        })),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create breakout rooms");
    } finally {
      setPending(false);
    }
  };

  const handleEnd = async () => {
    setPending(true);
    setError(null);
    try {
      await endBreakoutRooms(roomId, accessToken);
      setActiveRooms([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't end breakout rooms");
    } finally {
      setPending(false);
    }
  };

  const isActive = activeRooms.length > 0;

  return (
    <div data-testid="breakout-rooms-host-panel" className="text-sm flex flex-col gap-2">
      <p className="font-medium">Breakout rooms</p>

      {isActive ? (
        <>
          <ul className="flex flex-col gap-2">
            {activeRooms.map((r) => (
              <li key={r.id}>
                <p className="font-medium">{r.label}</p>
                <ul className="pl-2 text-xs text-secondary">
                  {r.participants.length === 0 && <li>No one assigned yet</li>}
                  {r.participants.map((p) => (
                    <li key={p.userId}>{p.user.name}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleEnd}
            disabled={pending}
            className="text-xs underline disabled:opacity-50 self-start"
          >
            End breakout rooms
          </button>
        </>
      ) : others.length === 0 ? (
        <p className="text-xs text-secondary">No one else has joined yet.</p>
      ) : (
        <>
          <label className="text-xs flex items-center gap-2">
            Number of rooms
            <input
              type="number"
              min={1}
              max={MAX_ROOMS}
              value={roomCount}
              onChange={(e) =>
                setRoomCount(Math.min(MAX_ROOMS, Math.max(1, Number(e.target.value) || 1)))
              }
              className="w-12 text-black rounded px-1"
            />
          </label>
          <ul className="flex flex-col gap-2">
            {others.map((p) => (
              <li key={p.identity} className="flex items-center justify-between gap-2">
                <span className="truncate">{p.name ?? p.identity}</span>
                <span className="flex gap-1 shrink-0">
                  {Array.from({ length: roomCount }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleAssignment(p.identity, n)}
                      aria-pressed={assignments[p.identity] === n}
                      // Ember marks the currently-selected room assignment
                      // for this participant — an active/selected state,
                      // the same rule used everywhere else in this UI.
                      className={`text-xs rounded px-1.5 ${
                        assignments[p.identity] === n
                          ? "bg-ember text-ember-fg"
                          : "bg-white/10"
                      }`}
                    >
                      Room {n}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleCreate}
            disabled={pending}
            className="text-xs underline disabled:opacity-50 self-start"
          >
            Create breakout rooms
          </button>
        </>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
