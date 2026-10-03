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
  TRICK_CARD_TOP,
  TRICK_STEP,
  ZONES,
  centreOf,
  handFanXs,
  opponentBlocks,
  stumpRowXs,
  type Point,
} from "../layout";
import { cardBackTextureKey, cardTextureKey } from "../card-packs/card-pack-def";
import { LAST_TRICK_ID } from "../../../../lib/expedition/expedition-ids";
import type { ObjectIndex } from "../object-index";
import type { CardModel, SceneModel } from "../../../../lib/expedition/build-scene-model";
import type { CampHandlers } from "./camp-handlers";
import { fitLabel } from "./text-fit";
import { DIM_ALPHA, PANEL_ALPHA, labelWidth, miniCard, plate, platedText, text, type Layer } from "./ui-kit";

const DEAL_TWEEN_MS = 150;
const TRICK_NAME_CHARS = 7;
const FAN_STEP = 16;
const TRAY_PAD = 3;

/** Where a seat's played card flies in from: its opponent block, or your hand. */
function seatOrigin(model: SceneModel, seatId: string): Point {
  const opponents = model.seats.filter((s) => !s.isYou);
  const i = opponents.findIndex((s) => s.seatId === seatId);
  if (i === -1) return centreOf(ZONES.hand);
  return centreOf(opponentBlocks(opponents.length)[i]!);
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
  hit.on("pointerdown", () => handlers.onCard(card.id));
  hit.on("pointerover", () => handlers.onCardHover(card.id));
  hit.on("pointerout", () => handlers.onCardHover(null));
  layer.add(hit);
  index.register("camp", card.objectId, hit);
}

export function drawTrick(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, previous: SceneModel | null): void {
  const trick = model.trick;
  if (trick === null || trick.plays.length === 0) return;
  const xs = stumpRowXs(trick.plays.length, TRICK_STEP);
  const previousPlayCount = previous?.trick?.plays.length ?? 0;

  trick.plays.forEach((play, i) => {
    const x = xs[i]!;
    const image = scene.add.image(x, TRICK_CARD_TOP, cardTextureKey(model.cardPackId, play.card.label, "full")).setOrigin(0.5, 0);
    if (i >= previousPlayCount) {
      const from = seatOrigin(model, play.seatId);
      image.setPosition(from.x, from.y);
      scene.tweens.add({
        targets: image,
        x,
        y: TRICK_CARD_TOP,
        duration: DEAL_TWEEN_MS,
        onUpdate: () => image.setPosition(Math.round(image.x), Math.round(image.y)),
      });
    }
    layer.add(image);
    index.register("camp", play.card.objectId, image);

    const name = fitLabel(nameOf(model, play.seatId), TRICK_NAME_CHARS);
    layer.add(platedText(scene, x - Math.floor(labelWidth(name) / 2), TRICK_CARD_TOP + CARD_H + 3, name));
    if (play.isLed) {
      layer.add(platedText(scene, x - Math.floor(labelWidth("Led") / 2), TRICK_CARD_TOP - LABEL_CELL.h - 2, "Led", PALETTE.sun));
    }
  });
}

export function drawLastTrick(scene: Phaser.Scene, layer: Layer, model: SceneModel, index: ObjectIndex, handlers: CampHandlers): void {
  const last = model.lastTrick;
  if (last === null) return;
  const zone = ZONES.lastTrick;
  const right = zone.x + zone.w - 2;

  layer.add(plate(scene, zone.x, zone.y, zone.w, zone.h).setAlpha(PANEL_ALPHA));
  layer.add(text(scene, right - labelWidth("Last trick"), zone.y + 1, "Last trick", PALETTE.textDim));

  const pileX = right - MINI_W - 4;
  const pileY = zone.y + 11;
  const pile = scene.add.container(pileX + MINI_W / 2, pileY + MINI_H / 2);
  pile.add(scene.add.image(0, 0, cardBackTextureKey(model.cardPackId, "mini")));
  pile.setSize(MINI_W + 8, MINI_H + 4);
  pile.setInteractive({ useHandCursor: true });
  pile.on("pointerover", () => handlers.onLastTrickHover(true));
  pile.on("pointerout", () => handlers.onLastTrickHover(false));
  layer.add(pile);
  index.register("camp", LAST_TRICK_ID, pile);

  const won = `${fitLabel(nameOf(model, last.winnerSeatId), 12)} won`;
  layer.add(text(scene, right - labelWidth(won), zone.y + zone.h - LABEL_CELL.h - 2, won));

  if (!last.open) return;
  const n = last.plays.length;
  last.plays.forEach((play, i) => {
    const x = pileX - 8 - MINI_W - FAN_STEP * (n - 1 - i);
    layer.add(miniCard(scene, x, pileY, play.card.label, model.cardPackId));
    if (play.seatId === last.winnerSeatId) {
      layer.add(scene.add.rectangle(x, pileY, MINI_W, MINI_H, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
    }
    if (play.isLed) {
      layer.add(text(scene, x + MINI_W / 2 - Math.floor(labelWidth("Led") / 2), pileY + MINI_H + 2, "Led", PALETTE.sun));
    }
  });
}
