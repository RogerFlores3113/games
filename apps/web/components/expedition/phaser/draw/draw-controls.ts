/**
 * The face-up objective pool on the stump, and the `actions` zone: the
 * Whisper button, Confirm / Cancel, and rescue Use / Pass. Every flag
 * drawn (`pickable`, `targetable`, `canConfirm`, `whisper.*`) is already a
 * server-derived fact on the model.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { MINI_H, MINI_W, OBJECTIVE_POOL_STEP, ZONES, stumpRowXs } from "../layout";
import { CANCEL_ID, CONFIRM_ID, GATE_SKIP_ID, TRAY_MORE_ID, WHISPER_ID, gateUseObjectId } from "../../../../lib/expedition/expedition-ids";
import type { ObjectIndex } from "../object-index";
import type { ObjectiveChip, SceneModel } from "../../../../lib/expedition/build-scene-model";
import type { ArtId } from "../art/art-registry";
import type { CampHandlers } from "./camp-handlers";
import { fitLabel, wrapWords } from "./text-fit";
import { button, labelWidth, miniCard, plate, platedText, text, type Layer } from "./ui-kit";

const TILE_W = OBJECTIVE_POOL_STEP - 4;
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
  layer.add(platedText(scene, zone.x + Math.floor((zone.w - labelWidth(title)) / 2), zone.y + 12, title));

  const bodyY = zone.y + 28;
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

const BANNER_PAD = 6;

/** The rescue window on the stump: what failed, who it waits on, and your
 * Use and Pass buttons when it waits on you. */
function drawBanner(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const banner = model.banner;
  if (banner === null) return;
  const zone = ZONES.stump;
  const x = zone.x + 4;
  const w = zone.w - 8;
  const chars = Math.floor((w - BANNER_PAD * 2) / LABEL_CELL.w);
  const titleLines = wrapWords(banner.title, chars).slice(0, 2);
  const detail = wrapWords(banner.detail, chars).slice(0, 2);
  const buttons = banner.youPending ? 1 : 0;
  const lineH = LABEL_CELL.h + 2;
  const titleH = titleLines.length * lineH + 2;
  const h = BANNER_PAD * 2 + titleH + detail.length * lineH + buttons * (BUTTON_H + 6);
  const y = zone.y + Math.floor((zone.h - h) / 2);
  const bg = plate(scene, x, y, w, h);
  bg.setStrokeStyle(1, toPhaserColor(PALETTE.destructive));
  layer.add(bg);
  titleLines.forEach((line, i) => {
    layer.add(text(scene, x + Math.floor((w - labelWidth(line)) / 2), y + BANNER_PAD + i * lineH, line, PALETTE.destructive));
  });
  detail.forEach((line, i) => {
    layer.add(text(scene, x + Math.floor((w - labelWidth(line)) / 2), y + BANNER_PAD + titleH + i * lineH, line));
  });
  if (!banner.youPending) return;
  const items = [
    ...banner.uses.map((u) => ({ id: gateUseObjectId(u.sourceId), label: `Use ${u.name}`, onClick: () => handlers.onGateUse(u.sourceId), outline: true })),
    { id: GATE_SKIP_ID, label: "Pass", onClick: () => handlers.onGateSkip(), outline: false },
  ];
  const gap = 6;
  const bw = Math.min(96, Math.floor((w - BANNER_PAD * 2 - gap * (items.length - 1)) / items.length));
  const total = bw * items.length + gap * (items.length - 1);
  const by = y + h - BANNER_PAD - BUTTON_H / 2;
  items.forEach((item, i) => {
    const cx = x + Math.floor((w - total) / 2) + i * (bw + gap) + bw / 2;
    const b = button(scene, cx, by, bw, BUTTON_H, item.label, { onClick: item.onClick, outline: item.outline });
    layer.add(b);
    index.register("camp", item.id, b);
  });
}

const TRAY_OPTION_H_TEXT = 14;
const TRAY_CARDS_H = MINI_H + 2;
const TRAY_MINI_STEP = 9;

