import { z } from "zod";
import { ROOM_ROLES } from "../roles";

export const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  scheduledFor: z.string().datetime().optional(),
  maxParticipants: z.number().int().positive().max(1000).default(100),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const joinRoomSchema = z.object({
  roomId: z.string().uuid(),
  role: z.enum(ROOM_ROLES),
});

export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
