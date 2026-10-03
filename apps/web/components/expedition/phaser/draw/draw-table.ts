/**
 * The camp's world backdrop and boss effect, and the top bar, prompt line
 * and tooltip shared with the fireside. Every value drawn comes from a
 * scene model.
 */
import type Phaser from "phaser";
import { STAGE, STUMP_CENTRE, ZONES, type Rect } from "../layout";
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

/** Backdrop and stump, drawn once per scene create(). */
export function drawStaticWorld(scene: Phaser.Scene): void {
  placeArt(scene, "bg-jungle-night", STAGE.w / 2, STAGE.h / 2);
  placeArt(scene, "stump-table", STUMP_CENTRE.x, STUMP_CENTRE.y);
}

export function drawTopBar(scene: Phaser.Scene, layer: Layer, bar: TopBar): void {
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
  layer.add(text(scene, x + 2, textY, `Supplies ${bar.supplies}`));

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

export function drawTooltip(scene: Phaser.Scene, layer: Layer, tip: Tooltip | null, zone: Rect): void {
  if (tip === null) return;
  const maxChars = Math.floor((zone.w - 4) / LABEL_CELL.w);
  const maxLines = Math.floor(zone.h / LABEL_CELL.h);
  const body = wrapWords(`${tip.title}: ${tip.text}`, maxChars);
  const reason = tip.reason === null ? [] : wrapWords(`Not now: ${tip.reason}`, maxChars).slice(0, 1);
  const lines = [...body.slice(0, maxLines - reason.length), ...reason];
  layer.add(plate(scene, zone.x, zone.y, zone.w, zone.h));
  lines.forEach((line, i) => {
    const isReason = i >= lines.length - reason.length;
    layer.add(text(scene, zone.x + 2, zone.y + i * LABEL_CELL.h, line, isReason ? PALETTE.destructive : PALETTE.text));
  });
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
