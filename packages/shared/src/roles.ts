/**
 * RBAC roles for a room, as decided in WEBRTC_LIVEKIT.md #2.
 * Single source of truth — imported by both the NestJS token/guard layer
 * and the Next.js UI (to conditionally render host-only controls).
 */
export const ROOM_ROLES = ["host", "participant", "viewer"] as const;

export type RoomRole = (typeof ROOM_ROLES)[number];
