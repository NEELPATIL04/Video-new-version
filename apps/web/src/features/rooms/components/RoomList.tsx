"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listMyRooms } from "../api";
import { useAuthStore } from "@/features/auth/store";

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
        <li key={room.id}>
          <Link
            href={`/rooms/${room.id}`}
            className="flex justify-between items-center border rounded px-4 py-3 hover:bg-gray-50"
          >
            <span>{room.name}</span>
            <span className="text-xs uppercase text-gray-500">{room.status}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
