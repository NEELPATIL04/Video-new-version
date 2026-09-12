"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listMyRooms } from "../api";
import { useAuthStore } from "@/features/auth/store";

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

export function RoomList() {
  const accessToken = useAuthStore((s) => s.accessToken);
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

  const { data: rooms, isLoading, error } = useQuery({
    queryKey: ["rooms", accessToken],
    queryFn: () => listMyRooms(accessToken as string),
    enabled: !!accessToken,
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading meetings...</p>;
  if (error) return <p className="text-sm text-red-600">Failed to load meetings</p>;
  if (!rooms || rooms.length === 0) {
    return <p className="text-sm text-gray-500">No meetings yet — start one above.</p>;
  }

  return (
    <ul className="flex flex-col gap-2 w-full max-w-md">
      {rooms.map((room) => (
        <li key={room.id} className="border rounded px-4 py-3 flex flex-col gap-2">
          <Link href={`/rooms/${room.id}`} className="flex justify-between items-center hover:opacity-70">
            <span>{room.name}</span>
            <span className="text-xs uppercase text-gray-500">{room.status}</span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Code: {formatJoinCode(room.joinCode)}</span>
            <button
              type="button"
              onClick={() => handleCopyCode(room.id, room.joinCode)}
              className="underline"
            >
              {copiedRoomId === room.id ? "Copied" : "Copy"}
            </button>
          </div>
          {room.status === "scheduled" && room.scheduledFor && (
            <ScheduledMeetingCalendarLinks
              roomId={room.id}
              name={room.name}
              scheduledFor={room.scheduledFor}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
