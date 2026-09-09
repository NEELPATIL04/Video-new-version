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

export interface JoinRoomResponse {
  participant: {
    id: string;
    role: "host" | "participant" | "viewer";
    joinedAt: string;
    user: { name: string };
  };
  liveKitUrl: string;
  liveKitToken: string;
}

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

export function leaveRoom(id: string, accessToken: string) {
  return apiFetch<void>(`/rooms/${id}/leave`, { method: "POST", accessToken });
}
