/**
 * The fireside's trail, draft, crew, backpack and Ready zones. Every value
 * drawn comes from `FiresideModel`; clicks only call the handlers.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { FIRESIDE_ZONES, rowBoxes, trailStopXs, type Rect } from "../layout";
import { placeArt } from "../art/place-art";
import { ART, gearArtId, type ArtId } from "../art/art-registry";
import type { ObjectIndex } from "../object-index";
import type { CrewRow, DraftItem, FiresideModel, OwnedItem, TrailStop } from "../../../../lib/expedition/fireside-model";
import { fitLabel } from "./text-fit";
import { DIM_ALPHA, button, labelWidth, plate, text, type Layer } from "./ui-kit";

export interface FiresideHandlers {
  onDraft(gearId: string): void;
  onPack(gearId: string): void;
  onReady(): void;
  onGearHover(gearId: string | null): void;
}

interface Ctx {
  scene: Phaser.Scene;
  layer: Layer;
  model: FiresideModel;
  index: ObjectIndex;
  handlers: FiresideHandlers;
}

const PANEL_ALPHA = 0.75;
const INK = PALETTE.cardEdge;
const PULSE_MS = 600;

function centredText(scene: Phaser.Scene, cx: number, y: number, value: string, color: string = PALETTE.text): Phaser.GameObjects.BitmapText {
  return text(scene, cx - Math.floor(labelWidth(value) / 2), y, value, color);
}

function panel(ctx: Ctx, zone: Rect): void {
  ctx.layer.add(plate(ctx.scene, zone.x, zone.y, zone.w, zone.h).setAlpha(PANEL_ALPHA));
}

// ---------------------------------------------------------------------------
// Trail
// ---------------------------------------------------------------------------

const MARKER_ROW = 36;
const LABEL_ROW = 46;
const CAPTION_ROW = 55;

const CAPTION_COLOR: Readonly<Record<TrailStop["state"], string>> = {
  cleared: PALETTE.moss,
  next: PALETTE.turn,
  ahead: PALETTE.destructive,
};

function markerFor(stop: TrailStop): ArtId {
  if (stop.state === "cleared") return "marker-cleared";
  return stop.boss ? "marker-boss" : "marker-camp";
}

function drawTrail(ctx: Ctx): void {
  const { scene, layer, model } = ctx;
  const zone = FIRESIDE_ZONES.trail;
  layer.add(placeArt(scene, "trail-map", zone.x + zone.w / 2, zone.y + zone.h / 2));

  const xs = trailStopXs(model.trail.length + 1);
  const markerY = (i: number): number => zone.y + MARKER_ROW + (i % 2 === 0 ? -2 : 2);

  const path = scene.add.graphics();
  path.fillStyle(toPhaserColor(INK), 1);
  for (let i = 0; i + 1 < xs.length; i++) {
    const [x0, x1] = [xs[i]! + 10, xs[i + 1]! - 10];
    for (let x = x0; x < x1; x += 4) {
      const t = (x - x0) / (x1 - x0);
      path.fillRect(x, Math.round(markerY(i) + (markerY(i + 1) - markerY(i)) * t), 2, 1);
    }
  }
  layer.add(path);

  model.trail.forEach((stop, i) => {
    const x = xs[i]!;
    const y = markerY(i);
    if (stop.state === "next") {
      const glow = scene.add.rectangle(x, y, 20, 20, 0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn));
      layer.add(glow);
      scene.tweens.add({ targets: glow, alpha: { from: 1, to: 0.3 }, duration: PULSE_MS, yoyo: true, repeat: -1 });
      const token = ART["crew-token"];
      layer.add(placeArt(scene, "crew-token", x, zone.y + 4 + token.h / 2));
      layer.add(text(scene, x + token.w / 2 + 2, zone.y + 8, "Crew", INK));
    }
    const marker = placeArt(scene, markerFor(stop), x, y);
    if (stop.state === "ahead") marker.setAlpha(0.7);
    layer.add(marker);
    layer.add(centredText(scene, x, zone.y + LABEL_ROW, `Camp ${stop.campNumber}`, INK));
    if (stop.caption !== "") layer.add(centredText(scene, x, zone.y + CAPTION_ROW, stop.caption, CAPTION_COLOR[stop.state]));
  });

  const templeX = xs[xs.length - 1]!;
  layer.add(placeArt(scene, "temple", templeX, markerY(model.trail.length)));
  layer.add(centredText(scene, templeX, zone.y + LABEL_ROW, "Temple", INK));
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

const TILE_GAP = 8;
const TILE_MAX_W = 116;
const TILE_H = 100;
const PIP = 5;

function sizePips(scene: Phaser.Scene, container: Phaser.GameObjects.Container, cx: number, y: number, size: number): void {
  const caption = `size ${size}`;
  const pipsW = size * (PIP + 2);
  const startX = cx - Math.floor((labelWidth(caption) + (size > 0 ? 4 + pipsW : 0)) / 2);
  container.add(text(scene, startX, y, caption, PALETTE.textDim));
  for (let i = 0; i < size; i++) {
    const px = startX + labelWidth(caption) + 4 + i * (PIP + 2);
    container.add(scene.add.rectangle(px, y + 1, PIP, PIP, toPhaserColor(PALETTE.sun)).setOrigin(0, 0));
  }
}

function drawDraftTile(ctx: Ctx, item: DraftItem, x: number, y: number, w: number): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, TILE_H, toPhaserColor(PALETTE.stump)).setOrigin(0, 0);
  bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  container.add(bg);
  const art = gearArtId(item.gearId);
  if (art !== null) container.add(placeArt(scene, art, w / 2, 22).setScale(2));
  const cx = Math.floor(w / 2);
  container.add(centredText(scene, cx, 44, fitLabel(item.name, Math.floor((w - 4) / LABEL_CELL.w))));
  sizePips(scene, container, cx, 58, item.size);
  container.add(centredText(scene, cx, 72, item.window, PALETTE.textDim));
  container.add(centredText(scene, cx, 86, "Take it", PALETTE.turn));
  bg.setInteractive({ useHandCursor: true });
  bg.on("pointerdown", () => handlers.onDraft(item.gearId));
  bg.on("pointerover", () => handlers.onGearHover(item.gearId));
  bg.on("pointerout", () => handlers.onGearHover(null));
  layer.add(container);
  index.register("fireside", item.objectId, container);
}

function drawDraft(ctx: Ctx): void {
  const { scene, layer, model } = ctx;
  const zone = FIRESIDE_ZONES.draft;
  panel(ctx, zone);
  const draft = model.draft;
  if (draft.kind === "offer") {
    layer.add(text(scene, zone.x + 6, zone.y + 4, "Gear by the fire: take one", PALETTE.textDim));
    rowBoxes(zone.x + 8, zone.w - 16, draft.items.length, TILE_GAP, TILE_MAX_W).forEach((box, i) => {
      drawDraftTile(ctx, draft.items[i]!, box.x, zone.y + 16, box.w);
    });
    return;
  }
  const cy = zone.y + zone.h / 2;
  if (draft.kind === "taken") {
    const art = gearArtId(draft.gearId);
    if (art !== null) layer.add(placeArt(scene, art, zone.x + 48, cy).setScale(2));
    layer.add(text(scene, zone.x + 80, cy - 10, `Taken: ${draft.name}`));
    layer.add(text(scene, zone.x + 80, cy + 2, "Pack it below to bring it along", PALETTE.textDim));
    return;
  }
  if (draft.text !== "") layer.add(centredText(scene, zone.x + zone.w / 2, cy - 4, draft.text, PALETTE.textDim));
}

// ---------------------------------------------------------------------------
// Crew
// ---------------------------------------------------------------------------

const CREW_TITLE_H = 13;
const CREW_ROW_MAX = 26;
const CHIP_H = 10;

const STATUS: Readonly<Record<CrewRow["status"], { label: string; color: string }>> = {
  ready: { label: "ready ✓", color: PALETTE.done },
  drafting: { label: "drafting…", color: PALETTE.sun },
  packing: { label: "packing…", color: PALETTE.textDim },
};

function drawCrewRow(ctx: Ctx, row: CrewRow, x: number, y: number, w: number): void {
  const { scene, layer } = ctx;
  const status = row.connected ? STATUS[row.status] : { label: "away", color: PALETTE.statusDisconnected };
  const statusX = x + w - labelWidth(status.label);
  const nameChars = Math.floor((statusX - x - 4) / LABEL_CELL.w);
  layer.add(text(scene, x, y, fitLabel(row.isYou ? `${row.displayLabel} (you)` : row.displayLabel, nameChars), row.isYou ? PALETTE.turn : PALETTE.text));
  layer.add(text(scene, statusX, y, status.label, status.color));

  const chipY = y + LABEL_CELL.h + 2;
  if (row.gear.length === 0) {
    layer.add(text(scene, x, chipY + 1, "no gear packed", PALETTE.textDim));
    return;
  }
  let cursor = x;
  for (let i = 0; i < row.gear.length; i++) {
    const rest = row.gear.length - i - 1;
    const reserve = rest > 0 ? labelWidth(`+${rest}`) + 2 : 0;
    const label = fitLabel(row.gear[i]!.name, Math.floor((x + w - reserve - cursor - 4) / LABEL_CELL.w));
    if (Array.from(label).length < 3) {
      layer.add(text(scene, cursor, chipY + 1, `+${rest + 1}`, PALETTE.textDim));
      return;
    }
    const chipW = labelWidth(label) + 4;
    layer.add(plate(scene, cursor, chipY, chipW, CHIP_H, PALETTE.bark));
    layer.add(text(scene, cursor + 2, chipY + 1, label));
    cursor += chipW + 2;
  }
}

function drawCrew(ctx: Ctx): void {
  const { scene, layer, model } = ctx;
  const zone = FIRESIDE_ZONES.crew;
  panel(ctx, zone);
  layer.add(text(scene, zone.x + 4, zone.y + 3, "Crew", PALETTE.textDim));
  const rowH = Math.min(CREW_ROW_MAX, Math.floor((zone.h - CREW_TITLE_H) / Math.max(1, model.crew.length)));
  model.crew.forEach((row, i) => {
    const group = scene.add.container(0, 0);
    drawCrewRow({ ...ctx, layer: group }, row, zone.x + 4, zone.y + CREW_TITLE_H + i * rowH, zone.w - 8);
    if (!row.connected) group.setAlpha(0.6);
    layer.add(group);
  });
}

// ---------------------------------------------------------------------------
// Backpack
// ---------------------------------------------------------------------------

const BAG_X = 124;
const SLOT_H = 22;
const SLOT_GAP = 2;
const SLOT_MAX_W = 72;
const OWNED_GAP = 4;
const OWNED_MAX_W = 64;
const OWNED_H = 42;

function drawOwnedTile(ctx: Ctx, item: OwnedItem, x: number, y: number, w: number): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, OWNED_H, toPhaserColor(PALETTE.stump)).setOrigin(0, 0);
  if (item.equipped) bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  container.add(bg);
  const art = gearArtId(item.gearId);
  if (art !== null) container.add(placeArt(scene, art, w / 2, 11));
  const cx = Math.floor(w / 2);
  container.add(centredText(scene, cx, 21, fitLabel(item.name, Math.floor((w - 2) / LABEL_CELL.w))));
  const caption =
    item.blocked !== null
      ? { v: item.blocked.caption, c: PALETTE.destructive }
      : item.equipped
        ? { v: "packed", c: PALETTE.turn }
        : { v: `size ${item.size}`, c: PALETTE.textDim };
  container.add(centredText(scene, cx, 31, caption.v, caption.c));
  if (item.blocked !== null) container.setAlpha(DIM_ALPHA);
  bg.setInteractive({ useHandCursor: item.blocked === null });
  bg.on("pointerdown", () => {
    if (item.blocked === null) handlers.onPack(item.gearId);
  });
  bg.on("pointerover", () => handlers.onGearHover(item.gearId));
  bg.on("pointerout", () => handlers.onGearHover(null));
  layer.add(container);
  index.register("fireside", item.objectId, container);
}

function drawBackpack(ctx: Ctx): void {
  const { scene, layer, model } = ctx;
  const zone = FIRESIDE_ZONES.backpack;
  const bag = model.backpack;
  panel(ctx, zone);
  if (bag === null) {
    layer.add(centredText(scene, zone.x + zone.w / 2, zone.y + zone.h / 2 - 4, "Watching the crew pack", PALETTE.textDim));
    return;
  }
  layer.add(text(scene, zone.x + 4, zone.y + 3, "Backpack"));
  const art = ART["backpack-open"];
  layer.add(placeArt(scene, "backpack-open", zone.x + 4 + art.w / 2, zone.y + 16 + art.h / 2));

  const x0 = zone.x + BAG_X;
  const rowW = zone.x + zone.w - 4 - x0;
  const cap = `Capacity ${bag.capacity}, ${bag.used} used`;
  layer.add(text(scene, x0 + rowW - labelWidth(cap), zone.y + 3, cap, PALETTE.textDim));

  const slotY = zone.y + 14;
  const slots = rowBoxes(x0, rowW, bag.capacity, SLOT_GAP, SLOT_MAX_W);
  for (const slot of slots) {
    layer.add(scene.add.rectangle(slot.x, slotY, slot.w, SLOT_H, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.plateEdge)));
  }
  for (const item of bag.packed) {
    if (item.size === 0) continue;
    const first = slots[item.firstSlot];
    const last = slots[item.firstSlot + item.size - 1];
    if (first === undefined || last === undefined) continue;
    const w = last.x + last.w - first.x;
    layer.add(plate(scene, first.x, slotY, w, SLOT_H, PALETTE.bark));
    const label = fitLabel(item.name, Math.floor((w - 4) / LABEL_CELL.w));
    layer.add(centredText(scene, first.x + w / 2, slotY + Math.floor((SLOT_H - LABEL_CELL.h) / 2), label));
  }

  const ownedY = zone.y + zone.h - OWNED_H - 2;
  if (bag.owned.length === 0) {
    layer.add(text(scene, x0, ownedY + 16, "Nothing yet: take a gear above", PALETTE.textDim));
    return;
  }
  rowBoxes(x0, rowW, bag.owned.length, OWNED_GAP, OWNED_MAX_W).forEach((box, i) => {
    drawOwnedTile(ctx, bag.owned[i]!, box.x, ownedY, box.w);
  });
}

// ---------------------------------------------------------------------------
// Ready
// ---------------------------------------------------------------------------

const READY_W = 136;
const READY_H = 40;

const READY_CAPTION: Readonly<Record<NonNullable<FiresideModel["ready"]>["state"], string>> = {
  blocked: "Take a gear first",
  open: "Set out when packed",
  done: "Waiting for the crew",
};

function drawReady(ctx: Ctx): void {
  const { scene, layer, model, index, handlers } = ctx;
  const ready = model.ready;
  if (ready === null) return;
  const zone = FIRESIDE_ZONES.ready;
  const cx = zone.x + zone.w / 2;
  const cy = zone.y + 6 + READY_H / 2;
  if (ready.state === "open") {
    const b = button(scene, cx, cy, READY_W, READY_H, "Ready", { onClick: () => handlers.onReady(), outline: true, big: true });
    layer.add(b);
    index.register("fireside", ready.objectId, b);
  } else {
    const done = ready.state === "done";
    layer.add(button(scene, cx, cy, READY_W, READY_H, done ? "Ready ✓" : "Ready", { big: true, dim: !done, color: done ? PALETTE.moss : PALETTE.stump }));
  }
  layer.add(plate(scene, zone.x + 4, zone.y + 54, zone.w - 8, 14).setAlpha(PANEL_ALPHA));
  layer.add(centredText(scene, cx, zone.y + 57, READY_CAPTION[ready.state], ready.state === "open" ? PALETTE.text : PALETTE.textDim));
}

export function drawFireside(scene: Phaser.Scene, layer: Layer, model: FiresideModel, index: ObjectIndex, handlers: FiresideHandlers): void {
  const ctx: Ctx = { scene, layer, model, index, handlers };
  drawTrail(ctx);
  drawDraft(ctx);
  drawCrew(ctx);
  drawBackpack(ctx);
  drawReady(ctx);
}
