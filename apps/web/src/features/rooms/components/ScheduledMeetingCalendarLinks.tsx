"use client";

import {
  DEFAULT_MEETING_DURATION_MINUTES,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  downloadIcsFile,
} from "../calendarLinks";

interface ScheduledMeetingCalendarLinksProps {
  roomId: string;
  name: string;
  scheduledFor: string;
}

// Reads window.location.origin, so it's only ever rendered client-side —
// RoomList dynamic-imports this with ssr:false rather than guarding with
// mount-state here (this project's React Compiler lint rule flags
// synchronous setState-in-effect as an anti-pattern; dynamic import with
// ssr:false is the idiomatic Next.js way to mark a component client-only
// without that pattern).
export function ScheduledMeetingCalendarLinks({ roomId, name, scheduledFor }: ScheduledMeetingCalendarLinksProps) {
  const start = new Date(scheduledFor);
  const end = new Date(start.getTime() + DEFAULT_MEETING_DURATION_MINUTES * 60_000);
  const joinUrl = `${window.location.origin}/rooms/${roomId}`;
  const event = { title: name, joinUrl, start, end };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="text-gray-500">{start.toLocaleString()}</span>
      <a
        href={buildGoogleCalendarUrl(event)}
        target="_blank"
        rel="noreferrer"
        className="underline text-gray-600"
      >
        Add to Google Calendar
      </a>
      <a
        href={buildOutlookCalendarUrl(event)}
        target="_blank"
        rel="noreferrer"
        className="underline text-gray-600"
      >
        Add to Outlook
      </a>
      <button
        type="button"
        onClick={() => downloadIcsFile(event, `${roomId}@videoconferencingapp`, `${name}.ics`)}
        className="underline text-gray-600"
      >
        Download .ics
      </button>
    </div>
  );
}
