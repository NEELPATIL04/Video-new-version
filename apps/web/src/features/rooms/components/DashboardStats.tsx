"use client";

import { CalendarRange, Radio, Clock, CheckCircle2 } from "lucide-react";
import type { Room } from "../api";

interface DashboardStatsProps {
  rooms: Room[];
}

// Every count here is a plain client-side filter over the SAME
// listMyRooms response RoomList/UpNextCard already render — no separate
// endpoint, no invented metric. Deliberately does NOT show a live
// "N in call" count: that needs a real per-room LiveKit participant
// query (RoomServiceClient.listParticipants) this pass doesn't add.
export function DashboardStats({ rooms }: DashboardStatsProps) {
  const active = rooms.filter((r) => r.status === "active").length;
  const scheduled = rooms.filter((r) => r.status === "scheduled").length;
  const ended = rooms.filter((r) => r.status === "ended").length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="dash-stat-card dash-stat-card-primary flex items-start justify-between">
        <div>
          <p className="text-xs" style={{ color: "rgba(19,18,17,0.65)" }}>
            Total meetings
          </p>
          <p className="text-2xl font-medium" style={{ color: "var(--color-surface-0)" }}>
            {rooms.length}
          </p>
        </div>
        <CalendarRange size={18} style={{ color: "rgba(19,18,17,0.55)" }} className="shrink-0" aria-hidden="true" />
      </div>
      <div className="dash-stat-card flex items-start justify-between">
        <div>
          <p className="text-xs text-secondary">Active now</p>
          <p className="text-2xl font-medium" style={{ color: "#5dcaa5" }}>
            {active}
          </p>
        </div>
        <Radio size={18} style={{ color: "#5dcaa5" }} className="shrink-0" aria-hidden="true" />
      </div>
      <div className="dash-stat-card flex items-start justify-between">
        <div>
          <p className="text-xs text-secondary">Scheduled</p>
          <p className="text-2xl font-medium" style={{ color: "#ef9f27" }}>
            {scheduled}
          </p>
        </div>
        <Clock size={18} style={{ color: "#ef9f27" }} className="shrink-0" aria-hidden="true" />
      </div>
      <div className="dash-stat-card flex items-start justify-between">
        <div>
          <p className="text-xs text-secondary">Ended</p>
          <p className="text-2xl font-medium">{ended}</p>
        </div>
        <CheckCircle2 size={18} className="text-muted shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}
