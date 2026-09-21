"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MoreHorizontal, Users, Crown, LayoutGrid, SlidersHorizontal, BarChart3, ClipboardList, type LucideIcon } from "lucide-react";
import { HostControls } from "./HostControls";
import { WaitingRoomHostPanel } from "./WaitingRoomHostPanel";
import { CoHostControl } from "./CoHostControl";
import { BreakoutRoomsHostPanel } from "./BreakoutRoomsHostPanel";
import { PollControl } from "./PollControl";
import { AgendaControl } from "./AgendaControl";
import { MeetingLockControl } from "./MeetingLockControl";
import { WhiteboardControl } from "./WhiteboardControl";
import { PictureInPictureControl } from "./PictureInPictureControl";

// Same reasoning as CallRoom.tsx's own dynamic imports: both packages
// touch browser-only APIs (WebGL/insertable-streams, an AudioWorklet)
// at import time, so ssr:false keeps them out of the server render and
// out of the initial bundle for anyone who never opens this section.
const BackgroundEffectsControl = dynamic(
  () => import("./BackgroundEffectsControl").then((m) => m.BackgroundEffectsControl),
  { ssr: false },
);
const NoiseCancellationControl = dynamic(
  () => import("./NoiseCancellationControl").then((m) => m.NoiseCancellationControl),
  { ssr: false },
);

type Section = "people" | "cohosts" | "breakout" | "background" | "polls" | "agenda";

interface MenuItem {
  section: Section;
  icon: LucideIcon;
  label: string;
}

interface CallSidePanelProps {
  roomId: string;
  canManage: boolean;
  isHost: boolean;
  // The drawer below is `fixed ... right-4 w-80` — the same rightmost
  // ~336px of the viewport .video-stage-chat occupies when chat is open
  // (also 320px wide, flush to the edge, see globals.css). Without this,
  // opening any section while chat is open renders the drawer directly
  // on top of the chat panel. Shifts the drawer's own right offset past
  // chat's width instead, rather than making the two mutually exclusive
  // — a participant should be able to check the agenda/poll/people list
  // while still keeping chat open, the same way they could before chat
  // was reachable at all.
  showChat: boolean;
}

// A single "More" trigger + dropdown menu, replacing what used to be an
// 8-icon rail permanently visible on screen — collapsing every
// occasionally-needed control behind one control is what keeps the call
// screen's persistent chrome down to the agreed 6-button tray instead of
// a dozen+ simultaneously-visible icons (see the reference mockup this
// was built against). Every existing panel component underneath keeps
// its own state/polling/handlers completely unchanged — this only
// changes how each one is reached. The drawer (one section's content at
// a time, never overlapping) is unchanged from the previous rail-based
// version.
export function CallSidePanel({ roomId, canManage, isHost, showChat }: CallSidePanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<Section | null>(null);

  const items: MenuItem[] = [
    ...(canManage ? [{ section: "people" as const, icon: Users, label: "People" }] : []),
    ...(isHost ? [{ section: "cohosts" as const, icon: Crown, label: "Co-hosts" }] : []),
    ...(isHost ? [{ section: "breakout" as const, icon: LayoutGrid, label: "Breakout rooms" }] : []),
    { section: "background", icon: SlidersHorizontal, label: "Background & audio" },
    { section: "polls", icon: BarChart3, label: "Polls" },
    { section: "agenda", icon: ClipboardList, label: "Agenda" },
  ];

  const sectionTitle: Record<Section, string> = {
    people: "People",
    cohosts: "Co-hosts",
    breakout: "Breakout rooms",
    background: "Background & audio",
    polls: "Polls",
    agenda: "Agenda",
  };

  const openSection = (section: Section) => {
    setActiveSection(section);
    setMenuOpen(false);
  };

  return (
    <div className="tray-item-with-popover">
      <button
        type="button"
        data-testid="more-menu-toggle"
        aria-label="More"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
        className={`tray-button ${menuOpen ? "tray-button-active" : ""}`}
      >
        <MoreHorizontal size={20} />
      </button>

      {menuOpen && (
        <div data-testid="more-menu" className="tray-popover more-menu">
          {items.map((item) => (
            <button
              key={item.section}
              type="button"
              data-testid={`more-menu-${item.section}`}
              onClick={() => openSection(item.section)}
              className="more-menu-item"
            >
              <item.icon size={16} aria-hidden="true" />
              {item.label}
            </button>
          ))}
          {/* These three wrap existing, unchanged components — each
              already renders its own complete action (a toggle, or an
              overlay-opening button), just restyled by the .more-menu
              scope in globals.css to read as a menu row instead of a
              standalone circular/pill control. */}
          {canManage && <MeetingLockControl roomId={roomId} />}
          <WhiteboardControl roomId={roomId} isHost={isHost} />
          <PictureInPictureControl />
        </div>
      )}

      {activeSection && (
        <div
          data-testid="call-side-drawer"
          className={`fixed top-20 bottom-20 z-20 w-80 drawer-surface p-4 overflow-y-auto flex flex-col gap-4 ${showChat ? "right-[340px]" : "right-4"}`}
        >
          <div className="flex items-center justify-between">
            <p className="font-medium">{sectionTitle[activeSection]}</p>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setActiveSection(null)}
              className="text-xs underline"
            >
              Close
            </button>
          </div>

          {activeSection === "people" && canManage && (
            <>
              <HostControls roomId={roomId} />
              <WaitingRoomHostPanel roomId={roomId} />
            </>
          )}
          {activeSection === "cohosts" && isHost && <CoHostControl roomId={roomId} />}
          {activeSection === "breakout" && isHost && <BreakoutRoomsHostPanel roomId={roomId} />}
          {activeSection === "background" && (
            <>
              <BackgroundEffectsControl />
              <NoiseCancellationControl />
            </>
          )}
          {activeSection === "polls" && <PollControl roomId={roomId} isHost={isHost} />}
          {activeSection === "agenda" && <AgendaControl roomId={roomId} canManage={canManage} />}
        </div>
      )}
    </div>
  );
}
