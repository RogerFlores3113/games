/**
 * The crew around the stump: each teammate as their character's seated
 * silhouette behind it, with a name plate above their head (the `crowd`
 * zone). Your own seat panel (`you`) and your kit (`kit`) sit at the left.
 * Every value comes from `SceneModel`.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { MINI_H, PLATE_H, SILHOUETTE_H, STUMP_ART_AT, ZONES, plateRect, seatSpots, type Rect } from "../layout";
import { placeArt } from "../art/place-art";
import { ART, crewArtId, sourceArtId } from "../art/art-registry";
import { mateSourceObjectId, seatObjectId, sourceObjectId } from "../../../../lib/expedition/expedition-ids";
import type { ObjectIndex } from "../object-index";
import type { ObjectiveChip, SceneModel, SeatModel, SourceChip } from "../../../../lib/expedition/build-scene-model";
import type { CampHandlers } from "./camp-handlers";
import { fitLabel } from "./text-fit";
import { DIM_ALPHA, PANEL_ALPHA, labelWidth, objectiveItem, objectiveItemWidth, plate, text, type Layer } from "./ui-kit";

const ROW_H = 12;
const ICON = 16;
const OBJECTIVE_GAP = 2;
const DISCONNECTED_ALPHA = 0.5;
const PULSE_DURATION_MS = 500;

interface Ctx {
  scene: Phaser.Scene;
  model: SceneModel;
  index: ObjectIndex;
  handlers: CampHandlers;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Teammates in turn order: everyone but you, or every seat for a
 * spectator. */
export function others(model: SceneModel): SeatModel[] {
  return model.seats.filter((s) => !s.isYou);
}

function outline(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: string = PALETTE.turn): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(Math.round(x), Math.round(y), w, h, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(color));
}

/** The name row: a plate registered as `seat:<id>`, clickable only while the
 * seat is a target. */
function nameRow(ctx: Ctx, group: Layer, seat: SeatModel, row: Rect, badge: { value: string; color: string } | null): void {
  const { scene, index, handlers } = ctx;
  const container = scene.add.container(row.x, row.y);
  const bg = plate(scene, 0, 0, row.w, row.h, PALETTE.stump);
  if (seat.mayAct || seat.targetable || seat.selected) bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  container.add(bg);

  let nameX = 2;
  if (seat.isExpeditionLeader) {
    container.add(placeArt(scene, "leader-sun", 1 + ICON / 2, row.h / 2));
    nameX += ICON + 1;
  }
  const badgeW = badge === null ? 0 : labelWidth(badge.value) + 4;
  const textY = Math.floor((row.h - LABEL_CELL.h) / 2);
  const nameChars = Math.floor((row.w - nameX - badgeW - 2) / LABEL_CELL.w);
  container.add(text(scene, nameX, textY, fitLabel(seat.displayLabel, nameChars)));
  if (badge !== null) container.add(text(scene, row.w - 2 - labelWidth(badge.value), textY, badge.value, badge.color));

  if (seat.targetable) {
    const hit = scene.add.zone(0, 0, row.w, row.h).setOrigin(0, 0);
    container.add(hit);
    hit.setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => handlers.onPick("seat", seat.seatId));
  }
  group.add(container);
  index.register("camp", seatObjectId(seat.seatId), container);
}

function objectivesRow(ctx: Ctx, group: Layer, chips: ObjectiveChip[], x: number, y: number, maxW: number): void {
  const targeting = ctx.model.targeting !== null;
  const widths = chips.map(objectiveItemWidth);
  const natural = widths.reduce((sum, w) => sum + w, 0) + OBJECTIVE_GAP * Math.max(0, chips.length - 1);
  const squeeze = chips.length > 1 && natural > maxW ? (natural - maxW) / (chips.length - 1) : 0;
  let cursor = x;
  chips.forEach((chip, i) => {
    const item = objectiveItem(ctx.scene, cursor, y, chip, ctx.model.cardPackId, {
      onClick: () => ctx.handlers.onObjective(chip.objectiveId),
      onHover: (over) => ctx.handlers.onObjectiveHover(over ? chip.objectiveId : null),
      dim: targeting,
    });
    group.add(item);
    ctx.index.register("camp", chip.objectId, item);
    cursor += Math.floor(widths[i]! + OBJECTIVE_GAP - squeeze);
  });
}

/** A teammate's kit as icons, right-aligned ending at `right`. Hover shows
 * the source's rules; teammates' sources never start targeting. */