/** Choices with no single place on the table (whispers, your won tricks,
 * the ranks for a held card), as buttons on the stump. Pages when they do
 * not all fit. */
function drawTray(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const tray = model.tray;
  if (tray === null) return;
  const zone = ZONES.stump;
  layer.add(plate(scene, zone.x, zone.y, zone.w, zone.h).setAlpha(0.92).setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
  const title = fitLabel(tray.title, Math.floor((zone.w - 8) / LABEL_CELL.w));
  layer.add(text(scene, zone.x + Math.floor((zone.w - labelWidth(title)) / 2), zone.y + 3, title, PALETTE.textDim));

  const withCards = tray.options.some((o) => o.cards.length > 0);
  const cardsW = (n: number): number => (n === 0 ? 0 : MINI_W + TRAY_MINI_STEP * (n - 1));
  const optionW = Math.max(28, ...tray.options.map((o) => Math.max(labelWidth(o.label), cardsW(o.cards.length)) + 8));
  const optionH = TRAY_OPTION_H_TEXT + (withCards ? TRAY_CARDS_H : 0);
  const gap = 4;
  const areaY = zone.y + 14;
  const areaH = zone.h - 16;
  const cols = Math.max(1, Math.floor((zone.w - 8 + gap) / (optionW + gap)));
  const rows = Math.max(1, Math.floor((areaH + gap) / (optionH + gap)));
  const perPage = cols * rows;
  const paged = tray.options.length > perPage;
  const slots = paged ? perPage - 1 : perPage;
  const pages = Math.max(1, Math.ceil(tray.options.length / slots));
  const page = model.trayPage % pages;
  const shown = tray.options.slice(page * slots, page * slots + slots);
  const count = shown.length + (paged ? 1 : 0);
  const usedCols = Math.min(cols, count);
  const left = zone.x + Math.floor((zone.w - (usedCols * optionW + (usedCols - 1) * gap)) / 2);
  const cell = (i: number): { cx: number; y: number } => ({
    cx: left + (i % cols) * (optionW + gap) + optionW / 2,
    y: areaY + Math.floor(i / cols) * (optionH + gap),
  });

  shown.forEach((option, i) => {
    const { cx, y } = cell(i);
    const container = scene.add.container(Math.round(cx - optionW / 2), y);
    const bg = plate(scene, 0, 0, optionW, optionH, PALETTE.stump).setStrokeStyle(1, toPhaserColor(PALETTE.turn));
    container.add(bg);
    container.add(text(scene, Math.floor((optionW - labelWidth(option.label)) / 2), 3, option.label));
    const cx0 = Math.floor((optionW - cardsW(option.cards.length)) / 2);
    option.cards.forEach((label, j) => container.add(miniCard(scene, cx0 + j * TRAY_MINI_STEP, TRAY_OPTION_H_TEXT, label, model.cardPackId)));
    container.setSize(optionW, optionH);
    const hit = scene.add.zone(0, 0, optionW, optionH).setOrigin(0, 0);
    hit.setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => handlers.onTrayPick(option.choiceId));
    container.add(hit);
    layer.add(container);
    index.register("camp", option.objectId, container);
  });
  if (paged) {
    const { cx, y } = cell(shown.length);
    const more = button(scene, cx, y + optionH / 2, optionW, optionH, `More ${page + 1}/${pages}`, { onClick: () => handlers.onTrayMore() });
    layer.add(more);
    index.register("camp", TRAY_MORE_ID, more);
  }
}

export function drawControls(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  drawObjectivePool(scene, layer, model, index, handlers);
  drawActions(scene, layer, model, index, handlers);
  drawWhisperCaption(scene, layer, model);
}

/** Overlays on the stump: drawn last so they cover the trick. */
export function drawStumpOverlays(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  drawBanner(scene, layer, model, index, handlers);
  drawTray(scene, layer, model, index, handlers);
}
