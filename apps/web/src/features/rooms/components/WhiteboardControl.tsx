"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import {
  addWhiteboardStroke,
  clearWhiteboard,
  listWhiteboardStrokes,
  undoLastWhiteboardStroke,
  type WhiteboardPoint,
  type WhiteboardStroke,
} from "../api";
import { useAuthStore } from "@/features/auth/store";

interface WhiteboardControlProps {
  roomId: string;
  isHost: boolean;
}

// "whiteboard" is our own topic, distinct from "reactions" and LiveKit's
// built-in "lk.chat" — same one-channel-per-room, topics-just-filter
// model as ReactionsControl. Sent reliable (unlike reactions' lossy
// sends): a dropped reaction just never appears, which is fine, but a
// dropped stroke would leave two participants' canvases silently
// disagreeing for the rest of the call — there's no later re-sync once
// the initial REST fetch on mount has already happened.
const TOPIC = "whiteboard";

// Fixed, non-DPI-scaled canvas size — the "blank canvas, freehand pen
// only" scope this feature is deliberately kept to (see FEATURES.md's
// Research notes) doesn't need crisp retina rendering or a resizable
// canvas; every point is stored normalized 0-1 anyway so the actual
// pixel size here is just a rendering choice, not part of the wire format.
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 400;

const COLORS = ["#111111", "#e11d48", "#2563eb", "#16a34a", "#f59e0b"];
const DEFAULT_WIDTH = 3;

type WhiteboardMessage =
  | { type: "stroke"; stroke: WhiteboardStroke }
  | { type: "undo"; strokeId: string }
  | { type: "clear" };

function drawStroke(ctx: CanvasRenderingContext2D, stroke: { points: WhiteboardPoint[]; color: string; width: number }) {
  if (stroke.points.length < 2) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x * CANVAS_WIDTH, stroke.points[0].y * CANVAS_HEIGHT);
  for (const p of stroke.points.slice(1)) {
    ctx.lineTo(p.x * CANVAS_WIDTH, p.y * CANVAS_HEIGHT);
  }
  ctx.stroke();
}

