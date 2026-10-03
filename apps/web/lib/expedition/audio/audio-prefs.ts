import { createStore, type StoreApi } from "zustand/vanilla";
import { safeGetItem, safeSetItem } from "../../safe-storage";
import type { AudioChannel } from "./sound-bank";

/** Per-browser volume mix. Local only, never sent to the server. */
export interface AudioPrefs {
  muted: boolean;
  music: number;
  ambience: number;
  sfx: number;
}

export const DEFAULT_AUDIO_PREFS: AudioPrefs = { muted: false, music: 0.35, ambience: 0.5, sfx: 0.7 };

export const AUDIO_PREFS_KEY = "expedition-audio";

function clamp01(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

/** Tolerates absent, malformed or tampered storage. Never throws. */
export function parseAudioPrefs(raw: string | null): AudioPrefs {
  if (raw === null) return DEFAULT_AUDIO_PREFS;
  try {
    const o = JSON.parse(raw) as Record<string, unknown> | null;
    if (o === null || typeof o !== "object") return DEFAULT_AUDIO_PREFS;
    return {
      muted: o.muted === true,
      music: clamp01(o.music, DEFAULT_AUDIO_PREFS.music),
      ambience: clamp01(o.ambience, DEFAULT_AUDIO_PREFS.ambience),
      sfx: clamp01(o.sfx, DEFAULT_AUDIO_PREFS.sfx),
    };
  } catch {
    return DEFAULT_AUDIO_PREFS;
  }
}

/** The level a sound of `channel` and trim `trim` plays at. */
export function effectiveVolume(prefs: AudioPrefs, channel: AudioChannel, trim: number): number {
  return prefs.muted ? 0 : prefs[channel] * trim;
}

export type AudioPrefsStore = StoreApi<AudioPrefs>;

export function createAudioPrefsStore(read: () => string | null, write: (json: string) => void): AudioPrefsStore {
  const store = createStore<AudioPrefs>(() => parseAudioPrefs(read()));
  store.subscribe((state) => write(JSON.stringify(state)));
  return store;
}

/** The app-wide store, read from localStorage on first import in the browser. */
export const audioPrefsStore: AudioPrefsStore = createAudioPrefsStore(
  () => safeGetItem(AUDIO_PREFS_KEY),
  (json) => safeSetItem(AUDIO_PREFS_KEY, json),
);

export function toggleMute(store: AudioPrefsStore = audioPrefsStore): void {
  store.setState((s) => ({ muted: !s.muted }));
}
