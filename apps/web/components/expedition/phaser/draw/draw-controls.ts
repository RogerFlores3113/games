/**
 * The face-up objective pool on the table, and the `actions` zone: the
 * Whisper button, Confirm / Cancel, and rescue Use / Pass. Every flag
 * drawn (`pickable`, `targetable`, `canConfirm`, `whisper.*`) is already a
 * server-derived fact on the model.
 */
import type Phaser from "phaser";
import { CURSOR, pointerIf } from "../cursors";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { MINI_H, MINI_W, OBJECTIVE_POOL_STEP, ZONES, tableRowXs } from "../layout";
import { CANCEL_ID, CONFIRM_ID, GATE_SKIP_ID, TRAY_MORE_ID, WHISPER_ID, gateUseObjectId } from "../../../../lib/expedition/expedition-ids";
import type { ObjectIndex } from "../object-index";
import type { ObjectiveChip, SceneModel } from "../../../../lib/expedition/build-scene-model";
import { sourceArtId, type ArtId } from "../art/art-registry";
import { cardBackTextureKey } from "../card-packs/card-pack-def";
import { placeArt } from "../art/place-art";
import type { CampHandlers } from "./camp-handlers";
import { fitLabel, wrapWords } from "./text-fit";
import { button, hiddenMiniCard, labelWidth, miniCard, plate, platedText, text, type Layer } from "./ui-kit";

const TILE_W = OBJECTIVE_POOL_STEP - 4;
const BUTTON_H = 14;
const WHISPER_H = 18;
const ROW_GAP = 4;
const PULSE_MS = 600;

