"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocalParticipant, useParticipants } from "@livekit/components-react";
import { lowerParticipantHand } from "../api";
import { useAuthStore } from "@/features/auth/store";

interface RaiseHandControlProps {
  roomId: string;
  isHost: boolean;
}

interface HandMetadata {
  handRaised?: boolean;
}

function isHandRaised(metadata?: string): boolean {
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
// anyone else's metadata. Lowering ANOTHER participant's hand (a host
// queue-management action) can't go through that same call, so it's a
// backend endpoint instead (POST .../lower-hand), guarded the same
// assertActiveNonSelfParticipant way as mute/remove.
export function RaiseHandControl({ roomId, isHost }: RaiseHandControlProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const [pendingSelf, setPendingSelf] = useState(false);
  const [pendingIdentity, setPendingIdentity] = useState<string | null>(null);

  const selfRaised = isHandRaised(localParticipant.metadata);

  const raisedHands = useMemo(
    () => participants.filter((p) => isHandRaised(p.metadata)),
    [participants],
  );

  const handleToggleSelf = useCallback(async () => {
    setPendingSelf(true);
    try {
      await localParticipant.setMetadata(JSON.stringify({ handRaised: !selfRaised }));
    } finally {
      setPendingSelf(false);
    }
  }, [localParticipant, selfRaised]);

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

  return (
    <div
      data-testid="raise-hand-control"
      className="absolute bottom-20 right-4 z-10 bg-black/80 text-white rounded p-3 text-sm w-56 flex flex-col gap-2"
    >
      <button
        type="button"
        onClick={handleToggleSelf}
        disabled={pendingSelf}
        className="text-xs underline disabled:opacity-50 self-start"
      >
        {selfRaised ? "Lower hand" : "✋ Raise hand"}
      </button>

      {raisedHands.length > 0 && (
        <>
          <p className="font-medium">Raised hands ({raisedHands.length})</p>
          <ul className="flex flex-col gap-2">
            {raisedHands.map((p) => (
              <li key={p.identity} className="flex items-center justify-between gap-2">
                <span className="truncate">✋ {p.isLocal ? "You" : p.name ?? p.identity}</span>
                {isHost && !p.isLocal && (
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
        </>
      )}
    </div>
  );
}
