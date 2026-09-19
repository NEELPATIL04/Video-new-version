"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import type { LocalAudioTrack } from "livekit-client";
import { NoiseCancellationProcessor } from "../NoiseCancellationProcessor";

// Per-participant, purely local effect on the microphone — like
// BackgroundEffectsControl, this renders for every participant, not just
// the host. See NoiseCancellationProcessor for why RNNoise was picked
// over LiveKit's own Krisp package (Krisp is locked to LiveKit Cloud;
// this project self-hosts). Rendered via a client-only dynamic import
// (see CallRoom) — the underlying package loads an AudioWorklet + WASM
// binary, both browser-only.
export function NoiseCancellationControl() {
  const { microphoneTrack } = useLocalParticipant();
  const [supported] = useState(() => NoiseCancellationProcessor.isSupported);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processorRef = useRef<NoiseCancellationProcessor | null>(null);

  // Re-applies the current on/off state whenever the mic track becomes
  // available — covers both the initial publish and a re-publish after
  // toggling the mic off and back on.
  useEffect(() => {
    const track = microphoneTrack?.track as LocalAudioTrack | undefined;
    if (!track || !supported) return;

    (async () => {
      try {
        if (!enabled) {
          if (processorRef.current) {
            await track.stopProcessor();
            processorRef.current = null;
          }
          setError(null);
          return;
        }

        if (!processorRef.current) {
          processorRef.current = new NoiseCancellationProcessor();
          await track.setProcessor(processorRef.current);
        }
        setError(null);
      } catch (err) {
        console.error("Noise cancellation failed to apply", err);
        setError("Couldn't enable noise cancellation — check your connection and try again.");
        processorRef.current = null;
      }
    })();
  }, [microphoneTrack, enabled, supported]);

  if (!supported) {
    return (
      <p className="text-xs text-secondary mt-4 pt-4 border-t border-white/10">
        Noise cancellation isn&apos;t supported in this browser.
      </p>
    );
  }

  return (
    <div className="text-sm mt-4 pt-4 border-t border-white/10">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Noise cancellation
      </label>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}
