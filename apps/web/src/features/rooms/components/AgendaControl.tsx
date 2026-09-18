"use client";

import { useCallback, useEffect, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import {
  addAgendaItem,
  listAgenda,
  removeAgendaItem,
  toggleAgendaItem,
  type AgendaItem,
} from "../api";
import { useAuthStore } from "@/features/auth/store";

// Our own topic, distinct from "polls" (PollControl), "whiteboard"
// (WhiteboardControl), and "reactions" (ReactionsControl) — one data
// channel per room, topics just filter which handler sees which message.
const TOPIC = "agenda";

interface AgendaControlProps {
  roomId: string;
  // canManage (host OR co-host), not isHost — co-host gets the same
  // agenda-management rights as host, backed by RoomHostOrCoHostGuard on
  // the backend (see rooms.controller.ts's agenda routes).
  canManage: boolean;
}

// The agenda's question/items/completion state is genuinely persisted
// (AgendaItem rows in schema.prisma) — same design as PollControl, not
// LiveKit-only state, since a late joiner must see the exact current
// checklist, not just events broadcast after they connected.
//
// Live updates use BOTH a data-channel broadcast AND a REST fetch,
// deliberately — same reasoning as PollControl/WhiteboardControl. The
// channel is used only as a "something changed, go refetch" ping (never as
// the actual item data itself), so a dropped broadcast degrades to a late
// update, never a wrong one.
export function AgendaControl({ roomId, canManage }: AgendaControlProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reusable in event handlers (the data-channel callback below, and each
  // mutation's own broadcast) — NOT called directly from our own effect
  // body, matching PollControl's cancelled-flag idiom for the mount effect
  // itself.
  const refresh = useCallback(async () => {
    if (!accessToken) return;
    try {
      const current = await listAgenda(roomId, accessToken);
      setItems(current);
    } catch {
      // Transient network hiccup — keep showing the last known state
      // rather than flashing it away.
    }
  }, [roomId, accessToken]);

  // Runs once on mount for EVERY participant, host/co-host or not — the
  // late-joiner path: reflects whatever is in the database right now,
  // regardless of whether an "item added"/"item toggled"/"item removed"
  // broadcast happened before this component ever mounted.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const fetchCurrent = async () => {
      try {
        const current = await listAgenda(roomId, accessToken);
        if (!cancelled) setItems(current);
      } catch {
        // Transient network hiccup — keep the initial (empty) state rather
        // than throwing during mount.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    fetchCurrent();
    return () => {
      cancelled = true;
    };
  }, [roomId, accessToken]);

  // Fire-and-forget-triggered refetch, like PollControl's — the callback
  // here runs as a data-channel message handler (an external-system
  // subscription), not inside our own effect body, so calling setState via
  // refresh() here is the sanctioned pattern.
  const { send } = useDataChannel(TOPIC, () => {
    refresh();
  });

  const notifyChanged = useCallback(async () => {
    // Reliable, unlike ReactionsControl's lossy sends — a dropped ping
    // here would leave other participants' checklists stale until their
    // next unrelated refresh. Ping-only: no payload is trusted, refresh()
    // above is what actually reads the source of truth.
    await send(new TextEncoder().encode("changed"), { reliable: true });
  }, [send]);

  const handleAdd = async () => {
    if (!accessToken || !newTitle.trim()) return;
    setPending(true);
    setError(null);
    try {
      const created = await addAgendaItem(roomId, newTitle.trim(), accessToken);
      setItems((prev) => [...prev, created]);
      setNewTitle("");
      await notifyChanged();
    } catch {
      setError("Couldn't add that item");
    } finally {
      setPending(false);
    }
  };

  const handleToggle = async (itemId: string, completed: boolean) => {
    if (!accessToken) return;
    // Optimistic, in the SAME tick as setPending below — otherwise the
    // very next render (triggered by setPending itself, before the PATCH
    // resolves) would still read the OLD item.completed for this
    // checkbox's `checked` prop and force the just-clicked box back to
    // unchecked for a moment, a real, visible flicker (not just a test
    // artifact — Playwright's own .check() correctly refused to consider
    // that a legitimate state change).
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, completed } : item)),
    );
    setPending(true);
    try {
      const updated = await toggleAgendaItem(roomId, itemId, completed, accessToken);
      setItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
      await notifyChanged();
    } catch {
      // Roll back to the server's real state rather than trusting the
      // optimistic guess we just made.
      await refresh();
    } finally {
      setPending(false);
    }
  };

  const handleRemove = async (itemId: string) => {
    if (!accessToken) return;
    setPending(true);
    try {
      await removeAgendaItem(roomId, itemId, accessToken);
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      await notifyChanged();
    } catch {
      await refresh();
    } finally {
      setPending(false);
    }
  };

  if (!accessToken || !loaded) return null;

  // Nothing to show at all: no items yet, and this participant can't
  // manage the agenda either (so there's no "add" affordance for them).
  if (items.length === 0 && !canManage) return null;

  return (
    <div
      data-testid="agenda-control"
      className="absolute top-24 right-4 z-10 bg-black/80 text-white rounded p-3 text-sm w-64 flex flex-col gap-2"
    >
      <p className="font-medium">Agenda</p>

      <ul data-testid="agenda-list" className="flex flex-col gap-1">
        {items.map((item) => (
          <li
            key={item.id}
            data-testid={`agenda-item-${item.id}`}
            className="flex items-center gap-2 text-xs"
          >
            {canManage ? (
              <input
                data-testid={`agenda-item-checkbox-${item.id}`}
                type="checkbox"
                checked={item.completed}
                disabled={pending}
                onChange={(e) => handleToggle(item.id, e.target.checked)}
              />
            ) : (
              <span aria-hidden="true">{item.completed ? "☑" : "☐"}</span>
            )}
            <span className={item.completed ? "line-through text-gray-400 flex-1" : "flex-1"}>
              {item.title}
            </span>
            {canManage && (
              <button
                type="button"
                data-testid={`agenda-item-delete-${item.id}`}
                onClick={() => handleRemove(item.id)}
                disabled={pending}
                className="text-xs shrink-0"
                aria-label={`Remove ${item.title}`}
              >
                ✕
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-gray-300">No agenda items yet</li>}
      </ul>

      {canManage && (
        <div className="flex items-center gap-1">
          <input
            data-testid="agenda-add-input"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add an item"
            className="text-black text-xs rounded px-2 py-1 flex-1"
          />
          <button
            type="button"
            data-testid="agenda-add-submit"
            onClick={handleAdd}
            disabled={pending || !newTitle.trim()}
            className="text-xs underline disabled:opacity-50 shrink-0"
          >
            Add
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
