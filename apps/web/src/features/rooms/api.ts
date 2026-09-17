import { apiFetch } from "@/lib/api-client";

export interface Room {
  id: string;
  name: string;
  status: "scheduled" | "active" | "ended";
  scheduledFor: string | null;
  maxParticipants: number;
  hostId: string;
  createdAt: string;
  updatedAt: string;
  // Short numeric alternative to the room ID/link (e.g. "482913657",
  // shown to users grouped as "482 913 657"). Not a security boundary —
  // the waiting room + auth are — just needs to be easy to read aloud
  // and type back in.
  joinCode: string;
  // Host-controlled. While true, joinRoom rejects any brand-new joiner
  // with a 403 ("This meeting is locked") but never affects someone who
  // already has a Participant row — including the host.
  locked: boolean;
  // Fixed at creation, never toggled mid-call — see e2ee.ts and
  // FEATURES.md's Research notes. The actual key never appears anywhere
  // in this Room object or any other API response; it only ever lives in
  // the room URL's fragment, which this object has no access to.
  e2eeEnabled: boolean;
}

// Shared shape for both the waiting-room list and the full active-
// participant list below — a waiting participant IS a participant, just
// one whose admittedAt hasn't been set yet.
export interface Participant {
  id: string;
  // The actual user id — this, not the participant row's own `id`, is
  // what the admit/deny endpoints below take as :userId.
  userId: string;
  // "cohost" — a host-appointed participant with the same call-control/
  // queue-management privileges as the host (mute, remove, admit, deny,
  // lock/unlock, lower-hand), but never room-lifecycle powers or the
  // ability to appoint/revoke other co-hosts. See FEATURES.md's Research
  // notes.
  role: "host" | "cohost" | "participant" | "viewer";
  joinedAt: string;
  user: { name: string };
}

// A host is admitted immediately; anyone else lands in "waiting" until the
// host admits or denies them. Discriminated on `status` — TypeScript only
// allows reading liveKitToken once it's been narrowed to "admitted", which
// mirrors the backend never issuing one until admittedAt is actually set.
export type JoinRoomResponse =
  | { status: "waiting"; participant: Participant }
  | {
      status: "admitted";
      participant: Participant;
      liveKitUrl: string;
      liveKitToken: string;
      // See Room.e2eeEnabled above — lets the call page tell "this room
      // was never encrypted" apart from "this room needs a key you
      // don't have" before it ever tries to connect.
      e2eeEnabled: boolean;
    }
  | { status: "denied" };

export function createRoom(
  input: {
    name: string;
    scheduledFor?: string;
    maxParticipants?: number;
    e2eeEnabled?: boolean;
  },
  accessToken: string,
) {
  return apiFetch<Room>("/rooms", { method: "POST", body: input, accessToken });
}

export function listMyRooms(accessToken: string) {
  return apiFetch<Room[]>("/rooms", { accessToken });
}

export function getRoom(id: string, accessToken: string) {
  return apiFetch<Room>(`/rooms/${id}`, { accessToken });
}

// Accepts the code with or without the display-formatted spaces
// ("482 913 657" or "482913657") — encodeURIComponent so a raw space
// survives the request; the backend strips all non-digits anyway.
export function getRoomByCode(code: string, accessToken: string) {
  return apiFetch<Room>(`/rooms/by-code/${encodeURIComponent(code)}`, { accessToken });
}

export function joinRoom(id: string, accessToken: string) {
  return apiFetch<JoinRoomResponse>(`/rooms/${id}/join`, { method: "POST", accessToken });
}

// Polled by a waiting participant's client to find out once the host has
// acted — same response shape as joinRoom.
export function getJoinStatus(id: string, accessToken: string) {
  return apiFetch<JoinRoomResponse>(`/rooms/${id}/join-status`, { accessToken });
}

// Host-only — same BOLA note as mute/remove below: the backend
// re-verifies at the DB level, so exposing these to any signed-in user is
// safe.
export function listWaitingParticipants(roomId: string, accessToken: string) {
  return apiFetch<Participant[]>(`/rooms/${roomId}/waiting`, { accessToken });
}

// Member-only (RoomMemberGuard) — every currently-active participant of
// this room, including their DB-backed role. Used by CoHostControl: role
// is authorization-facing state (it directly gates backend endpoints via
// RoomHostOrCoHostGuard), so it lives in Postgres, not LiveKit's live
// participant metadata the way a raised hand does — useParticipants()
// has no concept of our RoomRole at all, only this endpoint does.
export function listParticipants(roomId: string, accessToken: string) {
  return apiFetch<Participant[]>(`/rooms/${roomId}/participants`, { accessToken });
}