function tileCaption(chip: ObjectiveChip): { body: string | null; caption: string } {
  if (chip.kind === "hidden") return { body: null, caption: "hidden" };
  if (chip.kind === "sun") return { body: null, caption: "the Sun" };
  if (chip.kind === "no-tricks") return { body: "0", caption: "tricks" };
  if (chip.kind === "exactly-n") return { body: chip.label.split(" ")[0]!, caption: "tricks" };
  if (chip.orderBadge === null) return { body: null, caption: chip.label };
  return { body: null, caption: `${chip.label} ${chip.orderBadge === "L" ? "last" : `#${chip.orderBadge}`}` };
}

function drawObjectivePool(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const pool = model.faceUpObjectives;
  if (pool.length === 0) return;
  const zone = ZONES.table;
  const title = "Objectives";
  layer.add(platedText(scene, zone.x + Math.floor((zone.w - labelWidth(title)) / 2), zone.y + 12, title));

  const bodyY = zone.y + 28;
  tableRowXs(pool.length, OBJECTIVE_POOL_STEP).forEach((cx, i) => {
    const chip = pool[i]!;
    const tileX = cx - TILE_W / 2;
    const container = scene.add.container(Math.round(tileX), bodyY);
    const bodyX = Math.round(TILE_W / 2 - MINI_W / 2);
    const { body, caption } = tileCaption(chip);
    if (chip.kind === "hidden") {
      container.add(hiddenMiniCard(scene, bodyX, 0, model.cardPackId));
    } else if (body === null) {
      container.add(miniCard(scene, bodyX, 0, chip.label, model.cardPackId));
    } else {
      container.add(plate(scene, bodyX, 0, MINI_W, MINI_H, PALETTE.stump));
      container.add(text(scene, bodyX + Math.floor((MINI_W - labelWidth(body)) / 2), (MINI_H - LABEL_CELL.h) / 2, body));
    }
    container.add(platedText(scene, Math.floor((TILE_W - labelWidth(caption)) / 2), MINI_H + 3, caption));

    const highlighted = chip.pickable || chip.targetable;
    const ring = highlighted || chip.selected ? PALETTE.turn : chip.kind === "sun" ? PALETTE.sun : null;
    if (ring !== null) {
      container.add(scene.add.rectangle(bodyX, 0, MINI_W, MINI_H, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(ring)));
    }
    const hit = scene.add.zone(0, 0, TILE_W, MINI_H + 3 + LABEL_CELL.h).setOrigin(0, 0);
    container.add(hit);
    hit.setInteractive(pointerIf(highlighted));
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
  const { visible, reason, left, state, washes } = model.whisper;
  const caption = visible ? (washes ? "Will wash away" : left > 1 ? `Share a card (${left})` : "Share a card") : (reason ?? "");
  if (caption === "") return;
  const zone = ZONES.actions;
  const color = visible ? (washes ? PALETTE.rain : PALETTE.turn) : state === "blocked" ? PALETTE.destructive : state === "washed" ? PALETTE.rain : PALETTE.textDim;
  const shown = fitLabel(caption, Math.floor((zone.w - 4) / LABEL_CELL.w));
  layer.add(text(scene, zone.x + Math.floor((zone.w - labelWidth(shown)) / 2), zone.y + 2 + WHISPER_H + 3, shown, color));
}

const BANNER_PAD = 6;

/** The rescue window on the table: what failed, who it waits on, and your
 * Use and Pass buttons when it waits on you. */
function drawBanner(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const banner = model.banner;
  if (banner === null) return;
  const zone = ZONES.table;
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
    ...banner.uses.map((u) => ({ id: gateUseObjectId(u.sourceKey), label: `Use ${u.name}`, onClick: () => handlers.onGateUse(u.sourceKey), outline: true })),
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
 * the ranks for a held card), as buttons on the table. Pages when they do
 * not all fit. */
function drawTray(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const tray = model.tray;
  if (tray === null) return;
  const zone = ZONES.table;
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
    hit.setInteractive({ cursor: CURSOR.pointer });
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

const POPUP_ROW_H = 17;
const POPUP_BUY_H = 13;

/** The Pop-up Shop over the table: a row per item in stock (icon, name,
 * price, then a button for each player it can go to) and the refresh. */
function drawPopupShop(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const shop = model.popupShop;
  if (shop === null) return;
  const zone = ZONES.table;
  layer.add(plate(scene, zone.x, zone.y, zone.w, zone.h).setAlpha(0.95).setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
  layer.add(text(scene, zone.x + 4, zone.y + 3, shop.title, PALETTE.sun));
  const purse = `Crew: ${shop.purse} coins`;
  layer.add(text(scene, zone.x + zone.w - 4 - labelWidth(purse), zone.y + 3, purse, PALETTE.coinShine));
  const nameW = 76;
  shop.rows.forEach((row, i) => {
    const y = zone.y + 14 + i * POPUP_ROW_H;
    const art = sourceArtId(row.itemId);
    if (art !== null) layer.add(placeArt(scene, art, zone.x + 12, y + 7));
    const name = text(scene, zone.x + 22, y + 3, fitLabel(row.name, Math.floor((nameW - 4) / LABEL_CELL.w)), row.rare ? PALETTE.rain : PALETTE.text);
    name.setInteractive();
    name.on("pointerover", () => handlers.onSourceHover(row.itemId));
    name.on("pointerout", () => handlers.onSourceHover(null));
    layer.add(name);
    index.register("camp", row.infoId, name);
    const price = `${row.price}c`;
    layer.add(text(scene, zone.x + 22 + nameW, y + 3, price, PALETTE.coinShine));
    const left = zone.x + 22 + nameW + labelWidth("99c") + 6;
    const w = Math.floor((zone.x + zone.w - 4 - left - (row.buys.length - 1) * 2) / Math.max(1, row.buys.length));
    row.buys.forEach((buy, j) => {
      const label = fitLabel(buy.label, Math.floor((w - 4) / LABEL_CELL.w));
      const b = button(scene, left + j * (w + 2) + w / 2, y + 7, w, POPUP_BUY_H, label, { onClick: () => handlers.onTrayPick(buy.choiceId), outline: buy.selected, color: buy.selected ? PALETTE.moss : undefined });
      layer.add(b);
      index.register("camp", buy.objectId, b);
    });
  });
  const refresh = shop.refresh;
  if (refresh !== null) {
    const w = labelWidth(refresh.label) + 10;
    const b = button(scene, zone.x + zone.w - 4 - w / 2, zone.y + zone.h - 3 - POPUP_BUY_H / 2, w, POPUP_BUY_H, refresh.label, { onClick: () => handlers.onTrayPick(refresh.choiceId), outline: refresh.selected, color: refresh.selected ? PALETTE.moss : undefined });
    layer.add(b);
    index.register("camp", refresh.objectId, b);
  }
  if (shop.rows.length === 0) layer.add(text(scene, zone.x + 8, zone.y + 20, "Sold out until you refresh", PALETTE.textDim));
}

const FAN_ROW_H = MINI_H + 3;
const FAN_STEP = 8;
const FAN_NAME_W = 44;

/** The Magician's picker: each teammate's hand fanned face down beside
 * their name, then the cards you know from it face up; a click picks a
 * place. A hand already picked from this use is dimmed. */
function drawFanPicker(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const fan = model.fan;
  if (fan === null) return;
  const h = 14 + fan.rows.length * FAN_ROW_H + 2;
  const zone = { x: ZONES.table.x - 32, y: ZONES.table.y + ZONES.table.h - h, w: ZONES.table.w + 64, h };
  layer.add(plate(scene, zone.x, zone.y, zone.w, zone.h).setAlpha(0.95).setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
  layer.add(text(scene, zone.x + 4, zone.y + 3, fitLabel(fan.title, Math.floor((zone.w - 8) / LABEL_CELL.w)), PALETTE.textDim));
  fan.rows.forEach((row, r) => {
    const y = zone.y + 14 + r * FAN_ROW_H;
    layer.add(text(scene, zone.x + 4, y + Math.floor((MINI_H - LABEL_CELL.h) / 2), fitLabel(row.name, Math.floor((FAN_NAME_W - 4) / LABEL_CELL.w)), row.places.some((p) => p.targetable) ? PALETTE.text : PALETTE.textDim));
    // Each card back's hit is the strip of it left showing; the last one, and a known card, is whole.
    const pick = (place: { choiceId: string; objectId: string; selected: boolean; targetable: boolean }, x: number, hitW: number, art: Phaser.GameObjects.GameObject[]) => {
      const container = scene.add.container(0, 0);
      container.add(art);
      if (place.selected) container.add(scene.add.rectangle(x, y, MINI_W, MINI_H, 0, 0).setOrigin(0, 0).setStrokeStyle(2, toPhaserColor(PALETTE.turn)));
      if (!place.targetable && !place.selected) container.setAlpha(0.45);
      const hit = scene.add.zone(x, y, hitW, MINI_H).setOrigin(0, 0);
      if (place.targetable) {
        hit.setInteractive({ cursor: CURSOR.pointer });
        hit.on("pointerdown", () => handlers.onTrayPick(place.choiceId));
      }
      container.add(hit);
      container.setSize(MINI_W, MINI_H);
      layer.add(container);
      index.register("camp", place.objectId, hit);
    };
    let x = zone.x + FAN_NAME_W;
    row.places.forEach((place, i) => {
      const back = [
        scene.add.image(x, y, cardBackTextureKey(model.cardPackId, "mini")).setOrigin(0, 0),
        scene.add.rectangle(x, y, MINI_W, MINI_H, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.cardEdge)),
      ];
      pick(place, x, i === row.places.length - 1 ? MINI_W : FAN_STEP, back);
      x += FAN_STEP;
    });
    x += MINI_W - FAN_STEP + 6;
    for (const known of row.known) {
      pick(known, x, MINI_W, [miniCard(scene, x, y, known.label, model.cardPackId)]);
      x += MINI_W + 2;
    }
  });
}

/** The Perfumist's pink mist over a hallucinated trick. */
function drawMist(scene: Phaser.Scene, layer: Layer, model: SceneModel): void {
  if (!model.mist) return;
  const zone = ZONES.table;
  layer.add(scene.add.ellipse(zone.x + zone.w / 2, zone.y + zone.h / 2, zone.w + 40, zone.h + 24, toPhaserColor(PALETTE.mist), 0.3));
  const label = "Pink mist: every card goes back";
  layer.add(platedText(scene, zone.x + Math.floor((zone.w - labelWidth(label)) / 2), zone.y + 2, label, PALETTE.mist));
}

export function drawControls(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  drawObjectivePool(scene, layer, model, index, handlers);
  drawActions(scene, layer, model, index, handlers);
  drawWhisperCaption(scene, layer, model);
}

/** Overlays on the table: drawn last so they cover the trick. */
export function drawTableOverlays(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  drawMist(scene, layer, model);
  drawBanner(scene, layer, model, index, handlers);
  drawFanPicker(scene, layer, model, index, handlers);
  drawTray(scene, layer, model, index, handlers);
  drawPopupShop(scene, layer, model, index, handlers);
}
