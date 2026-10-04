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

/** Every character, upgrade and item, each with a 16x16 icon under
 * sources/<id>.png. `source-icons.test.ts` checks this against the catalogue. */
export const SOURCE_ICON_IDS = [
  "scout", "guide", "botanist", "medic", "signaller", "cartographer",
  "scout.keen-eye", "scout.eavesdrop", "guide.pathfinder", "guide.howler-call",
  "botanist.greenhouse", "botanist.antidote", "medic.rally", "medic.field-kit",
  "signaller.loud-call", "signaller.call-and-response", "cartographer.detour", "cartographer.landmark",
  "trained-monkey", "pack-mule", "parrot", "trail-map", "rain-poncho", "smoke-signal", "whetstone",
  "puffball", "bait", "camouflage", "rope-ladder", "heavy-pack", "mosquito-net",
] as const;

/** The six characters, each a 64x80 seated silhouette under crew/<id>.png,
 * drawn bottom-centred. */
export const CREW_IDS = ["scout", "guide", "botanist", "medic", "signaller", "cartographer"] as const;

type SourceIconId = `source-${(typeof SOURCE_ICON_IDS)[number]}`;
type CrewArtId = `crew-${(typeof CREW_IDS)[number]}`;

const SOURCE_ART = Object.fromEntries(
  SOURCE_ICON_IDS.map((id) => [`source-${id}`, { file: `sources/${id}.png`, w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } }]),
) as Record<SourceIconId, ArtDef>;

const CREW_ART = Object.fromEntries(
  CREW_IDS.map((id) => [`crew-${id}`, { file: `crew/${id}.png`, w: 64, h: 80, fallback: { color: c(PALETTE.letterbox), label: "" } }]),
) as Record<CrewArtId, ArtDef>;

/** Locations with their own 640x360 backdrop under locations/bg-<id>.png.
 * The Jungle keeps the camp's own backdrop; the temple's waits for its camp. */
const LOCATION_ART = {
  "bg-clearing": { file: "locations/bg-clearing.png", w: 640, h: 360, fallback: { color: c(PALETTE.night), label: "clearing" } },
  "bg-clifftop": { file: "locations/bg-clifftop.png", w: 640, h: 360, fallback: { color: c(PALETTE.night), label: "clifftop" } },
  "bg-desert": { file: "locations/bg-desert.png", w: 640, h: 360, fallback: { color: c(PALETTE.coinEdge), label: "desert" } },
  "bg-cave": { file: "locations/bg-cave.png", w: 640, h: 360, fallback: { color: c(PALETTE.letterbox), label: "cave" } },
  "bg-magma": { file: "locations/bg-magma.png", w: 640, h: 360, fallback: { color: c(PALETTE.destructive), label: "magma" } },
  "bg-temple": { file: "locations/bg-temple.png", w: 640, h: 360, fallback: { color: c(PALETTE.moss), label: "temple" } },
} as const satisfies Readonly<Record<string, ArtDef>>;

/** Every animal and disaster boss, each a sprite under bosses/<id>.png. */
const BOSS_SIZES = {
  tiger: [112, 96], rats: [112, 80], snake: [96, 96], crocodile: [160, 64], capybara: [96, 80], beaver: [96, 96],
  tornado: [96, 112], earthquake: [128, 80], wildfire: [144, 96], meteor: [112, 112], "blood-moon": [96, 96],
  locusts: [128, 96], monsoon: [112, 112],
} as const;

type BossArtId = `boss-${keyof typeof BOSS_SIZES}`;

const BOSS_ART = Object.fromEntries(
  Object.entries(BOSS_SIZES).map(([id, [w, h]]) => [`boss-${id}`, { file: `bosses/${id}.png`, w, h, fallback: { color: c(PALETTE.destructive), label: id } }]),
) as Record<BossArtId, ArtDef>;

