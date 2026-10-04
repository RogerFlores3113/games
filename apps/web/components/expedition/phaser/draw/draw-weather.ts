/**
 * The camp's modifiers on screen: the chip strip on the top bar, the small
 * pixel icons that name a location or weather at a glance, and the weather
 * overlay (rain, a storm's darker sky, and the flash when lightning
 * strikes). Every value drawn comes from the scene model.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { STAGE, STUMP_CENTRE, ZONES } from "../layout";
import type { ObjectIndex } from "../object-index";
import type { Haze, ModChip, Precipitation, Sky } from "../../../../lib/expedition/weather-model";
import { labelWidth, plate, text, type Layer } from "./ui-kit";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/** 9x9 pixel icons; each letter is a palette colour, "." is clear. */
const ICON_INK: Readonly<Record<string, string>> = {
  o: PALETTE.sun,
  y: PALETTE.coin,
  w: PALETTE.moon,
  g: PALETTE.textDim,
  d: PALETTE.plateEdge,
  b: PALETTE.rain,
  t: PALETTE.done,
  k: PALETTE.bark,
  m: PALETTE.moss,
  r: PALETTE.destructive,
  c: PALETTE.cardFace,
};

const ICONS: Readonly<Record<string, readonly string[]>> = {
  fair: ["....o....", ".o.....o.", "...ooo...", "..ooooo..", "o.ooooo.o", "..ooooo..", "...ooo...", ".o.....o.", "....o...."],
  rain: ["...www...", ".wwwwwww.", "wwwwwwwww", ".wwwwwww.", ".........", ".b..b..b.", "b..b..b..", ".........", ".b..b..b."],
  thunderstorm: ["...ggg...", ".ggggggg.", "ggggggggg", ".gggyggg.", "....yy...", "...yy....", "..yyyyy..", "....yy...", "...y....."],
  jungle: ["...ttt...", "..ttttt..", ".ttttttt.", "ttttttttt", ".ttttttt.", "...kkk...", "....k....", "....k....", "mmmmmmmmm"],
  clearing: [".........", ".........", "....o....", "...ooo...", ".........", "t..t...t.", "tt.tt.ttt", "mmmmmmmmm", "mmmmmmmmm"],
  clifftop: ["....w....", "...www...", "...gwg...", "..ggggg..", "..gdggg..", ".ggggdgg.", ".gdggggg.", "ggggggdgg", "ddddddddd"],
  desert: ["......o..", ".....ooo.", "......o..", "..t......", ".ttt.....", "..t...cc.", "..t..cccc", "ccccccccc", "ccccccccc"],
  cave: ["...ggg...", ".ggggggg.", "ggg...ggg", "gg.....gg", "gg..b..gg", "g...b...g", "g..bbb..g", "g.......g", "ggggggggg"],
  magma: ["...r.r...", "....r....", "...kkk...", "..kkokk..", "..kkokk..", ".kkkokkk.", ".kkoookk.", "kkoooookk", "ooooooooo"],
  fog: [".........", "wwwww....", "...wwwwww", ".........", ".wwwwww..", "....wwwww", ".........", "wwwww....", "..wwwwww."],
  night: ["..www....", ".ww......", "ww.....y.", "ww.......", "ww....y..", "ww.......", ".ww.....y", "..www....", "........."],
  steam: [".w...w...", "..w...w..", ".w...w...", "..w...w..", ".........", "..rrrrr..", ".rrooorr.", "rrooooorr", "rrrrrrrrr"],
  flooding: [".b..b..b.", "b..b..b..", ".........", "bb...bb..", "..bbb..bb", ".........", "bb...bb..", "..bbb..bb", "bbbbbbbbb"],
};

