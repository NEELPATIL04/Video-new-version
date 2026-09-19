"use client";

import { useEffect, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { getRoom, lockRoom, unlockRoom } from "../api";
import { useAuthStore } from "@/features/auth/store";

interface MeetingLockControlProps {
  roomId: string;
}

// Host-only. Rendered as a compact pill inside CallSidePanel's icon rail
// (not its own floating panel — a single boolean toggle doesn't need a
// drawer section). Not rendered for regular participants at all — they
// have no use for a toggle they can't act on (CallRoom gates this the
// same way it gates the other host-only controls).
//
// "Locked" blocks brand-new joiners in RoomsService.joinRoom; it never
// affects anyone who already has a Participant row, including the host —
// see the service's own comment on why that reuses the exact same
// "existing member" check as the capacity gate rather than new logic.
// That means the host can freely lock a meeting mid-call without any risk
// of locking themselves out, and anyone already admitted can always
// reconnect after a network drop regardless of the lock state.
export function MeetingLockControl({ roomId }: MeetingLockControlProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [locked, setLocked] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  // joinRoom's response doesn't include the full Room object (just the
  // Participant), so the initial locked state is fetched once here rather
  // than threaded down as a prop from the page.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getRoom(roomId, accessToken)
      .then((room) => {
        if (!cancelled) setLocked(room.locked);
      })
      .catch(() => {
        // Transient hiccup fetching initial state — leave the control
        // hidden rather than risk showing the wrong lock state.
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, accessToken]);

  if (locked === null || !accessToken) return null;

  const handleToggle = async () => {
    setPending(true);
    try {
      const room = locked ? await unlockRoom(roomId, accessToken) : await lockRoom(roomId, accessToken);
      setLocked(room.locked);
    } finally {
      setPending(false);
    }
  };

  return (
    <div data-testid="meeting-lock-control">
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        // Ember marks "the meeting is currently locked" — the one active/
        // needs-attention state this control has. Unlocked (the default)
        // stays the plain rail-button look. The menu-row reskin (globals.css)
        // forces this button's background transparent, so the ember cue
        // lives on the icon/text color instead of rail-button-active's bg.
        className="rail-button w-auto px-3 text-xs whitespace-nowrap disabled:opacity-50"
        style={{ color: locked ? "var(--color-ember)" : undefined }}
      >
        {locked ? <Unlock size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
        {locked ? "Unlock meeting" : "Lock meeting"}
      </button>
    </div>
  );
}
