/**
 * The fireside's trail, muster or draft, crew, kit and Ready zones. Every value
 * drawn comes from `FiresideModel`; clicks only call the handlers.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { FIRESIDE_ZONES, MUSTER_ZONES, rowBoxes, trailStopXs, type Rect } from "../layout";
import { placeArt } from "../art/place-art";
import { ART, crewArtId, sourceArtId, type ArtId } from "../art/art-registry";
import type { ObjectIndex } from "../object-index";
import type { CharacterCard, CrewRow, DraftItem, FiresideModel, KitItem, TrailStop } from "../../../../lib/expedition/fireside-model";
import { fitLabel, wrapWords } from "./text-fit";
import { PANEL_ALPHA, button, labelWidth, plate, text, type Layer } from "./ui-kit";

export interface FiresideHandlers {
  /** A muster or draft tile: picks a character or takes a source. */
  onDraft(sourceId: string): void;
  onReady(): void;
  onSourceHover(sourceId: string | null): void;
}

interface Ctx {
  scene: Phaser.Scene;
  layer: Layer;
  model: FiresideModel;
  index: ObjectIndex;
  handlers: FiresideHandlers;
}

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

// Rows inside the parchment, clear of its torn white edges.
const MARKER_ROW = 30;
const LABEL_ROW = 40;
const CAPTION_ROW = 49;

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
      layer.add(placeArt(scene, "crew-token", x, zone.y + 2 + token.h / 2));
      layer.add(text(scene, x + token.w / 2 + 2, zone.y + 6, "Crew", INK));
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
// Muster
// ---------------------------------------------------------------------------

const MUSTER_GAP = 4;
const PORTRAIT_H = 84;
const LINE = LABEL_CELL.h + 2;

/** Lines of `value` wrapped to the card width, at most `max`. */
function wrapped(value: string, chars: number, max: number): string[] {
  return wrapWords(value, chars).slice(0, max);
}

function drawCharacterCard(ctx: Ctx, card: CharacterCard, x: number, y: number, w: number, h: number): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(PALETTE.plate)).setOrigin(0, 0);
  const edge = card.yours ? PALETTE.turn : card.pickable ? PALETTE.sun : PALETTE.plateEdge;
  bg.setStrokeStyle(card.yours ? 2 : 1, toPhaserColor(edge));
  container.add(bg);
  container.add(scene.add.rectangle(2, 2, w - 4, PORTRAIT_H, toPhaserColor(PALETTE.night)).setOrigin(0, 0));
  const art = crewArtId(card.characterId);
  if (art !== null) container.add(placeArt(scene, art, w / 2, 2 + PORTRAIT_H - 40));

  const chars = Math.floor((w - 4) / LABEL_CELL.w);
  const cx = Math.floor(w / 2);
  let cy = PORTRAIT_H + 6;
  container.add(centredText(scene, cx, cy, fitLabel(card.name, chars), PALETTE.sun));
  cy += LINE;
  for (const line of wrapped(card.theme, chars, 2)) {
    container.add(centredText(scene, cx, cy, line, PALETTE.textDim));
    cy += LINE;
  }
  cy += 3;
  container.add(scene.add.rectangle(4, cy - 2, w - 8, 1, toPhaserColor(PALETTE.plateEdge)).setOrigin(0, 0));
  const icon = sourceArtId(card.power.sourceId);
  const powerW = (icon === null ? 0 : 18) + labelWidth(card.power.name);
  const px = Math.floor((w - powerW) / 2);
  if (icon !== null) container.add(placeArt(scene, icon, px + 8, cy + 6));
  container.add(text(scene, px + (icon === null ? 0 : 18), cy + 2, card.power.name));
  cy += 16;
  for (const line of wrapped(card.power.text, chars, 4)) {
    container.add(centredText(scene, cx, cy, line));
    cy += LINE;
  }
  cy += 2;
  for (const badge of card.power.badges) {
    for (const line of wrapped(badge, chars - 1, 2)) {
      container.add(badgeText(scene, cx, cy, line));
      cy += LINE + 1;
    }
  }
  if (card.pool !== null) {
    for (const line of wrapped(card.pool, chars, 2)) {
      container.add(centredText(scene, cx, cy, line, PALETTE.done));
      cy += LINE;
    }
  }

  const footer = card.yours ? "Your explorer" : card.takenBy !== null ? `Taken: ${card.takenBy}` : card.pickable ? "Choose" : "Free";
  const footerColor = card.yours ? PALETTE.turn : card.takenBy !== null ? PALETTE.textDim : PALETTE.sun;
  container.add(centredText(scene, cx, h - LABEL_CELL.h - 4, fitLabel(footer, chars), footerColor));
  if (card.takenBy !== null && !card.yours) container.setAlpha(0.55);

  container.setSize(w, h);
  const hit = scene.add.zone(0, 0, w, h).setOrigin(0, 0);
  hit.setInteractive({ useHandCursor: card.pickable });
  if (card.pickable) hit.on("pointerdown", () => handlers.onDraft(card.characterId));
  container.add(hit);
  if (card.pickable) {
    scene.tweens.add({ targets: bg, alpha: { from: 1, to: 0.8 }, duration: PULSE_MS, yoyo: true, repeat: -1 });
  }
  layer.add(container);
  index.register("fireside", card.objectId, container);
}

