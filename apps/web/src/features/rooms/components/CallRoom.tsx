"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ExternalE2EEKeyProvider } from "livekit-client";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import { getJoinStatus, type Participant } from "../api";
import { useAuthStore } from "@/features/auth/store";
import { CoHostControl } from "./CoHostControl";
import { HostControls } from "./HostControls";
import { MeetingLockControl } from "./MeetingLockControl";
import { PictureInPictureControl } from "./PictureInPictureControl";
import { ReactionsControl } from "./ReactionsControl";
import { RaiseHandControl } from "./RaiseHandControl";
import { WaitingRoomHostPanel } from "./WaitingRoomHostPanel";

// @livekit/track-processors pulls in MediaPipe's WASM segmentation model
// (~400KB+) and touches browser-only APIs (WebGL/insertable streams) at
// import time — ssr:false keeps it out of the server render entirely and
// out of the initial page bundle, loaded only once the call UI mounts.
const BackgroundEffectsControl = dynamic(
  () => import("./BackgroundEffectsControl").then((m) => m.BackgroundEffectsControl),
  { ssr: false },
);

// Same reasoning as above — @sapphi-red/web-noise-suppressor loads an
// AudioWorklet + WASM binary, both browser-only.
const NoiseCancellationControl = dynamic(
  () => import("./NoiseCancellationControl").then((m) => m.NoiseCancellationControl),
  { ssr: false },
);

type ParticipantRole = Participant["role"];

interface CallRoomProps {
  roomId: string;
  liveKitUrl: string;
  liveKitToken: string;
  // The role this participant had at the moment they joined. Can go
  // stale mid-call — a host promoting someone to co-host needs that
  // change to visibly unlock host panels for an ALREADY-connected
  // participant, not just after a refresh — so this is only the seed
  // value for the live-tracked `role` state below, not read directly.
  initialRole: ParticipantRole;
  // Present only when this room is E2EE-enabled AND this participant's
  // URL carried the key (see the [id]/page.tsx gate that refuses to
  // reach this component at all otherwise). Absent entirely for a
  // non-encrypted room — there is no "encryption off" value, only
  // "no key was ever provided."
  e2eeKey?: string;
}

