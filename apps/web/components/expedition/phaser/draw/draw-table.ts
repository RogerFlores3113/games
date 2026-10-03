/**
 * The camp's world backdrop and boss effect, and the top bar, prompt line
 * and tooltip shared with the fireside. Every value drawn comes from a
 * scene model.
 */
import type Phaser from "phaser";
import { STAGE, ZONES, type Rect } from "../layout";
import type { ObjectIndex } from "../object-index";
import { SUPPLIES_ID } from "../../../../lib/expedition/expedition-ids";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL, SIGN_CELL, WORLD_SIGN_FONT } from "../font/font-keys";
import { placeArt } from "../art/place-art";
import { ART } from "../art/art-registry";
import type { BossEffect, Tooltip, TopBar } from "../../../../lib/expedition/build-scene-model";
import type { Prompt, PromptTone } from "../../../../lib/expedition/build-prompt";
import { PANEL_ALPHA, labelWidth, plate, text, type Layer } from "./ui-kit";
import { wrapWords } from "./text-fit";

const MAX_CRATES = 8;
const RAIN_DROP_COUNT = 24;
const SKY_BAND_H = 80;

/** The backdrop, drawn once per scene create(). The stump is drawn with
 * the seats, over their silhouettes. */
export function drawStaticWorld(scene: Phaser.Scene): void {
  placeArt(scene, "bg-jungle-night", STAGE.w / 2, STAGE.h / 2);
}

/** `onSupplies` makes the crates a target while an ability picks the
 * supplies. */
export function drawTopBar(scene: Phaser.Scene, layer: Layer, bar: TopBar, index?: ObjectIndex, onSupplies?: () => void): void {
  const zone = ZONES.topBar;
  layer.add(plate(scene, zone.x, zone.y, zone.w, zone.h).setAlpha(PANEL_ALPHA));
  const textY = zone.y + Math.floor((zone.h - LABEL_CELL.h) / 2);
  const crate = ART.crate;
  const crates = Math.min(bar.supplies, MAX_CRATES);
  let x = zone.x + 6;
  for (let i = 0; i < crates; i++) {
    layer.add(placeArt(scene, "crate", x + crate.w / 2, zone.y + zone.h / 2));
    x += crate.w + 2;
  }
  const suppliesLabel = `Supplies ${bar.supplies}`;
  const pick = bar.suppliesPick;
  if (pick !== null && index !== undefined) {
    const w = x + 4 + labelWidth(suppliesLabel) - zone.x - 2;
    const target = scene.add.container(zone.x + 2, zone.y + 1);
    target.add(scene.add.rectangle(0, 0, w, zone.h - 2, 0, 0).setOrigin(0, 0).setStrokeStyle(2, toPhaserColor(PALETTE.turn)));
    target.setSize(w, zone.h - 2);
    if (pick.targetable && onSupplies !== undefined) {
      const hit = scene.add.zone(0, 0, w, zone.h - 2).setOrigin(0, 0);
      hit.setInteractive({ useHandCursor: true });
      hit.on("pointerdown", onSupplies);
      target.add(hit);
    }
    layer.add(target);
    index.register("camp", SUPPLIES_ID, target);
  }
  layer.add(text(scene, x + 2, textY, suppliesLabel, pick?.targetable ? PALETTE.turn : PALETTE.text));

  const campX = zone.x + Math.floor((zone.w - labelWidth(bar.camp)) / 2);
  layer.add(text(scene, campX, textY, bar.camp));

  if (bar.boss !== null) {
    const bossX = Math.max(campX + labelWidth(bar.camp) + 16, zone.x + zone.w - labelWidth(bar.boss.text) - 6);
    layer.add(text(scene, bossX, textY, bar.boss.text, bar.boss.dim ? PALETTE.textDim : PALETTE.destructive));
  }
}

const TONE_COLOR: Readonly<Record<PromptTone, string>> = {
  "your-move": PALETTE.text,
  waiting: PALETTE.textDim,
  info: PALETTE.text,
  alert: PALETTE.destructive,
};

