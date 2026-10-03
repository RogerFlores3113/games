/**
 * Your hand (the `hand` zone), the current trick on the stump, and the
 * last-trick pile with its hover fan (the `lastTrick` zone). Card facts
 * (`playable`, `dimmed`, `targetable`, `selected`, `lifted`, `isLed`) are
 * read off the model; nothing here recomputes legality.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import {
  CARD_H,
  CARD_W,
  HAND_CARD_Y,
  HAND_MARKER_H,
  HOVER_LIFT,
  MINI_H,
  MINI_W,
  YOUR_CARD_AT,
  ZONES,
  centreOf,
  handFanXs,
  plateRect,
  seatSpots,
  type Point,
} from "../layout";
import { cardTextureKey } from "../card-packs/card-pack-def";
import { BOARD_ID, LAST_TRICK_ID } from "../../../../lib/expedition/expedition-ids";
import type { ObjectIndex } from "../object-index";
import type { CardModel, SceneModel } from "../../../../lib/expedition/build-scene-model";
import type { CampHandlers } from "./camp-handlers";
import { others } from "./draw-seats";
import { fitLabel } from "./text-fit";
import { DIM_ALPHA, PANEL_ALPHA, labelWidth, miniCard, plate, platedText, text, type Layer } from "./ui-kit";

const DEAL_TWEEN_MS = 150;
const FAN_STEP = 15;
const TRAY_PAD = 3;

/** Where a seat's played card flies in from: its plate, or your hand. */
function seatOrigin(model: SceneModel, seatId: string, dropOrigin: Point | null): Point {
  if (seatId === model.youSeatId && dropOrigin !== null) return dropOrigin;
  const mates = others(model);
  const i = mates.findIndex((s) => s.seatId === seatId);
  if (i === -1) return centreOf(ZONES.hand);
  return centreOf(plateRect(seatSpots(mates.length), i));
}

/** The top-left of the card a seat plays: on the stump in front of them. */
function cardSpot(model: SceneModel, seatId: string): Point {
  if (seatId === model.youSeatId) return YOUR_CARD_AT;
  const mates = others(model);
  const i = mates.findIndex((s) => s.seatId === seatId);
  return seatSpots(mates.length)[i]?.card ?? YOUR_CARD_AT;
}

function nameOf(model: SceneModel, seatId: string): string {
  return model.seats.find((s) => s.seatId === seatId)?.displayLabel ?? "?";
}

/** A dark tray under the fan, so dimmed cards dim against it, not the art. */
function drawHandTray(scene: Phaser.Scene, layer: Layer, xs: number[]): void {
  if (xs.length === 0) return;
  const zone = ZONES.hand;
  const x = xs[0]! - TRAY_PAD;
  const y = HAND_CARD_Y - HOVER_LIFT - HAND_MARKER_H - 2;
  layer.add(plate(scene, x, y, xs.at(-1)! + CARD_W + TRAY_PAD - x, zone.y + zone.h - y).setAlpha(PANEL_ALPHA));
}

export function drawHand(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const xs = handFanXs(model.hand.length);
  drawHandTray(scene, layer, xs);
  const order = model.hand.map((card, i) => ({ card, i })).sort((a, b) => Number(a.card.lifted) - Number(b.card.lifted));

  for (const { card, i } of order) {
    const x = xs[i]!;
    const next = xs[i + 1];
    const strip = next === undefined || card.lifted ? CARD_W : next - x;
    drawHandCard(scene, layer, model, index, handlers, card, x, strip);
  }
}