function badgeText(scene: Phaser.Scene, cx: number, y: number, value: string): Phaser.GameObjects.GameObject[] {
  const w = labelWidth(value) + 4;
  const x = cx - Math.floor(w / 2);
  return [scene.add.rectangle(x, y - 1, w, LABEL_CELL.h + 2, toPhaserColor(PALETTE.stump)).setOrigin(0, 0), text(scene, x + 2, y, value, PALETTE.text)];
}

function drawMuster(ctx: Ctx, cards: CharacterCard[]): void {
  const { scene, layer } = ctx;
  const zone = MUSTER_ZONES.cards;
  const title = "Choose your explorer";
  layer.add(plate(scene, zone.x + Math.floor((zone.w - labelWidth(title)) / 2) - 4, zone.y - 13, labelWidth(title) + 8, 12).setAlpha(PANEL_ALPHA));
  layer.add(centredText(scene, zone.x + zone.w / 2, zone.y - 11, title, PALETTE.sun));
  rowBoxes(zone.x + 2, zone.w - 4, cards.length, MUSTER_GAP, 120).forEach((box, i) => {
    drawCharacterCard(ctx, cards[i]!, box.x, zone.y, box.w, zone.h);
  });
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

const TILE_GAP = 6;
const TILE_MAX_W = 128;

function drawDraftTile(ctx: Ctx, item: DraftItem, x: number, y: number, w: number, h: number): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const upgrade = item.kind === "upgrade";
  const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(upgrade ? PALETTE.stump : PALETTE.bark)).setOrigin(0, 0);
  bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  container.add(bg);
  const chars = Math.floor((w - 6) / LABEL_CELL.w);
  const cx = Math.floor(w / 2);
  container.add(scene.add.rectangle(0, 0, w, 11, toPhaserColor(upgrade ? PALETTE.turn : PALETTE.moss)).setOrigin(0, 0));
  container.add(centredText(scene, cx, 2, fitLabel(item.ribbon, chars)));
  const art = sourceArtId(item.sourceId);
  if (art !== null) container.add(placeArt(scene, art, cx, 30).setScale(2));
  let cy = 48;
  container.add(centredText(scene, cx, cy, fitLabel(item.name, chars), PALETTE.sun));
  cy += LINE + 2;
  for (const line of wrapped(item.text, chars, 3)) {
    container.add(centredText(scene, cx, cy, line));
    cy += LINE;
  }
  cy += 2;
  for (const badge of item.badges) {
    for (const line of wrapped(badge, chars - 1, 2)) {
      container.add(badgeText(scene, cx, cy, line));
      cy += LINE + 1;
    }
  }
  container.add(centredText(scene, cx, h - LABEL_CELL.h - 4, "Take it", PALETTE.turn));
  container.setSize(w, h);
  const hit = scene.add.zone(0, 0, w, h).setOrigin(0, 0);
  hit.setInteractive({ useHandCursor: true });
  hit.on("pointerdown", () => handlers.onDraft(item.sourceId));
  container.add(hit);
  layer.add(container);
  index.register("fireside", item.objectId, container);
}