export function admitParticipant(roomId: string, targetUserId: string, accessToken: string) {
  return apiFetch<void>(`/rooms/${roomId}/waiting/${targetUserId}/admit`, {
    method: "POST",
    accessToken,
  });
}

export function denyParticipant(roomId: string, targetUserId: string, accessToken: string) {
  return apiFetch<void>(`/rooms/${roomId}/waiting/${targetUserId}/deny`, {
    method: "POST",
    accessToken,
  });
}

export function leaveRoom(id: string, accessToken: string) {
  return apiFetch<void>(`/rooms/${id}/leave`, { method: "POST", accessToken });
}

// Host-only — the backend re-verifies the caller is actually the host at
// the DB level (RoomHostGuard) regardless of what the UI shows, so these
// calls are safe to expose to any signed-in user; a non-host attempting
// them just gets a 403.
export function muteParticipant(roomId: string, targetUserId: string, accessToken: string) {
  return apiFetch<void>(`/rooms/${roomId}/participants/${targetUserId}/mute`, {
    method: "POST",
    accessToken,
  });
}

export function removeParticipant(roomId: string, targetUserId: string, accessToken: string) {
  return apiFetch<void>(`/rooms/${roomId}/participants/${targetUserId}/remove`, {
    method: "POST",
    accessToken,
  });
}

// Host-only — lowers ANOTHER participant's raised hand (queue
// management). A participant lowering their OWN hand never calls this;
// that goes straight through LiveKit's client SDK
// (localParticipant.setMetadata()) instead. Same BOLA note as
// mute/remove: the backend re-verifies at the DB level, so this is safe
// to expose to any signed-in user.
export function lowerParticipantHand(roomId: string, targetUserId: string, accessToken: string) {
  return apiFetch<void>(`/rooms/${roomId}/participants/${targetUserId}/lower-hand`, {
    method: "POST",
    accessToken,
  });
}

// Host-only — blocks/unblocks brand-new joiners mid-call. Returns the
// updated room so the caller can reflect the new locked state without a
// second fetch. Same BOLA note as the other host actions: the backend
// re-verifies at the DB level (RoomHostGuard), so this is safe to expose
// to any signed-in user.
export function lockRoom(id: string, accessToken: string) {
  return apiFetch<Room>(`/rooms/${id}/lock`, { method: "POST", accessToken });
}

export function unlockRoom(id: string, accessToken: string) {
  return apiFetch<Room>(`/rooms/${id}/unlock`, { method: "POST", accessToken });
}

// Owner-only (not exposed to a co-host, even though co-hosts can call
// mute/remove/admit/deny/lock above) — the backend enforces this with a
// separate, stricter guard (RoomHostGuard, not RoomHostOrCoHostGuard) so
// a co-host can never appoint a rival or demote the real host.
export function promoteToCoHost(roomId: string, targetUserId: string, accessToken: string) {
  return apiFetch<void>(`/rooms/${roomId}/participants/${targetUserId}/promote`, {
    method: "POST",
    accessToken,
  });
}

export function demoteCoHost(roomId: string, targetUserId: string, accessToken: string) {
  return apiFetch<void>(`/rooms/${roomId}/participants/${targetUserId}/demote`, {
    method: "POST",
    accessToken,
  });
}

// Unlike a reaction or raised hand, a poll's question/options/votes are
// genuinely persisted (see schema.prisma's comment on the Poll model) —
// this shape is what both the host's create form and every participant's
// vote/results view render from.
export interface PollOption {
  id: string;
  text: string;
  voteCount: number;
}

export interface Poll {
  id: string;
  roomId: string;
  question: string;
  status: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
  options: PollOption[];
  totalVotes: number;
  // Scoped to the CALLER who fetched this poll — never derived from
  // anything sent by the client, computed server-side from PollVote.
  hasVoted: boolean;
  votedOptionId: string | null;
}

// Host-only — the backend re-verifies at the DB level (RoomHostGuard),
// same BOLA note as the other host actions above.
export function createPoll(
  roomId: string,
  input: { question: string; options: string[] },
  accessToken: string,
) {
  return apiFetch<Poll>(`/rooms/${roomId}/polls`, {
    method: "POST",
    body: input,
    accessToken,
  });
}

// The single most-recently-created poll for this room (open OR closed),
// or null if the room has never had one. Called on mount by every
// participant — this is the REST half of the late-joiner design (see
// FEATURES.md's Research notes): the data channel broadcast alone would
// never reach someone who joins after a poll already exists or has
// already closed.
export function getCurrentPoll(roomId: string, accessToken: string) {
  return apiFetch<Poll | null>(`/rooms/${roomId}/polls/current`, { accessToken });
}

