/**
 * Your kit at the left edge, in camp and between camps: the item slots sunk
 * into a leather strip, the powers raised out of a stone one, under a "Kit"
 * header that pops the bar out to show each one's name and what is left.
 * Hovering one names it in full in the tooltip; one you can use now glows,
 * and a click uses it. Every value comes from the `KitBar` model.
 */
import type Phaser from "phaser";
import { CURSOR } from "../cursors";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { KIT_SLOT, kitBarLayout, type Rect } from "../layout";
import { placeArt } from "../art/place-art";
import { sourceArtId } from "../art/art-registry";
import type { ObjectIndex } from "../object-index";
import type { SceneKey } from "../../../../lib/expedition/build-scene-model";
import type { KitBar, KitEntry } from "../../../../lib/expedition/kit-bar-model";
import { KIT_TOGGLE_ID } from "../../../../lib/expedition/expedition-ids";
import { fitLabel, fitUses } from "./text-fit";
import { DIM_ALPHA, labelWidth, text, type Layer } from "./ui-kit";

export interface KitBarHandlers {
  /** A source you can use now: use it, or start aiming it. */
  onUse(sourceKey: string): void;
  /** The pointer is over a source (its object id), or left it. */
  onHover(sourceKey: string | null, objectId?: string): void;
  /** The header: pops the bar out, or folds it back. */
  onToggle(): void;
}

const PULSE_MS = 600;
const WORDS_X = KIT_SLOT + 3;
const BACKPACK_SCALE = 0.5;

interface Ctx {
  scene: Phaser.Scene;
  layer: Layer;
  index: ObjectIndex;
  sceneKey: SceneKey;
  handlers: KitBarHandlers;
  open: boolean;
}

/** A strip's face: leather stitched just inside its edge, or plain stone. */
function strip(scene: Phaser.Scene, rect: Rect, kind: "leather" | "stone"): Phaser.GameObjects.GameObject[] {
  const fill = scene.add.rectangle(rect.x, rect.y, rect.w, rect.h, toPhaserColor(kind === "leather" ? PALETTE.kitLeather : PALETTE.stone)).setOrigin(0, 0);
  fill.setStrokeStyle(1, toPhaserColor(PALETTE.cardEdge));
  if (kind === "stone") return [fill];
  const g = scene.add.graphics();
  g.fillStyle(toPhaserColor(PALETTE.leatherStitch), 0.7);
  for (let y = rect.y + 3; y < rect.y + rect.h - 3; y += 4) {
    g.fillRect(rect.x + 1, y, 1, 2);
    g.fillRect(rect.x + rect.w - 2, y, 1, 2);
  }
  return [fill, g];
}

/** The 18 px square an icon sits in: sunk into leather, or raised from stone. */
function well(scene: Phaser.Scene, kind: "slot" | "tile"): Phaser.GameObjects.Graphics {
  const s = KIT_SLOT;
  const sunk = kind === "slot";
  const g = scene.add.graphics();
  g.fillStyle(toPhaserColor(sunk ? PALETTE.leatherPatch : PALETTE.stoneFace), 1);
  g.fillRect(0, 0, s, s);
  g.fillStyle(toPhaserColor(sunk ? PALETTE.slotShadow : PALETTE.stoneLight), 1);
  g.fillRect(0, 0, s, 1);
  g.fillRect(0, 0, 1, s);
  g.fillStyle(toPhaserColor(sunk ? PALETTE.slotLight : PALETTE.stoneShadow), 1);
  g.fillRect(0, s - 1, s, 1);
  g.fillRect(s - 1, 0, 1, s);
  return g;
}

/** A glow round a usable slot, solid while it is being aimed. */
function ring(ctx: Ctx, container: Phaser.GameObjects.Container, pulse: boolean, active: boolean): void {
  if (!pulse && !active) return;
  const outline = ctx.scene.add.rectangle(-1, -1, KIT_SLOT + 2, KIT_SLOT + 2, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(active ? PALETTE.sun : PALETTE.turn));
  container.add(outline);
  if (pulse) ctx.scene.tweens.add({ targets: outline, alpha: { from: 1, to: 0.3 }, duration: PULSE_MS, yoyo: true, repeat: -1 });
}

