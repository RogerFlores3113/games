import { describe, expect, it, afterEach } from "vitest";
import {
  CUE_RECIPES,
  DEFAULT_AUDIO_PREFS,
  createAudioEngine,
  readAudioPrefs,
  writeAudioPrefs,
} from "./hanabi-audio-synth";
import type { AudioContextLike, AudioParamLike, GainNodeLike, SoundLayer } from "./hanabi-audio-synth";
import type { Cue } from "./hanabi-audio-cues";

// Mirrors safe-storage.test.ts's fake-window installation pattern (this
// module goes through safe-storage, which requires a `window.localStorage`
// to exist before it will persist anything, matching the SSR-safe contract).
const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    // @ts-expect-error -- test-only global cleanup, restoring SSR shape
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

function installFakeLocalStorage(): Storage {
  const store = new Map<string, string>();
  const fake: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  // @ts-expect-error -- constructing a minimal window shape for a Node test environment
  globalThis.window = { localStorage: fake };
  return fake;
}

// ---------------------------------------------------------------------------
// Fake AudioContext — records every node created and every ramp call so
// behaviour (volume scaling, mute/volume gating, unlock gating) can be
// asserted without a real browser AudioContext.
// ---------------------------------------------------------------------------

interface RampCall {
  method: "setValueAtTime" | "linearRampToValueAtTime" | "exponentialRampToValueAtTime";
  value: number;
  time: number;
}

function fakeParam(): AudioParamLike & { calls: RampCall[] } {
  const calls: RampCall[] = [];
  return {
    value: 0,
    calls,
    setValueAtTime(value, time) {
      calls.push({ method: "setValueAtTime", value, time });
    },
    linearRampToValueAtTime(value, time) {
      calls.push({ method: "linearRampToValueAtTime", value, time });
    },
    exponentialRampToValueAtTime(value, time) {
      calls.push({ method: "exponentialRampToValueAtTime", value, time });
    },
  };
}

function createFakeContext(state: "suspended" | "running" = "running") {
  const gainNodes: Array<ReturnType<typeof fakeParam>> = [];
  let oscillatorCount = 0;
  let bufferSourceCount = 0;
  let resumeCalls = 0;

  const ctx: AudioContextLike = {
    currentTime: 0,
    state,
    sampleRate: 44100,
    destination: {},
    resume() {
      resumeCalls += 1;
    },
    createGain(): GainNodeLike {
      const gain = fakeParam();
      gainNodes.push(gain);
      return { gain, connect: () => undefined };
    },
    createOscillator() {
      oscillatorCount += 1;
      return {
        type: "sine",
        frequency: fakeParam(),
        connect: () => undefined,
        start: () => undefined,
        stop: () => undefined,
      };
    },
    createBiquadFilter() {
      return {
        type: "bandpass",
        frequency: fakeParam(),
        Q: fakeParam(),
        connect: () => undefined,
      };
    },
    createBuffer() {
      return { getChannelData: () => new Float32Array(1) };
    },
    createBufferSource() {
      bufferSourceCount += 1;
      return {
        buffer: null,
        connect: () => undefined,
        start: () => undefined,
        stop: () => undefined,
      };
    },
  };

  return {
    ctx,
    gainNodes,
    get oscillatorCount() {
      return oscillatorCount;
    },
    get bufferSourceCount() {
      return bufferSourceCount;
    },
    get resumeCalls() {
      return resumeCalls;
    },
  };
}

const ALL_CUES: Cue[] = ["clue", "play", "discard", "fuse", "stack-complete"];

