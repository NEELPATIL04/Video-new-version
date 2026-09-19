"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuthStore } from "@/features/auth/store";
import type { Room } from "../api";

// "482913657" -> "482 913 657" — easier to read aloud and to copy from.
function formatJoinCode(code: string): string {
  return code.replace(/(\d{3})(?=\d)/g, "$1 ");
}

// Reads window.location.origin internally — ssr:false is the idiomatic
// Next.js way to mark a component client-only (see its own file comment
// for why this isn't a mount-state check instead).
const ScheduledMeetingCalendarLinks = dynamic(
  () => import("./ScheduledMeetingCalendarLinks").then((m) => m.ScheduledMeetingCalendarLinks),
  { ssr: false },
);

const STATUS_DOT: Record<Room["status"], string> = {
  active: "dash-status-active",
  scheduled: "dash-status-scheduled",
  ended: "dash-status-ended",
};

interface RoomListProps {
  rooms: Room[];
  isLoading: boolean;
  error: boolean;
  // True when `rooms` has already been narrowed by a search query, so an
  // empty array means "no matches" rather than "no meetings at all" —
  // two different messages for the viewer.
  filtered?: boolean;
}

// Takes the already-fetched rooms list as a prop now (lifted to
// app/rooms/page.tsx so DashboardStats/UpNextCard/RoomList all read the
// exact same query result) rather than each independently calling
// useQuery for the same data. Same actions as before (join-code copy,
// host-only Analytics link, calendar links for a scheduled room) — only
// the row markup is denser, with a status-colored dot instead of a plain
// text badge.
export function RoomList({ rooms, isLoading, error, filtered }: RoomListProps) {
  const user = useAuthStore((s) => s.user);
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);

  const handleCopyCode = async (roomId: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedRoomId(roomId);
      setTimeout(() => setCopiedRoomId((current) => (current === roomId ? null : current)), 1500);
    } catch {
      // Clipboard access can be denied by the browser (permissions,
      // insecure context) — the code is still visible on screen to copy
      // manually, so this is a silent no-op, not an error state.
    }
  };

  if (isLoading) return <p className="text-sm text-muted">Loading meetings...</p>;
  if (error) return <p className="text-sm text-danger">Failed to load meetings</p>;
  if (rooms.length === 0) {
    return (
      <p className="text-sm text-muted">
        {filtered ? "No meetings match your search." : "No meetings yet — start one above."}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {rooms.map((room) => (
        <div key={room.id} className="dash-row">
          <Link href={`/rooms/${room.id}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80">
            <span className={`dash-status-dot ${STATUS_DOT[room.status]}`} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm truncate">{room.name}</p>
              <p className="text-xs text-muted">
                Code: {formatJoinCode(room.joinCode)}
                {room.status === "scheduled" && room.scheduledFor && (
                  <> · {new Date(room.scheduledFor).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</>
                )}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleCopyCode(room.id, room.joinCode)}
              className="text-xs text-secondary"
            >
              {copiedRoomId === room.id ? "Copied" : "Copy code"}
            </button>
            {/* Host-only — the backend re-verifies at the DB level
                (RoomHostGuard + a second hostId check inside
                getMeetingAnalytics), so this is just hiding an option
                that would 403 anyway, not the actual access control. */}
            {room.hostId === user?.id && (
              <Link
                href={`/rooms/${room.id}/analytics`}
                className="text-xs text-primary underline decoration-white/30 underline-offset-2 hover:decoration-white/60"
              >
                Analytics
              </Link>
            )}
            {room.status === "scheduled" && room.scheduledFor && (
              <ScheduledMeetingCalendarLinks roomId={room.id} name={room.name} scheduledFor={room.scheduledFor} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