/** A shape for each kind when its def has no icon of its own. */
const KIND_ICON: Readonly<Record<ModChip["kind"], readonly string[]>> = {
  location: ICONS.clearing!,
  weather: ICONS.fair!,
  pairing: ["....y....", "...yyy...", "..yy.yy..", ".yy...yy.", "yy.....yy", ".yy...yy.", "..yy.yy..", "...yyy...", "....y...."],
  animal: ["..k...k..", ".kkk.kkk.", ".kkkkkkk.", "kk.kkk.kk", "kkkkkkkkk", ".kkkkkkk.", "..kkkkk..", "...kkk...", "........."],
  disaster: ["....o....", "...ooo...", "...ooo...", "..ooooo..", "..oo.oo..", ".ooo.ooo.", ".ooooooo.", "ooooooooo", "........."],
  temple: ["....w....", "...www...", "wwwwwwwww", ".w.w.w.w.", ".w.w.w.w.", ".w.w.w.w.", ".w.w.w.w.", "wwwwwwwww", "ddddddddd"],
};

export const ICON_SIZE = 9;

/** The icon of a camp modifier, its top-left at (x, y). */
export function modIcon(scene: Phaser.Scene, id: string, kind: ModChip["kind"], x: number, y: number): Phaser.GameObjects.Graphics {
  const rows = ICONS[id] ?? KIND_ICON[kind];
  const g = scene.add.graphics();
  rows.forEach((row, ry) => {
    Array.from(row).forEach((ch, rx) => {
      const ink = ICON_INK[ch];
      if (ink === undefined) return;
      g.fillStyle(toPhaserColor(ink), 1);
      g.fillRect(Math.round(x) + rx, Math.round(y) + ry, 1, 1);
    });
  });
  return g;
}

/** A seat's items hidden by fog: the fog icon on a 16x16 grey tile, its
 * top-left at (x, y). */
export function fogTile(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const tile = scene.add.container(Math.round(x), Math.round(y));
  tile.add(plate(scene, 0, 0, 16, 16, PALETTE.plateEdge).setStrokeStyle(1, toPhaserColor(PALETTE.textDim)));
  tile.add(modIcon(scene, "fog", "weather", 4, 4));
  tile.setSize(16, 16);
  return tile;
}

// ---------------------------------------------------------------------------
// The strip
// ---------------------------------------------------------------------------

const CHIP_H = 14;
const CHIP_PAD = 3;
const CHIP_GAP = 4;
const PIP_W = 4;

const GAUGE_W = 18;
const GAUGE_H = 6;

/** How much of a chip fits: its reading, its name, or its icon alone. */
export type ChipFit = "badge" | "name" | "icon";
const FITS: readonly ChipFit[] = ["badge", "name", "icon"];

/** A boss or the temple keeps its name longest: it is the camp's headline.
 * A helper at the temple does not; the world column names it. */
function fitOf(chip: ModChip, tier: ChipFit): ChipFit {
  const headline = chip.kind === "temple" || ((chip.kind === "animal" || chip.kind === "disaster") && chip.strength === "full");
  return tier === "icon" && headline ? "name" : tier;
}

function chipWidth(chip: ModChip, fit: ChipFit): number {
  const withBadge = fit === "badge";
  const name = fit === "icon" ? 0 : CHIP_PAD + labelWidth(chip.name);
  const badge = withBadge && chip.badge !== null ? CHIP_GAP + labelWidth(chip.badge) : 0;
  const pips = withBadge && chip.pips > 0 ? CHIP_GAP + chip.pips * (PIP_W + 1) - 1 : 0;
  const gauge = chip.gauge !== null ? CHIP_GAP + GAUGE_W : 0;
  return CHIP_PAD + ICON_SIZE + name + badge + pips + gauge + CHIP_PAD;
}

/** The river's meter: the water risen so far, the dry part above it. */
function gauge(scene: Phaser.Scene, x: number, y: number, left: number, of: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(toPhaserColor(PALETTE.letterbox), 1);
  g.fillRect(x, y, GAUGE_W, GAUGE_H);
  const risen = of === 0 ? GAUGE_W - 2 : Math.round(((of - left) / of) * (GAUGE_W - 2));
  g.fillStyle(toPhaserColor(PALETTE.rain), 1);
  g.fillRect(x + 1, y + 1, risen, GAUGE_H - 2);
  g.lineStyle(1, toPhaserColor(PALETTE.plateEdge), 1);
  g.strokeRect(x + 0.5, y + 0.5, GAUGE_W - 1, GAUGE_H - 1);
  return g;
}

