"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listMyRooms } from "../api";
import { useAuthStore } from "@/features/auth/store";

// Reads window.location.origin internally — ssr:false is the idiomatic
// Next.js way to mark a component client-only (see its own file comment
// for why this isn't a mount-state check instead).
const ScheduledMeetingCalendarLinks = dynamic(
  () => import("./ScheduledMeetingCalendarLinks").then((m) => m.ScheduledMeetingCalendarLinks),
  { ssr: false },
);

export function RoomList() {
  const accessToken = useAuthStore((s) => s.accessToken);

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
