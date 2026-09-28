/**
 * Draws every seat around the stump (SCENE-02/03/04, D-03/D-04/D-08/D-13):
 * name, turn glow, leader flag, hand-size peek, tricks-won pile, the seat's
 * own objectives with status, its gear (only the viewer's own gear is
 * interactive), reveals, whisper tags, disconnect state, and seat targeting
 * for D-02's highlight-then-confirm flow. Every value drawn here comes from
 * `SceneModel` — never a server view field, never re-derived legality
 * (spec §7.1). Defines and exports `CampHandlers`, the shared handler
 * contract every camp draw module (seats/hand-trick/controls) is built
 * against.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { WORLD_LABEL_FONT } from "../font/font-keys";
import { truncateLabel } from "../font/glyphs-5x7";
import { seatAnchors } from "../layout";
import { cardBackTextureKey, cardTextureKey } from "../card-packs/card-pack-def";
import { gearObjectId, seatObjectId } from "../../../../lib/expedition/expedition-ids";
import type { ObjectIndex } from "../object-index";
import type { GearChip, MiniCard, ObjectiveChip, SceneModel, SeatModel } from "../../../../lib/expedition/build-scene-model";

export interface CampHandlers {
  onCard(cardId: string): void;
  onCardHover(cardId: string | null): void;
  onObjective(objectiveId: string): void;
  onSeat(seatId: string): void;
  onGear(gearId: string): void;
  onGearHover(gearId: string | null): void;
  onWhisper(): void;
  onConfirm(): void;
  onCancel(): void;
  onPreDealUse(gearId: string): void;
  onPreDealSkip(): void;
  onLastTrickHover(open: boolean): void;
}

const SEAT_W = 60;
const SEAT_H = 20;
const NAME_MAX_CHARS = 10;
const GEAR_MAX_CHARS = 8;
const GEAR_W = 30;
const GEAR_H = 12;
const GEAR_GAP = 4; // stage-sm
const OBJECTIVE_GAP = 4; // stage-sm
const OBJECTIVE_ROW_Y = SEAT_H / 2 + 8;
const GEAR_ROW_Y = SEAT_H / 2 + 20;
const HAND_PEEK_Y = -SEAT_H / 2 - 10;
const PILE_OFFSET_X = 34;
const REVEAL_Y = -SEAT_H / 2 - 22;
const DISCONNECTED_ALPHA = 0.5;
const TARGETING_DIM_ALPHA = 0.45;
const PULSE_DURATION_MS = 500;

function statusGlyph(status: ObjectiveChip["status"]): string {
  if (status === "done") return "+";
  if (status === "failed") return "x";
  return "-";
}

function statusColor(status: ObjectiveChip["status"]): number {
  if (status === "done") return toPhaserColor(PALETTE.done);
  if (status === "failed") return toPhaserColor(PALETTE.destructive);
  return toPhaserColor(PALETTE.text);
}

function nameFor(model: SceneModel, seatId: string): string {
  return model.seats.find((s) => s.seatId === seatId)?.displayLabel ?? "?";
}

function drawObjective(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  index: ObjectIndex,
  handlers: CampHandlers,
  chip: ObjectiveChip,
  x: number,
  y: number,
  targetingActive: boolean,
): void {
  const label = `${truncateLabel(chip.label, 6)}${chip.orderBadge !== null ? chip.orderBadge : ""}${statusGlyph(chip.status)}`;
  const container = scene.add.container(Math.round(x), Math.round(y));
  const text = scene.add.bitmapText(0, 0, WORLD_LABEL_FONT, label).setOrigin(0, 0.5);
  text.setTint(chip.targetable ? toPhaserColor(PALETTE.turn) : statusColor(chip.status));
  container.add(text);
  container.setSize(text.width, text.height);
  const dimmed = targetingActive && !chip.targetable;
  container.setAlpha(dimmed ? TARGETING_DIM_ALPHA : 1);
  if (chip.targetable) {
    container.setInteractive({ useHandCursor: true });
    container.on("pointerdown", () => handlers.onObjective(chip.objectiveId));
  }
  layer.add(container);
  index.register("camp", chip.objectId, container);
}

function drawGear(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  index: ObjectIndex,
  handlers: CampHandlers,
  chip: GearChip,
  x: number,
  y: number,
  interactive: boolean,
): void {
  const container = scene.add.container(Math.round(x), Math.round(y));
  const bg = scene.add.rectangle(0, 0, GEAR_W, GEAR_H, toPhaserColor(PALETTE.stump));
  const label = scene.add.bitmapText(0, 0, WORLD_LABEL_FONT, truncateLabel(chip.name, GEAR_MAX_CHARS)).setOrigin(0.5);
  container.add([bg, label]);
  container.setSize(GEAR_W, GEAR_H);
  container.setAlpha(chip.spent ? 0.4 : 1);

  if (interactive) {
    container.setInteractive({ useHandCursor: true });
    container.on("pointerdown", () => handlers.onGear(chip.gearId));
    container.on("pointerover", () => handlers.onGearHover(chip.gearId));
    container.on("pointerout", () => handlers.onGearHover(null));

    if (chip.pulse) {
      scene.tweens.add({
        targets: container,
        alpha: { from: 1, to: 0.6 },
        duration: PULSE_DURATION_MS,
        yoyo: true,
        repeat: -1,
      });
    }

    if (chip.showTooltip && chip.reason !== null) {
      const tooltip = scene.add.bitmapText(0, -GEAR_H - 2, WORLD_LABEL_FONT, chip.reason).setOrigin(0.5, 1);
      layer.add(tooltip);
      tooltip.setPosition(container.x, container.y - GEAR_H);
    }
  }

  layer.add(container);
  index.register("camp", gearObjectId(chip.gearId), container);
}

function drawReveal(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  index: ObjectIndex,
  reveal: MiniCard,
  x: number,
  y: number,
  cardPackId: SceneModel["cardPackId"],
): void {
  const container = scene.add.container(Math.round(x), Math.round(y));
  const key = cardTextureKey(cardPackId, reveal.label, "mini");
  const image = scene.add.image(0, 0, key);
  const tag = scene.add
    .bitmapText(0, image.displayHeight / 2, WORLD_LABEL_FONT, reveal.sourceTag === "whisper" ? "W" : reveal.sourceName.charAt(0))
    .setOrigin(0.5, 0);
  container.add([image, tag]);
  container.setSize(image.displayWidth, image.displayHeight + tag.height);
  layer.add(container);
  index.register("camp", reveal.objectId, container);
}

function drawSeat(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  index: ObjectIndex,
  handlers: CampHandlers,
  model: SceneModel,
  seat: SeatModel,
  anchor: { x: number; y: number },
  targetingActive: boolean,
): void {
  const container = scene.add.container(Math.round(anchor.x), Math.round(anchor.y));

  const bg = scene.add.rectangle(0, 0, SEAT_W, SEAT_H, toPhaserColor(PALETTE.stump));
  if (seat.mayAct || seat.targetable) {
    bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  }
  container.add(bg);

  const name = scene.add
    .bitmapText(0, 0, WORLD_LABEL_FONT, truncateLabel(seat.displayLabel, NAME_MAX_CHARS))
    .setOrigin(0.5);
  container.add(name);

  if (seat.isExpeditionLeader) {
    const flag = scene.add.bitmapText(-SEAT_W / 2 + 2, -SEAT_H / 2 + 1, WORLD_LABEL_FONT, "L").setOrigin(0, 0);
    flag.setTint(toPhaserColor(PALETTE.sun));
    container.add(flag);
  }

  if (!seat.isYou) {
    const peek = scene.add
      .bitmapText(0, HAND_PEEK_Y, WORLD_LABEL_FONT, `x${seat.handSize}`)
      .setOrigin(0.5);
    container.add(peek);
    if (seat.handSize > 0) {
      const back = scene.add.image(-8, HAND_PEEK_Y, cardBackTextureKey(model.cardPackId, "mini")).setOrigin(0.5);
      container.add(back);
    }
  }

  if (seat.tricksWon > 0) {
    const pileBack = scene.add
      .image(PILE_OFFSET_X, 0, cardBackTextureKey(model.cardPackId, "mini"))
      .setOrigin(0.5);
    const pileLabel = scene.add
      .bitmapText(PILE_OFFSET_X, pileBack.displayHeight / 2 + 2, WORLD_LABEL_FONT, `x${seat.tricksWon}`)
      .setOrigin(0.5, 0);
    container.add([pileBack, pileLabel]);
  }

  if (seat.whisperedTo.length > 0) {
    const targetName = truncateLabel(nameFor(model, seat.whisperedTo[0]!), 6);
    const whisperTag = scene.add
      .bitmapText(-SEAT_W / 2 + 2, SEAT_H / 2 + 1, WORLD_LABEL_FONT, `W>${targetName}`)
      .setOrigin(0, 0);
    container.add(whisperTag);
  }

  if (!seat.connected) {
    const sleep = scene.add.bitmapText(SEAT_W / 2 - 2, -SEAT_H / 2 + 1, WORLD_LABEL_FONT, "Zz").setOrigin(1, 0);
    sleep.setTint(toPhaserColor(PALETTE.statusDisconnected));
    container.add(sleep);
    container.setAlpha(DISCONNECTED_ALPHA);
  } else if (targetingActive && !seat.targetable && !seat.isYou) {
    container.setAlpha(TARGETING_DIM_ALPHA);
  }

  container.setSize(SEAT_W, SEAT_H);
  container.setInteractive({ useHandCursor: seat.targetable });
  if (seat.targetable) {
    container.on("pointerdown", () => handlers.onSeat(seat.seatId));
  }
  layer.add(container);
  index.register("camp", seatObjectId(seat.seatId), container);

  seat.objectives.forEach((chip, i) => {
    const x = -SEAT_W / 2 + i * (48 + OBJECTIVE_GAP);
    drawObjective(scene, layer, index, handlers, chip, anchor.x + x, anchor.y + OBJECTIVE_ROW_Y, targetingActive);
  });

  seat.gear.forEach((chip, i) => {
    const x = -SEAT_W / 2 + i * (GEAR_W + GEAR_GAP);
    drawGear(scene, layer, index, handlers, chip, anchor.x + x, anchor.y + GEAR_ROW_Y, seat.isYou);
  });

  seat.reveals.forEach((reveal, i) => {
    const x = -SEAT_W / 2 + i * 18;
    drawReveal(scene, layer, index, reveal, anchor.x + x, anchor.y + REVEAL_Y, model.cardPackId);
  });
}

export function drawSeats(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  model: SceneModel,
  index: ObjectIndex,
  handlers: CampHandlers,
): void {
  const anchors = seatAnchors(model.seats.length);
  const targetingActive = model.targeting !== null;
  model.seats.forEach((seat, i) => {
    const anchor = anchors[i];
    if (anchor === undefined) return;
    drawSeat(scene, layer, index, handlers, model, seat, anchor, targetingActive);
  });
}
