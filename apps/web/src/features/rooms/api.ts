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
    }
  | { status: "denied" };

export function createRoom(
  input: { name: string; scheduledFor?: string; maxParticipants?: number },
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
