/**
 * Draws the viewer's hand fan, the current trick with its led marker, and
 * the last-trick glance (SCENE-02/03/04, D-06, D-10). Every card fact drawn
 * here — `playable`, `dimmed`, `targetable`, `selected`, `lifted`, `isLed` —
 * is read directly off `CardModel`/`TrickPlayModel`; this module never reads
 * the server view's own hand-legality or trick-plays fields directly, and
 * never recomputes legality (spec §7.1).
 */
import Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { WORLD_LABEL_FONT } from "../font/font-keys";
import { CARD_H, CARD_W, HAND_Y, HOVER_LIFT, MINI_H, MINI_W, handFanXs, seatAnchors, trickSlots } from "../layout";
import { cardTextureKey } from "../card-packs/card-pack-def";
import { LAST_TRICK_ID } from "../../../../lib/expedition/expedition-ids";
import type { ObjectIndex } from "../object-index";
import type { SceneModel, TrickPlayModel } from "../../../../lib/expedition/build-scene-model";
import type { CampHandlers } from "./draw-seats";

const LAST_TRICK_FAN_GAP = 16;
const DEAL_TWEEN_MS = 150;

function seatAnchorFor(model: SceneModel, seatId: string): { x: number; y: number } | null {
  const idx = model.seats.findIndex((s) => s.seatId === seatId);
  if (idx === -1) return null;
  const anchors = seatAnchors(model.seats.length);
  return anchors[idx] ?? null;
}

export function drawHand(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  model: SceneModel,
  index: ObjectIndex,
  handlers: CampHandlers,
): void {
  const xs = handFanXs(model.hand.length);

  model.hand.forEach((card, i) => {
    const x = xs[i];
    if (x === undefined) return;
    const y = HAND_Y - (card.lifted ? HOVER_LIFT : 0);
    const key = cardTextureKey(model.cardPackId, card.label, "full");
    const image = scene.add.image(Math.round(x + CARD_W / 2), Math.round(y), key).setOrigin(0.5, 0);

    image.setAlpha(1);
    if (card.dimmed) {
      image.setAlpha(0.4);
    }

    if (card.targetable || card.selected) {
      const outline = scene.add
        .rectangle(image.x, image.y + CARD_H / 2, CARD_W, CARD_H, 0, 0)
        .setStrokeStyle(1, toPhaserColor(PALETTE.turn));
      layer.add(outline);
    }

    const nextX = xs[i + 1];
    const stripWidth = nextX !== undefined ? Math.max(1, Math.round(nextX - x)) : CARD_W;
    const hitWidth = card.lifted ? CARD_W : stripWidth;
    image.setInteractive(new Phaser.Geom.Rectangle(0, 0, hitWidth, CARD_H), Phaser.Geom.Rectangle.Contains);
    image.on("pointerdown", () => handlers.onCard(card.id));
    image.on("pointerover", () => handlers.onCardHover(card.id));
    image.on("pointerout", () => handlers.onCardHover(null));

    layer.add(image);
    index.register("camp", card.objectId, image);
  });
}

function drawTrickCard(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  index: ObjectIndex,
  model: SceneModel,
  play: TrickPlayModel,
  slot: { x: number; y: number },
  isNew: boolean,
): void {
  const key = cardTextureKey(model.cardPackId, play.card.label, "full");
  const startPoint = seatAnchorFor(model, play.seatId);
  const startX = isNew && startPoint !== null ? startPoint.x : slot.x;
  const startY = isNew && startPoint !== null ? startPoint.y : slot.y;
  const image = scene.add.image(Math.round(startX), Math.round(startY), key).setOrigin(0.5, 0.5);

  if (isNew && startPoint !== null) {
    scene.tweens.add({
      targets: image,
      x: Math.round(slot.x),
      y: Math.round(slot.y),
      duration: DEAL_TWEEN_MS,
      onUpdate: () => {
        image.x = Math.round(image.x);
        image.y = Math.round(image.y);
      },
    });
  }

  if (play.isLed) {
    const pennant = scene.add
      .bitmapText(Math.round(slot.x), Math.round(slot.y - CARD_H / 2 - 8), WORLD_LABEL_FONT, "LED")
      .setOrigin(0.5, 1);
    pennant.setTint(toPhaserColor(PALETTE.turn));
    layer.add(pennant);
  }

  layer.add(image);
  index.register("camp", play.card.objectId, image);
}

export function drawTrick(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  model: SceneModel,
  index: ObjectIndex,
  previous: SceneModel | null,
): void {
  const trick = model.trick;
  if (trick === null) return;
  const slots = trickSlots(trick.plays.length);
  const previousPlayCount = previous?.trick?.plays.length ?? 0;

  trick.plays.forEach((play, i) => {
    const slot = slots[i];
    if (slot === undefined) return;
    const isNew = i >= previousPlayCount;
    drawTrickCard(scene, layer, index, model, play, slot, isNew);
  });
}

export function drawLastTrick(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  model: SceneModel,
  index: ObjectIndex,
  handlers: CampHandlers,
): void {
  const lastTrick = model.lastTrick;
  if (lastTrick === null) return;

  const winnerAnchor = seatAnchorFor(model, lastTrick.winnerSeatId);
  if (winnerAnchor === null) return;

  const pileContainer = scene.add.container(Math.round(winnerAnchor.x), Math.round(winnerAnchor.y - CARD_H));
  const pileBack = scene.add
    .rectangle(0, 0, MINI_W, MINI_H, toPhaserColor(PALETTE.cardBack))
    .setStrokeStyle(1, toPhaserColor(PALETTE.cardEdge));
  pileContainer.add(pileBack);
  pileContainer.setSize(MINI_W, MINI_H);
  pileContainer.setInteractive({ useHandCursor: true });
  pileContainer.on("pointerover", () => handlers.onLastTrickHover(true));
  pileContainer.on("pointerout", () => handlers.onLastTrickHover(false));
  layer.add(pileContainer);
  index.register("camp", LAST_TRICK_ID, pileContainer);

  if (!lastTrick.open) return;

  lastTrick.plays.forEach((play, i) => {
    const x = winnerAnchor.x + (i - (lastTrick.plays.length - 1) / 2) * LAST_TRICK_FAN_GAP;
    const y = winnerAnchor.y - CARD_H - MINI_H;
    const key = cardTextureKey(model.cardPackId, play.card.label, "mini");
    const image = scene.add.image(Math.round(x), Math.round(y), key).setOrigin(0.5);
    layer.add(image);

    if (play.isLed) {
      const marker = scene.add.bitmapText(Math.round(x), Math.round(y - MINI_H), WORLD_LABEL_FONT, "L").setOrigin(0.5, 1);
      layer.add(marker);
    }
    if (play.seatId === lastTrick.winnerSeatId) {
      const outline = scene.add
        .rectangle(Math.round(x), Math.round(y), MINI_W, MINI_H, 0, 0)
        .setStrokeStyle(1, toPhaserColor(PALETTE.turn));
      layer.add(outline);
    }
  });
}
