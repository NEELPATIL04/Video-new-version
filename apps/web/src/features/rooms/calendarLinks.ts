// "Add to calendar" for a scheduled meeting — deliberately NOT an OAuth
// calendar integration (no Google/Microsoft API calls, no stored tokens,
// no consent screens). Each of these is a pure, offline computation from
// data we already have: a specially-formatted URL the calendar provider's
// own web app knows how to pre-fill (Google, Outlook), or a downloadable
// .ics file that every calendar app can import. See FEATURES.md's
// "Research notes" section for why the full OAuth-sync version is a much
// bigger, separately-scoped effort.

interface CalendarEvent {
  title: string;
  /** Meeting join URL — used as both the event location and its description link. */
  joinUrl: string;
  /** Meeting start time. */
  start: Date;
  /** Meeting end time. There's no real "end" for a live call — this is a
   *  calendar-display estimate only (defaultMeetingDurationMinutes below),
   *  never enforced anywhere else in the app. */
  end: Date;
}

export const DEFAULT_MEETING_DURATION_MINUTES = 60;

function toGoogleDateFormat(date: Date): string {
  // YYYYMMDDTHHMMSSZ
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildGoogleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toGoogleDateFormat(event.start)}/${toGoogleDateFormat(event.end)}`,
    details: `Join the meeting: ${event.joinUrl}`,
    location: event.joinUrl,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    startdt: event.start.toISOString(),
    enddt: event.end.toISOString(),
    subject: event.title,
    body: `Join the meeting: ${event.joinUrl}`,
    location: event.joinUrl,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

// RFC 5545 §3.3.11: commas, semicolons, and backslashes must be escaped,
// and literal newlines become the two-character sequence "\n".
function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function toIcsDateFormat(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildIcsContent(event: CalendarEvent, uid: string): string {
  // RFC 5545 requires CRLF line endings.
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VideoConferencingApp//Meeting//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsDateFormat(new Date())}`,
    `DTSTART:${toIcsDateFormat(event.start)}`,
    `DTEND:${toIcsDateFormat(event.end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(`Join the meeting: ${event.joinUrl}`)}`,
    `LOCATION:${escapeIcsText(event.joinUrl)}`,
    `URL:${event.joinUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

// Triggers a browser download of the .ics file — no backend involved, the
// content is generated entirely client-side above.
export function downloadIcsFile(event: CalendarEvent, uid: string, filename: string): void {
  const blob = new Blob([buildIcsContent(event, uid)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
