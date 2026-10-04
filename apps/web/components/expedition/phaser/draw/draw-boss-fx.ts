/**
 * What a disaster does between tricks, played once each: the Wildfire's
 * burned card charring to ash and the Meteor's streak vaporizing the would-be
 * winner, a Tornado gust carrying your cards to the teammate on your right
 * while the cards you got glow, an Earthquake shaking the table while the
 * open objectives slide to their new owners, and a toast saying what
 * happened. Each is keyed (the trick, the log entry), so a redraw never plays
 * it again; what was already on the table when the scene first drew it is
 * never played.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { CARD_H, CARD_W, HAND_CARD_Y, MINI_H, MINI_W, STUMP_CENTRE, ZONES, centreOf, handFanXs, type Point } from "../layout";
import { cardTextureKey } from "../card-packs/card-pack-def";
import type { ObjectIndex } from "../object-index";
import type { ObjectiveChip, SceneModel } from "../../../../lib/expedition/build-scene-model";
import { cardSpot } from "./draw-hand-trick";
import { seatRect } from "./draw-seats";
import { PANEL_ALPHA, labelWidth, miniCard, plate, text, type Layer } from "./ui-kit";

const BURN_MS = 900;
const ASH_COUNT = 14;
const STREAK_MS = 260;
const VAPOR_MS = 420;
const FLIGHT_MS = 650;
const FLIGHT_STAGGER_MS = 90;
const GLOW_MS = 1600;
const SHAKE_MS = 450;
const SHAKE_INTENSITY = 0.008;
const SLIDE_MS = 700;
const TOAST_HOLD_MS = 2600;
const TOAST_FADE_MS = 400;
const TOAST_PAD = 4;
const TOAST_GAP = 3;
const TOAST_MAX_W = 432;
const EMBER = 0x3a1608;

/** Where every objective chip stands, by objective id. */
export type ChipSpots = ReadonlyMap<string, Point>;

function objectiveChips(model: SceneModel): ObjectiveChip[] {
  return [...model.seats.flatMap((s) => s.objectives), ...model.faceUpObjectives];
}

