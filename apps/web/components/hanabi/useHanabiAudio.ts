"use client";

import { useEffect, useRef, useState } from "react";
import type { HanabiView } from "@games/rules";
import { cuesForTransition } from "../../lib/hanabi-audio-cues";
import {
  createAudioEngine,
  DEFAULT_AUDIO_PREFS,
  readAudioPrefs,
  writeAudioPrefs,
  type AudioEngine,
} from "../../lib/hanabi-audio-synth";

type Snapshot = { history: HanabiView["history"]; stacks: HanabiView["stacks"] };

export interface UseHanabiAudioResult {
  muted: boolean;
  volume: number;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
}

/**
 * D-24..D-29: turns live `history` transitions into sound. The engine
 * (`createAudioEngine`) owns the underlying Web Audio context — this hook
 * never touches Web Audio APIs directly, only the pure `Cue` selection and
 * the engine's `unlock`/`play`/`setMuted`/`setVolume` surface.
 *
 * D-26: no context is created/resumed until the first `pointerdown` or
 * `keydown` anywhere on the page — the listeners remove themselves after
 * the first gesture.
 *
 * D-29: `prevRef` is reset to `null` whenever `reconnecting` becomes true,
 * so the first post-reconnect view is treated as an initial mount (no
 * catch-up cue backlog) rather than diffed against the pre-drop history.
 */
export function useHanabiAudio(game: HanabiView | null, reconnecting: boolean): UseHanabiAudioResult {
  const engineRef = useRef<AudioEngine | null>(null);
  const prevRef = useRef<Snapshot | null>(null);
  const [muted, setMutedState] = useState(DEFAULT_AUDIO_PREFS.muted);
  const [volume, setVolumeState] = useState(DEFAULT_AUDIO_PREFS.volume);

  // Lazily create the engine and load persisted prefs — never during SSR
  // render, only inside a mount effect.
  useEffect(() => {
    const engine = createAudioEngine();
    engineRef.current = engine;
    const prefs = readAudioPrefs();
    setMutedState(prefs.muted);
    setVolumeState(prefs.volume);
    engine.setMuted(prefs.muted);
    engine.setVolume(prefs.volume);
  }, []);

  // D-26: gesture-gated unlock. Listeners remove themselves after the
  // first pointerdown/keydown.
  useEffect(() => {
    function unlock() {
      engineRef.current?.unlock();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // D-29: reconnect baseline reset — the next transition is treated as an
  // initial mount, never diffed against pre-drop history.
  useEffect(() => {
    if (reconnecting) {
      prevRef.current = null;
    }
  }, [reconnecting]);

  // D-27/D-28: play exactly the cues for entries that are new since the
  // last snapshot, then advance the baseline.
  useEffect(() => {
    if (!game || reconnecting) return;
    const next: Snapshot = { history: game.history, stacks: game.stacks };
    const cues = cuesForTransition(prevRef.current, next);
    const engine = engineRef.current;
    if (engine) {
      for (const cue of cues) {
        engine.play(cue);
      }
    }
    prevRef.current = next;
  }, [game, reconnecting]);

  function setMuted(nextMuted: boolean): void {
    setMutedState(nextMuted);
    engineRef.current?.setMuted(nextMuted);
    writeAudioPrefs({ muted: nextMuted, volume });
  }

  function setVolume(nextVolume: number): void {
    setVolumeState(nextVolume);
    engineRef.current?.setVolume(nextVolume);
    writeAudioPrefs({ muted, volume: nextVolume });
  }

  return { muted, volume, setMuted, setVolume };
}