// Any active room member — the backend validates the optionId belongs to
// THIS poll at the DB level and rejects a repeat vote (409).
export function votePoll(roomId: string, pollId: string, optionId: string, accessToken: string) {
  return apiFetch<Poll>(`/rooms/${roomId}/polls/${pollId}/vote`, {
    method: "POST",
    body: { optionId },
    accessToken,
  });
}

// Host-only — locks further voting; the poll and its results stay
// visible (not deleted), same reasoning as endRoom preserving
// participant history.
export function closePoll(roomId: string, pollId: string, accessToken: string) {
  return apiFetch<Poll>(`/rooms/${roomId}/polls/${pollId}/close`, {
    method: "POST",
    accessToken,
  });
}

export interface ParticipantAnalytics {
  userId: string;
  name: string;
  role: Participant["role"];
  joinedAt: string;
  leftAt: string | null;
  admittedAt: string | null;
  // Mirrors the backend's own definition (leftAt === null) rather than
  // being re-derived here — see RoomsService.getMeetingAnalytics.
  stillInCall: boolean;
  durationSec: number;
}

// Pure Postgres aggregation — no LiveKit connection required, so this
// resolves identically whether the meeting is still live or already
// ended. Host-only: the backend re-verifies at the DB level (RoomHostGuard
// + a second hostId check inside the service itself, since this response
// contains every participant's name and full join/leave history), so a
// non-host calling this just gets a 403.
export interface MeetingAnalytics {
  roomId: string;
  roomName: string;
  status: "scheduled" | "active" | "ended";
  meetingStartedAt: string | null;
  // null while the meeting is still ongoing (or hasn't started) — only set
  // once RoomStatus is 'ended'.
  meetingEndedAt: string | null;
  meetingDurationSec: number;
  totalUniqueParticipants: number;
  participants: ParticipantAnalytics[];
}

export function getMeetingAnalytics(roomId: string, accessToken: string) {
  return apiFetch<MeetingAnalytics>(`/rooms/${roomId}/analytics`, { accessToken });
}

// Normalized 0-1 coordinates (fraction of the canvas's own width/height),
// not raw pixels — a stroke drawn on one participant's canvas must line
// up the same way on every other participant's canvas regardless of
// their own window/canvas size. See WhiteboardControl.tsx.
export interface WhiteboardPoint {
  x: number;
  y: number;
}

export interface WhiteboardStroke {
  id: string;
  points: WhiteboardPoint[];
  color: string;
  width: number;
  authorId: string;
  createdAt: string;
}

// Fetched on mount by WhiteboardControl — the late-joiner path. A
// participant who joins after strokes have already been drawn gets the
// existing canvas from here rather than from LiveKit (which only ever
// syncs live events to already-connected participants going forward, see
// FEATURES.md's Research notes). Any active member may call this — same
// access level as listParticipants.
export function listWhiteboardStrokes(roomId: string, accessToken: string) {
  return apiFetch<WhiteboardStroke[]>(`/rooms/${roomId}/whiteboard/strokes`, { accessToken });
}

// Persists the stroke so a future late joiner can fetch it via
// listWhiteboardStrokes above. The caller is responsible for ALSO
// broadcasting it over the LiveKit data channel so already-connected
// participants see it live without polling this endpoint — see
// WhiteboardControl.tsx. Any active member may draw (everyone-can-draw
// is this feature's default), not just the host.
export function addWhiteboardStroke(
  roomId: string,
  input: { points: WhiteboardPoint[]; color: string; width?: number },
  accessToken: string,
) {
  return apiFetch<WhiteboardStroke>(`/rooms/${roomId}/whiteboard/strokes`, {
    method: "POST",
    body: input,
    accessToken,
  });
}

// Undoes the CALLING user's own most recent stroke only — the backend
// looks the stroke up by the caller's own identity, never a client-
// supplied stroke id, so this can't undo someone else's drawing.
export function undoLastWhiteboardStroke(roomId: string, accessToken: string) {
  return apiFetch<WhiteboardStroke>(`/rooms/${roomId}/whiteboard/strokes/last`, {
    method: "DELETE",
    accessToken,
  });
}

// Host-only — clears every participant's strokes at once, a meaningfully
// more destructive action than undoing your own last one (see
// RoomsService.clearWhiteboard). Same BOLA note as the other host
// actions: the backend re-verifies at the DB level (RoomHostGuard), so
// this is safe to expose to any signed-in user.
export function clearWhiteboard(roomId: string, accessToken: string) {
  return apiFetch<void>(`/rooms/${roomId}/whiteboard`, { method: "DELETE", accessToken });
}
