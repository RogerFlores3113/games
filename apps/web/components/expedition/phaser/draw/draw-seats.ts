/**
 * The crew around the table: each teammate as their character's seated
 * silhouette behind it, with a name plate above their head (the `crowd`
 * zone), and the board your hand rests on in front of it. Your own seat
 * panel (`you`) and your kit (`kit`) sit at the left.
 * Every value comes from `SceneModel`.
 */
import type Phaser from "phaser";
import { CURSOR, pointerIf } from "../cursors";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { CARD_H, HAND_CARD_Y, MINI_H, PLATE_H, SILHOUETTE_H, ZONES, boardArtAt, plateRect, seatSpots, tableArtAt, tableSpan, type Rect } from "../layout";
import { placeArt } from "../art/place-art";
import { ART, crewArtId, sourceArtId, tableOf, type TableId } from "../art/art-registry";
import { mateSourceObjectId, seatFogObjectId, seatMarkObjectId, seatObjectId, sourceObjectId } from "../../../../lib/expedition/expedition-ids";
import { fogTile } from "./draw-weather";
import type { ObjectIndex } from "../object-index";
import type { ObjectiveChip, SceneModel, SeatModel, SourceChip } from "../../../../lib/expedition/build-scene-model";
import type { SeatBossMark } from "../../../../lib/expedition/boss-model";
import type { CampHandlers } from "./camp-handlers";
import { fitLabel, fitUses } from "./text-fit";
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
    hit.setInteractive({ cursor: CURSOR.pointer });
    hit.on("pointerdown", () => handlers.onPick("seat", seat.seatId));
  }
  group.add(container);
  index.register("camp", seatObjectId(seat.seatId), container);
}

function objectivesRow(ctx: Ctx, group: Layer, chips: ObjectiveChip[], x: number, y: number, maxW: number): void {
  const targeting = ctx.model.targeting !== null;
  const rowWidth = (ws: number[]) => ws.reduce((sum, w) => sum + w, 0) + OBJECTIVE_GAP * Math.max(0, chips.length - 1);
  // A crowded row shortens "No tricks" to "=0" before squeezing items together; the tooltip says the rest.
  const tight = rowWidth(chips.map((c) => objectiveItemWidth(c))) > maxW;
  const widths = chips.map((c) => objectiveItemWidth(c, tight));
  const natural = rowWidth(widths);
  const squeeze = chips.length > 1 && natural > maxW ? (natural - maxW) / (chips.length - 1) : 0;
  let cursor = x;
  chips.forEach((chip, i) => {
    const item = objectiveItem(ctx.scene, cursor, y, chip, ctx.model.cardPackId, {
      onClick: () => ctx.handlers.onObjective(chip.objectiveId),
      onHover: (over) => ctx.handlers.onObjectiveHover(over ? chip.objectiveId : null),
      dim: targeting,
      tight,
    });
    group.add(item);
    ctx.index.register("camp", chip.objectId, item);
    cursor += Math.floor(widths[i]! + OBJECTIVE_GAP - squeeze);
  });
}

/** A teammate's kit as icons, right-aligned ending at `right`. Hover shows
 * the source's rules; teammates' sources never start targeting. A camp's
 * grant (the temple's skip) is the crew's, shown once in your own kit. */
function kitIcons(ctx: Ctx, group: Layer, seat: SeatModel, right: number, cy: number, maxW: number): number {
  const fit = Math.max(0, Math.floor((maxW + 1) / (ICON + 1)));
  const shown = seat.sources.filter((chip) => chip.kind !== "grant").slice(0, fit);
  shown.forEach((chip, i) => {
    const x = right - (shown.length - i) * (ICON + 1) + 1;
    const art = sourceArtId(chip.sourceId);
    const container = ctx.scene.add.container(x + ICON / 2, cy);
    if (art !== null) container.add(placeArt(ctx.scene, art, 0, 0));
    container.setSize(ICON, ICON);
    container.setAlpha(chip.spent ? DIM_ALPHA : 1);
    const mate = { seatId: seat.seatId, sourceKey: chip.sourceKey };
    container.setInteractive();
    container.on("pointerover", () => ctx.handlers.onMateSourceHover(mate));
    container.on("pointerout", () => ctx.handlers.onMateSourceHover(null));
    ctx.index.register("camp", mateSourceObjectId(seat.seatId, chip.sourceKey), container);
    group.add(container);
  });
  return shown.length * (ICON + 1);
}

