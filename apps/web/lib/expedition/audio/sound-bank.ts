/**
 * The Expedition sound bank: every sound the game can make, as data. The
 * Phaser loader, the director and the volume mixer all read this one table.
 */

export type AudioChannel = "music" | "ambience" | "sfx";

export const SFX_IDS = [
  "sfx-card-play",
  "sfx-card-deal",
  "sfx-card-pick",
  "sfx-whisper",
  "sfx-objective-done",
  "sfx-objective-failed",
  "sfx-camp-cleared",
  "sfx-run-lost",
  "sfx-ui-click",
  "sfx-equip",
  "sfx-power",
  "sfx-supply-lost",
] as const;

export const LOOP_IDS = ["amb-jungle", "amb-fire", "music-camp"] as const;

export type SfxId = (typeof SFX_IDS)[number];
export type LoopId = (typeof LOOP_IDS)[number];
export type SoundId = SfxId | LoopId;

export interface SoundSpec {
  /** Ogg first, mp3 for Safari. */
  files: [string, string];
  channel: AudioChannel;
  loop: boolean;
  /** Per-sound trim, multiplied by the channel and master levels. */
  volume: number;
}

export const AUDIO_URL_PREFIX = "/expedition/audio/";

function spec(id: SoundId, channel: AudioChannel, loop: boolean, volume: number): SoundSpec {
  return { files: [`${AUDIO_URL_PREFIX}${id}.ogg`, `${AUDIO_URL_PREFIX}${id}.mp3`], channel, loop, volume };
}

export const SOUND_BANK: Record<SoundId, SoundSpec> = {
  "amb-jungle": spec("amb-jungle", "ambience", true, 1),
  "amb-fire": spec("amb-fire", "ambience", true, 0.8),
  "music-camp": spec("music-camp", "music", true, 1),
  "sfx-card-play": spec("sfx-card-play", "sfx", false, 1),
  "sfx-card-deal": spec("sfx-card-deal", "sfx", false, 0.9),
  "sfx-card-pick": spec("sfx-card-pick", "sfx", false, 1),
  "sfx-whisper": spec("sfx-whisper", "sfx", false, 1),
  "sfx-objective-done": spec("sfx-objective-done", "sfx", false, 0.9),
  "sfx-objective-failed": spec("sfx-objective-failed", "sfx", false, 1),
  "sfx-camp-cleared": spec("sfx-camp-cleared", "sfx", false, 1),
  "sfx-run-lost": spec("sfx-run-lost", "sfx", false, 1),
  "sfx-ui-click": spec("sfx-ui-click", "sfx", false, 0.8),
  "sfx-equip": spec("sfx-equip", "sfx", false, 1),
  "sfx-power": spec("sfx-power", "sfx", false, 1),
  "sfx-supply-lost": spec("sfx-supply-lost", "sfx", false, 1),
};

export const SOUND_IDS = Object.keys(SOUND_BANK) as SoundId[];

/** The loops that should be sounding in a scene. Camp and fireside get the
 * full bed. A finished run keeps the ambience and drops the music. */
export function loopsForScene(sceneKey: "camp" | "fireside" | "run-end" | null): LoopId[] {
  switch (sceneKey) {
    case "camp":
      return ["music-camp", "amb-jungle"];
    case "fireside":
      return ["music-camp", "amb-fire"];
    case "run-end":
      return ["amb-fire"];
    case null:
      return [];
  }
}