describe("CUE_RECIPES", () => {
  it("has exactly the 5 Cue keys", () => {
    expect(Object.keys(CUE_RECIPES).sort()).toEqual([...ALL_CUES].sort());
  });

  it("every recipe is pairwise distinct via JSON.stringify", () => {
    const serialized = ALL_CUES.map((cue) => JSON.stringify(CUE_RECIPES[cue]));
    const unique = new Set(serialized);
    expect(unique.size).toBe(ALL_CUES.length);
  });

  it("fuse differs from play", () => {
    expect(JSON.stringify(CUE_RECIPES.fuse)).not.toBe(JSON.stringify(CUE_RECIPES.play));
  });

  it("every layer has attackMs >= 2, decay/release > attack, and peak gain <= 1", () => {
    for (const cue of ALL_CUES) {
      for (const layer of CUE_RECIPES[cue] as readonly SoundLayer[]) {
        expect(layer.attackMs).toBeGreaterThanOrEqual(2);
        expect(layer.decayMs).toBeGreaterThan(layer.attackMs);
        expect(layer.gain).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("createAudioEngine", () => {
  it("play() before unlock() creates no context and no nodes", () => {
    const fake = createFakeContext();
    let created = 0;
    const engine = createAudioEngine({
      createContext: () => {
        created += 1;
        return fake.ctx;
      },
    });
    engine.play("clue");
    expect(created).toBe(0);
    expect(fake.oscillatorCount).toBe(0);
    expect(fake.bufferSourceCount).toBe(0);
  });

  it("after unlock(), play() creates oscillator/buffer-source nodes routed through a gain node scaled by volume", () => {
    const fake = createFakeContext();
    const engine = createAudioEngine({ createContext: () => fake.ctx });
    engine.unlock();
    engine.setVolume(0.8);
    engine.play("clue"); // clue recipe: 1 noise layer + 1 tone layer
    expect(fake.oscillatorCount).toBe(1);
    expect(fake.bufferSourceCount).toBe(1);
    expect(fake.gainNodes.length).toBe(2);
    const clueRecipe = CUE_RECIPES.clue;
    for (const [i, gainNode] of fake.gainNodes.entries()) {
      const layer = clueRecipe[i]!;
      const rampCall = gainNode.calls.find((c) => c.method === "linearRampToValueAtTime");
      expect(rampCall?.value).toBeCloseTo(layer.gain * 0.8);
    }
  });

  it("setMuted(true) -> play creates no nodes", () => {
    const fake = createFakeContext();
    const engine = createAudioEngine({ createContext: () => fake.ctx });
    engine.unlock();
    engine.setMuted(true);
    engine.play("play");
    expect(fake.oscillatorCount).toBe(0);
    expect(fake.bufferSourceCount).toBe(0);
  });

  it("setVolume(0) -> play creates no nodes", () => {
    const fake = createFakeContext();
    const engine = createAudioEngine({ createContext: () => fake.ctx });
    engine.unlock();
    engine.setVolume(0);
    engine.play("play");
    expect(fake.oscillatorCount).toBe(0);
    expect(fake.bufferSourceCount).toBe(0);
  });

  it("unlock() calls context.resume() when state is suspended", () => {
    const fake = createFakeContext("suspended");
    const engine = createAudioEngine({ createContext: () => fake.ctx });
    engine.unlock();
    expect(fake.resumeCalls).toBe(1);
  });

  it("calling unlock() twice creates only one context", () => {
    const fake = createFakeContext();
    let created = 0;
    const engine = createAudioEngine({
      createContext: () => {
        created += 1;
        return fake.ctx;
      },
    });
    engine.unlock();
    engine.unlock();
    expect(created).toBe(1);
  });

  it("if createContext throws, unlock() and play() do not throw", () => {
    const engine = createAudioEngine({
      createContext: () => {
        throw new Error("no AudioContext available");
      },
    });
    expect(() => engine.unlock()).not.toThrow();
    expect(() => engine.play("clue")).not.toThrow();
  });
});

describe("readAudioPrefs / writeAudioPrefs", () => {
  it("returns DEFAULT_AUDIO_PREFS when nothing is stored", () => {
    installFakeLocalStorage();
    expect(readAudioPrefs()).toEqual(DEFAULT_AUDIO_PREFS);
  });

  it("writeAudioPrefs then readAudioPrefs round-trips", () => {
    installFakeLocalStorage();
    writeAudioPrefs({ muted: true, volume: 0.8 });
    expect(readAudioPrefs()).toEqual({ muted: true, volume: 0.8 });
  });

  it("clamps/defaults an invalid stored volume", () => {
    const storage = installFakeLocalStorage();
    storage.setItem("hanabi-audio-volume", "abc");
    const prefsForNonNumeric = readAudioPrefs();
    expect(prefsForNonNumeric.volume).toBeGreaterThanOrEqual(0);
    expect(prefsForNonNumeric.volume).toBeLessThanOrEqual(1);

    storage.setItem("hanabi-audio-volume", "7");
    const prefsForOutOfRange = readAudioPrefs();
    expect(prefsForOutOfRange.volume).toBe(1);
  });
});
