import { safeGetItem, safeSetItem } from "./safe-storage";
import type { Cue } from "./hanabi-audio-cues";

/**
 * D-25/D-26 boundary: all sound is Web Audio synthesis (tone + filtered-noise
 * layers), never audio files. `AudioContext`/node types are referenced
 * through the minimal structural `*Like` interfaces below so tests can pass
 * a hand-written fake context — the real browser `AudioContext` is only ever
 * constructed lazily, inside `defaultCreateContext`'s function body (never at
 * module load), so importing this module under SSR/Node (no `AudioContext`
 * global) is always safe.
 */

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
}

export interface GainNodeLike {
  gain: AudioParamLike;
  connect(destination: unknown): unknown;
}

export interface OscillatorNodeLike {
  type: "sine" | "triangle";
  frequency: AudioParamLike;
  connect(destination: unknown): unknown;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface BiquadFilterNodeLike {
  type: "bandpass" | "highpass" | "lowpass";
  frequency: AudioParamLike;
  Q: AudioParamLike;
  connect(destination: unknown): unknown;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null;
  connect(destination: unknown): unknown;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  currentTime: number;
  state: "suspended" | "running" | "closed";
  sampleRate: number;
  destination: unknown;
  resume(): Promise<void> | void;
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createBuffer(numChannels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): AudioBufferSourceNodeLike;
}

export type SoundLayer =
  | {
      kind: "tone";
      shape: "sine" | "triangle";
      frequency: number;
      endFrequency?: number;
      startMs: number;
      attackMs: number;
      decayMs: number;
      gain: number;
    }
  | {
      kind: "noise";
      filterType: "bandpass" | "highpass" | "lowpass";
      filterHz: number;
      q: number;
      startMs: number;
      attackMs: number;
      decayMs: number;
      gain: number;
    };

/** D-24: soft plastic/ceramic tile-tap recipes, one per `Cue`. Every layer
 * has attackMs >= 2 and a decay strictly longer than the attack (no hard
 * on/off click), and peak gain <= 1 — see hanabi-audio-synth.test.ts for the
 * behavior-level assertion of this invariant across every recipe. */
export const CUE_RECIPES: Readonly<Record<Cue, readonly SoundLayer[]>> = {
  clue: [
    { kind: "noise", filterType: "bandpass", filterHz: 2500, q: 6, startMs: 0, attackMs: 3, decayMs: 60, gain: 0.5 },
    { kind: "tone", shape: "sine", frequency: 3200, startMs: 0, attackMs: 4, decayMs: 70, gain: 0.15 },
  ],
  play: [
    { kind: "noise", filterType: "bandpass", filterHz: 1200, q: 4, startMs: 0, attackMs: 4, decayMs: 90, gain: 0.55 },
    { kind: "tone", shape: "triangle", frequency: 520, startMs: 0, attackMs: 5, decayMs: 110, gain: 0.35 },
  ],
  discard: [
    { kind: "noise", filterType: "lowpass", filterHz: 600, q: 1, startMs: 0, attackMs: 4, decayMs: 150, gain: 0.5 },
    { kind: "tone", shape: "sine", frequency: 220, startMs: 0, attackMs: 6, decayMs: 160, gain: 0.3 },
  ],
  fuse: [
    {
      kind: "tone",
      shape: "triangle",
      frequency: 196,
      endFrequency: 150,
      startMs: 0,
      attackMs: 3,
      decayMs: 220,
      gain: 0.4,
    },
    {
      kind: "tone",
      shape: "triangle",
      frequency: 208,
      endFrequency: 160,
      startMs: 0,
      attackMs: 3,
      decayMs: 220,
      gain: 0.4,
    },
  ],
  "stack-complete": [
    { kind: "tone", shape: "triangle", frequency: 660, startMs: 0, attackMs: 4, decayMs: 130, gain: 0.35 },
    { kind: "tone", shape: "triangle", frequency: 830, startMs: 90, attackMs: 4, decayMs: 130, gain: 0.35 },
    { kind: "tone", shape: "triangle", frequency: 990, startMs: 180, attackMs: 4, decayMs: 160, gain: 0.4 },
  ],
};

export interface AudioPrefs {
  muted: boolean;
  volume: number;
}

export const DEFAULT_AUDIO_PREFS: AudioPrefs = { muted: false, volume: 0.5 };

const MUTED_KEY = "hanabi-audio-muted";
const VOLUME_KEY = "hanabi-audio-volume";

function clampVolume(raw: string | null): number {
  if (raw === null) return DEFAULT_AUDIO_PREFS.volume;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_AUDIO_PREFS.volume;
  return Math.min(1, Math.max(0, parsed));
}

/** T-06.1-13: untrusted stored strings are parsed and clamped, never trusted
 * verbatim — an invalid muted flag or an out-of-range/non-numeric volume
 * falls back to `DEFAULT_AUDIO_PREFS`. */
export function readAudioPrefs(): AudioPrefs {
  const mutedRaw = safeGetItem(MUTED_KEY);
  const muted = mutedRaw === "1" ? true : mutedRaw === "0" ? false : DEFAULT_AUDIO_PREFS.muted;
  const volume = clampVolume(safeGetItem(VOLUME_KEY));
  return { muted, volume };
}

export function writeAudioPrefs(prefs: AudioPrefs): void {
  safeSetItem(MUTED_KEY, prefs.muted ? "1" : "0");
  safeSetItem(VOLUME_KEY, String(Math.min(1, Math.max(0, prefs.volume))));
}

export interface AudioEngine {
  unlock(): void;
  play(cue: Cue): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
}

export interface AudioEngineDeps {
  createContext?: () => AudioContextLike;
}

/** The real browser AudioContext, referenced ONLY inside this function body
 * (never at module load / top level) so importing this module in SSR/Node
 * (no `AudioContext` global) never throws. */
function defaultCreateContext(): AudioContextLike {
  return new AudioContext() as unknown as AudioContextLike;
}

/** D-26: gesture-gated engine. No context is created until `unlock()` is
 * called, and no sound plays until then either. `deps.createContext` lets
 * tests inject a fake context; T-06.1-14 wraps context creation and every
 * `play()` body in try/catch so a failure degrades to silence, never a
 * board crash. */
export function createAudioEngine(deps: AudioEngineDeps = {}): AudioEngine {
  const createContext = deps.createContext ?? defaultCreateContext;
  const prefs = readAudioPrefs();
  let muted = prefs.muted;
  let volume = prefs.volume;
  let ctx: AudioContextLike | null = null;
  let noiseBuffer: AudioBufferLike | null = null;

  function ensureNoiseBuffer(context: AudioContextLike): AudioBufferLike | null {
    if (noiseBuffer !== null) return noiseBuffer;
    try {
      const length = Math.max(1, Math.floor(context.sampleRate * 0.5));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      noiseBuffer = buffer;
    } catch {
      noiseBuffer = null;
    }
    return noiseBuffer;
  }

  function playLayer(context: AudioContextLike, layer: SoundLayer): void {
    const now = context.currentTime + layer.startMs / 1000;
    const attackEnd = now + layer.attackMs / 1000;
    const decayEnd = attackEnd + layer.decayMs / 1000;
    const stopAt = decayEnd + 0.03;

    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(layer.gain * volume, attackEnd);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, decayEnd);
    gainNode.connect(context.destination);

    if (layer.kind === "tone") {
      const osc = context.createOscillator();
      osc.type = layer.shape;
      osc.frequency.setValueAtTime(layer.frequency, now);
      if (layer.endFrequency !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, layer.endFrequency), decayEnd);
      }
      osc.connect(gainNode);
      osc.start(now);
      osc.stop(stopAt);
      return;
    }

    const buffer = ensureNoiseBuffer(context);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = layer.filterType;
    filter.frequency.setValueAtTime(layer.filterHz, now);
    filter.Q.setValueAtTime(layer.q, now);
    source.connect(filter);
    filter.connect(gainNode);
    source.start(now);
    source.stop(stopAt);
  }

  return {
    unlock(): void {
      if (ctx !== null) {
        if (ctx.state === "suspended") {
          try {
            void ctx.resume();
          } catch {
            // Audio silently unavailable.
          }
        }
        return;
      }
      try {
        const created = createContext();
        ctx = created;
        if (created.state === "suspended") {
          void created.resume();
        }
      } catch {
        ctx = null;
      }
    },
    play(cue: Cue): void {
      if (ctx === null) return; // D-26: nothing plays before unlock()
      if (muted || volume <= 0) return;
      const recipe = CUE_RECIPES[cue];
      try {
        for (const layer of recipe) {
          playLayer(ctx, layer);
        }
      } catch {
        // T-06.1-14: audio failure degrades to silence, never a crash.
      }
    },
    setMuted(nextMuted: boolean): void {
      muted = nextMuted;
      writeAudioPrefs({ muted, volume });
    },
    setVolume(nextVolume: number): void {
      volume = Math.min(1, Math.max(0, nextVolume));
      writeAudioPrefs({ muted, volume });
    },
  };
}