export const ART = {
  "bg-jungle-night": { file: "camp/bg-jungle-night.png", w: 640, h: 360, fallback: { color: c(PALETTE.jungle), label: "" } },
  "stump-table": { file: "camp/stump-table.png", w: 384, h: 176, fallback: { color: c(PALETTE.stump), label: "" } },
  campfire: { file: "camp/campfire.png", w: 32, h: 32, frames: 4, fps: 6, fallback: { color: c(PALETTE.sun), label: "fire" } },
  lantern: { file: "camp/lantern.png", w: 16, h: 16, fallback: { color: c(PALETTE.sun), label: "" } },
  "mascot-panda": { file: "camp/mascot-panda.png", w: 32, h: 32, frames: 4, fps: 4, fallback: { color: c(PALETTE.sun), label: "panda" } },
  "mascot-cheer": { file: "camp/mascot-cheer.png", w: 32, h: 32, frames: 4, fps: 6, fallback: { color: c(PALETTE.sun), label: "yay" } },
  "mascot-flop": { file: "camp/mascot-flop.png", w: 32, h: 32, frames: 4, fps: 4, fallback: { color: c(PALETTE.sun), label: "oof" } },
  crate: { file: "camp/crate.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "seat-pack": { file: "camp/seat-pack.png", w: 16, h: 16, fallback: { color: c(PALETTE.moss), label: "bag" } },
  "leader-sun": { file: "camp/leader-sun.png", w: 16, h: 16, fallback: { color: c(PALETTE.sun), label: "*" } },
  "icon-whisper": { file: "camp/icon-whisper.png", w: 16, h: 16, fallback: { color: c(PALETTE.turn), label: "W" } },
  "icon-tricks": { file: "camp/icon-tricks.png", w: 16, h: 16, fallback: { color: c(PALETTE.textDim), label: "" } },
  "bg-fireside": { file: "fireside/bg-fireside.png", w: 640, h: 360, fallback: { color: c(PALETTE.jungle), label: "" } },
  "trail-map": { file: "fireside/trail-map.png", w: 568, h: 64, fallback: { color: c(PALETTE.cardFace), label: "" } },
  "marker-camp": { file: "fireside/marker-camp.png", w: 16, h: 16, fallback: { color: c(PALETTE.bark), label: "" } },
  "marker-cleared": { file: "fireside/marker-cleared.png", w: 16, h: 16, fallback: { color: c(PALETTE.done), label: "" } },
  "marker-boss": { file: "fireside/marker-boss.png", w: 16, h: 16, fallback: { color: c(PALETTE.destructive), label: "" } },
  temple: { file: "fireside/temple.png", w: 16, h: 16, fallback: { color: c(PALETTE.moon), label: "" } },
  "crew-token": { file: "fireside/crew-token.png", w: 16, h: 16, fallback: { color: c(PALETTE.turn), label: "" } },
  "backpack-open": { file: "fireside/backpack-open.png", w: 96, h: 64, fallback: { color: c(PALETTE.moss), label: "backpack" } },
  "bg-temple-dawn": { file: "run-end/bg-temple-dawn.png", w: 640, h: 360, fallback: { color: c(PALETTE.jungle), label: "" } },
  "bg-trail-dusk": { file: "run-end/bg-trail-dusk.png", w: 640, h: 360, fallback: { color: c(PALETTE.letterbox), label: "" } },
  ...LOCATION_ART,
  ...BOSS_ART,
  ...SOURCE_ART,
  ...CREW_ART,
} as const satisfies Readonly<Record<string, ArtDef>>;

export type ArtId = keyof typeof ART;

export const ART_URL_PREFIX = "/expedition/sprites/";

export function artTextureKey(id: ArtId): string {
  return `art:${id}`;
}

/** The icon for a character, upgrade or item, or null when it has none. */
export function sourceArtId(sourceId: string): ArtId | null {
  const id = `source-${sourceId}`;
  return id in ART ? (id as ArtId) : null;
}

/** The art a camp modifier draws: a location's backdrop or a boss's sprite.
 * Null for other kinds, and for an id with no art. */
export function modArtId(mod: { readonly id: string; readonly kind: string }): ArtId | null {
  const id = mod.kind === "location" ? (mod.id === "jungle" ? "bg-jungle-night" : `bg-${mod.id}`) : mod.kind === "animal" || mod.kind === "disaster" ? `boss-${mod.id}` : null;
  return id !== null && id in ART ? (id as ArtId) : null;
}

/** A location's backdrop: its own, or the Jungle's. */
export function backdropArtId(location: string): ArtId {
  return modArtId({ id: location, kind: "location" }) ?? "bg-jungle-night";
}

/** The seated silhouette for a character, or null when it has none. */
export function crewArtId(characterId: string): ArtId | null {
  const id = `crew-${characterId}`;
  return id in ART ? (id as ArtId) : null;
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