function kitIcons(ctx: Ctx, group: Layer, seat: SeatModel, right: number, cy: number, maxW: number): number {
  const fit = Math.max(0, Math.floor((maxW + 1) / (ICON + 1)));
  const shown = seat.sources.slice(0, fit);
  shown.forEach((chip, i) => {
    const x = right - (shown.length - i) * (ICON + 1) + 1;
    const art = sourceArtId(chip.sourceId);
    const container = ctx.scene.add.container(x + ICON / 2, cy);
    if (art !== null) container.add(placeArt(ctx.scene, art, 0, 0));
    container.setSize(ICON, ICON);
    container.setAlpha(chip.spent ? DIM_ALPHA : 1);
    const mate = { seatId: seat.seatId, sourceId: chip.sourceId };
    container.setInteractive();
    container.on("pointerover", () => ctx.handlers.onMateSourceHover(mate));
    container.on("pointerout", () => ctx.handlers.onMateSourceHover(null));
    ctx.index.register("camp", mateSourceObjectId(seat.seatId, chip.sourceId), container);
    group.add(container);
  });
  return shown.length * (ICON + 1);
}

/** "12 cards": the seat's hand, a target for hand picks. */
function handCount(ctx: Ctx, group: Layer, seat: SeatModel, x: number, y: number): void {
  const { scene, index, handlers } = ctx;
  const label = plural(seat.handSize, "card", "cards");
  const w = labelWidth(label) + 4;
  const container = scene.add.container(x, y);
  if (seat.handPick.targetable || seat.handPick.selected) container.add(outline(scene, 0, 0, w, LABEL_CELL.h + 2));
  container.add(text(scene, 2, 1, label, seat.handPick.targetable ? PALETTE.turn : PALETTE.text));
  container.setSize(w, LABEL_CELL.h + 2);
  if (seat.handPick.targetable) {
    const hit = scene.add.zone(0, 0, w, LABEL_CELL.h + 2).setOrigin(0, 0);
    hit.setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => handlers.onPick("hand", seat.seatId));
    container.add(hit);
  }
  group.add(container);
  index.register("camp", seat.handObjectId, container);
}

/** A teammate behind the stump: the silhouette, drawn before the stump so
 * its rim hides their legs. Clickable while the seat is a target. */
function drawSilhouette(ctx: Ctx, layer: Layer, seat: SeatModel, spot: { x: number; bottom: number }): void {
  const { scene, model, handlers } = ctx;
  const art = seat.characterId === null ? null : crewArtId(seat.characterId);
  if (art === null) return;
  const cy = spot.bottom - SILHOUETTE_H / 2;
  if (seat.targetable || seat.selected) {
    // A 1px outline in the target colour: the silhouette four times, offset.
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      layer.add(placeArt(scene, art, spot.x + dx, cy + dy).setTintFill(toPhaserColor(PALETTE.turn)));
    }
  }
  const sprite = placeArt(scene, art, spot.x, cy);
  if (!seat.connected) sprite.setAlpha(DISCONNECTED_ALPHA);
  else if (model.targeting !== null && !inPlay(seat)) sprite.setAlpha(0.7);
  if (seat.targetable) {
    sprite.setInteractive({ useHandCursor: true, pixelPerfect: true });
    sprite.on("pointerdown", () => handlers.onPick("seat", seat.seatId));
  }
  layer.add(sprite);
}

function drawPlate(ctx: Ctx, layer: Layer, seat: SeatModel, box: Rect): void {
  const { scene, model } = ctx;
  const group = scene.add.container(0, 0);
  layer.add(group);
  group.add(plate(scene, box.x, box.y, box.w, box.h).setAlpha(PANEL_ALPHA));
  const x0 = box.x + 2;
  const iw = box.w - 4;

  const badge = !seat.connected ? { value: "away", color: PALETTE.statusDisconnected } : seat.mayAct ? { value: "turn", color: PALETTE.turn } : null;
  nameRow(ctx, group, seat, { x: x0, y: box.y + 2, w: iw, h: ROW_H }, badge);

  const countsY = box.y + 15;
  handCount(ctx, group, seat, x0, countsY);
  const tricks = plural(seat.tricksWon, "trick", "tricks");
  group.add(text(scene, x0 + iw - labelWidth(tricks) - 1, countsY + 1, tricks, PALETTE.textDim));

  const rowY = box.y + PLATE_H - MINI_H - 3;
  const iconsW = kitIcons(ctx, group, seat, x0 + iw, rowY + MINI_H / 2, Math.floor(iw / 2));
  if (seat.objectives.length > 0) objectivesRow(ctx, group, seat.objectives, x0, rowY, iw - iconsW - 4);

  if (!seat.connected) group.setAlpha(DISCONNECTED_ALPHA);
  else if (model.targeting !== null && !inPlay(seat)) group.setAlpha(DIM_ALPHA);
}

/** Whether anything on this seat is offered or picked by the targeting. */
function inPlay(seat: SeatModel): boolean {
  return seat.targetable || seat.selected || seat.handPick.targetable || seat.handPick.selected || seat.objectives.some((o) => o.targetable || o.selected);
}