/** A small bolt, 4 wide, 7 tall. */
function bolt(g: Phaser.GameObjects.Graphics, x: number, y: number, color: string): void {
  g.fillStyle(toPhaserColor(color), 1);
  for (const [px, py] of [[2, 0], [3, 0], [1, 1], [2, 1], [1, 2], [0, 3], [1, 3], [2, 3], [3, 3], [2, 4], [1, 5], [2, 5], [1, 6]] as const) {
    g.fillRect(x + px, y + py, 1, 1);
  }
}

/** How much of each chip the strip shows in `room` px, and how wide it is. */
export function stripFit(chips: readonly ModChip[], room: number): { tier: ChipFit; total: number } {
  const totalAt = (tier: ChipFit) => chips.reduce((w, chip) => w + chipWidth(chip, fitOf(chip, tier)), 0) + CHIP_GAP * (chips.length - 1);
  const tier = FITS.find((t) => totalAt(t) <= room) ?? "icon";
  return { tier, total: totalAt(tier) };
}

export interface StripHandlers {
  onModHover(modId: string | null): void;
}

/** The camp's modifiers as chips centred in the top bar's free span
 * [left, right): icon, name, and a live reading. When the span is too
 * narrow the readings go first, then every name but the boss's or the
 * temple's. */
export function drawModStrip(scene: Phaser.Scene, layer: Layer, chips: ModChip[], span: { left: number; right: number }, index: ObjectIndex, handlers: StripHandlers): void {
  if (chips.length === 0) return;
  const room = span.right - span.left;
  const { tier, total } = stripFit(chips, room);
  const zone = ZONES.topBar;
  const y = zone.y + Math.floor((zone.h - CHIP_H) / 2);
  let x = span.left + Math.max(0, Math.floor((room - total) / 2));
  for (const chip of chips) {
    const fit = fitOf(chip, tier);
    const withBadges = fit === "badge";
    const w = chipWidth(chip, fit);
    const container = scene.add.container(x, y);
    const back = plate(scene, 0, 0, w, CHIP_H, chip.alert ? PALETTE.stump : PALETTE.plate);
    back.setStrokeStyle(1, toPhaserColor(chip.alert ? PALETTE.coin : PALETTE.plateEdge));
    container.add(back);
    container.add(modIcon(scene, chip.id, chip.kind, CHIP_PAD, Math.floor((CHIP_H - ICON_SIZE) / 2)));
    const textY = Math.floor((CHIP_H - LABEL_CELL.h) / 2);
    let cx = CHIP_PAD + ICON_SIZE + CHIP_PAD;
    if (fit !== "icon") {
      container.add(text(scene, cx, textY, chip.name));
      cx += labelWidth(chip.name);
    }
    if (withBadges && chip.badge !== null) {
      cx += CHIP_GAP;
      container.add(text(scene, cx, textY, chip.badge, chip.alert ? PALETTE.coinShine : PALETTE.sun));
      cx += labelWidth(chip.badge);
    }
    if (withBadges && chip.pips > 0) {
      cx += CHIP_GAP;
      const pips = scene.add.graphics();
      for (let i = 0; i < chip.pips; i++) bolt(pips, cx + i * (PIP_W + 1), Math.floor((CHIP_H - 7) / 2), PALETTE.coin);
      container.add(pips);
      cx += chip.pips * (PIP_W + 1) - 1;
    }
    if (chip.gauge !== null) {
      cx += CHIP_GAP;
      container.add(gauge(scene, cx, Math.floor((CHIP_H - GAUGE_H) / 2), chip.gauge.left, chip.gauge.of));
    }
    container.setSize(w, CHIP_H);
    const hit = scene.add.zone(0, 0, w, CHIP_H).setOrigin(0, 0);
    hit.setInteractive();
    hit.on("pointerover", () => handlers.onModHover(chip.id));
    hit.on("pointerout", () => handlers.onModHover(null));
    container.add(hit);
    layer.add(container);
    index.register("camp", chip.objectId, container);
    x += w + CHIP_GAP;
  }
}

// ---------------------------------------------------------------------------
// The weather overlay
// ---------------------------------------------------------------------------

