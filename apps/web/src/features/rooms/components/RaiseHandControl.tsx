"use client";

import { useCallback, useMemo, useState } from "react";
import { useParticipants } from "@livekit/components-react";
import { lowerParticipantHand } from "../api";
import { useAuthStore } from "@/features/auth/store";

interface RaiseHandControlProps {
  roomId: string;
  // True for the host AND a co-host — either can lower someone else's
  // hand (RoomHostOrCoHostGuard backs the lower-hand endpoint). Named
  // canManage rather than isHost since it's no longer strictly "are you
  // THE host" — see FEATURES.md's Research notes on Co-host.
  canManage: boolean;
}

interface HandMetadata {
  handRaised?: boolean;
}

// Exported for VideoStage's own compact toggle button in the main tray —
// both read/write the same localParticipant.metadata, so LiveKit's own
// reactive hooks keep them in sync with no shared React state needed.
export function isHandRaised(metadata?: string): boolean {
  if (!metadata) return false;
  try {
    return (JSON.parse(metadata) as HandMetadata).handRaised === true;
  } catch {
    // A malformed/unexpected metadata string — treat as "not raised"
    // rather than crashing the call for everyone.
    return false;
  }
}

// Raised-hand state is CURRENT STATE ("whose hand is up right now"), not a
// one-off event like a reaction — a participant who joins the call AFTER
// someone already raised their hand still needs to see it raised. That
// rules out ReactionsControl's data-channel broadcast (fire-and-forget;
// a late joiner simply never received the original event) and points at
// LiveKit participant metadata instead: LiveKit resyncs every connected
// participant's current metadata to anyone who joins later as part of
// normal room state, which is exactly the property this feature needs.
// See FEATURES.md's Research notes for the fuller writeup, including why
// this isn't a DB field (it's live call state, not something needing a
// row or history, unlike Participant.admittedAt).
//
// Raising/lowering YOUR OWN hand calls localParticipant.setMetadata()
// directly, client-side, no backend round trip — safe because the
// LiveKit access token's canUpdateOwnMetadata grant restricts this to a
// participant's own identity; LiveKit itself won't let this call touch
// anyone else's metadata. The toggle for that lives in VideoStage's own
// tray now (an icon-only button next to mic/camera/leave, reading/writing
// the same metadata via the same isHandRaised helper above) — this
// component keeps only the "who else has raised their hand" list and the
// host/co-host-only "lower someone else's hand" action, which IS a
// backend endpoint (POST .../lower-hand), guarded the same
// assertActiveNonSelfParticipant way as mute/remove, since it acts on
// another participant.
export function RaiseHandControl({ roomId, canManage }: RaiseHandControlProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const participants = useParticipants();
  const [pendingIdentity, setPendingIdentity] = useState<string | null>(null);

  const raisedHands = useMemo(
    () => participants.filter((p) => isHandRaised(p.metadata)),
    [participants],
  );
  // Your OWN raised hand already glows on the tray button itself — this
  // popover exists to surface OTHER people's raised hands, so it should
  // only appear when there's actually one to show. Without this, raising
  // just your own hand pops up a redundant "Raised hands (1) — You" list
  // right next to the button already showing that same state.
  const hasOtherRaisedHand = raisedHands.some((p) => !p.isLocal);

  const handleLowerOther = useCallback(
    async (identity: string) => {
      if (!accessToken) return;
      setPendingIdentity(identity);
      try {
        await lowerParticipantHand(roomId, identity, accessToken);
      } finally {
        setPendingIdentity(null);
      }
    },
    [roomId, accessToken],
  );

  if (!hasOtherRaisedHand) return null;

  return (
    <div data-testid="raise-hand-control" className="panel-surface p-3 text-sm flex flex-col gap-2">
      <p className="font-medium">Raised hands ({raisedHands.length})</p>
      <ul className="flex flex-col gap-2">
        {raisedHands.map((p) => (
          <li key={p.identity} className="flex items-center justify-between gap-2">
            <span className="truncate">✋ {p.isLocal ? "You" : p.name ?? p.identity}</span>
            {canManage && !p.isLocal && (
              <button
                type="button"
                onClick={() => handleLowerOther(p.identity)}
                disabled={pendingIdentity === p.identity}
                className="text-xs underline disabled:opacity-50 shrink-0"
              >
                Lower
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
