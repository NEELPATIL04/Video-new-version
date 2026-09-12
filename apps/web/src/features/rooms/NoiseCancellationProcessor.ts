import { loadRnnoise, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import type { AudioProcessorOptions, Track, TrackProcessor } from "livekit-client";

// The AudioWorklet script and WASM binaries are copied from
// node_modules into public/ at install time — see
// scripts/copy-rnnoise-assets.mjs — since Next.js has no Vite-style
// `?url` import for vendoring a package's binary assets.
const WORKLET_URL = "/rnnoise/workletProcessor.js";
const WASM_URL = "/rnnoise/rnnoise.wasm";
const WASM_SIMD_URL = "/rnnoise/rnnoise_simd.wasm";

// RNNoise (xiph.org, BSD-licensed) via @sapphi-red/web-noise-suppressor —
// picked over LiveKit's own official Krisp package because Krisp is
// locked to LiveKit Cloud accounts (confirmed against LiveKit's own docs
// and a GitHub issue asking this exact question, closed "not planned" by
// LiveKit's maintainers); this project deliberately self-hosts LiveKit.
// RNNoise is genuinely open-source and works anywhere.
//
// Modeled directly on @livekit/track-processors' own GainAudioProcessor
// (its source is explicitly documented as "a reference implementation
// for building custom audio processors using the TrackProcessor
// interface") — same Web Audio graph shape: source -> [effect] ->
// destination, same init/restart/destroy lifecycle.
export class NoiseCancellationProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = "noise-cancellation-processor";
  processedTrack?: MediaStreamTrack;

  private sourceNode?: MediaStreamAudioSourceNode;
  private rnnoiseNode?: RnnoiseWorkletNode;
  private destinationNode?: MediaStreamAudioDestinationNode;

  static get isSupported(): boolean {
    return (
      typeof AudioContext !== "undefined" &&
      typeof AudioWorkletNode !== "undefined" &&
      typeof MediaStreamAudioSourceNode !== "undefined" &&
      typeof MediaStreamAudioDestinationNode !== "undefined"
    );
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    const { track, audioContext } = opts;
    this.sourceNode = audioContext.createMediaStreamSource(new MediaStream([track]));
    this.destinationNode = audioContext.createMediaStreamDestination();

    // RnnoiseWorkletNode assumes a 48kHz context (documented constraint
    // of the library, tied to the model it was trained on) — virtually
    // universal for WebRTC audio (Opus's native rate), but fall back to
    // an untouched pass-through rather than risk garbled audio on the
    // rare device/browser combination that differs.
    if (audioContext.sampleRate !== 48000) {
      console.warn(
        `Noise cancellation needs a 48kHz audio context (got ${audioContext.sampleRate}Hz) — passing audio through unprocessed.`,
      );
      this.sourceNode.connect(this.destinationNode);
      this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
      return;
    }

    await audioContext.audioWorklet.addModule(WORKLET_URL);
    const wasmBinary = await loadRnnoise({ url: WASM_URL, simdUrl: WASM_SIMD_URL });

    this.rnnoiseNode = new RnnoiseWorkletNode(audioContext, { maxChannels: 1, wasmBinary });
    this.sourceNode.connect(this.rnnoiseNode);
    this.rnnoiseNode.connect(this.destinationNode);

    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    this.sourceNode?.disconnect();
    this.rnnoiseNode?.disconnect();
    this.rnnoiseNode?.destroy();
    this.destinationNode?.disconnect();
    this.processedTrack?.stop();
    this.sourceNode = undefined;
    this.rnnoiseNode = undefined;
    this.destinationNode = undefined;
    this.processedTrack = undefined;
  }
}
