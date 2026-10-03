/**
 * What has been whispered this camp. The `whispers` zone keeps the cards
 * teammates named to you (face up, labelled "from <Name>") and the cards you
 * named (labelled "to <Name>"). A ticker along the foot of the stump says,
 * to every seat, who whispered to whom.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { MINI_H, MINI_W, ZONES } from "../layout";
import type { ObjectIndex } from "../object-index";
import type { SceneModel } from "../../../../lib/expedition/build-scene-model";
import { fitLabel } from "./text-fit";
import { PANEL_ALPHA, labelWidth, miniCard, plate, platedText, text, type Layer } from "./ui-kit";

const CELL_W = 58;
const CELL_H = 22;
const CELL_TEXT_X = MINI_W + 3;
const NAME_CHARS = 6;
const MAX_CELLS = 4;
const TICKER_LINES = 2;
const TICKER_LINE_H = 10;

interface Cell {
  caption: string;
  name: string;
  card: string;
  objectId: string;
  outline: string;
}

function cellsOf(model: SceneModel): Cell[] {
  const received = model.receivedWhispers.map((w) => ({ caption: "from", name: w.fromName, card: w.card, objectId: w.objectId, outline: PALETTE.turn }));
  const sent = model.sentWhispers.map((w) => ({ caption: "you sent to", name: w.toName, card: w.card, objectId: w.objectId, outline: PALETTE.sun }));
  return [...sent, ...received].slice(0, MAX_CELLS);
}

function drawCards(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex): void {
  const cells = cellsOf(model);
  if (cells.length === 0) return;
  const zone = ZONES.whispers;
  const rows = Math.ceil(cells.length / 2);
  layer.add(plate(scene, zone.x, zone.y, zone.w, 11 + rows * CELL_H).setAlpha(PANEL_ALPHA));
  layer.add(text(scene, zone.x + 3, zone.y + 1, "Whispers", PALETTE.textDim));

  cells.forEach((cell, i) => {
    const x = zone.x + 2 + (i % 2) * CELL_W;
    const y = zone.y + 10 + Math.floor(i / 2) * CELL_H;
    const card = miniCard(scene, x, y, cell.card, model.cardPackId);
    layer.add(card);
    layer.add(scene.add.rectangle(x, y, MINI_W, MINI_H, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(cell.outline)));
    index.register("camp", cell.objectId, card);
    layer.add(text(scene, x + CELL_TEXT_X, y + 1, fitLabel(cell.caption, NAME_CHARS), PALETTE.textDim));
    layer.add(text(scene, x + CELL_TEXT_X, y + 10, fitLabel(cell.name, NAME_CHARS)));
  });
}

function drawTicker(scene: Phaser.Scene, layer: Layer, model: SceneModel): void {
  const lines = model.whisperLog.slice(-TICKER_LINES);
  const zone = ZONES.stump;
  lines.forEach((line, i) => {
    const age = lines.length - 1 - i;
    const y = zone.y + zone.h - 3 - TICKER_LINE_H * (age + 1) + 1;
    const x = zone.x + Math.floor((zone.w - labelWidth(line)) / 2);
    layer.add(platedText(scene, x, y, line, age === 0 ? PALETTE.text : PALETTE.textDim));
  });
}

export function drawWhispers(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex): void {
  drawCards(scene, layer, model, index);
  drawTicker(scene, layer, model);
}