/** Name and what is left, beside the slot while the bar is out. */
function words(ctx: Ctx, container: Phaser.GameObjects.Container, rect: Rect, name: string, uses: string, color: string): void {
  const chars = Math.floor((rect.w - WORDS_X - 1) / LABEL_CELL.w);
  container.add(text(ctx.scene, WORDS_X, 1, fitLabel(name, chars)));
  container.add(text(ctx.scene, WORDS_X, KIT_SLOT - LABEL_CELL.h, fitLabel(uses, chars), color));
}

/** The hit over a row: hover names it; a click uses it when it can be. */
function hit(ctx: Ctx, container: Phaser.GameObjects.Container, rect: Rect, sourceKey: string, objectId: string, usable: boolean): void {
  const zone = ctx.scene.add.zone(0, 0, rect.w, rect.h).setOrigin(0, 0);
  zone.setInteractive(usable ? { cursor: CURSOR.pointer } : undefined);
  zone.on("pointerover", () => ctx.handlers.onHover(sourceKey, objectId));
  zone.on("pointerout", () => ctx.handlers.onHover(null));
  if (usable) zone.on("pointerdown", () => ctx.handlers.onUse(sourceKey));
  container.add(zone);
  container.setSize(rect.w, rect.h);
}

function usesColor(entry: KitEntry): string {
  return entry.usable ? PALETTE.turn : entry.spent ? PALETTE.destructive : PALETTE.textDim;
}

function drawEntry(ctx: Ctx, entry: KitEntry, rect: Rect, kind: "slot" | "tile"): void {
  const { scene } = ctx;
  const container = scene.add.container(rect.x, rect.y);
  if (ctx.open) container.add(scene.add.rectangle(0, 0, rect.w, rect.h, toPhaserColor(kind === "slot" ? PALETTE.leatherSlot : PALETTE.stoneShadow), 0.55).setOrigin(0, 0));
  container.add(well(scene, kind));
  const art = sourceArtId(entry.sourceId);
  if (art !== null) container.add(placeArt(scene, art, KIT_SLOT / 2, KIT_SLOT / 2).setAlpha(entry.spent ? DIM_ALPHA : 1));
  ring(ctx, container, entry.pulse, entry.active);
  if (ctx.open) words(ctx, container, rect, entry.name, fitUses(entry.uses, Math.floor((rect.w - WORDS_X - 1) / LABEL_CELL.w)), usesColor(entry));
  hit(ctx, container, rect, entry.sourceKey, entry.objectId, entry.usable);
  ctx.layer.add(container);
  ctx.index.register(ctx.sceneKey, entry.objectId, container);
}

function drawEmptySlot(ctx: Ctx, rect: Rect): void {
  const container = ctx.scene.add.container(rect.x, rect.y);
  if (ctx.open) container.add(ctx.scene.add.rectangle(0, 0, rect.w, rect.h, toPhaserColor(PALETTE.leatherSlot), 0.55).setOrigin(0, 0));
  container.add(well(ctx.scene, "slot"));
  if (ctx.open) container.add(text(ctx.scene, WORDS_X, Math.floor((KIT_SLOT - LABEL_CELL.h) / 2), "Empty slot", PALETTE.textDim));
  ctx.layer.add(container);
}

/** The Pack Rat's backpack, under the item slots in camp. */
function drawBackpack(ctx: Ctx, backpack: NonNullable<KitBar["backpack"]>, rect: Rect): void {
  const { scene } = ctx;
  const container = scene.add.container(rect.x, rect.y);
  if (ctx.open) container.add(scene.add.rectangle(0, 0, rect.w, rect.h, toPhaserColor(PALETTE.leatherSlot), 0.55).setOrigin(0, 0));
  container.add(well(scene, "slot"));
  container.add(placeArt(scene, "backpack-icon", KIT_SLOT / 2, KIT_SLOT / 2).setScale(BACKPACK_SCALE).setAlpha(backpack.usable || backpack.active ? 1 : DIM_ALPHA));
  ring(ctx, container, backpack.pulse, backpack.active);
  if (ctx.open) words(ctx, container, rect, "Backpack", backpack.usable ? "Swap items" : "Not now", backpack.usable ? PALETTE.turn : PALETTE.textDim);
  hit(ctx, container, rect, backpack.sourceKey, backpack.objectId, backpack.usable);
  ctx.layer.add(container);
  ctx.index.register(ctx.sceneKey, backpack.objectId, container);
}