// Thin wrapper around LiveKit's own pre-built VideoConference prefab — grid
// layout, screen share, chat, and controls all come from the SDK. We don't
// hand-roll any of that (DEV_STANDARDS.md §9: use official SDKs, don't
// reimplement what they already solve).
//
// audio/video are deliberately NOT set to `true` here. When they are,
// LiveKitRoom tries to acquire the camera/mic as part of the connect
// handshake itself and treats a permission denial as a connection
// failure — so anyone who declines the browser permission prompt (a very
// normal thing to do) gets silently disconnected from the room entirely,
// not just joined without media. Leaving them unset connects the room
// signaling regardless of device permissions; VideoConference's own
// control bar lets the participant turn camera/mic on afterward once
// they've granted access.
export function CallRoom({ roomId, liveKitUrl, liveKitToken, initialRole, e2eeKey }: CallRoomProps) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [e2eeError, setE2eeError] = useState<string | null>(null);

  // Polls join-status (already used by WaitingRoom while pending) every
  // few seconds so a host promoting/demoting someone mid-call visibly
  // changes what THIS already-connected participant sees, without them
  // needing to refresh or reconnect. join-status is a cheap, idempotent
  // GET for an already-admitted participant — it just re-resolves to
  // "admitted" with whatever the current role is. See FEATURES.md's
  // Research notes on why this reuses an existing endpoint rather than a
  // new one, and why role lives in Postgres rather than LiveKit metadata
  // (which would need a read-modify-write merge with raise-hand's
  // existing handRaised field).
  const [role, setRole] = useState<ParticipantRole>(initialRole);
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await getJoinStatus(roomId, accessToken);
        if (!cancelled && result.status === "admitted") {
          setRole(result.participant.role);
        }
      } catch {
        // Transient network hiccup — keep the last known role rather than
        // flipping panels off.
      }
    };
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId, accessToken]);

  const isHost = role === "host";
  const canManage = role === "host" || role === "cohost";

  // Constructed once per mount, not per render — the worker in particular
  // must not be recreated on every re-render (each `new Worker(...)` is a
  // real thread the previous one would leak). useMemo with an empty-ish
  // dependency (e2eeKey only flips once, at mount, per the page-level
  // gate above) is enough here; this component doesn't need a full
  // "recreate if the key changes mid-call" story since e2ee is
  // creation-time-only and this component remounts on room change anyway
  // (roomId is part of its key in the parent tree).
  const e2ee = useMemo(() => {
    if (!e2eeKey) return null;
    return {
      keyProvider: new ExternalE2EEKeyProvider(),
      worker: new Worker("/livekit-e2ee-worker.mjs", { type: "module" }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ExternalE2EEKeyProvider.setKey() is async (PBKDF2 key derivation via
  // Web Crypto) — LiveKit's own examples await this BEFORE connecting,
  // not concurrently with it, so <LiveKitRoom connect> is deliberately
  // held back (via the `null` render below) until this resolves, rather
  // than trusting that publishing a track will always be slower.
  const [e2eeReady, setE2eeReady] = useState(!e2ee);
  useEffect(() => {
    if (!e2ee || !e2eeKey) return;
    let cancelled = false;
    e2ee.keyProvider
      .setKey(e2eeKey)
      .then(() => {
        if (!cancelled) setE2eeReady(true);
      })
      .catch(() => {
        if (!cancelled) setE2eeError("Couldn't set up encryption for this meeting.");
      });
    return () => {
      cancelled = true;
    };
  }, [e2ee, e2eeKey]);

  if (e2eeKey && !e2eeReady && !e2eeError) {
    return (
      <main className="flex items-center justify-center flex-1" style={{ height: "100vh" }}>
        <p className="text-sm text-gray-500">Setting up encryption...</p>
      </main>
    );
  }

  if (e2eeError) {
    return (
      <main className="flex flex-col items-center justify-center flex-1 gap-4" style={{ height: "100vh" }}>
        <p className="text-sm text-red-600">{e2eeError}</p>
        <button onClick={() => router.push("/rooms")} className="underline text-sm">
          Back to meetings
        </button>
      </main>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={liveKitUrl}
      token={liveKitToken}
      connect
      data-lk-theme="default"
      style={{ height: "100vh", position: "relative" }}
      options={e2ee ? { e2ee } : undefined}
      onDisconnected={() => router.push("/rooms")}
      onEncryptionError={() =>
        setE2eeError(
          "An encryption error occurred — this usually means someone in the call has a different key.",
        )
      }
    >
      {e2ee && (
        <div className="absolute top-4 left-4 z-10 bg-black/80 text-white text-xs rounded px-2 py-1">
          🔒 Encrypted
        </div>
      )}
      <VideoConference />
      {/* Inside LiveKitRoom's context so HostControls can read the live
          participant list — HostControls itself gates rendering when no
          one else has joined yet, but the canManage check happens here so
          neither a plain participant nor a not-yet-promoted viewer ever
          mounts a component with mute/remove/lock actions. A co-host gets
          the exact same panels as the real host — RoomHostOrCoHostGuard
          backs every one of these actions on the backend too, so there's
          no privilege this UI could offer that the API would refuse.
          WaitingRoomHostPanel doesn't need LiveKit's context (it polls
          the DB directly, since a waiting participant isn't connected to
          LiveKit at all yet) but lives alongside the other host-or-cohost
          overlays for the same reason. CoHostControl is the one panel
          gated on strict isHost instead — appointing/revoking a co-host
          is owner-only (RoomHostGuard, not RoomHostOrCoHostGuard), so a
          co-host must never see this control at all. */}
      {canManage && (
        <>
          <HostControls roomId={roomId} />
          <WaitingRoomHostPanel roomId={roomId} />
          <MeetingLockControl roomId={roomId} />
        </>
      )}
      {isHost && <CoHostControl roomId={roomId} />}
      {/* Every participant controls their own camera background and mic
          noise cancellation, not just the host — and anyone can react,
          not just the host. ReactionsControl isn't dynamic-imported like
          the other two: useDataChannel is LiveKit's own hook, already
          proven safe to import directly (HostControls does the same
          with useParticipants), unlike the third-party WASM libraries
          the other controls load. Same reasoning for RaiseHandControl
          (useLocalParticipant/useParticipants, both LiveKit's own hooks)
          — anyone can raise their own hand, not just the host; canManage
          is only used inside it to decide whether to show the "lower
          someone else's hand" action, extended to co-hosts the same way
          as the panels above. PictureInPictureControl is the same
          not-dynamic-imported case again: it only touches the standard
          browser Picture-in-Picture/DOM APIs at click time, no
          third-party WASM/worker import cost to defer, and it's a
          personal viewing preference like the two effects controls
          above, not a call-wide action, so it renders for everyone. */}
      <BackgroundEffectsControl />
      <NoiseCancellationControl />
      <ReactionsControl />
      <RaiseHandControl roomId={roomId} canManage={canManage} />
      <PictureInPictureControl />
    </LiveKitRoom>
  );
}
