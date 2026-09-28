/**
 * Draws the camp's remaining interactive chrome (SCENE-02/03, D-02/D-03):
 * the face-up objective pool during objective-pick, the Whisper token, the
 * D-02 highlight-then-confirm Confirm/Cancel pair, and the pre-deal
 * Use/Skip row. Every value drawn here comes from `SceneModel` — nothing
 * here decides legality; `model.targeting.canConfirm` and every chip's
 * `pickable`/`targetable`/`usable` flag are already server-derived facts
 * copied onto the model (spec §7.1).
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { WORLD_LABEL_FONT } from "../font/font-keys";
import { truncateLabel } from "../font/glyphs-5x7";
import { HUD, STUMP } from "../layout";
import {
  CANCEL_ID,
  CONFIRM_ID,
  PREDEAL_SKIP_ID,
  WHISPER_ID,
  preDealUseObjectId,
} from "../../../../lib/expedition/expedition-ids";
import type { ObjectIndex } from "../object-index";
import type { GearChip, ObjectiveChip, SceneModel } from "../../../../lib/expedition/build-scene-model";
import type { CampHandlers } from "./draw-seats";

const CHIP_GAP = 40;
const BUTTON_W = 36;
const BUTTON_H = 12;
const BUTTON_GAP = 4;
const PRE_DEAL_ROW_Y = STUMP.y + STUMP.ry + 20;

function statusGlyph(status: ObjectiveChip["status"]): string {
  if (status === "done") return "+";
  if (status === "failed") return "x";
  return "-";
}

function boundsFor(index: ObjectIndex, id: string): { x: number; y: number; width: number; height: number } | null {
  return index.entries().find((e) => e.id === id)?.bounds ?? null;
}

function drawFaceUpObjectives(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  index: ObjectIndex,
  handlers: CampHandlers,
  objectives: ObjectiveChip[],
): void {
  const startX = STUMP.x - ((objectives.length - 1) * CHIP_GAP) / 2;
  objectives.forEach((chip, i) => {
    const x = Math.round(startX + i * CHIP_GAP);
    const y = STUMP.y;
    const container = scene.add.container(x, y);
    const label = `${truncateLabel(chip.label, 6)}${chip.orderBadge !== null ? chip.orderBadge : ""}${statusGlyph(chip.status)}`;
    const text = scene.add.bitmapText(0, 0, WORLD_LABEL_FONT, label).setOrigin(0.5);
    container.add(text);
    container.setSize(text.width, text.height);
    const highlighted = chip.pickable || chip.targetable;
    if (highlighted) {
      text.setTint(toPhaserColor(PALETTE.turn));
      container.setInteractive({ useHandCursor: true });
      container.on("pointerdown", () => handlers.onObjective(chip.objectiveId));
    }
    layer.add(container);
    index.register("camp", chip.objectId, container);
  });
}

function drawWhisper(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  index: ObjectIndex,
  handlers: CampHandlers,
  whisper: SceneModel["whisper"],
): void {
  if (!whisper.visible) return;
  const container = scene.add.container(Math.round(HUD.whisper.x), Math.round(HUD.whisper.y));
  const bg = scene.add.rectangle(0, 0, BUTTON_W, BUTTON_H, toPhaserColor(PALETTE.stump));
  if (whisper.active) {
    bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  }
  const label = scene.add.bitmapText(0, 0, WORLD_LABEL_FONT, "Whisper").setOrigin(0.5);
  container.add([bg, label]);
  container.setSize(BUTTON_W, BUTTON_H);
  container.setInteractive({ useHandCursor: true });
  container.on("pointerdown", () => handlers.onWhisper());
  layer.add(container);
  index.register("camp", WHISPER_ID, container);
}

function drawButton(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  index: ObjectIndex,
  id: string,
  label: string,
  x: number,
  y: number,
  enabled: boolean,
  alpha: number,
  onClick: () => void,
): void {
  const container = scene.add.container(Math.round(x), Math.round(y));
  const bg = scene.add.rectangle(0, 0, BUTTON_W, BUTTON_H, toPhaserColor(PALETTE.stump));
  const text = scene.add.bitmapText(0, 0, WORLD_LABEL_FONT, label).setOrigin(0.5);
  container.add([bg, text]);
  container.setSize(BUTTON_W, BUTTON_H);
  container.setAlpha(alpha);
  if (enabled) {
    container.setInteractive({ useHandCursor: true });
    container.on("pointerdown", onClick);
  }
  layer.add(container);
  index.register("camp", id, container);
}

function drawTargetingButtons(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  index: ObjectIndex,
  handlers: CampHandlers,
  targeting: NonNullable<SceneModel["targeting"]>,
): void {
  const sourceBounds = boundsFor(index, targeting.sourceObjectId);
  const anchorX = sourceBounds !== null ? sourceBounds.x + sourceBounds.width / 2 : STUMP.x;
  const anchorY = sourceBounds !== null ? sourceBounds.y : STUMP.y;

  const confirmX = anchorX + BUTTON_W / 2 + BUTTON_GAP;
  const cancelX = confirmX + BUTTON_W + BUTTON_GAP;
  const confirmAlpha = targeting.canConfirm ? 1 : 0.4;

  drawButton(scene, layer, index, CONFIRM_ID, "Confirm", confirmX, anchorY, targeting.canConfirm, confirmAlpha, () =>
    handlers.onConfirm(),
  );
  drawButton(scene, layer, index, CANCEL_ID, "Cancel", cancelX, anchorY, true, 1, () => handlers.onCancel());
}

function drawPreDeal(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  index: ObjectIndex,
  handlers: CampHandlers,
  preDeal: NonNullable<SceneModel["preDeal"]>,
): void {
  if (!preDeal.youPending) return;
  const items: { id: string; label: string; onClick: () => void }[] = preDeal.gear.map((gear: GearChip) => ({
    id: preDealUseObjectId(gear.gearId),
    label: `Use ${truncateLabel(gear.name, 5)}`,
    onClick: () => handlers.onPreDealUse(gear.gearId),
  }));
  items.push({ id: PREDEAL_SKIP_ID, label: "Skip", onClick: () => handlers.onPreDealSkip() });

  const startX = STUMP.x - ((items.length - 1) * (BUTTON_W + BUTTON_GAP)) / 2;
  items.forEach((item, i) => {
    const x = startX + i * (BUTTON_W + BUTTON_GAP);
    drawButton(scene, layer, index, item.id, item.label, x, PRE_DEAL_ROW_Y, true, 1, item.onClick);
  });
}

export function drawControls(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  model: SceneModel,
  index: ObjectIndex,
  handlers: CampHandlers,
): void {
  drawFaceUpObjectives(scene, layer, index, handlers, model.faceUpObjectives);
  drawWhisper(scene, layer, index, handlers, model.whisper);
  if (model.targeting !== null) {
    drawTargetingButtons(scene, layer, index, handlers, model.targeting);
  }
  if (model.preDeal !== null) {
    drawPreDeal(scene, layer, index, handlers, model.preDeal);
  }
}