const DROP_KEY = "weather:drop";
const SKY_DIM: Readonly<Record<Precipitation, number>> = { none: 0, rain: 0.18, storm: 0.34 };
const NIGHT_DIM = 0.38;
const FOG_KEY = "weather:fog-band";
/** Mist above the seat plates, around the stump and low on the ground, so
 * the plates' text never sits on a bright band. */
const FOG_BANDS = [
  { y: 46, alpha: 0.3, drift: 60, ms: 9000 },
  { y: 182, alpha: 0.38, drift: -80, ms: 11000 },
  { y: 248, alpha: 0.3, drift: 70, ms: 10000 },
] as const;
/** The water line: just under the hand panels when the river is low, the
 * stump's foot when it floods. */
const RIVER_LOW_Y = 300;
const RIVER_HIGH_Y = 232;
const RIVER_MS = 700;
const FLASH_MS = 520;
const BLOOD_MOON_ALPHA = 0.24;
const MOON_MS = 600;

function ensureDropTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(DROP_KEY)) return;
  const g = scene.make.graphics({}, false);
  g.fillStyle(toPhaserColor(PALETTE.rain), 1);
  g.fillRect(0, 0, 1, 8);
  g.fillStyle(toPhaserColor(PALETTE.moon), 1);
  g.fillRect(0, 6, 1, 2);
  g.generateTexture(DROP_KEY, 1, 8);
  g.destroy();
}

/** A soft horizontal band of mist, clear at its top and bottom edges. */
function ensureFogTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(FOG_KEY)) return;
  const texture = scene.textures.createCanvas(FOG_KEY, STAGE.w + 160, 56);
  if (!texture) return;
  const ctx = texture.context;
  const gradient = ctx.createLinearGradient(0, 0, 0, 56);
  gradient.addColorStop(0, "rgba(201, 205, 214, 0)");
  gradient.addColorStop(0.5, "rgba(201, 205, 214, 1)");
  gradient.addColorStop(1, "rgba(201, 205, 214, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, STAGE.w + 160, 56);
  texture.refresh();
}

/** The weather between the backdrop and the table: rain and the storm's
 * darker sky, the night's dark, drifting fog, and the river rising in a
 * flooded cave. Each part is rebuilt only when it changes. */
