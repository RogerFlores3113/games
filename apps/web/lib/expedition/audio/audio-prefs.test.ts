import { describe, expect, it } from "vitest";
import { createAudioPrefsStore, DEFAULT_AUDIO_PREFS, effectiveVolume, parseAudioPrefs, toggleMute } from "./audio-prefs";

describe("audio prefs", () => {
  it("defaults to moderate levels when nothing is stored", () => {
    expect(parseAudioPrefs(null)).toEqual({ muted: false, music: 0.35, ambience: 0.5, sfx: 0.7 });
  });

  it("falls back per field on malformed or out-of-range storage", () => {
    expect(parseAudioPrefs("not json")).toEqual(DEFAULT_AUDIO_PREFS);
    expect(parseAudioPrefs('{"music":9,"ambience":"x","sfx":-1,"muted":true}')).toEqual({ muted: true, music: 1, ambience: 0.5, sfx: 0 });
  });

  it("persists every change and applies mute live", () => {
    const writes: string[] = [];
    const store = createAudioPrefsStore(() => null, (j) => writes.push(j));
    store.setState({ music: 0.2 });
    toggleMute(store);
    expect(JSON.parse(writes[writes.length - 1]!)).toEqual({ muted: true, music: 0.2, ambience: 0.5, sfx: 0.7 });
    expect(effectiveVolume(store.getState(), "music", 1)).toBe(0);
    toggleMute(store);
    expect(effectiveVolume(store.getState(), "music", 0.5)).toBeCloseTo(0.1);
  });
});
