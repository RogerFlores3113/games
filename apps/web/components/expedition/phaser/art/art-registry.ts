/**
 * Every sprite the Expedition scenes draw. Scenes place art only through
 * `placeArt(scene, id, x, y)`, so a PNG can land one file at a time: an id
 * whose file is not listed in `ART_FILES` draws its labelled fallback.
 * No `phaser` import.
 */
import { PALETTE, toPhaserColor } from "../palette";

export interface ArtDef {
  /** Under /expedition/sprites/. */
  file: string;
  /** Frame size in stage px. */
  w: number;
  h: number;
  /** Horizontal strip; animated when > 1. */
  frames?: number;
  fps?: number;
  /** Drawn when the PNG is missing. The label is drawn only if it fits. */
  fallback: { color: number; label: string };
}

const c = toPhaserColor;

export const ART = {
  "bg-jungle-night": { file: "camp/bg-jungle-night.png", w: 640, h: 360, fallback: { color: c(PALETTE.jungle), label: "" } },
  "stump-table": { file: "camp/stump-table.png", w: 368, h: 128, fallback: { color: c(PALETTE.stump), label: "" } },
  campfire: { file: "camp/campfire.png", w: 32, h: 32, frames: 4, fps: 6, fallback: { color: c(PALETTE.sun), label: "fire" } },
  lantern: { file: "camp/lantern.png", w: 16, h: 32, fallback: { color: c(PALETTE.sun), label: "" } },
  firefly: { file: "camp/firefly.png", w: 4, h: 4, frames: 2, fps: 2, fallback: { color: c(PALETTE.done), label: "" } },
  "mascot-panda": { file: "camp/mascot-panda.png", w: 32, h: 32, frames: 4, fps: 4, fallback: { color: c(PALETTE.sun), label: "panda" } },
  crate: { file: "camp/crate.png", w: 12, h: 10, fallback: { color: c(PALETTE.bark), label: "" } },
  "seat-pack": { file: "camp/seat-pack.png", w: 24, h: 24, fallback: { color: c(PALETTE.moss), label: "bag" } },
  "leader-sun": { file: "camp/leader-sun.png", w: 10, h: 10, fallback: { color: c(PALETTE.sun), label: "*" } },
  "icon-whisper": { file: "camp/icon-whisper.png", w: 12, h: 12, fallback: { color: c(PALETTE.turn), label: "W" } },
  "icon-tricks": { file: "camp/icon-tricks.png", w: 10, h: 10, fallback: { color: c(PALETTE.textDim), label: "" } },
  "gear-chatter": { file: "gear/chatter.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "gear-peek": { file: "gear/peek.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "gear-broadcast": { file: "gear/broadcast.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "gear-ghost": { file: "gear/ghost.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "gear-reroll": { file: "gear/reroll.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "gear-pickpocket": { file: "gear/pickpocket.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "gear-commandeer": { file: "gear/commandeer.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "gear-jam": { file: "gear/jam.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "gear-reassign": { file: "gear/reassign.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "gear-overclock": { file: "gear/overclock.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "bg-fireside": { file: "fireside/bg-fireside.png", w: 640, h: 360, fallback: { color: c(PALETTE.jungle), label: "" } },
  "trail-map": { file: "fireside/trail-map.png", w: 608, h: 64, fallback: { color: c(PALETTE.cardFace), label: "trail map" } },
  "marker-camp": { file: "fireside/marker-camp.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "marker-cleared": { file: "fireside/marker-cleared.png", w: 16, h: 16, fallback: { color: c(PALETTE.done), label: "" } },
  "marker-boss": { file: "fireside/marker-boss.png", w: 16, h: 16, fallback: { color: c(PALETTE.destructive), label: "" } },
  temple: { file: "fireside/temple.png", w: 16, h: 16, fallback: { color: c(PALETTE.moon), label: "" } },
  "backpack-open": { file: "fireside/backpack-open.png", w: 96, h: 64, fallback: { color: c(PALETTE.moss), label: "backpack" } },
  "bg-temple-dawn": { file: "run-end/bg-temple-dawn.png", w: 640, h: 360, fallback: { color: c(PALETTE.jungle), label: "" } },
  "bg-trail-dusk": { file: "run-end/bg-trail-dusk.png", w: 640, h: 360, fallback: { color: c(PALETTE.letterbox), label: "" } },
} as const satisfies Readonly<Record<string, ArtDef>>;

export type ArtId = keyof typeof ART;

export const ART_URL_PREFIX = "/expedition/sprites/";

export function artTextureKey(id: ArtId): string {
  return `art:${id}`;
}

export function artFallbackKey(id: ArtId): string {
  return `art-fallback:${id}`;
}

export type ArtSource =
  | { kind: "file"; key: string; url: string; def: ArtDef }
  | { kind: "fallback"; key: string; def: ArtDef };

/** Which texture `id` draws from, given the sprite files actually on disk. */
export function resolveArt(id: ArtId, files: ReadonlySet<string>): ArtSource {
  const def: ArtDef = ART[id];
  if (files.has(def.file)) return { kind: "file", key: artTextureKey(id), url: `${ART_URL_PREFIX}${def.file}`, def };
  return { kind: "fallback", key: artFallbackKey(id), def };
}

/** The fallback label, or "" when it would not fit inside the placeholder
 * with a 1px margin (label glyph cells are 6x8). */
export function fittedFallbackLabel(def: ArtDef): string {
  const label = def.fallback.label;
  if (label === "" || def.h < 10 || label.length * 6 > def.w - 2) return "";
  return label;
}
