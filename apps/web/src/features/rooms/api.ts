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

export interface WaitingParticipant {
  id: string;
  // The actual user id — this, not the participant row's own `id`, is
  // what the admit/deny endpoints below take as :userId.
  userId: string;
  role: "host" | "participant" | "viewer";
  joinedAt: string;
  user: { name: string };
}

// A host is admitted immediately; anyone else lands in "waiting" until the
// host admits or denies them. Discriminated on `status` — TypeScript only
// allows reading liveKitToken once it's been narrowed to "admitted", which
// mirrors the backend never issuing one until admittedAt is actually set.
export type JoinRoomResponse =
  | { status: "waiting"; participant: WaitingParticipant }
  | {
      status: "admitted";
      participant: WaitingParticipant;
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
  return apiFetch<WaitingParticipant[]>(`/rooms/${roomId}/waiting`, { accessToken });
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

// --- Breakout rooms ---
// See FEATURES.md's Research notes for the two design decisions behind
// this feature: a new, minimal BreakoutRoom model (not a self-referencing
// Room), and polling my-assignment (not a LiveKit data-channel/metadata
// signal) for the reconnect notification.

export interface BreakoutRoomDefinition {
  label: string;
  participantUserIds: string[];
}

export interface CreatedBreakoutRoom {
  id: string;
  label: string;
  participantUserIds: string[];
}

export interface BreakoutRoom {
  id: string;
  label: string;
  participants: { userId: string; user: { name: string } }[];
}

// Polled by every non-host participant's client while connected to the
// call — see BreakoutRoomAwareCallRoom.tsx for how a transition here
// drives disconnecting from one LiveKit room and connecting to another.
export type MyBreakoutAssignment =
  | { status: "none" }
  | {
      status: "assigned";
      breakoutRoomId: string;
      label: string;
      liveKitUrl: string;
      liveKitToken: string;
    };

// Host-only — the backend re-verifies at the DB level (RoomHostGuard),
// same BOLA note as the other host actions above. Creates every room in
// `rooms` and assigns the listed participants in a single request/
// transaction, so no participant ever observes a half-split meeting.
export function createBreakoutRooms(
  roomId: string,
  rooms: BreakoutRoomDefinition[],
  accessToken: string,
) {
  return apiFetch<CreatedBreakoutRoom[]>(`/rooms/${roomId}/breakout-rooms`, {
    method: "POST",
    body: { rooms },
    accessToken,
  });
}

export function listBreakoutRooms(roomId: string, accessToken: string) {
  return apiFetch<BreakoutRoom[]>(`/rooms/${roomId}/breakout-rooms`, { accessToken });
}

export function endBreakoutRooms(roomId: string, accessToken: string) {
  return apiFetch<void>(`/rooms/${roomId}/breakout-rooms/end`, {
    method: "POST",
    accessToken,
  });
}

// No host-only note here deliberately — this is scoped to the CALLER's
// own assignment (roomId + the authenticated user), same as
// getJoinStatus above; there is nothing here for one participant to peek
// into another's assignment.
export function getMyBreakoutAssignment(roomId: string, accessToken: string) {
  return apiFetch<MyBreakoutAssignment>(`/rooms/${roomId}/breakout-rooms/my-assignment`, {
    accessToken,
  });
}