export function drawPrompt(scene: Phaser.Scene, layer: Layer, prompt: Prompt): void {
  const zone = ZONES.prompt;
  const bg = plate(scene, zone.x, zone.y, zone.w, zone.h);
  if (prompt.tone === "your-move") bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  layer.add(bg);
  const w = Array.from(prompt.text).length * SIGN_CELL.w;
  const line = scene.add
    .bitmapText(zone.x + Math.floor((zone.w - w) / 2), zone.y + Math.floor((zone.h - SIGN_CELL.h) / 2), WORLD_SIGN_FONT, prompt.text)
    .setTint(toPhaserColor(TONE_COLOR[prompt.tone]));
  layer.add(line);
}

/** Title and badges on the first line, the one-sentence text under it,
 * and why it can't be used now last, in red. */
export function drawTooltip(scene: Phaser.Scene, layer: Layer, tip: Tooltip | null, zone: Rect): void {
  if (tip === null) return;
  const maxChars = Math.floor((zone.w - 4) / LABEL_CELL.w);
  const maxLines = Math.floor(zone.h / LABEL_CELL.h);
  const badges = tip.badges.length > 0 ? `  ${tip.badges.join(" | ")}` : "";
  const head = tip.text === "" ? null : fitLabelTo(tip.title, maxChars);
  const body = tip.text === "" ? [] : wrapWords(tip.text, maxChars);
  const reasonText = tip.text === "" ? `${tip.title}: ${tip.reason}` : `Not now: ${tip.reason}`;
  const reason = tip.reason === null ? [] : wrapWords(reasonText, maxChars).slice(0, 1);
  const room = maxLines - (head === null ? 0 : 1) - reason.length;
  layer.add(plate(scene, zone.x, zone.y, zone.w, zone.h));
  let y = zone.y;
  if (head !== null) {
    layer.add(text(scene, zone.x + 2, y, head, PALETTE.sun));
    const shownBadges = badges.slice(0, Math.max(0, maxChars - head.length));
    if (shownBadges.trim() !== "") layer.add(text(scene, zone.x + 2 + labelWidth(head), y, shownBadges, PALETTE.textDim));
    y += LABEL_CELL.h;
  }
  for (const line of body.slice(0, room)) {
    layer.add(text(scene, zone.x + 2, y, line));
    y += LABEL_CELL.h;
  }
  for (const line of reason) {
    layer.add(text(scene, zone.x + 2, y, line, PALETTE.destructive));
    y += LABEL_CELL.h;
  }
}

function fitLabelTo(value: string, maxChars: number): string {
  return Array.from(value).length <= maxChars ? value : `${Array.from(value).slice(0, maxChars - 1).join("")}…`;
}

interface BossEffectState {
  container: Phaser.GameObjects.Container;
  tweens: Phaser.Tweens.Tween[];
}

const BOSS_EFFECT_STATE = new WeakMap<Phaser.Scene, BossEffectState>();

/** A persistent boss-twist effect: "rain" is a looping drop shower,
 * "dark-sky" a translucent tint over the top of the stage. Idempotent. */
export function setBossEffect(scene: Phaser.Scene, effect: BossEffect): void {
  const previous = BOSS_EFFECT_STATE.get(scene);
  if (previous) {
    for (const tween of previous.tweens) tween.stop();
    previous.container.destroy();
    BOSS_EFFECT_STATE.delete(scene);
  }
  if (effect === "none") return;

  const container = scene.add.container(0, 0);
  const tweens: Phaser.Tweens.Tween[] = [];

  if (effect === "rain") {
    for (let i = 0; i < RAIN_DROP_COUNT; i++) {
      const x = Math.round(Math.random() * STAGE.w);
      const startY = Math.round(Math.random() * STAGE.h);
      const drop = scene.add.rectangle(x, startY, 1, 1, toPhaserColor(PALETTE.rain));
      container.add(drop);
      const duration = 1000 + Math.round(Math.random() * 500);
      tweens.push(
        scene.tweens.add({
          targets: drop,
          y: { from: 0, to: STAGE.h },
          duration,
          repeat: -1,
          onUpdate: () => {
            drop.y = Math.round(drop.y);
          },
        }),
      );
    }
  } else if (effect === "dark-sky") {
    container.add(scene.add.rectangle(STAGE.w / 2, SKY_BAND_H / 2, STAGE.w, SKY_BAND_H, toPhaserColor(PALETTE.letterbox), 0.5));
  }

  BOSS_EFFECT_STATE.set(scene, { container, tweens });
}