/** Heavy fog over the items a teammate has not used: a fog tile left of
 * their kit icons, whose hover explains it. Returns the width it takes. */
function fogOverItems(ctx: Ctx, group: Layer, seat: SeatModel, x: number, y: number): number {
  const tile = fogTile(ctx.scene, x, y);
  tile.setInteractive();
  tile.on("pointerover", () => ctx.handlers.onModHover("fog"));
  tile.on("pointerout", () => ctx.handlers.onModHover(null));
  group.add(tile);
  ctx.index.register("camp", seatFogObjectId(seat.seatId), tile);
  return ICON + 1;
}

/** A plate's hand and trick counts, from the longest wording to the
 * shortest that keeps a cell between them in `w`: "10 cards", "0 tricks",
 * then "0 won", then "10" with "0 won" on a spectator's narrowest plate. */
function countsFor(seat: Pick<SeatModel, "handSize" | "tricksWon">, w: number): { cards: string; tricks: string } {
  const cards = plural(seat.handSize, "card", "cards");
  const forms = [
    { cards, tricks: plural(seat.tricksWon, "trick", "tricks") },
    { cards, tricks: `${seat.tricksWon} won` },
    { cards: String(seat.handSize), tricks: `${seat.tricksWon} won` },
  ];
  return forms.find((f) => labelWidth(f.cards) + 4 + LABEL_CELL.w + labelWidth(f.tricks) <= w) ?? forms.at(-1)!;
}

/** "12 cards": the seat's hand, a target for hand picks. */
function handCount(ctx: Ctx, group: Layer, seat: SeatModel, x: number, y: number, label: string): void {
  const { scene, index, handlers } = ctx;
  const w = labelWidth(label) + 4;
  const container = scene.add.container(x, y);
  if (seat.handPick.targetable || seat.handPick.selected) container.add(outline(scene, 0, 0, w, LABEL_CELL.h + 2));
  container.add(text(scene, 2, 1, label, seat.handPick.targetable ? PALETTE.turn : PALETTE.text));
  container.setSize(w, LABEL_CELL.h + 2);
  if (seat.handPick.targetable) {
    const hit = scene.add.zone(0, 0, w, LABEL_CELL.h + 2).setOrigin(0, 0);
    hit.setInteractive({ cursor: CURSOR.pointer });
    hit.on("pointerdown", () => handlers.onPick("hand", seat.seatId));
    container.add(hit);
  }
  group.add(container);
  index.register("camp", seat.handObjectId, container);
}

/** A teammate behind the table: the silhouette, drawn before the table so
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
    sprite.setInteractive({ cursor: CURSOR.pointer, pixelPerfect: true });
    sprite.on("pointerdown", () => handlers.onPick("seat", seat.seatId));
  }
  layer.add(sprite);
}

const MARK_H = LABEL_CELL.h + 2;

function markColor(mark: SeatBossMark): string {
  return mark.alert ? PALETTE.destructive : PALETTE.sun;
}

/** A boss's mark on a teammate, hung under their plate over the
 * silhouette's head. */
function drawMark(ctx: Ctx, layer: Layer, seat: SeatModel, box: Rect): void {
  const mark = seat.bossMark;
  if (mark === null) return;
  const w = labelWidth(mark.label) + 4;
  const x = Math.round(box.x + (box.w - w) / 2);
  const y = box.y + box.h + 1;
  const tag = plate(ctx.scene, x, y, w, MARK_H, PALETTE.plate).setStrokeStyle(1, toPhaserColor(markColor(mark)));
  layer.add(tag);
  layer.add(text(ctx.scene, x + 2, y + 1, mark.label, markColor(mark)));
  ctx.index.register("camp", seatMarkObjectId(seat.seatId), tag);
}