export class WeatherOverlay {
  private current: Precipitation | null = null;
  private haze: Haze | null = null;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private hazeObjects: Phaser.GameObjects.GameObject[] = [];
  private river: Phaser.GameObjects.Container | null = null;
  private moon: Phaser.GameObjects.Rectangle | null = null;
  private readonly flashed = new Set<string>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sky: Layer,
    private readonly top: Layer,
  ) {}

  setSky(sky: Pick<Sky, "precipitation" | "haze" | "flood" | "bloodMoon">): void {
    this.setHaze(sky.haze);
    this.setPrecipitation(sky.precipitation);
    this.setRiver(sky.flood);
    this.setBloodMoon(sky.bloodMoon);
  }

  /** A red cast over the sky while the Blood Moon is up, fading in and out
   * as it rises and sets. */
  private setBloodMoon(up: boolean): void {
    if (this.moon === null) {
      this.moon = this.scene.add.rectangle(0, 0, STAGE.w, STAGE.h, toPhaserColor(PALETTE.destructive)).setOrigin(0, 0).setAlpha(0);
      this.sky.add(this.moon);
    }
    const alpha = up ? BLOOD_MOON_ALPHA : 0;
    if (this.moon.getData("target") === alpha) return;
    this.moon.setData("target", alpha);
    this.scene.tweens.killTweensOf(this.moon);
    this.scene.tweens.add({ targets: this.moon, alpha, duration: MOON_MS, ease: "Sine.easeInOut" });
  }

  private setHaze(haze: Haze): void {
    if (haze === this.haze) return;
    this.haze = haze;
    for (const obj of this.hazeObjects) obj.destroy();
    this.hazeObjects = [];
    if (haze === "night") {
      this.hazeObjects = [this.scene.add.rectangle(0, 0, STAGE.w, STAGE.h, toPhaserColor(PALETTE.letterbox), NIGHT_DIM).setOrigin(0, 0)];
    } else if (haze === "fog") {
      ensureFogTexture(this.scene);
      this.hazeObjects = [
        this.scene.add.rectangle(0, 0, STAGE.w, STAGE.h, toPhaserColor(PALETTE.moon), 0.12).setOrigin(0, 0),
        ...FOG_BANDS.map((band) => {
          const image = this.scene.add.image(-80, band.y, FOG_KEY).setOrigin(0, 0.5).setAlpha(band.alpha);
          this.scene.tweens.add({ targets: image, x: -80 + band.drift, duration: band.ms, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
          return image;
        }),
      ];
    }
    this.sky.add(this.hazeObjects);
  }

  /** The water rises to its new line; a fresh camp starts it there. */
  private setRiver(flood: number | null): void {
    if (flood === null) {
      this.river?.destroy();
      this.river = null;
      return;
    }
    const y = Math.round(RIVER_LOW_Y - flood * (RIVER_LOW_Y - RIVER_HIGH_Y));
    if (this.river === null) {
      const water = this.scene.add.rectangle(0, 0, STAGE.w, STAGE.h, toPhaserColor(PALETTE.rain), 0.32).setOrigin(0, 0);
      const crest = this.scene.add.rectangle(0, 0, STAGE.w, 2, toPhaserColor(PALETTE.moon), 0.55).setOrigin(0, 0);
      this.river = this.scene.add.container(0, y, [water, crest]);
      this.sky.add(this.river);
      return;
    }
    if (this.river.y !== y) this.scene.tweens.add({ targets: this.river, y, duration: RIVER_MS, ease: "Quad.easeOut" });
  }

  private setPrecipitation(precipitation: Precipitation): void {
    if (precipitation === this.current) return;
    this.current = precipitation;
    for (const obj of this.objects) obj.destroy();
    this.objects = [];
    if (precipitation === "none") return;
    const dim = this.scene.add.rectangle(0, 0, STAGE.w, STAGE.h, toPhaserColor(PALETTE.letterbox), SKY_DIM[precipitation]).setOrigin(0, 0);
    ensureDropTexture(this.scene);
    const storm = precipitation === "storm";
    const rain = this.scene.add.particles(0, 0, DROP_KEY, {
      x: { min: -40, max: STAGE.w + 40 },
      y: -8,
      lifespan: 1100,
      speedY: { min: storm ? 380 : 300, max: storm ? 460 : 360 },
      speedX: { min: storm ? -90 : -40, max: storm ? -60 : -20 },
      rotate: storm ? 12 : 6,
      alpha: { start: 0.85, end: 0.35 },
      quantity: storm ? 6 : 4,
      frequency: 20,
    });
    this.sky.add([dim, rain]);
    this.objects = [dim, rain];
  }

  /** Lights the sky once per strike key, with a bolt down onto the stump. */
  flash(strike: string | null): void {
    if (strike === null || this.flashed.has(strike)) return;
    this.flashed.add(strike);
    const glare = this.scene.add.rectangle(0, 0, STAGE.w, STAGE.h, toPhaserColor(PALETTE.text), 0.85).setOrigin(0, 0);
    const bolt = this.scene.add.graphics();
    const points = [
      [STUMP_CENTRE.x + 70, 0],
      [STUMP_CENTRE.x + 40, 40],
      [STUMP_CENTRE.x + 58, 46],
      [STUMP_CENTRE.x + 18, 96],
      [STUMP_CENTRE.x + 34, 100],
      [STUMP_CENTRE.x, ZONES.stump.y + 6],
    ] as const;
    for (const [width, color] of [[5, PALETTE.coin], [2, PALETTE.text]] as const) {
      bolt.lineStyle(width, toPhaserColor(color), 1);
      bolt.beginPath();
      bolt.moveTo(points[0][0], points[0][1]);
      for (const [px, py] of points.slice(1)) bolt.lineTo(px, py);
      bolt.strokePath();
    }
    this.top.add([glare, bolt]);
    this.scene.tweens.add({ targets: glare, alpha: { from: 0.85, to: 0 }, duration: FLASH_MS, ease: "Quad.easeOut", onComplete: () => glare.destroy() });
    this.scene.tweens.add({ targets: bolt, alpha: { from: 1, to: 0 }, delay: FLASH_MS / 3, duration: FLASH_MS, onComplete: () => bolt.destroy() });
  }
}
