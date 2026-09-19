"use client";

import { useCallback, useState } from "react";
import { useDataChannel, useLocalParticipant } from "@livekit/components-react";
import { Smile } from "lucide-react";

// "reactions" is our own topic, deliberately distinct from LiveKit's own
// built-in chat topic ("lk.chat") so the two never collide on the same
// data channel — there's only one channel per room; topics are just a
// filter, not a separate connection. See FEATURES.md's Research notes
// for why this data-channel approach was chosen over any alternative
// (it reuses the call's already-authenticated, already-encrypted
// connection rather than opening a new one).
const TOPIC = "reactions";
const REACTIONS = ["👍", "❤️", "😂", "🎉", "👏"];
const SEND_COOLDOWN_MS = 1500;
const DISPLAY_DURATION_MS = 3000;

interface FloatingReaction {
  id: string;
  emoji: string;
  senderName: string;
}

interface ReactionPayload {
  emoji: string;
}

// Ephemeral by design — not persisted anywhere (no DB, no chat history).
// Rendered for every participant, not just the host, since anyone can
// react. No dynamic/ssr:false import needed here (unlike
// BackgroundEffectsControl/NoiseCancellationControl) — useDataChannel is
// LiveKit's own hook, already proven safe to import directly elsewhere
// in this codebase (HostControls uses useParticipants the same way).
//
// Self-contained toggle + popover now (not a permanently-visible 5-emoji
// row) — collapsing every rarely-needed control behind a single trigger
// is what keeps the tray itself down to 6 buttons instead of a dozen+
// simultaneously-visible controls (see the agreed reference mockup). The
// data-channel subscription and floating-bubble display stay mounted
// unconditionally regardless of whether the picker itself is open — a
// participant must still SEE other people's reactions even while their
// own picker is closed.
export function ReactionsControl() {
  const { localParticipant } = useLocalParticipant();
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const [onCooldown, setOnCooldown] = useState(false);
  const [open, setOpen] = useState(false);

  const showReaction = useCallback((emoji: string, senderName: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setFloating((prev) => [...prev, { id, emoji, senderName }]);
    setTimeout(() => {
      setFloating((prev) => prev.filter((r) => r.id !== id));
    }, DISPLAY_DURATION_MS);
  }, []);

  const { send } = useDataChannel(TOPIC, (msg) => {
    let emoji: string | undefined;
    try {
      const decoded = JSON.parse(new TextDecoder().decode(msg.payload)) as ReactionPayload;
      emoji = decoded.emoji;
    } catch {
      // A malformed payload (buggy or malicious client) — ignore rather
      // than crash the call for everyone else.
      return;
    }
    if (typeof emoji !== "string") return;

    showReaction(emoji, msg.from?.name || msg.from?.identity || "Someone");
  });

  const handleSend = useCallback(
    async (emoji: string) => {
      if (onCooldown) return;
      setOnCooldown(true);
      setTimeout(() => setOnCooldown(false), SEND_COOLDOWN_MS);

      const payload: ReactionPayload = { emoji };
      // Lossy, not reliable — a dropped reaction just never appears,
      // which is fine and correct for something this ephemeral (unlike
      // a chat message, nobody needs delivery guarantees on an emoji).
      await send(new TextEncoder().encode(JSON.stringify(payload)), { reliable: false });

      // The data channel only delivers to OTHER participants, not back
      // to the sender — show our own reaction locally so we see it too.
      showReaction(emoji, localParticipant.name || "You");
      setOpen(false);
    },
    [onCooldown, send, localParticipant, showReaction],
  );

  return (
    <>
      <div className="tray-item-with-popover">
        <button
          type="button"
          data-testid="reactions-toggle"
          aria-label="React"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`tray-button ${open ? "tray-button-active" : ""}`}
        >
          <Smile size={20} />
        </button>
        {open && (
          <div data-testid="reactions-popover" className="tray-popover flex gap-2">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSend(emoji)}
                disabled={onCooldown}
                className="text-xl disabled:opacity-40"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* This one stays independently positioned — floating reaction
          bubbles drift upward over the video regardless of whether the
          picker itself is open. */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col gap-1 items-center pointer-events-none">
        {floating.map((r) => (
          <div key={r.id} className="panel-surface text-sm px-2 py-1">
            {r.emoji} {r.senderName}
          </div>
        ))}
      </div>
    </>
  );
}
