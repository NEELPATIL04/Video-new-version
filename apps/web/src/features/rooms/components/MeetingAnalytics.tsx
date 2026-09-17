"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMeetingAnalytics, type MeetingAnalytics as MeetingAnalyticsData } from "../api";
import { useAuthStore } from "@/features/auth/store";
import { ApiError } from "@/lib/api-client";

interface MeetingAnalyticsProps {
  roomId: string;
}

// mm:ss / h:mm:ss — short enough to fit in a stat tile without wrapping.
function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Host-only view of a single room's attendance — reachable from the room
// list (RoomList.tsx) for any room the current user hosts, live or
// already ended. The backend endpoint is pure Postgres (no LiveKit call),
// so this works identically whether the meeting is still in progress
// (durations computed against "now" for anyone who hasn't left) or has
// already ended — see FEATURES.md's Research notes for why that was the
// deliberate choice over gating this on the meeting having ended.
export function MeetingAnalytics({ roomId }: MeetingAnalyticsProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [data, setData] = useState<MeetingAnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getMeetingAnalytics(roomId, accessToken)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Couldn't load meeting analytics");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, accessToken]);

  if (error) {
    return (
      <main className="flex flex-col items-center justify-center flex-1 gap-4 p-8">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/rooms" className="underline text-sm">
          Back to meetings
        </Link>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex items-center justify-center flex-1">
        <p className="text-sm text-gray-500">Loading analytics...</p>
      </main>
    );
  }

  // A scheduled meeting nobody has joined yet — the backend deliberately
  // returns an empty shape rather than misleading "duration since
  // creation" data (see RoomsService.getMeetingAnalytics).
  const notStarted = data.status === "scheduled";

  return (
    <main
      data-testid="meeting-analytics"
      className="flex flex-col items-center gap-6 p-8 flex-1 w-full"
    >
      <div className="w-full max-w-2xl flex justify-between items-center">
        <h1 className="text-2xl font-semibold">{data.roomName} — Analytics</h1>
        <Link href="/rooms" className="text-sm underline">
          Back to meetings
        </Link>
      </div>

      {notStarted ? (
        <p className="text-sm text-gray-500">This meeting hasn&apos;t started yet — nobody has joined.</p>
      ) : (
        <>
          <div className="w-full max-w-2xl grid grid-cols-3 gap-4 text-center">
            <div className="border rounded p-4">
              <p data-testid="analytics-total-participants" className="text-2xl font-semibold">
                {data.totalUniqueParticipants}
              </p>
              <p className="text-xs text-gray-500">Unique participants</p>
            </div>
            <div className="border rounded p-4">
              <p data-testid="analytics-duration" className="text-2xl font-semibold">
                {formatDuration(data.meetingDurationSec)}
              </p>
              <p className="text-xs text-gray-500">
                {data.meetingEndedAt ? "Meeting duration" : "Duration so far — still in progress"}
              </p>
            </div>
            <div className="border rounded p-4">
              <p className="text-2xl font-semibold uppercase">{data.status}</p>
              <p className="text-xs text-gray-500">Status</p>
            </div>
          </div>

          <table className="w-full max-w-2xl text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-2">Name</th>
                <th className="py-2 pr-2">Role</th>
                <th className="py-2 pr-2">Joined</th>
                <th className="py-2 pr-2">Left</th>
                <th className="py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {data.participants.map((p) => (
                <tr key={p.userId} data-testid="analytics-participant-row" className="border-b">
                  <td className="py-2 pr-2">{p.name}</td>
                  <td className="py-2 pr-2 capitalize">{p.role}</td>
                  <td className="py-2 pr-2">{new Date(p.joinedAt).toLocaleString()}</td>
                  <td className="py-2 pr-2">
                    {p.stillInCall ? (
                      <span className="text-green-600">Still in call</span>
                    ) : (
                      new Date(p.leftAt as string).toLocaleString()
                    )}
                  </td>
                  <td className="py-2">{formatDuration(p.durationSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