/** "Kit" and an arrow that points the way the bar will move. */
function drawHeader(ctx: Ctx, rect: Rect): void {
  const { scene } = ctx;
  const container = scene.add.container(rect.x, rect.y);
  const label = ctx.open ? "Your kit" : "Kit";
  const bg = scene.add.rectangle(0, 0, rect.w, rect.h, toPhaserColor(PALETTE.cardEdge), 0.9).setOrigin(0, 0);
  container.add(bg);
  // The slim bar between camps has a pixel to spare on each side of "Kit".
  const textX = rect.w < 30 ? 1 : 2;
  container.add(text(scene, textX, Math.floor((rect.h - LABEL_CELL.h) / 2) + 1, label, PALETTE.coinShine));
  const g = scene.add.graphics();
  g.fillStyle(toPhaserColor(PALETTE.coinShine), 1);
  const ax = Math.max(textX + labelWidth(label), rect.w - 4);
  const cy = Math.floor(rect.h / 2);
  for (let i = 0; i < 3; i++) {
    const x = ctx.open ? ax + 2 - i : ax + i;
    g.fillRect(x, cy - (2 - i), 1, 2 * (2 - i) + 1);
  }
  container.add(g);
  const zone = scene.add.zone(0, 0, rect.w, rect.h).setOrigin(0, 0).setInteractive({ cursor: CURSOR.pointer });
  zone.on("pointerover", () => bg.setFillStyle(toPhaserColor(PALETTE.stump), 1));
  zone.on("pointerout", () => bg.setFillStyle(toPhaserColor(PALETTE.cardEdge), 0.9));
  zone.on("pointerdown", () => ctx.handlers.onToggle());
  container.add(zone);
  container.setSize(rect.w, rect.h);
  ctx.layer.add(container);
  ctx.index.register(ctx.sceneKey, KIT_TOGGLE_ID, container);
}

/** The bar in `zone`: the items and the powers side by side (`columns` 2)
 * or the powers under the items (1). */
export function drawKitBar(scene: Phaser.Scene, layer: Layer, bar: KitBar | null, zone: Rect, columns: 1 | 2, index: ObjectIndex, sceneKey: SceneKey, handlers: KitBarHandlers): void {
  if (bar === null) return;
  const itemRows = bar.items.length + (bar.backpack === null ? 0 : 1);
  const geo = kitBarLayout(zone, columns, itemRows, bar.powers.length, bar.open);
  const ctx: Ctx = { scene, layer, index, sceneKey, handlers, open: bar.open };
  if (bar.open) {
    // Popped out over the scene: one backing under the strips, so nothing
    // behind shows between them.
    const bottom = Math.max(geo.leather.y + geo.leather.h, (geo.stone?.y ?? 0) + (geo.stone?.h ?? 0));
    const right = Math.max(geo.header.x + geo.header.w, geo.leather.x + geo.leather.w, (geo.stone?.x ?? 0) + (geo.stone?.w ?? 0));
    layer.add(scene.add.rectangle(geo.header.x - 1, geo.header.y - 1, right - geo.header.x + 2, bottom - geo.header.y + 2, toPhaserColor(PALETTE.letterbox), 0.92).setOrigin(0, 0));
  }
  layer.add(strip(scene, geo.leather, "leather"));
  if (geo.stone !== null) layer.add(strip(scene, geo.stone, "stone"));
  drawHeader(ctx, geo.header);
  bar.items.forEach((entry, i) => (entry === null ? drawEmptySlot(ctx, geo.items[i]!) : drawEntry(ctx, entry, geo.items[i]!, "slot")));
  if (bar.backpack !== null) drawBackpack(ctx, bar.backpack, geo.items[bar.items.length]!);
  bar.powers.forEach((entry, i) => drawEntry(ctx, entry, geo.powers[i]!, "tile"));
}