function drawDraft(ctx: Ctx): void {
  const { scene, layer, model } = ctx;
  const zone = FIRESIDE_ZONES.draft;
  panel(ctx, zone);
  const draft = model.draft;
  if (draft.kind === "offer") {
    layer.add(text(scene, zone.x + 6, zone.y + 3, "Camp cleared! Take one to bring along", PALETTE.textDim));
    rowBoxes(zone.x + 6, zone.w - 12, draft.items.length, TILE_GAP, TILE_MAX_W).forEach((box, i) => {
      drawDraftTile(ctx, draft.items[i]!, box.x, zone.y + 14, box.w, zone.h - 18);
    });
    return;
  }
  const cy = zone.y + zone.h / 2;
  if (draft.kind === "taken") {
    const art = sourceArtId(draft.sourceId);
    if (art !== null) layer.add(placeArt(scene, art, zone.x + 48, cy).setScale(2));
    layer.add(text(scene, zone.x + 80, cy - 10, `Taken: ${draft.name}`));
    layer.add(text(scene, zone.x + 80, cy + 2, "It is in your kit below", PALETTE.textDim));
    return;
  }
  if (draft.text !== "") layer.add(centredText(scene, zone.x + zone.w / 2, cy - 4, draft.text, PALETTE.textDim));
}

// ---------------------------------------------------------------------------
// Crew
// ---------------------------------------------------------------------------

const CREW_TITLE_H = 13;
const CREW_ROW_MAX = 30;

const STATUS: Readonly<Record<CrewRow["status"], { label: string; color: string }>> = {
  ready: { label: "ready ✓", color: PALETTE.done },
  drafting: { label: "drafting…", color: PALETTE.sun },
  choosing: { label: "choosing…", color: PALETTE.sun },
  resting: { label: "not ready", color: PALETTE.textDim },
};

/** Name and status, then the character and kit as icons. */
function drawCrewRow(ctx: Ctx, row: CrewRow, x: number, y: number, w: number): void {
  const { scene, layer } = ctx;
  const status = row.connected ? STATUS[row.status] : { label: "away", color: PALETTE.statusDisconnected };
  const statusX = x + w - labelWidth(status.label);
  const nameChars = Math.floor((statusX - x - 4) / LABEL_CELL.w);
  layer.add(text(scene, x, y, fitLabel(row.isYou ? `${row.displayLabel} (you)` : row.displayLabel, nameChars), row.isYou ? PALETTE.turn : PALETTE.text));
  layer.add(text(scene, statusX, y, status.label, status.color));

  const iconY = y + LABEL_CELL.h + 10;
  if (row.character === null) {
    layer.add(text(scene, x, iconY - 4, "no explorer yet", PALETTE.textDim));
    return;
  }
  let cursor = x;
  for (const source of row.sources) {
    const art = sourceArtId(source.sourceId);
    if (art === null) continue;
    if (cursor + ART[art].w > x + w - labelWidth(row.character) - 6) break;
    layer.add(placeArt(scene, art, cursor + ART[art].w / 2, iconY));
    cursor += ART[art].w + 1;
  }
  layer.add(text(scene, x + w - labelWidth(row.character), iconY - 4, row.character, PALETTE.textDim));
}

function drawCrewIn(ctx: Ctx, zone: Rect): void {
  const { scene, layer, model } = ctx;
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

/** At muster the crew is a row of name and pick, one column per seat. */
function drawMusterCrew(ctx: Ctx): void {
  const { scene, layer, model } = ctx;
  const zone = MUSTER_ZONES.crew;
  panel(ctx, zone);
  layer.add(text(scene, zone.x + 4, zone.y + 3, "Crew", PALETTE.textDim));
  rowBoxes(zone.x + 4, zone.w - 8, model.crew.length, 6, 150).forEach((box, i) => {
    const row = model.crew[i]!;
    const chars = Math.floor(box.w / LABEL_CELL.w);
    const y = zone.y + 14;
    const group = scene.add.container(0, 0);
    group.add(text(scene, box.x, y, fitLabel(row.isYou ? `${row.displayLabel} (you)` : row.displayLabel, chars), row.isYou ? PALETTE.turn : PALETTE.text));
    const status = row.connected ? STATUS[row.status] : { label: "away", color: PALETTE.statusDisconnected };
    group.add(text(scene, box.x, y + 11, fitLabel(row.character ?? "choosing…", chars), row.character === null ? PALETTE.sun : PALETTE.textDim));
    if (row.character !== null) group.add(text(scene, box.x, y + 22, status.label, status.color));
    if (!row.connected) group.setAlpha(0.6);
    layer.add(group);
  });
}

// ---------------------------------------------------------------------------
// Kit
// ---------------------------------------------------------------------------

const KIT_X = 112;
const KIT_GAP = 3;
const KIT_ROW_H = 20;

function drawKitTile(ctx: Ctx, item: KitItem, x: number, y: number, w: number): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, KIT_ROW_H, toPhaserColor(item.kind === "item" ? PALETTE.bark : PALETTE.stump)).setOrigin(0, 0);
  container.add(bg);
  const art = sourceArtId(item.sourceId);
  if (art !== null) container.add(placeArt(scene, art, 10, KIT_ROW_H / 2));
  const chars = Math.floor((w - 22) / LABEL_CELL.w);
  container.add(text(scene, 20, 1, fitLabel(item.name, chars)));
  container.add(text(scene, 20, KIT_ROW_H - LABEL_CELL.h - 1, fitLabel(item.charge, chars), PALETTE.textDim));
  container.setSize(w, KIT_ROW_H);
  bg.setInteractive();
  bg.on("pointerover", () => handlers.onSourceHover(item.sourceId));
  bg.on("pointerout", () => handlers.onSourceHover(null));
  layer.add(container);
  index.register("fireside", item.objectId, container);
}

