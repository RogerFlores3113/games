/**
 * What has been whispered this camp. The `whispers` zone keeps the cards
 * teammates named to you (face up, labelled "from <Name>") and the cards you
 * named (labelled "to <Name>"), and the cards the latest Tornado gust took
 * from your hand. A ticker along the foot of the table says,
 * to every seat, who whispered to whom.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { MINI_H, MINI_W, ZONES } from "../layout";
import type { ObjectIndex } from "../object-index";
import type { SceneModel } from "../../../../lib/expedition/build-scene-model";
import { fitLabel } from "./text-fit";
import { truncateLabel } from "../font/glyphs-5x7";
import { PANEL_ALPHA, labelWidth, miniCard, plate, platedText, text, type Layer } from "./ui-kit";

const CELL_H = 23;
const CELL_TEXT_X = MINI_W + 3;
const NAME_CHARS = 12;
const MAX_CELLS = 4;
const TICKER_LINES = 2;
const TICKER_LINE_H = 9;

interface Cell {
  caption: string;
  name: string;
  card: string;
  objectId: string;
  outline: string;
}

/** Newest first: the cards you know because a teammate or an ability
 * showed them to you, and the ones you whispered. */
function cellsOf(model: SceneModel): Cell[] {
  const received = model.receivedWhispers.map((w) => ({ caption: "from", name: w.fromName, card: w.card, objectId: w.objectId, outline: PALETTE.turn }));
  const shown = model.shownCards.map((c) => ({ caption: c.sourceName, name: `${c.fromName} has`, card: c.card, objectId: c.objectId, outline: PALETTE.done }));
  const sent = model.sentWhispers.map((w) => ({ caption: "you sent to", name: w.toName, card: w.card, objectId: w.objectId, outline: PALETTE.sun }));
  const gust = model.gustSent.map((w) => ({ caption: "gust sent to", name: w.toName, card: w.card, objectId: w.objectId, outline: PALETTE.destructive }));
  return [...received, ...shown, ...sent, ...gust].reverse().slice(0, MAX_CELLS);
}

function drawCards(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex): void {
  const cells = cellsOf(model);
  if (cells.length === 0) return;
  const zone = ZONES.whispers;
  layer.add(plate(scene, zone.x, zone.y, zone.w, 12 + cells.length * CELL_H).setAlpha(PANEL_ALPHA));
  layer.add(text(scene, zone.x + 3, zone.y + 2, "Cards you know", PALETTE.textDim));

  cells.forEach((cell, i) => {
    const x = zone.x + 3;
    const y = zone.y + 12 + i * CELL_H;
    const card = miniCard(scene, x, y, cell.card, model.cardPackId);
    layer.add(card);
    layer.add(scene.add.rectangle(x, y, MINI_W, MINI_H, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(cell.outline)));
    index.register("camp", cell.objectId, card);
    layer.add(text(scene, x + CELL_TEXT_X, y + 1, fitLabel(cell.caption, NAME_CHARS), PALETTE.textDim));
    layer.add(text(scene, x + CELL_TEXT_X, y + 11, fitLabel(cell.name, NAME_CHARS)));
  });
}

/** The newest whispers under the table. The boss's rule and a lightning
 * strike on the trick in play are pinned to the bottom lines, each on a
 * solid plate edged in its colour, since the table behind them is
 * as dark and busy as the text is bright. */
function drawTicker(scene: Phaser.Scene, layer: Layer, model: SceneModel): void {
  const pinned = [
    ...(model.boss === null || model.boss.rule === "" ? [] : [{ line: model.boss.rule, color: model.boss.alert ? PALETTE.destructive : PALETTE.sun, pinned: true }]),
    ...(model.sky.notice === null ? [] : [{ line: model.sky.notice, color: PALETTE.coin, pinned: true }]),
  ].slice(-TICKER_LINES);
  const room = TICKER_LINES - pinned.length;
  const whispers = room === 0 ? [] : model.whisperLog.slice(-room);
  const lines = [...whispers.map((line, i) => ({ line, color: i === whispers.length - 1 && pinned.length === 0 ? PALETTE.text : PALETTE.textDim, pinned: false })), ...pinned];
  const zone = ZONES.ticker;
  const chars = Math.floor((zone.w - 6) / LABEL_CELL.w);
  lines.forEach(({ line, color, pinned: rule }, i) => {
    const age = lines.length - 1 - i;
    const shown = truncateLabel(line, chars);
    const y = zone.y + zone.h - TICKER_LINE_H * (age + 1) + 1;
    const x = zone.x + Math.floor((zone.w - labelWidth(shown)) / 2);
    if (!rule) {
      layer.add(platedText(scene, x, y, shown, color));
      return;
    }
    layer.add(plate(scene, x - 3, y - 2, labelWidth(shown) + 5, TICKER_LINE_H + 2).setStrokeStyle(1, toPhaserColor(color)));
    layer.add(text(scene, x, y, shown, color));
  });
}

export function drawWhispers(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex): void {
  drawCards(scene, layer, model, index);
  drawTicker(scene, layer, model);
}
