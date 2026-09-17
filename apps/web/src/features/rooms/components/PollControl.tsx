"use client";

import { useCallback, useEffect, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import { closePoll, createPoll, getCurrentPoll, votePoll, type Poll } from "../api";
import { useAuthStore } from "@/features/auth/store";

// Our own topic, distinct from "reactions" (ReactionsControl) and
// LiveKit's built-in "lk.chat" — one data channel per room, topics just
// filter which handler sees which message.
const TOPIC = "polls";
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

interface PollControlProps {
  roomId: string;
  isHost: boolean;
}

// Poll state (question/options/votes) is genuinely persisted — unlike a
// reaction or raised hand, results must survive a page refresh and be
// auditable after the call, so Postgres (Poll/PollOption/PollVote in
// schema.prisma) is the source of truth, not LiveKit state.
//
// Live updates use BOTH a data-channel broadcast AND a REST fetch,
// deliberately — see FEATURES.md's Research notes for the full writeup.
// Short version: the data channel is fire-and-forget, exactly like
// ReactionsControl's, so on its own it would silently miss a participant
// who joins (or refreshes) after a poll already exists or has already
// closed — the same late-joiner failure mode raise-hand's research
// documents. Here the channel is used only as a "something changed, go
// refetch" ping (never as the actual vote count itself) — a poll's tally
// must be exactly correct, unlike an ephemeral emoji, so the REST fetch
// it triggers is what's actually trusted, not the broadcast payload.
export function PollControl({ roomId, isHost }: PollControlProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reusable in event handlers (the data-channel callback below, and a
  // vote/create's error fallback) — NOT called directly from our own
  // effect body (see the mount effect below, which has its own
  // self-contained fetch instead, matching WaitingRoomHostPanel's
  // cancelled-flag idiom) since referencing an outer async setState
  // function from inside useEffect trips the set-state-in-effect lint
  // rule; three similar lines here beats fighting that rule for a
  // premature shared abstraction.
  const refresh = useCallback(async () => {
    if (!accessToken) return;
    try {
      const current = await getCurrentPoll(roomId, accessToken);
      setPoll(current);
    } catch {
      // Transient network hiccup — keep showing the last known state
      // rather than flashing it away.
    }
  }, [roomId, accessToken]);

  // Runs once on mount for EVERY participant, host or not — this is the
  // half of the design that covers a late joiner: it reflects whatever is
  // in the database right now, regardless of whether a "poll created" or
  // "vote cast" broadcast happened before this component ever mounted.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const fetchCurrent = async () => {
      try {
        const current = await getCurrentPoll(roomId, accessToken);
        if (!cancelled) setPoll(current);
      } catch {
        // Transient network hiccup — keep the initial (empty) state
        // rather than throwing during mount.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    fetchCurrent();
    return () => {
      cancelled = true;
    };
  }, [roomId, accessToken]);

  // Fire-and-forget broadcast, like ReactionsControl's — the callback
  // here runs as a data-channel message handler (an external-system
  // subscription), not inside our own effect body, so calling setState
  // via refresh() here is the sanctioned pattern.
  const { send } = useDataChannel(TOPIC, () => {
    refresh();
  });

  const notifyChanged = useCallback(async () => {
    // Reliable, unlike ReactionsControl's lossy sends — this is a small,
    // low-frequency signal (not spammy like reactions), and a dropped
    // ping would leave other participants' UIs stale until their next
    // unrelated refresh, so paying for delivery here is worth it. It's
    // still only ever treated as a trigger, never as data — refresh()
    // above is what actually reads the source of truth.
    await send(new TextEncoder().encode("changed"), { reliable: true });
  }, [send]);

  const resetCreateForm = () => {
    setQuestion("");
    setOptions(["", ""]);
    setError(null);
    setShowCreateForm(false);
  };

  const handleCreate = async () => {
    if (!accessToken) return;
    const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || trimmedOptions.length < MIN_OPTIONS) {
      setError(`Enter a question and at least ${MIN_OPTIONS} options`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await createPoll(roomId, { question: question.trim(), options: trimmedOptions }, accessToken);
      setPoll(created);
      resetCreateForm();
      await notifyChanged();
    } catch {
      setError("Couldn't create the poll — it may already have an open one.");
    } finally {
      setPending(false);
    }
  };

  const handleVote = async (optionId: string) => {
    if (!accessToken || !poll) return;
    setPending(true);
    try {
      const updated = await votePoll(roomId, poll.id, optionId, accessToken);
      setPoll(updated);
      await notifyChanged();
    } catch {
      // Most likely a 409 (already voted, or the poll just closed) — a
      // refetch shows the caller the actual current state either way.
      await refresh();
    } finally {
      setPending(false);
    }
  };

  const handleClose = async () => {
    if (!accessToken || !poll) return;
    setPending(true);
    try {
      const closed = await closePoll(roomId, poll.id, accessToken);
      setPoll(closed);
      await notifyChanged();
    } finally {
      setPending(false);
    }
  };

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };

  const addOption = () => {
    setOptions((prev) => (prev.length < MAX_OPTIONS ? [...prev, ""] : prev));
  };

  const removeOption = (index: number) => {
    setOptions((prev) => (prev.length > MIN_OPTIONS ? prev.filter((_, i) => i !== index) : prev));
  };

  if (!accessToken || !loaded) return null;

  // Nothing to show at all: no poll yet, and this participant isn't the
  // host (so there's no "create" affordance for them either).
  if (!poll && !isHost) return null;

  // A regular participant sees vote buttons until they vote (or the poll
  // closes), then switches to results — same "don't show the answer
  // before you've answered" behavior most poll UIs use. The host is the
  // one exception: they see live results the moment the poll exists,
  // whether or not they've voted themselves, since monitoring results
  // (not participating) is their primary reason to have this panel open
  // — but they can still vote too if they want (canVote below is
  // independent of showResults).
  const showResults = !poll || poll.status === "closed" || poll.hasVoted || isHost;
  const canVote = !!poll && poll.status === "open" && !poll.hasVoted;

  return (
    <div
      data-testid="poll-control"
      className="absolute bottom-20 left-4 z-10 bg-black/80 text-white rounded p-3 text-sm w-64 flex flex-col gap-2"
    >
      {!poll && isHost && !showCreateForm && (
        <button
          type="button"
          data-testid="poll-open-create"
          onClick={() => setShowCreateForm(true)}
          className="text-xs underline self-start"
        >
          📊 Create poll
        </button>
      )}

      {!poll && isHost && showCreateForm && (
        <div data-testid="poll-create-form" className="flex flex-col gap-2">
          <p className="font-medium">New poll</p>
          <input
            data-testid="poll-question-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question"
            className="text-black text-xs rounded px-2 py-1"
          />
          {options.map((opt, index) => (
            <div key={index} className="flex items-center gap-1">
              <input
                data-testid={`poll-option-input-${index}`}
                value={opt}
                onChange={(e) => updateOption(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
                className="text-black text-xs rounded px-2 py-1 flex-1"
              />
              {options.length > MIN_OPTIONS && (
                <button type="button" onClick={() => removeOption(index)} className="text-xs shrink-0" aria-label={`Remove option ${index + 1}`}>
                  ✕
                </button>
              )}
            </div>
          ))}
          {options.length < MAX_OPTIONS && (
            <button type="button" onClick={addOption} className="text-xs underline self-start">
              + Add option
            </button>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="poll-submit-create"
              onClick={handleCreate}
              disabled={pending}
              className="text-xs underline disabled:opacity-50"
            >
              Start poll
            </button>
            <button type="button" onClick={resetCreateForm} className="text-xs underline">
              Cancel
            </button>
          </div>
        </div>
      )}

      {poll && (
        <div data-testid="poll-active" className="flex flex-col gap-2">
          <p className="font-medium">{poll.question}</p>
          {poll.status === "closed" && <p className="text-xs text-gray-300">Poll closed</p>}

          {canVote && (
            <ul data-testid="poll-vote-options" className="flex flex-col gap-1">
              {poll.options.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => handleVote(option.id)}
                    disabled={pending}
                    className="text-xs underline disabled:opacity-50 text-left"
                  >
                    {option.text}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showResults && (
            <ul data-testid="poll-results" className="flex flex-col gap-1">
              {poll.options.map((option) => {
                const pct = poll.totalVotes > 0 ? Math.round((option.voteCount / poll.totalVotes) * 100) : 0;
                return (
                  <li key={option.id} className="text-xs">
                    <div className="flex justify-between">
                      <span className={option.id === poll.votedOptionId ? "font-semibold" : ""}>
                        {option.text}
                        {option.id === poll.votedOptionId ? " (your vote)" : ""}
                      </span>
                      <span>
                        {option.voteCount} · {pct}%
                      </span>
                    </div>
                    <div className="h-1 bg-white/20 rounded mt-0.5">
                      <div className="h-1 bg-white rounded" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
              <li className="text-xs text-gray-300">{poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"} total</li>
            </ul>
          )}

          {isHost && poll.status === "open" && (
            <button
              type="button"
              data-testid="poll-close"
              onClick={handleClose}
              disabled={pending}
              className="text-xs underline disabled:opacity-50 self-start"
            >
              Close poll
            </button>
          )}

          {isHost && poll.status === "closed" && !showCreateForm && (
            <button
              type="button"
              data-testid="poll-open-create"
              onClick={() => {
                setPoll(null);
                setShowCreateForm(true);
              }}
              className="text-xs underline self-start"
            >
              📊 New poll
            </button>
          )}
        </div>
      )}
    </div>
  );
}