function drawKit(ctx: Ctx): void {
  const { scene, layer, model } = ctx;
  const zone = FIRESIDE_ZONES.backpack;
  const kit = model.kit;
  panel(ctx, zone);
  if (kit === null) {
    layer.add(centredText(scene, zone.x + zone.w / 2, zone.y + zone.h / 2 - 4, "Watching the crew", PALETTE.textDim));
    return;
  }
  layer.add(text(scene, zone.x + 4, zone.y + 3, "Your kit"));
  const art = ART["backpack-open"];
  layer.add(placeArt(scene, "backpack-open", zone.x + 4 + art.w / 2, zone.y + zone.h - art.h / 2 - 2));
  const x0 = zone.x + KIT_X;
  const cols = 3;
  const w = Math.floor((zone.x + zone.w - 4 - x0 - KIT_GAP * (cols - 1)) / cols);
  kit.forEach((item, i) => {
    drawKitTile(ctx, item, x0 + (i % cols) * (w + KIT_GAP), zone.y + 14 + Math.floor(i / cols) * (KIT_ROW_H + KIT_GAP), w);
  });
}

// ---------------------------------------------------------------------------
// Ready
// ---------------------------------------------------------------------------

const READY_W = 136;
const READY_H = 30;

const READY_CAPTION: Readonly<Record<NonNullable<FiresideModel["ready"]>["state"], string>> = {
  blocked: "Pick first",
  open: "Set out when ready",
  done: "Waiting for the crew",
};

function drawReady(ctx: Ctx, zone: Rect): void {
  const { scene, layer, model, index, handlers } = ctx;
  const ready = model.ready;
  if (ready === null) return;
  const cx = zone.x + zone.w / 2;
  const cy = zone.y + 4 + READY_H / 2;
  if (ready.state === "open") {
    const b = button(scene, cx, cy, READY_W, READY_H, "Ready", { onClick: () => handlers.onReady(), outline: true, big: true });
    layer.add(b);
    index.register("fireside", ready.objectId, b);
  } else {
    const done = ready.state === "done";
    layer.add(button(scene, cx, cy, READY_W, READY_H, done ? "Ready ✓" : "Ready", { big: true, dim: !done, color: done ? PALETTE.moss : PALETTE.stump }));
  }
  layer.add(plate(scene, zone.x + 4, zone.y + READY_H + 6, zone.w - 8, 12).setAlpha(PANEL_ALPHA));
  layer.add(centredText(scene, cx, zone.y + READY_H + 8, READY_CAPTION[ready.state], ready.state === "open" ? PALETTE.text : PALETTE.textDim));
}

export function drawFireside(scene: Phaser.Scene, layer: Layer, model: FiresideModel, index: ObjectIndex, handlers: FiresideHandlers): void {
  const ctx: Ctx = { scene, layer, model, index, handlers };
  if (model.muster !== null) {
    drawMuster(ctx, model.muster);
    drawMusterCrew(ctx);
    drawReady(ctx, MUSTER_ZONES.ready);
    return;
  }
  drawTrail(ctx);
  drawDraft(ctx);
  drawCrewIn(ctx, FIRESIDE_ZONES.crew);
  drawKit(ctx);
  drawReady(ctx, FIRESIDE_ZONES.ready);
}