function drawPlate(ctx: Ctx, layer: Layer, seat: SeatModel, box: Rect): void {
  const { scene, model } = ctx;
  const group = scene.add.container(0, 0);
  layer.add(group);
  const back = plate(scene, box.x, box.y, box.w, box.h).setAlpha(PANEL_ALPHA);
  if (seat.bossMark?.alert) back.setStrokeStyle(1, toPhaserColor(PALETTE.destructive));
  group.add(back);
  const x0 = box.x + 2;
  const iw = box.w - 4;

  const badge = !seat.connected ? { value: "offline", color: PALETTE.statusDisconnected } : seat.mayAct ? { value: "turn", color: PALETTE.turn } : null;
  nameRow(ctx, group, seat, { x: x0, y: box.y + 2, w: iw, h: ROW_H }, badge);

  const countsY = box.y + 15;
  const counts = countsFor(seat, iw - 1);
  handCount(ctx, group, seat, x0, countsY, counts.cards);
  group.add(text(scene, x0 + iw - labelWidth(counts.tricks) - 1, countsY + 1, counts.tricks, PALETTE.textDim));

  const rowY = box.y + PLATE_H - MINI_H - 3;
  let iconsW = kitIcons(ctx, group, seat, x0 + iw, rowY + MINI_H / 2, Math.floor(iw / 2));
  if (seat.itemsHidden) iconsW += fogOverItems(ctx, group, seat, x0 + iw - iconsW - ICON, rowY + Math.floor((MINI_H - ICON) / 2));
  if (seat.objectives.length > 0) objectivesRow(ctx, group, seat.objectives, x0, rowY, iw - iconsW - 4);

  if (!seat.connected) group.setAlpha(DISCONNECTED_ALPHA);
  else if (model.targeting !== null && !inPlay(seat)) group.setAlpha(DIM_ALPHA);
}

/** Whether anything on this seat is offered or picked by the targeting. */
function inPlay(seat: SeatModel): boolean {
  return seat.targetable || seat.selected || seat.handPick.targetable || seat.handPick.selected || seat.objectives.some((o) => o.targetable || o.selected);
}

const BOARD_SHADOW_H = 4;
const BOARD_SHADOW_ALPHA = 0.55;
const BOARD_LIP_ALPHA = 0.45;
/** The board art's transparent margin either side. */
const BOARD_INSET = 10;

/** The board your hand stands on, in front of the table's foot: the shadow
 * it casts on the table along its rim, and a lit lip where your cards stand,
 * so the two never read as one surface. */
function drawBoard(scene: Phaser.Scene, layer: Layer, id: TableId): void {
  const at = boardArtAt(id);
  const board = ART[`board-${id}`];
  const rim = tableSpan(id).boardTop;
  const w = board.w - 2 * BOARD_INSET;
  layer.add(plate(scene, at.x + BOARD_INSET, rim - BOARD_SHADOW_H, w, BOARD_SHADOW_H, PALETTE.letterbox).setAlpha(BOARD_SHADOW_ALPHA));
  layer.add(placeArt(scene, `board-${id}`, at.x + board.w / 2, at.y + board.h / 2));
  layer.add(plate(scene, at.x + BOARD_INSET, HAND_CARD_Y + CARD_H, w, 1, PALETTE.cardFace).setAlpha(BOARD_LIP_ALPHA));
}

/** The silhouettes, then the location's table over their legs, then your
 * board over the table's foot. */
export function drawCrowdAndTable(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const ctx: Ctx = { scene, model, index, handlers };
  const mates = others(model);
  const spots = seatSpots(mates.length);
  mates.forEach((seat, i) => drawSilhouette(ctx, layer, seat, spots[i]!));
  const id = tableOf(model.sky.backdrop);
  const at = tableArtAt(id);
  const table = ART[`table-${id}`];
  layer.add(placeArt(scene, `table-${id}`, at.x + table.w / 2, at.y + table.h / 2));
  drawBoard(scene, layer, id);
}

