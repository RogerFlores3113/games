/**
 * The face-up objective pool on the stump, and the `actions` zone: the
 * Whisper button, Confirm / Cancel, and pre-deal Use / Skip. Every flag
 * drawn (`pickable`, `targetable`, `canConfirm`, `whisper.*`) is already a
 * server-derived fact on the model.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { MINI_H, MINI_W, OBJECTIVE_POOL_STEP, ZONES, stumpRowXs } from "../layout";
import { CANCEL_ID, CONFIRM_ID, PREDEAL_SKIP_ID, WHISPER_ID, preDealUseObjectId } from "../../../../lib/expedition/expedition-ids";
import type { ObjectIndex } from "../object-index";
import type { ObjectiveChip, SceneModel } from "../../../../lib/expedition/build-scene-model";
import type { ArtId } from "../art/art-registry";
import type { CampHandlers } from "./camp-handlers";
import { fitLabel } from "./text-fit";
import { button, labelWidth, miniCard, plate, platedText, text, type Layer } from "./ui-kit";

const TILE_W = OBJECTIVE_POOL_STEP - 2;
const BUTTON_H = 14;
const WHISPER_H = 18;
const ROW_GAP = 4;
const PULSE_MS = 600;

function tileCaption(chip: ObjectiveChip): { body: string | null; caption: string } {
  if (chip.kind === "no-tricks") return { body: "0", caption: "tricks" };
  if (chip.kind === "exactly-n") return { body: chip.label.split(" ")[0]!, caption: "tricks" };
  if (chip.orderBadge === null) return { body: null, caption: chip.label };
  return { body: null, caption: `${chip.label} ${chip.orderBadge === "L" ? "last" : `#${chip.orderBadge}`}` };
}

function drawObjectivePool(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const pool = model.faceUpObjectives;
  if (pool.length === 0) return;
  const zone = ZONES.stump;
  const title = "Objectives";
  layer.add(platedText(scene, zone.x + Math.floor((zone.w - labelWidth(title)) / 2), zone.y + 8, title));

  const bodyY = zone.y + 24;
  stumpRowXs(pool.length, OBJECTIVE_POOL_STEP).forEach((cx, i) => {
    const chip = pool[i]!;
    const tileX = cx - TILE_W / 2;
    const container = scene.add.container(Math.round(tileX), bodyY);
    const bodyX = Math.round(TILE_W / 2 - MINI_W / 2);
    const { body, caption } = tileCaption(chip);
    if (body === null) {
      container.add(miniCard(scene, bodyX, 0, chip.label, model.cardPackId));
    } else {
      container.add(plate(scene, bodyX, 0, MINI_W, MINI_H, PALETTE.stump));
      container.add(text(scene, bodyX + Math.floor((MINI_W - labelWidth(body)) / 2), (MINI_H - LABEL_CELL.h) / 2, body));
    }
    container.add(platedText(scene, Math.floor((TILE_W - labelWidth(caption)) / 2), MINI_H + 3, caption));

    const highlighted = chip.pickable || chip.targetable;
    if (highlighted || chip.selected) {
      container.add(scene.add.rectangle(bodyX, 0, MINI_W, MINI_H, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
    }
    const hit = scene.add.zone(0, 0, TILE_W, MINI_H + 3 + LABEL_CELL.h).setOrigin(0, 0);
    container.add(hit);
    hit.setInteractive({ useHandCursor: highlighted });
    hit.on("pointerover", () => handlers.onObjectiveHover(chip.objectiveId));
    hit.on("pointerout", () => handlers.onObjectiveHover(null));
    if (highlighted) hit.on("pointerdown", () => handlers.onObjective(chip.objectiveId));
    layer.add(container);
    index.register("camp", chip.objectId, container);
  });
}

interface Action {
  id: string;
  label: string;
  onClick?: () => void;
  outline?: boolean;
  icon?: ArtId;
  /** Row in the actions zone; buttons in one row split its width. */
  row: number;
  h?: number;
}

