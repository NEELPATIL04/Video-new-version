"use client";

import dynamic from "next/dynamic";
import type { Room } from "../api";

// Same ssr:false reasoning as RoomList's own use of this component — it
// reads window.location.origin internally.
const ScheduledMeetingCalendarLinks = dynamic(
  () => import("./ScheduledMeetingCalendarLinks").then((m) => m.ScheduledMeetingCalendarLinks),
  { ssr: false },
);

interface UpNextCardProps {
  rooms: Room[];
}

// The single soonest scheduled meeting — plain client-side sort over the
// same rooms list DashboardStats/RoomList already have, not a new query.
// Renders nothing if there isn't one, rather than an empty card.
export function UpNextCard({ rooms }: UpNextCardProps) {
  const next = rooms
    .filter((r) => r.status === "scheduled" && r.scheduledFor)
    .sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime())[0];

  if (!next) return null;

  const when = new Date(next.scheduledFor!).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="dash-card">
      <p className="dash-card-title mb-1">Up next</p>
      <p className="text-sm text-secondary mb-3">
        {next.name} · {when}
      </p>
      <ScheduledMeetingCalendarLinks roomId={next.id} name={next.name} scheduledFor={next.scheduledFor!} />
    </div>
  );
}
