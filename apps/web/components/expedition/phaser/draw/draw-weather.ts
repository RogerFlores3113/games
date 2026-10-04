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
import type { ModChip, Precipitation } from "../../../../lib/expedition/weather-model";
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
};

const ICONS: Readonly<Record<string, readonly string[]>> = {
  fair: ["....o....", ".o.....o.", "...ooo...", "..ooooo..", "o.ooooo.o", "..ooooo..", "...ooo...", ".o.....o.", "....o...."],
  rain: ["...www...", ".wwwwwww.", "wwwwwwwww", ".wwwwwww.", ".........", ".b..b..b.", "b..b..b..", ".........", ".b..b..b."],
  thunderstorm: ["...ggg...", ".ggggggg.", "ggggggggg", ".gggyggg.", "....yy...", "...yy....", "..yyyyy..", "....yy...", "...y....."],
  jungle: ["...ttt...", "..ttttt..", ".ttttttt.", "ttttttttt", ".ttttttt.", "...kkk...", "....k....", "....k....", "mmmmmmmmm"],
  clearing: [".........", ".........", "....o....", "...ooo...", ".........", "t..t...t.", "tt.tt.ttt", "mmmmmmmmm", "mmmmmmmmm"],
  clifftop: ["....w....", "...www...", "...gwg...", "..ggggg..", "..gdggg..", ".ggggdgg.", ".gdggggg.", "ggggggdgg", "ddddddddd"],
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

// ---------------------------------------------------------------------------
// The strip
// ---------------------------------------------------------------------------

const CHIP_H = 14;
const CHIP_PAD = 3;
const CHIP_GAP = 4;
const PIP_W = 4;

function chipWidth(chip: ModChip, withBadge: boolean): number {
  const badge = withBadge && chip.badge !== null ? CHIP_GAP + labelWidth(chip.badge) : 0;
  const pips = withBadge && chip.pips > 0 ? CHIP_GAP + chip.pips * (PIP_W + 1) - 1 : 0;
  return CHIP_PAD + ICON_SIZE + CHIP_PAD + labelWidth(chip.name) + badge + pips + CHIP_PAD;
}

/** A small bolt, 4 wide, 7 tall. */
function bolt(g: Phaser.GameObjects.Graphics, x: number, y: number, color: string): void {
  g.fillStyle(toPhaserColor(color), 1);
  for (const [px, py] of [[2, 0], [3, 0], [1, 1], [2, 1], [1, 2], [0, 3], [1, 3], [2, 3], [3, 3], [2, 4], [1, 5], [2, 5], [1, 6]] as const) {
    g.fillRect(x + px, y + py, 1, 1);
  }
}

export interface StripHandlers {
  onModHover(modId: string | null): void;
}

/** The camp's modifiers as chips centred in the top bar's free span
 * [left, right): icon, name, and a live reading. A chip's reading is
 * dropped first when the span is too narrow. */
export function drawModStrip(scene: Phaser.Scene, layer: Layer, chips: ModChip[], span: { left: number; right: number }, index: ObjectIndex, handlers: StripHandlers): void {
  if (chips.length === 0) return;
  const room = span.right - span.left;
  const full = chips.reduce((w, chip) => w + chipWidth(chip, true), 0) + CHIP_GAP * (chips.length - 1);
  const withBadges = full <= room;
  const total = withBadges ? full : chips.reduce((w, chip) => w + chipWidth(chip, false), 0) + CHIP_GAP * (chips.length - 1);
  const zone = ZONES.topBar;
  const y = zone.y + Math.floor((zone.h - CHIP_H) / 2);
  let x = span.left + Math.max(0, Math.floor((room - total) / 2));
  for (const chip of chips) {
    const w = chipWidth(chip, withBadges);
    const container = scene.add.container(x, y);
    const back = plate(scene, 0, 0, w, CHIP_H, chip.alert ? PALETTE.stump : PALETTE.plate);
    back.setStrokeStyle(1, toPhaserColor(chip.alert ? PALETTE.coin : PALETTE.plateEdge));
    container.add(back);
    container.add(modIcon(scene, chip.id, chip.kind, CHIP_PAD, Math.floor((CHIP_H - ICON_SIZE) / 2)));
    const textY = Math.floor((CHIP_H - LABEL_CELL.h) / 2);
    let cx = CHIP_PAD + ICON_SIZE + CHIP_PAD;
    container.add(text(scene, cx, textY, chip.name));
    cx += labelWidth(chip.name);
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
const FLASH_MS = 520;

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

/** The rain and the storm's dimmer sky, drawn between the backdrop and the
 * table; rebuilt only when the precipitation changes. */
export class WeatherOverlay {
  private current: Precipitation | null = null;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private readonly flashed = new Set<string>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sky: Layer,
    private readonly top: Layer,
  ) {}

  setPrecipitation(precipitation: Precipitation): void {
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