function drawHandCard(
  scene: Phaser.Scene,
  layer: Layer,
  model: SceneModel,
  index: ObjectIndex,
  handlers: CampHandlers,
  card: CardModel,
  x: number,
  strip: number,
): void {
  const y = HAND_CARD_Y - (card.lifted ? HOVER_LIFT : 0);
  if (card.dragging) {
    layer.add(scene.add.rectangle(x, y, CARD_W, CARD_H, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.textDim), 0.6));
    return;
  }
  const image = scene.add.image(x, y, cardTextureKey(model.cardPackId, card.label, "full")).setOrigin(0, 0);
  image.setAlpha(card.dimmed ? DIM_ALPHA : 1);
  layer.add(image);

  if (card.targetable) {
    layer.add(scene.add.rectangle(x, y - HAND_MARKER_H - 1, strip - 2, HAND_MARKER_H, toPhaserColor(PALETTE.turn)).setOrigin(0, 0));
  }
  if (card.selected) {
    layer.add(scene.add.rectangle(x, y, CARD_W, CARD_H, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
  }

  const hit = scene.add.zone(x, y, strip, CARD_H).setOrigin(0, 0);
  hit.setInteractive({ useHandCursor: card.playable || card.targetable });
  hit.on("pointerdown", () => handlers.onCardPress(card.id));
  hit.on("pointerover", () => handlers.onCardHover(card.id));
  hit.on("pointerout", () => handlers.onCardHover(null));
  layer.add(hit);
  index.register("camp", card.objectId, hit);
}

/** The stump's drop outline while a legal card is held. */
export function drawDropTarget(scene: Phaser.Scene, layer: Layer, model: SceneModel): void {
  if (model.drag === null || !model.drag.legal) return;
  const zone = ZONES.stump;
  layer.add(
    scene.add
      .rectangle(zone.x + 2, zone.y + 2, zone.w - 4, zone.h - 4, 0, 0)
      .setOrigin(0, 0)
      .setStrokeStyle(2, toPhaserColor(PALETTE.turn)),
  );
  const label = "Drop to play";
  layer.add(platedText(scene, zone.x + Math.floor((zone.w - labelWidth(label)) / 2), zone.y + zone.h - LABEL_CELL.h - 26, label, PALETTE.turn));
}

export function drawTrick(
  scene: Phaser.Scene,
  layer: Layer,
  model: SceneModel,
  index: ObjectIndex,
  handlers: CampHandlers,
  previous: SceneModel | null,
  dropOrigin: Point | null = null,
): void {
  const trick = model.trick;
  if (trick === null || trick.plays.length === 0) return;
  const previousPlayCount = previous?.trick?.plays.length ?? 0;

  trick.plays.forEach((play, i) => {
    const at = cardSpot(model, play.seatId);
    const container = scene.add.container(at.x, at.y);
    container.add(scene.add.image(0, 0, cardTextureKey(model.cardPackId, play.card.label, "full")).setOrigin(0, 0));
    if (play.isLed) {
      container.add(scene.add.rectangle(0, 0, CARD_W, CARD_H, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.sun)));
      container.add(platedText(scene, Math.floor((CARD_W - labelWidth("Led")) / 2), CARD_H - LABEL_CELL.h - 1, "Led", PALETTE.sun));
    }
    if (play.card.targetable || play.card.selected) {
      container.add(scene.add.rectangle(-1, -1, CARD_W + 2, CARD_H + 2, 0, 0).setOrigin(0, 0).setStrokeStyle(2, toPhaserColor(PALETTE.turn)));
    }
    container.setSize(CARD_W, CARD_H);
    if (play.card.targetable) {
      const hit = scene.add.zone(0, 0, CARD_W, CARD_H).setOrigin(0, 0);
      hit.setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => handlers.onPick("card", play.card.id));
      container.add(hit);
    }
    if (i >= previousPlayCount) {
      const from = seatOrigin(model, play.seatId, dropOrigin);
      container.setPosition(from.x - CARD_W / 2, from.y);
      scene.tweens.add({
        targets: container,
        x: at.x,
        y: at.y,
        duration: DEAL_TWEEN_MS,
        onUpdate: () => container.setPosition(Math.round(container.x), Math.round(container.y)),
      });
    }
    layer.add(container);
    index.register("camp", play.card.objectId, container);
  });
}

/** The whole trick as one target (Howler Call): the stump outlined, with a
 * label, clickable anywhere. */
export function drawBoardPick(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const pick = model.boardPick;
  if (pick === null) return;
  const zone = ZONES.stump;
  const container = scene.add.container(zone.x, zone.y);
  container.add(scene.add.rectangle(1, 1, zone.w - 2, zone.h - 2, 0, 0).setOrigin(0, 0).setStrokeStyle(2, toPhaserColor(PALETTE.turn)));
  const label = pick.selected ? "This trick (picked)" : "Click to pick this trick";
  container.add(platedText(scene, Math.floor((zone.w - labelWidth(label)) / 2), zone.h - LABEL_CELL.h - 3, label, PALETTE.turn));
  container.setSize(zone.w, zone.h);
  if (pick.targetable) {
    const hit = scene.add.zone(0, 0, zone.w, zone.h).setOrigin(0, 0);
    hit.setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => handlers.onPick("board", ""));
    container.add(hit);
  }
  layer.add(container);
  index.register("camp", BOARD_ID, container);
}

/** The last trick's cards, the winner's outlined. Hovering the panel marks
 * the led card too. */
export function drawLastTrick(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const last = model.lastTrick;
  if (last === null) return;
  const zone = ZONES.lastTrick;

  const panel = scene.add.container(zone.x, zone.y);
  panel.add(plate(scene, 0, 0, zone.w, zone.h).setAlpha(PANEL_ALPHA));
  panel.add(text(scene, 3, 2, "Last trick", PALETTE.textDim));
  const fanY = 12;
  const n = last.plays.length;
  const left = Math.floor((zone.w - (MINI_W + FAN_STEP * (n - 1))) / 2);
  last.plays.forEach((play, i) => {
    const x = left + FAN_STEP * i;
    panel.add(miniCard(scene, x, fanY, play.card.label, model.cardPackId));
    if (play.seatId === last.winnerSeatId) {
      panel.add(scene.add.rectangle(x, fanY, MINI_W, MINI_H, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
    }
    if (last.open && play.isLed) panel.add(scene.add.rectangle(x, fanY + MINI_H + 1, MINI_W, 2, toPhaserColor(PALETTE.sun)).setOrigin(0, 0));
  });
  const won = `${fitLabel(nameOf(model, last.winnerSeatId), 10)} won`;
  panel.add(text(scene, 3, zone.h - LABEL_CELL.h - 3, won, last.open ? PALETTE.turn : PALETTE.text));
  panel.setSize(zone.w, zone.h);
  const hit = scene.add.zone(0, 0, zone.w, zone.h).setOrigin(0, 0);
  hit.setInteractive();
  hit.on("pointerover", () => handlers.onLastTrickHover(true));
  hit.on("pointerout", () => handlers.onLastTrickHover(false));
  panel.add(hit);
  layer.add(panel);
  index.register("camp", LAST_TRICK_ID, panel);
}
