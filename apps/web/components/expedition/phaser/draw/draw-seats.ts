/**
 * Opponent seat blocks (the `opponents` zone) and your own seat panel (the
 * `you` zone). Each block is a fixed stack of labelled rows that never draws
 * outside its rectangle. Every value comes from `SceneModel`.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { MINI_H, SEAT_BLOCK_PAD, ZONES, opponentBlocks, type Rect } from "../layout";
import { placeArt } from "../art/place-art";
import { ART } from "../art/art-registry";
import { gearObjectId, seatObjectId } from "../../../../lib/expedition/expedition-ids";
import type { ObjectIndex } from "../object-index";
import type { GearChip, ObjectiveChip, SceneModel, SeatModel } from "../../../../lib/expedition/build-scene-model";
import type { CampHandlers } from "./camp-handlers";
import { fitLabel } from "./text-fit";
import { DIM_ALPHA, labelWidth, objectiveItem, objectiveItemWidth, plate, text, type Layer } from "./ui-kit";

const NAME_MAX_CHARS = 14;
const ROW_H = 12;
const GEAR_H = 12;
const CHIP_GAP = 2;
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

function nameOf(model: SceneModel, seatId: string): string {
  return model.seats.find((s) => s.seatId === seatId)?.displayLabel ?? "?";
}

/** The name row: a plate registered as `seat:<id>`, clickable only while the
 * seat is a target. Badges sit right-aligned on the same row. */
function nameRow(ctx: Ctx, group: Layer, seat: SeatModel, row: Rect, badges: { value: string; color: string; id?: string }[]): void {
  const { scene, index, handlers } = ctx;
  const container = scene.add.container(row.x, row.y);
  const bg = plate(scene, 0, 0, row.w, row.h, PALETTE.stump);
  if (seat.mayAct || seat.targetable || seat.selected) bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  container.add(bg);

  let nameX = 2;
  if (seat.isExpeditionLeader) {
    const sun = ART["leader-sun"];
    container.add(placeArt(scene, "leader-sun", 1 + sun.w / 2, row.h / 2));
    nameX += sun.w + 2;
  }

  const shown = [...badges];
  const layoutBadges = (): { right: number; placed: { value: string; color: string; id?: string; x: number }[] } => {
    let right = row.w - 2;
    const placed = shown.map((b) => {
      const x = right - labelWidth(b.value);
      right = x - 4;
      return { ...b, x };
    });
    return { right, placed };
  };
  let laid = layoutBadges();
  while (shown.length > 0 && laid.right - nameX < 4 * LABEL_CELL.w) {
    shown.pop();
    laid = layoutBadges();
  }

  const nameChars = Math.min(NAME_MAX_CHARS, Math.floor((laid.right - nameX) / LABEL_CELL.w));
  const textY = Math.floor((row.h - LABEL_CELL.h) / 2);
  container.add(text(scene, nameX, textY, fitLabel(seat.displayLabel, nameChars)));
  for (const b of laid.placed) {
    const t = text(scene, b.x, textY, b.value, b.color);
    container.add(t);
    if (b.id !== undefined) index.register("camp", b.id, t);
  }

  if (seat.targetable) {
    const hit = scene.add.zone(0, 0, row.w, row.h).setOrigin(0, 0);
    container.add(hit);
    hit.setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => handlers.onSeat(seat.seatId));
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
      dim: targeting,
    });
    group.add(item);
    ctx.index.register("camp", chip.objectId, item);
    cursor += Math.floor(widths[i]! + OBJECTIVE_GAP - squeeze);
  });
}

/** Chips in a grid of `cols` columns filling `area`, one row per GEAR_H + 2. */
function gearGrid(ctx: Ctx, group: Layer, chips: GearChip[], area: Rect, cols: number, interactive: boolean): void {
  if (chips.length === 0) return;
  const w = Math.floor((area.w - CHIP_GAP * (cols - 1)) / cols);
  chips.forEach((chip, i) => {
    const cx = area.x + (i % cols) * (w + CHIP_GAP) + w / 2;
    const cy = area.y + Math.floor(i / cols) * (GEAR_H + CHIP_GAP) + GEAR_H / 2;
    const container = ctx.scene.add.container(Math.round(cx), Math.round(cy));
    const bg = ctx.scene.add.rectangle(0, 0, w, GEAR_H, toPhaserColor(PALETTE.bark));
    if (interactive && chip.usable) bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
    const label = fitLabel(chip.name, Math.floor((w - 2) / LABEL_CELL.w));
    const t = text(ctx.scene, -Math.floor(labelWidth(label) / 2), -LABEL_CELL.h / 2, label);
    container.add([bg, t]);
    container.setSize(w, GEAR_H);
    container.setAlpha(chip.spent ? DIM_ALPHA : 1);
    if (interactive) {
      container.setInteractive({ useHandCursor: true });
      container.on("pointerdown", () => ctx.handlers.onGear(chip.gearId));
      container.on("pointerover", () => ctx.handlers.onGearHover(chip.gearId));
      container.on("pointerout", () => ctx.handlers.onGearHover(null));
      if (chip.pulse) {
        ctx.scene.tweens.add({ targets: container, alpha: { from: 1, to: 0.6 }, duration: PULSE_DURATION_MS, yoyo: true, repeat: -1 });
      }
      // Only your own chip is registered: gear ids are per gear, not per
      // seat, so a teammate holding the same gear would otherwise shadow it.
      ctx.index.register("camp", gearObjectId(chip.gearId), container);
    }
    group.add(container);
  });
}