export class BossFx {
  private readonly played = new Set<string>();
  /** Objective chips whose ghost is still sliding: hidden until it lands. */
  private readonly sliding = new Set<string>();
  private toastsShown = 0;
  private seeded = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Layer,
    private readonly index: ObjectIndex,
  ) {}

  /** Before a redraw: where each objective chip stands now. */
  chipSpots(model: SceneModel | null): ChipSpots {
    const spots = new Map<string, Point>();
    if (model === null) return spots;
    for (const chip of objectiveChips(model)) {
      const at = this.index.positionOf(chip.objectId);
      if (at !== null) spots.set(chip.objectiveId, at);
    }
    return spots;
  }

  /** After a redraw: plays whatever is new since the last one. */
  play(model: SceneModel, previous: SceneModel | null, before: ChipSpots): void {
    const keys = this.keysOf(model);
    if (!this.seeded) {
      this.seeded = true;
      for (const key of keys) this.played.add(key);
      return;
    }
    const fresh = (key: string): boolean => {
      if (this.played.has(key)) return false;
      this.played.add(key);
      return true;
    };
    const last = model.lastTrick;
    if (last !== null && fresh(`trick:${last.key}`)) {
      for (const play of last.plays.filter((p) => p.burned)) {
        if (last.burn === "vaporize") this.vaporize(model, play.seatId, play.card.label);
        else this.burn(model, play.seatId, play.card.label);
      }
    }
    if (model.gust !== null && fresh(`gust:${model.gust.key}`)) this.gust(model, previous);
    const fresher = model.happenings.filter((h) => fresh(h.key));
    if (fresher.some((h) => h.kind === "quake")) this.quake(model, previous, before);
    for (const happening of fresher) this.toast(happening.text, happening.cards, model);
  }

  /** Keeps a sliding chip hidden through redraws until its ghost lands. */
  afterDraw(): void {
    for (const objectId of this.sliding) this.index.setVisible(objectId, false);
  }

  private keysOf(model: SceneModel): string[] {
    return [
      ...(model.lastTrick === null ? [] : [`trick:${model.lastTrick.key}`]),
      ...(model.gust === null ? [] : [`gust:${model.gust.key}`]),
      ...model.happenings.map((h) => h.key),
    ];
  }

  private card(model: SceneModel, label: string, at: Point): Phaser.GameObjects.Image {
    const image = this.scene.add.image(at.x + CARD_W / 2, at.y + CARD_H / 2, cardTextureKey(model.cardPackId, label, "full"));
    this.layer.add(image);
    return image;
  }

  /** The burned card chars and crumbles to ash where it lay. */
  private burn(model: SceneModel, seatId: string, label: string): void {
    const at = cardSpot(model, seatId);
    const card = this.card(model, label, at);
    const counter = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: BURN_MS * 0.55,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        const c = (from: number, to: number) => Math.round(from + (to - from) * t);
        card.setTint((c(255, (EMBER >> 16) & 255) << 16) | (c(255, (EMBER >> 8) & 255) << 8) | c(255, EMBER & 255));
      },
    });
    this.scene.tweens.add({
      targets: card,
      alpha: 0,
      scaleY: 0.6,
      y: card.y + 8,
      delay: BURN_MS * 0.45,
      duration: BURN_MS * 0.55,
      onComplete: () => {
        counter.stop();
        card.destroy();
      },
    });
    for (let i = 0; i < ASH_COUNT; i++) {
      const color = i % 3 === 0 ? PALETTE.sun : PALETTE.textDim;
      const flake = this.scene.add.rectangle(at.x + 2 + Math.random() * (CARD_W - 4), at.y + 4 + Math.random() * (CARD_H - 8), 2, 2, toPhaserColor(color));
      this.layer.add(flake);
      this.scene.tweens.add({
        targets: flake,
        x: flake.x + (Math.random() - 0.5) * 16,
        y: flake.y + (i % 3 === 0 ? -14 : 10) - Math.random() * 6,
        alpha: 0,
        delay: BURN_MS * 0.3 + Math.random() * 200,
        duration: BURN_MS * 0.7,
        onComplete: () => flake.destroy(),
      });
    }
  }

  /** A streak falls from the sky onto the card, which flashes white and is gone. */
  private vaporize(model: SceneModel, seatId: string, label: string): void {
    const at = cardSpot(model, seatId);
    const card = this.card(model, label, at);
    const target = { x: at.x + CARD_W / 2, y: at.y + CARD_H / 2 };
    const streak = this.scene.add.graphics();
    for (const [width, color] of [[5, PALETTE.sun], [2, PALETTE.text]] as const) {
      streak.lineStyle(width, toPhaserColor(color), 1);
      streak.lineBetween(target.x + 90, target.y - 140, target.x, target.y);
    }
    this.layer.add(streak);
    this.scene.tweens.add({ targets: streak, alpha: 0, duration: STREAK_MS, delay: STREAK_MS / 2, onComplete: () => streak.destroy() });
    this.scene.time.delayedCall(STREAK_MS / 2, () => card.setTintFill(toPhaserColor(PALETTE.text)));
    this.scene.tweens.add({ targets: card, scale: 1.5, alpha: 0, delay: STREAK_MS / 2, duration: VAPOR_MS, ease: "Quad.easeOut", onComplete: () => card.destroy() });
  }

  /** Your sent cards fly from where they sat in your hand to the teammate on
   * your right; the cards you got glow in place. */
  private gust(model: SceneModel, previous: SceneModel | null): void {
    const gust = model.gust;
    if (gust === null || previous === null) return;
    const to = seatRect(model, gust.toSeatId);
    const was = handFanXs(previous.hand.length);
    gust.cards.forEach((sent, i) => {
      const slot = previous.hand.findIndex((c) => c.id === sent.cardId);
      if (slot === -1 || to === null) return;
      const card = this.card(model, sent.label, { x: was[slot]!, y: HAND_CARD_Y });
      const end = centreOf(to);
      this.scene.tweens.add({
        targets: card,
        x: end.x,
        y: end.y,
        scale: 0.5,
        angle: -200,
        alpha: { from: 1, to: 0.2 },
        delay: i * FLIGHT_STAGGER_MS,
        duration: FLIGHT_MS,
        ease: "Quad.easeIn",
        onComplete: () => card.destroy(),
      });
    });
    const known = new Set(previous.hand.map((c) => c.id));
    const now = handFanXs(model.hand.length);
    model.hand.forEach((card, i) => {
      if (known.has(card.id)) return;
      const glow = this.scene.add.rectangle(now[i]! - 1, HAND_CARD_Y - 1, CARD_W + 2, CARD_H + 2, 0, 0).setOrigin(0, 0).setStrokeStyle(2, toPhaserColor(PALETTE.turn));
      this.layer.add(glow);
      this.scene.tweens.add({ targets: glow, alpha: { from: 1, to: 0.2 }, duration: GLOW_MS / 4, yoyo: true, repeat: 1, onComplete: () => glow.destroy() });
    });
  }

  /** The table shakes; each objective that changed hands slides from its
   * old owner to its new one. */
  private quake(model: SceneModel, previous: SceneModel | null, before: ChipSpots): void {
    this.scene.cameras.main.shake(SHAKE_MS, SHAKE_INTENSITY);
    if (previous === null) return;
    const was = new Map(previous.seats.flatMap((s) => s.objectives.map((o) => [o.objectiveId, s.seatId] as const)));
    for (const chip of model.seats.flatMap((s) => s.objectives)) {
      const from = before.get(chip.objectiveId);
      const end = this.index.positionOf(chip.objectId);
      if (from === undefined || end === null || was.get(chip.objectiveId) === chip.ownerSeatId) continue;
      const ghost = this.scene.add.container(from.x, from.y);
      if (chip.kind === "win-card" || chip.kind === "ordered") ghost.add(miniCard(this.scene, 0, 0, chip.label, model.cardPackId));
      else {
        ghost.add(plate(this.scene, 0, 0, labelWidth(chip.label) + 4, MINI_H, PALETTE.stump));
        ghost.add(text(this.scene, 2, Math.floor((MINI_H - LABEL_CELL.h) / 2), chip.label));
      }
      ghost.add(this.scene.add.rectangle(-1, -1, MINI_W + 2, MINI_H + 2, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.sun)));
      this.layer.add(ghost);
      this.sliding.add(chip.objectId);
      this.scene.tweens.add({
        targets: ghost,
        x: end.x,
        y: end.y,
        delay: SHAKE_MS,
        duration: SLIDE_MS,
        ease: "Back.easeInOut",
        onComplete: () => {
          ghost.destroy();
          this.sliding.delete(chip.objectId);
          this.index.setVisible(chip.objectId, true);
        },
      });
    }
    this.afterDraw();
  }

  /** A plated line over the stump, with the cards it is about, that fades
   * after a few seconds. Toasts that arrive together stack. */
  private toast(line: string, cards: string[], model: SceneModel): void {
    const chars = Math.floor((TOAST_MAX_W - 2 * TOAST_PAD) / LABEL_CELL.w);
    const shown = Array.from(line).length > chars ? `${Array.from(line).slice(0, chars - 1).join("")}…` : line;
    const cardsW = cards.length === 0 ? 0 : cards.length * (MINI_W + 2) - 2;
    const w = Math.max(labelWidth(shown), cardsW) + 2 * TOAST_PAD;
    const h = LABEL_CELL.h + 2 * TOAST_PAD + (cards.length === 0 ? 0 : MINI_H + TOAST_GAP);
    const slot = this.toastsShown++ % 3;
    const x = Math.round(STUMP_CENTRE.x - w / 2);
    const y = ZONES.stump.y + 2 + slot * (LABEL_CELL.h + 2 * TOAST_PAD + TOAST_GAP);
    const toast = this.scene.add.container(x, y);
    toast.add(plate(this.scene, 0, 0, w, h, PALETTE.plate).setAlpha(PANEL_ALPHA + 0.1).setStrokeStyle(1, toPhaserColor(PALETTE.destructive)));
    toast.add(text(this.scene, Math.round((w - labelWidth(shown)) / 2), TOAST_PAD, shown, PALETTE.sun));
    const left = Math.round((w - cardsW) / 2);
    cards.forEach((label, i) => toast.add(miniCard(this.scene, left + i * (MINI_W + 2), TOAST_PAD + LABEL_CELL.h + TOAST_GAP, label, model.cardPackId)));
    this.layer.add(toast);
    this.scene.tweens.add({
      targets: toast,
      alpha: { from: 1, to: 0 },
      delay: TOAST_HOLD_MS,
      duration: TOAST_FADE_MS,
      onComplete: () => {
        toast.destroy();
        this.toastsShown = Math.max(0, this.toastsShown - 1);
      },
    });
  }
}
