"use client";

import { CalendarDays, ClipboardList, LogOut, Video } from "lucide-react";

interface RoomsSidebarProps {
  onSignOut: () => void;
}

// Only two real nav items — Meetings (this page) and Templates (jumps to
// the templates card below via a plain in-page anchor, not a separate
// route). Deliberately no Tasks/Calendar/Team-style entries that don't
// correspond to anything this app actually has — a nav item that goes
// nowhere is worse than a shorter sidebar. Real icon-library glyphs
// (lucide-react), not emoji/Unicode symbols — an emoji rendered oversized
// enough to overlap the "Sign out" label's own text in an earlier pass.
export function RoomsSidebar({ onSignOut }: RoomsSidebarProps) {
  return (
    <aside className="dash-sidebar dash-glass">
      <div className="flex items-center gap-3 px-2 mb-8">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.16)",
          }}
        >
          <Video size={18} style={{ color: "var(--color-text-primary)" }} aria-hidden="true" />
        </div>
        <span className="font-medium tracking-wide hidden md:inline">Meet</span>
      </div>

      <p className="text-xs text-muted px-2 mb-2 uppercase tracking-wide hidden md:block">Menu</p>
      <a href="#" className="dash-nav-item dash-nav-item-active mb-1">
        <CalendarDays size={16} aria-hidden="true" /> <span className="hidden md:inline">Meetings</span>
      </a>
      <a href="#templates" className="dash-nav-item">
        <ClipboardList size={16} aria-hidden="true" /> <span className="hidden md:inline">Templates</span>
      </a>

      <div className="flex-1" />

      <button type="button" onClick={onSignOut} className="dash-nav-item">
        <LogOut size={16} aria-hidden="true" /> <span className="hidden md:inline">Sign out</span>
      </button>
    </aside>
  );
}