function cardBackIcon(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Rectangle {
  return scene.add
    .rectangle(x, y, 6, 8, toPhaserColor(PALETTE.cardBack))
    .setOrigin(0, 0)
    .setStrokeStyle(1, toPhaserColor(PALETTE.textDim));
}

function drawOpponent(ctx: Ctx, layer: Layer, seat: SeatModel, block: Rect): void {
  const { scene, model } = ctx;
  const group = scene.add.container(0, 0);
  layer.add(group);
  const x0 = block.x + SEAT_BLOCK_PAD;
  const iw = block.w - SEAT_BLOCK_PAD * 2;
  const pack = ART["seat-pack"];
  const leftW = iw - pack.w - 4;

  group.add(plate(scene, block.x, block.y, block.w, block.h).setAlpha(0.7));

  const badges: { value: string; color: string; id?: string }[] = [];
  if (!seat.connected) badges.push({ value: "away", color: PALETTE.statusDisconnected });
  if (seat.whisperedTo.length > 0) badges.push({ value: `>${fitLabel(nameOf(model, seat.whisperedTo[0]!), 4)}`, color: PALETTE.turn });
  for (const reveal of seat.reveals) {
    badges.push({ value: reveal.label, color: reveal.sourceTag === "whisper" ? PALETTE.turn : PALETTE.sun, id: reveal.objectId });
  }
  nameRow(ctx, group, seat, { x: x0, y: block.y + SEAT_BLOCK_PAD, w: iw, h: ROW_H }, badges);

  const countsY = block.y + 18;
  group.add(cardBackIcon(scene, x0, countsY + 1));
  const cards = plural(seat.handSize, "card", "cards");
  group.add(text(scene, x0 + 9, countsY + 1, cards));
  const tricksX = x0 + 9 + labelWidth(cards) + 8;
  const trickIcon = ART["icon-tricks"];
  group.add(placeArt(scene, "icon-tricks", tricksX + trickIcon.w / 2, countsY + 5));
  group.add(text(scene, tricksX + trickIcon.w + 3, countsY + 1, plural(seat.tricksWon, "trick", "tricks")));

  objectivesRow(ctx, group, seat.objectives, x0, block.y + 30, leftW);
  gearGrid(ctx, group, seat.gear, { x: x0, y: block.y + 54, w: leftW, h: GEAR_H }, Math.max(1, seat.gear.length), false);
  group.add(placeArt(scene, "seat-pack", x0 + iw - pack.w / 2, block.y + 30 + pack.h / 2));

  if (!seat.connected) group.setAlpha(DISCONNECTED_ALPHA);
  else if (model.targeting !== null && !seat.targetable) group.setAlpha(DIM_ALPHA);
}

function drawYou(ctx: Ctx, layer: Layer, seat: SeatModel): void {
  const { scene } = ctx;
  const group = scene.add.container(0, 0);
  layer.add(group);
  const z = ZONES.you;
  group.add(plate(scene, z.x, z.y, z.w, z.h).setAlpha(0.7));
  const x0 = z.x + 2;
  const iw = z.w - 4;

  nameRow(ctx, group, seat, { x: x0, y: z.y + 2, w: iw, h: ROW_H }, []);

  const tricksY = z.y + 16;
  const trickIcon = ART["icon-tricks"];
  group.add(placeArt(scene, "icon-tricks", x0 + 2 + trickIcon.w / 2, tricksY + 4));
  group.add(text(scene, x0 + trickIcon.w + 5, tricksY, `${plural(seat.tricksWon, "trick", "tricks")} won`));

  const goalsY = z.y + 27;
  group.add(text(scene, x0 + 2, goalsY + Math.floor((MINI_H - LABEL_CELL.h) / 2), "Goals", PALETTE.textDim));
  const goalsX = x0 + 2 + labelWidth("Goals") + 4;
  if (seat.objectives.length === 0) {
    group.add(text(scene, goalsX, goalsY + Math.floor((MINI_H - LABEL_CELL.h) / 2), "none", PALETTE.textDim));
  } else {
    objectivesRow(ctx, group, seat.objectives, goalsX, goalsY, z.x + z.w - 2 - goalsX);
  }

  const gearY = z.y + 50;
  group.add(text(scene, x0 + 2, gearY + 2, "Gear", PALETTE.textDim));
  const gearX = x0 + 2 + labelWidth("Goals") + 4;
  const area = { x: gearX, y: gearY, w: z.x + z.w - 2 - gearX, h: GEAR_H * 2 + CHIP_GAP };
  if (seat.gear.length === 0) {
    group.add(text(scene, gearX, gearY + 2, "none", PALETTE.textDim));
  } else {
    gearGrid(ctx, group, seat.gear, area, Math.max(1, Math.ceil(seat.gear.length / 2)), true);
  }
}

export function drawSeats(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const ctx: Ctx = { scene, model, index, handlers };
  const opponents = model.seats.filter((s) => !s.isYou);
  const blocks = opponentBlocks(opponents.length);
  opponents.forEach((seat, i) => drawOpponent(ctx, layer, seat, blocks[i]!));
  const you = model.seats.find((s) => s.isYou);
  if (you !== undefined) drawYou(ctx, layer, you);
}
