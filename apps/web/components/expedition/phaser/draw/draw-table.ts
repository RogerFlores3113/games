/**
 * The camp scene's static-world and HUD drawing primitives (D-03, D-13,
 * D-15). Every colour comes from `PALETTE`, every position from `layout.ts`
 * — no hand-typed hex literal or magic coordinate at a draw call site.
 * `phaser` is a type-only import; every Phaser API used here is reached
 * through the injected `scene`, matching `card-textures.ts`'s convention.
 */
import type Phaser from "phaser";
import { HUD, STUMP } from "../layout";
import { PALETTE, toPhaserColor } from "../palette";
import { SIGN_CELL, WORLD_LABEL_FONT, WORLD_SIGN_FONT } from "../font/font-keys";
import type { BossEffect, SceneModel } from "../../../../lib/expedition/build-scene-model";

const STAGE_W = 640;
const STAGE_H = 360;
const SKY_BAND_H = 80;

const SUPPLY_CRATE_W = 10;
const SUPPLY_CRATE_H = 8;
const SUPPLY_CRATE_GAP = 2;

const SIGN_W = 140;
const SIGN_PADDING = 4;

const RAIN_DROP_COUNT = 24;

/** The jungle backdrop, a darker "sky" band across the top, and the oval
 * stump table — drawn once per scene create(), never re-drawn per model
 * update (it never changes). */
export function drawStaticWorld(scene: Phaser.Scene): void {
  const graphics = scene.add.graphics();
  graphics.fillStyle(toPhaserColor(PALETTE.jungle), 1);
  graphics.fillRect(0, 0, STAGE_W, STAGE_H);
  graphics.fillStyle(toPhaserColor(PALETTE.letterbox), 1);
  graphics.fillRect(0, 0, STAGE_W, SKY_BAND_H);
  graphics.fillStyle(toPhaserColor(PALETTE.stump), 1);
  graphics.fillEllipse(STUMP.x, STUMP.y, STUMP.rx * 2, STUMP.ry * 2);
}

/** Supply crates, the camp-number counter, and the wooden sign (window
 * label + boss-twist name), drawn into `layer` — a Container the caller
 * clears and rebuilds on every model change. */
export function drawHud(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, model: SceneModel): void {
  for (let i = 0; i < model.supplies; i++) {
    const crateX = Math.round(HUD.supplies.x + i * (SUPPLY_CRATE_W + SUPPLY_CRATE_GAP) + SUPPLY_CRATE_W / 2);
    const crateY = Math.round(HUD.supplies.y + SUPPLY_CRATE_H / 2);
    layer.add(scene.add.rectangle(crateX, crateY, SUPPLY_CRATE_W, SUPPLY_CRATE_H, toPhaserColor(PALETTE.stump)));
  }
  layer.add(
    scene.add.bitmapText(HUD.supplies.x, HUD.supplies.y + SUPPLY_CRATE_H + 2, WORLD_LABEL_FONT, `x${model.supplies}`),
  );

  layer.add(scene.add.bitmapText(HUD.campNumber.x, HUD.campNumber.y, WORLD_LABEL_FONT, `Camp ${model.campNumber}/6`));

  const signHasTwist = model.sign.twistName !== null;
  const signH = signHasTwist ? SIGN_CELL.h * 2 + SIGN_PADDING * 2 : SIGN_CELL.h + SIGN_PADDING * 2;
  layer.add(
    scene.add.rectangle(
      Math.round(HUD.sign.x + SIGN_W / 2),
      Math.round(HUD.sign.y + signH / 2),
      SIGN_W,
      signH,
      toPhaserColor(PALETTE.stump),
    ),
  );
  layer.add(scene.add.bitmapText(HUD.sign.x + SIGN_PADDING, HUD.sign.y + SIGN_PADDING, WORLD_SIGN_FONT, model.sign.label));
  if (model.sign.twistName !== null) {
    layer.add(
      scene.add.bitmapText(
        HUD.sign.x + SIGN_PADDING,
        HUD.sign.y + SIGN_PADDING + SIGN_CELL.h,
        WORLD_SIGN_FONT,
        model.sign.twistName,
      ),
    );
  }
}

interface BossEffectState {
  container: Phaser.GameObjects.Container;
  tweens: Phaser.Tweens.Tween[];
}

const BOSS_EFFECT_STATE = new WeakMap<Phaser.Scene, BossEffectState>();

/** Manages a persistent boss-twist placeholder effect (D-15): "rain" is a
 * looping downward drop shower, "dark-sky" a translucent tint over the sky
 * band, "none" removes whatever effect was previously active. Idempotent —
 * safe to call on every model update with the same `effect` value. */
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
      const x = Math.round(Math.random() * STAGE_W);
      const startY = Math.round(Math.random() * STAGE_H);
      const drop = scene.add.rectangle(x, startY, 1, 1, toPhaserColor(PALETTE.rain));
      container.add(drop);
      const duration = 1000 + Math.round(Math.random() * 500);
      const tween = scene.tweens.add({
        targets: drop,
        y: { from: 0, to: STAGE_H },
        duration,
        repeat: -1,
        onUpdate: () => {
          drop.y = Math.round(drop.y);
        },
      });
      tweens.push(tween);
    }
  } else if (effect === "dark-sky") {
    container.add(
      scene.add.rectangle(STAGE_W / 2, SKY_BAND_H / 2, STAGE_W, SKY_BAND_H, toPhaserColor(PALETTE.letterbox), 0.5),
    );
  }

  BOSS_EFFECT_STATE.set(scene, { container, tweens });
}