function actionList(model: SceneModel, handlers: CampHandlers): Action[] {
  const actions: Action[] = [];
  if (model.gate !== null && model.gate.youPending && model.targeting === null) {
    model.gate.sources.forEach((source, i) => {
      actions.push({ id: preDealUseObjectId(source.sourceId), label: `Use ${source.name}`, onClick: () => handlers.onGateUse(source.sourceId), row: i });
    });
    actions.push({ id: PREDEAL_SKIP_ID, label: "Skip", onClick: () => handlers.onGateSkip(), row: model.gate.sources.length });
    return actions;
  }
  if (model.whisper.shown) {
    actions.push(
      model.whisper.visible
        ? { id: WHISPER_ID, label: "Whisper", onClick: () => handlers.onWhisper(), outline: true, icon: "icon-whisper", row: 0, h: WHISPER_H }
        : { id: WHISPER_ID, label: "Whisper", icon: "icon-whisper", row: 0, h: WHISPER_H },
    );
  }
  if (model.targeting !== null) {
    const confirm: Action = model.targeting.canConfirm
      ? { id: CONFIRM_ID, label: "Confirm", onClick: () => handlers.onConfirm(), outline: true, row: 1 }
      : { id: CONFIRM_ID, label: "Confirm", row: 1 };
    actions.push(confirm, { id: CANCEL_ID, label: "Cancel", onClick: () => handlers.onCancel(), row: 1 });
  }
  return actions;
}

function drawActions(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const zone = ZONES.actions;
  const actions = actionList(model, handlers);
  const rows = new Map<number, Action[]>();
  for (const a of actions) rows.set(a.row, [...(rows.get(a.row) ?? []), a]);

  for (const [row, items] of rows) {
    const gap = 4;
    const w = Math.floor((zone.w - 4 - gap * (items.length - 1)) / items.length);
    items.forEach((a, i) => {
      const h = a.h ?? BUTTON_H;
      const top = 2 + row * (BUTTON_H + ROW_GAP) + (row >= 1 && model.whisper.shown ? WHISPER_H - BUTTON_H : 0);
      const cy = zone.y + top + h / 2;
      const cx = zone.x + 2 + i * (w + gap) + w / 2;
      const b = button(scene, cx, cy, w, h, a.label, { onClick: a.onClick, outline: a.outline, icon: a.icon });
      layer.add(b);
      if (a.id === WHISPER_ID && a.onClick !== undefined && !model.whisper.active) {
        scene.tweens.add({ targets: b, alpha: { from: 1, to: 0.65 }, duration: PULSE_MS, yoyo: true, repeat: -1 });
      }
      // Only clickable buttons are registered: a registered id is one a
      // player (or a test) can press.
      if (a.onClick !== undefined) index.register("camp", a.id, b);
    });
  }
}

function drawWhisperCaption(scene: Phaser.Scene, layer: Layer, model: SceneModel): void {
  if (!model.whisper.shown || model.targeting !== null) return;
  const { visible, reason, left, state } = model.whisper;
  const caption = visible ? (left > 1 ? `Share a card (${left})` : "Share a card") : (reason ?? "");
  if (caption === "") return;
  const zone = ZONES.actions;
  const color = visible ? PALETTE.turn : state === "blocked" ? PALETTE.destructive : PALETTE.textDim;
  const shown = fitLabel(caption, Math.floor((zone.w - 4) / LABEL_CELL.w));
  layer.add(text(scene, zone.x + Math.floor((zone.w - labelWidth(shown)) / 2), zone.y + 2 + WHISPER_H + 3, shown, color));
}

export function drawControls(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  drawObjectivePool(scene, layer, model, index, handlers);
  drawActions(scene, layer, model, index, handlers);
  drawWhisperCaption(scene, layer, model);
}