/** Plates for every teammate, drawn over the world. */
export function drawPlates(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const ctx: Ctx = { scene, model, index, handlers };
  const mates = others(model);
  const spots = seatSpots(mates.length);
  mates.forEach((seat, i) => {
    drawPlate(ctx, layer, seat, plateRect(spots, i));
    drawMark(ctx, layer, seat, plateRect(spots, i));
  });
}

/** Where a seat sits on screen: a teammate's plate, or your own panel. */
export function seatRect(model: SceneModel, seatId: string): Rect | null {
  const you = model.seats.find((s) => s.isYou);
  if (you?.seatId === seatId) return ZONES.you;
  const mates = others(model);
  const i = mates.findIndex((s) => s.seatId === seatId);
  return i === -1 ? null : plateRect(seatSpots(mates.length), i);
}

function drawYou(ctx: Ctx, layer: Layer, seat: SeatModel): void {
  const { scene } = ctx;
  const group = scene.add.container(0, 0);
  layer.add(group);
  const z = ZONES.you;
  const back = plate(scene, z.x, z.y, z.w, z.h).setAlpha(PANEL_ALPHA);
  if (seat.bossMark?.alert) back.setStrokeStyle(1, toPhaserColor(PALETTE.destructive));
  group.add(back);
  const x0 = z.x + 2;
  const iw = z.w - 4;

  const mark = seat.bossMark === null ? null : { value: seat.bossMark.label, color: markColor(seat.bossMark) };
  nameRow(ctx, group, seat, { x: x0, y: z.y + 2, w: iw, h: ROW_H }, mark);

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
/** Items on bark; a camp's gift to the crew (the temple's skip) on moss. */
const KIT_ROW_FACE: Readonly<Record<SourceChip["kind"], string>> = { character: PALETTE.stump, power: PALETTE.stump, upgrade: PALETTE.stump, item: PALETTE.bark, grant: PALETTE.moss };
const KIT_ROW_GAP = 1;

function kitRow(ctx: Ctx, layer: Layer, chip: SourceChip, x: number, y: number, w: number): void {
  const { scene, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const bg = plate(scene, 0, 0, w, KIT_ROW_H, KIT_ROW_FACE[chip.kind]);
  if (chip.usable) bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  container.add(bg);
  const art = sourceArtId(chip.sourceId);
  if (art !== null) container.add(placeArt(scene, art, 1 + ICON / 2, KIT_ROW_H / 2));
  const textX = ICON + 3;
  const chars = Math.floor((w - textX - 1) / LABEL_CELL.w);
  container.add(text(scene, textX, 1, fitLabel(chip.name, chars)));
  const chargeColor = chip.usable ? PALETTE.turn : chip.spent ? PALETTE.destructive : PALETTE.textDim;
  container.add(text(scene, textX, KIT_ROW_H - LABEL_CELL.h - 1, fitUses(chip.charge, chars), chargeColor));
  container.setSize(w, KIT_ROW_H);
  container.setAlpha(chip.spent ? DIM_ALPHA + 0.2 : 1);
  const hit = scene.add.zone(0, 0, w, KIT_ROW_H).setOrigin(0, 0);
  hit.setInteractive(pointerIf(chip.usable));
  hit.on("pointerdown", () => handlers.onSource(chip.sourceKey));
  hit.on("pointerover", () => handlers.onSourceHover(chip.sourceKey));
  hit.on("pointerout", () => handlers.onSourceHover(null));
  container.add(hit);
  if (chip.pulse) scene.tweens.add({ targets: bg, alpha: { from: 1, to: 0.55 }, duration: PULSE_DURATION_MS, yoyo: true, repeat: -1 });
  layer.add(container);
  index.register("camp", chip.objectId, container);
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
