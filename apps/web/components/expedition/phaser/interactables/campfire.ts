/**
 * Campfire interactable (D-16, spec 5.4): a placeholder stacked-rectangle
 * fire. Clicking it spawns 6-10 square spark pixels that tween upward and
 * fade over ~400ms, then destroy themselves (T-12-15: bounded, self-
 * cleaning spawn — never an unbounded object count). Fun only — never
 * touches game state or the server (SCENE-09).
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import type { InteractableDef } from "./interactable-def";

const SPARK_COUNT_MIN = 6;
const SPARK_COUNT_MAX = 10;
const SPARK_SIZE = 2;
const SPARK_DURATION_MS = 400;
const SPARK_SPREAD_X = 12;
const SPARK_RISE_MIN = 10;
const SPARK_RISE_MAX = 20;

function place(scene: Phaser.Scene, anchor: { x: number; y: number }): Phaser.GameObjects.GameObject {
  const x = Math.round(anchor.x);
  const y = Math.round(anchor.y);
  const container = scene.add.container(x, y);

  const logColor = toPhaserColor(PALETTE.cardEdge);
  const flameColor = toPhaserColor(PALETTE.sun);

  const log = scene.add.rectangle(0, 8, 18, 4, logColor);
  const flameBase = scene.add.rectangle(0, 0, 10, 10, flameColor);
  const flameTip = scene.add.rectangle(0, -7, 5, 7, flameColor);
  container.add([log, flameBase, flameTip]);

  container.setSize(20, 24);
  container.setInteractive({ useHandCursor: true });
  return container;
}

function onClick(scene: Phaser.Scene, root: Phaser.GameObjects.GameObject): void {
  const container = root as Phaser.GameObjects.Container;
  const originX = Math.round(container.x);
  const originY = Math.round(container.y);
  const sparkColor = toPhaserColor(PALETTE.sun);
  const count =
    SPARK_COUNT_MIN + Math.floor(Math.random() * (SPARK_COUNT_MAX - SPARK_COUNT_MIN + 1));

  for (let i = 0; i < count; i++) {
    const offsetX = Math.round((Math.random() - 0.5) * SPARK_SPREAD_X);
    const startX = originX + offsetX;
    const startY = originY - 6;
    const spark = scene.add.rectangle(startX, startY, SPARK_SIZE, SPARK_SIZE, sparkColor);
    const riseBy = Math.round(SPARK_RISE_MIN + Math.random() * (SPARK_RISE_MAX - SPARK_RISE_MIN));

    scene.tweens.add({
      targets: spark,
      y: startY - riseBy,
      alpha: 0,
      duration: SPARK_DURATION_MS,
      ease: "Cubic.Out",
      onComplete: () => spark.destroy(),
    });
  }
}

export const campfire: InteractableDef = {
  id: "campfire",
  place,
  onClick,
};