// A blank shared canvas, not an overlay on top of the shared-screen video
// (FEATURES.md's Research notes flags that overlay-alignment problem as
// a separate, harder open question — v1 scope here is just "a shared
// canvas participants can draw on with a pen tool"). Rendered for every
// participant (not host-gated) since "collaborative" defaults to
// everyone-can-draw; isHost is only used to decide whether "Clear
// canvas" (which wipes everyone else's work too, not just your own) is
// shown — see rooms.controller.ts for why that one action alone is
// RoomHostGuard while drawing/undo are RoomMemberGuard.
export function WhiteboardControl({ roomId, isHost }: WhiteboardControlProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [open, setOpen] = useState(false);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<WhiteboardPoint[] | null>(null);

  // Fetched unconditionally on mount, not lazily on first open — this is
  // the late-joiner path (see FEATURES.md's Research notes): a
  // participant who joins after strokes already exist must see them the
  // first time they open the panel, not just from live events they
  // happened to be connected for. A pure LiveKit data-channel broadcast
  // is fire-and-forget and would silently miss anything drawn before
  // this participant connected — the exact gap raise-hand's Research
  // notes already worked through for participant metadata; a whiteboard's
  // stroke history doesn't fit in a metadata string, so persisting it in
  // Postgres and fetching it via REST is the analogous fix here.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listWhiteboardStrokes(roomId, accessToken)
      .then((fetched) => {
        if (!cancelled) setStrokes(fetched);
      })
      .catch(() => {
        // A failed initial fetch just leaves the canvas empty rather
        // than crashing the call — the same "degrade, don't break"
        // posture as BackgroundEffectsControl's model-load failure.
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, accessToken]);

  const redraw = useCallback(
    (pending?: WhiteboardPoint[]) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      for (const stroke of strokes) drawStroke(ctx, stroke);
      if (pending) drawStroke(ctx, { points: pending, color, width: DEFAULT_WIDTH });
    },
    [strokes, color],
  );

  useEffect(() => {
    if (open) redraw();
  }, [open, redraw]);

  const { send } = useDataChannel(TOPIC, (msg) => {
    let message: WhiteboardMessage | undefined;
    try {
      message = JSON.parse(new TextDecoder().decode(msg.payload)) as WhiteboardMessage;
    } catch {
      // A malformed payload (buggy or malicious client) — ignore rather
      // than crash the call for everyone else.
      return;
    }
    if (!message || typeof message !== "object") return;

    if (message.type === "stroke") {
      setStrokes((prev) => (prev.some((s) => s.id === message!.stroke.id) ? prev : [...prev, message!.stroke]));
    } else if (message.type === "undo") {
      setStrokes((prev) => prev.filter((s) => s.id !== message!.strokeId));
    } else if (message.type === "clear") {
      setStrokes([]);
    }
  });

  const broadcast = useCallback(
    async (message: WhiteboardMessage) => {
      // Reliable: a stroke silently missed by one participant means two
      // people's canvases permanently disagree for the rest of the call
      // (there's no later re-sync short of a re-fetch), unlike a dropped
      // reaction which just never appears and is immediately forgotten
      // anyway.
      await send(new TextEncoder().encode(JSON.stringify(message)), { reliable: true });
    },
    [send],
  );

  const getPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>): WhiteboardPoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = [getPoint(e)];
    },
    [getPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = [...drawingRef.current, getPoint(e)];
      redraw(drawingRef.current);
    },
    [getPoint, redraw],
  );

  const handlePointerUp = useCallback(async () => {
    const points = drawingRef.current;
    drawingRef.current = null;
    // A single click with no drag produces one point — not a line, so
    // not worth persisting as a stroke (also fails the backend DTO's
    // minimum of 2 points).
    if (!points || points.length < 2 || !accessToken) {
      redraw();
      return;
    }
    try {
      const stroke = await addWhiteboardStroke(roomId, { points, color, width: DEFAULT_WIDTH }, accessToken);
      setStrokes((prev) => [...prev, stroke]);
      // The data channel only delivers to OTHER participants, not back
      // to the sender (same as ReactionsControl) — our own stroke is
      // already added to local state above.
      await broadcast({ type: "stroke", stroke });
    } catch {
      redraw();
    }
  }, [accessToken, roomId, color, broadcast, redraw]);

  const handleUndo = useCallback(async () => {
    if (!accessToken) return;
    try {
      const stroke = await undoLastWhiteboardStroke(roomId, accessToken);
      setStrokes((prev) => prev.filter((s) => s.id !== stroke.id));
      await broadcast({ type: "undo", strokeId: stroke.id });
    } catch {
      // Nothing of the caller's own left to undo — no-op, not an error
      // worth surfacing.
    }
  }, [accessToken, roomId, broadcast]);

  const handleClear = useCallback(async () => {
    if (!accessToken) return;
    await clearWhiteboard(roomId, accessToken);
    setStrokes([]);
    await broadcast({ type: "clear" });
  }, [accessToken, roomId, broadcast]);

  // top-20 left-4 — bottom-4 left-4 collides with CoHostControl (added
  // on a separate branch, merged around the same time). See the flagged
  // follow-up task for auditing every floating panel's position properly
  // with real content-height clearance rather than guessed offsets.
  return (
    <div data-testid="whiteboard-control" className="absolute top-20 left-4 z-20 flex flex-col items-start gap-2">
      <button
        type="button"
        data-testid="whiteboard-toggle"
        onClick={() => setOpen((o) => !o)}
        className="bg-black/80 text-white rounded p-3 text-sm"
      >
        {open ? "Close whiteboard" : "🖊 Whiteboard"}
      </button>

      {open && (
        <div data-testid="whiteboard-panel" className="bg-white text-black rounded shadow-lg p-2 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`w-5 h-5 rounded-full border-2 ${color === c ? "border-black" : "border-transparent"}`}
              />
            ))}
            <input
              type="color"
              aria-label="Custom color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-6 h-6"
            />
            <button type="button" onClick={handleUndo} className="ml-2 underline">
              Undo
            </button>
            {isHost && (
              <button type="button" onClick={handleClear} className="underline">
                Clear canvas
              </button>
            )}
          </div>
          <canvas
            ref={canvasRef}
            data-testid="whiteboard-canvas"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            style={{ touchAction: "none", width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
            className="border border-gray-300 rounded cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>
      )}
    </div>
  );
}
