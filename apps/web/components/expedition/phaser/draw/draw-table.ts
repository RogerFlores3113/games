/**
 * The camp's world backdrop, top bar, prompt line, tooltip and boss effect.
 * Every value drawn comes from `SceneModel`.
 */
import type Phaser from "phaser";
import { STAGE, STUMP_CENTRE, ZONES } from "../layout";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL, SIGN_CELL, WORLD_SIGN_FONT } from "../font/font-keys";
import { placeArt } from "../art/place-art";
import { ART } from "../art/art-registry";
import type { BossEffect, SceneModel } from "../../../../lib/expedition/build-scene-model";
import type { PromptTone } from "../../../../lib/expedition/build-prompt";
import { labelWidth, plate, text, type Layer } from "./ui-kit";
import { wrapWords } from "./text-fit";

const MAX_CRATES = 8;
const BOSS_CAMPS = new Set([3, 6]);
const RAIN_DROP_COUNT = 24;
const SKY_BAND_H = 80;

/** Backdrop and stump, drawn once per scene create(). */
export function drawStaticWorld(scene: Phaser.Scene): void {
  placeArt(scene, "bg-jungle-night", STAGE.w / 2, STAGE.h / 2);
  placeArt(scene, "stump-table", STUMP_CENTRE.x, STUMP_CENTRE.y);
}

export function drawTopBar(scene: Phaser.Scene, layer: Layer, model: SceneModel): void {
  const zone = ZONES.topBar;
  const textY = zone.y + Math.floor((zone.h - LABEL_CELL.h) / 2);
  const crate = ART.crate;
  const crates = Math.min(model.supplies, MAX_CRATES);
  let x = zone.x + 6;
  for (let i = 0; i < crates; i++) {
    layer.add(placeArt(scene, "crate", x + crate.w / 2, zone.y + zone.h / 2));
    x += crate.w + 2;
  }
  layer.add(text(scene, x + 2, textY, `Supplies ${model.supplies}`));

  const camp = BOSS_CAMPS.has(model.campNumber) ? `Camp ${model.campNumber} of 6 - Boss camp` : `Camp ${model.campNumber} of 6`;
  const campX = zone.x + Math.floor((zone.w - labelWidth(camp)) / 2);
  layer.add(text(scene, campX, textY, camp));

  if (model.bossTwist !== null) {
    const boss = model.bossTwist.cancelled ? `Boss: ${model.bossTwist.name} (off)` : `Boss: ${model.bossTwist.name}`;
    const bossX = Math.max(campX + labelWidth(camp) + 16, zone.x + zone.w - labelWidth(boss) - 6);
    layer.add(text(scene, bossX, textY, boss, model.bossTwist.cancelled ? PALETTE.textDim : PALETTE.destructive));
  }
}

const TONE_COLOR: Readonly<Record<PromptTone, string>> = {
  "your-move": PALETTE.text,
  waiting: PALETTE.textDim,
  info: PALETTE.text,
  alert: PALETTE.destructive,
};

export function drawPrompt(scene: Phaser.Scene, layer: Layer, model: SceneModel): void {
  const zone = ZONES.prompt;
  const bg = plate(scene, zone.x, zone.y, zone.w, zone.h);
  if (model.prompt.tone === "your-move") bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  layer.add(bg);
  const value = model.prompt.text;
  const w = Array.from(value).length * SIGN_CELL.w;
  const line = scene.add
    .bitmapText(zone.x + Math.floor((zone.w - w) / 2), zone.y + Math.floor((zone.h - SIGN_CELL.h) / 2), WORLD_SIGN_FONT, value)
    .setTint(toPhaserColor(TONE_COLOR[model.prompt.tone]));
  layer.add(line);
}

export function drawTooltip(scene: Phaser.Scene, layer: Layer, model: SceneModel): void {
  const tip = model.tooltip;
  if (tip === null) return;
  const zone = ZONES.tooltip;
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