/** The silhouettes, then the stump over their legs. */
export function drawCrowdAndStump(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const ctx: Ctx = { scene, model, index, handlers };
  const mates = others(model);
  const spots = seatSpots(mates.length);
  mates.forEach((seat, i) => drawSilhouette(ctx, layer, seat, spots[i]!));
  const stump = ART["stump-table"];
  layer.add(placeArt(scene, "stump-table", STUMP_ART_AT.x + stump.w / 2, STUMP_ART_AT.y + stump.h / 2));
}

/** Plates for every teammate, drawn over the world. */
export function drawPlates(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const ctx: Ctx = { scene, model, index, handlers };
  const mates = others(model);
  const spots = seatSpots(mates.length);
  mates.forEach((seat, i) => drawPlate(ctx, layer, seat, plateRect(spots, i)));
}

function drawYou(ctx: Ctx, layer: Layer, seat: SeatModel): void {
  const { scene } = ctx;
  const group = scene.add.container(0, 0);
  layer.add(group);
  const z = ZONES.you;
  group.add(plate(scene, z.x, z.y, z.w, z.h).setAlpha(PANEL_ALPHA));
  const x0 = z.x + 2;
  const iw = z.w - 4;

  nameRow(ctx, group, seat, { x: x0, y: z.y + 2, w: iw, h: ROW_H }, null);

  const tricksY = z.y + 17;
  const trickIcon = ART["icon-tricks"];
  group.add(placeArt(scene, "icon-tricks", x0 + 2 + trickIcon.w / 2, tricksY + 4));
  group.add(text(scene, x0 + trickIcon.w + 5, tricksY, `${plural(seat.tricksWon, "trick", "tricks")} won`));

  const goalsY = z.y + 30;
  group.add(text(scene, x0 + 2, goalsY, "Your objectives", PALETTE.textDim));
  const rowY = goalsY + LABEL_CELL.h + 3;
  if (seat.objectives.length === 0) {
    group.add(text(scene, x0 + 2, rowY + Math.floor((MINI_H - LABEL_CELL.h) / 2), "none yet", PALETTE.textDim));
  } else {
    objectivesRow(ctx, group, seat.objectives, x0 + 2, rowY, iw - 4);
  }
}

const KIT_ROW_H = 18;
const KIT_ROW_GAP = 1;

function kitRow(ctx: Ctx, layer: Layer, chip: SourceChip, x: number, y: number, w: number): void {
  const { scene, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const bg = plate(scene, 0, 0, w, KIT_ROW_H, chip.kind === "item" ? PALETTE.bark : PALETTE.stump);
  if (chip.usable) bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  container.add(bg);
  const art = sourceArtId(chip.sourceId);
  if (art !== null) container.add(placeArt(scene, art, 1 + ICON / 2, KIT_ROW_H / 2));
  const textX = ICON + 3;
  const chars = Math.floor((w - textX - 1) / LABEL_CELL.w);
  container.add(text(scene, textX, 1, fitLabel(chip.name, chars)));
  const chargeColor = chip.usable ? PALETTE.turn : chip.spent ? PALETTE.destructive : PALETTE.textDim;
  container.add(text(scene, textX, KIT_ROW_H - LABEL_CELL.h - 1, fitLabel(chip.charge, chars), chargeColor));
  container.setSize(w, KIT_ROW_H);
  container.setAlpha(chip.spent ? DIM_ALPHA + 0.2 : 1);
  const hit = scene.add.zone(0, 0, w, KIT_ROW_H).setOrigin(0, 0);
  hit.setInteractive({ useHandCursor: chip.usable });
  hit.on("pointerdown", () => handlers.onSource(chip.sourceId));
  hit.on("pointerover", () => handlers.onSourceHover(chip.sourceId));
  hit.on("pointerout", () => handlers.onSourceHover(null));
  container.add(hit);
  if (chip.pulse) scene.tweens.add({ targets: bg, alpha: { from: 1, to: 0.55 }, duration: PULSE_DURATION_MS, yoyo: true, repeat: -1 });
  layer.add(container);
  index.register("camp", sourceObjectId(chip.sourceId), container);
}

/** Your character and kit, one row each: icon, name and what is left. */
function drawKit(ctx: Ctx, layer: Layer, seat: SeatModel): void {
  const { scene } = ctx;
  const z = ZONES.kit;
  const rows = seat.sources;
  const h = 11 + rows.length * (KIT_ROW_H + KIT_ROW_GAP);
  layer.add(plate(scene, z.x, z.y, z.w, Math.min(z.h, h)).setAlpha(PANEL_ALPHA));
  layer.add(text(scene, z.x + 3, z.y + 2, "Your kit", PALETTE.textDim));
  rows.forEach((chip, i) => kitRow(ctx, layer, chip, z.x + 1, z.y + 11 + i * (KIT_ROW_H + KIT_ROW_GAP), z.w - 2));
}

export function drawYouAndKit(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const you = model.seats.find((s) => s.isYou);
  if (you === undefined) return;
  const ctx: Ctx = { scene, model, index, handlers };
  drawYou(ctx, layer, you);
  drawKit(ctx, layer, you);
}
