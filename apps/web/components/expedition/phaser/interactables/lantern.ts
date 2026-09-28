/**
 * Lantern interactable (D-16, spec 5.4): a placeholder lantern on a rope.
 * Clicking it runs a damped angle swing (each pass halves the amplitude
 * until it settles back to rest). Fun only — never touches game state or
 * the server (SCENE-09).
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import type { InteractableDef } from "./interactable-def";

const SWING_START_DEGREES = 18;
const SWING_STEP_MS = 260;
const SWING_MIN_DEGREES = 1;
const SWING_DAMPING = 0.5;

function place(scene: Phaser.Scene, anchor: { x: number; y: number }): Phaser.GameObjects.GameObject {
  const x = Math.round(anchor.x);
  const y = Math.round(anchor.y);
  const container = scene.add.container(x, y);

  const ropeColor = toPhaserColor(PALETTE.cardEdge);
  const bodyColor = toPhaserColor(PALETTE.sun);

  const rope = scene.add.rectangle(0, -10, 1, 12, ropeColor);
  const body = scene.add.rectangle(0, 0, 8, 12, bodyColor);
  container.add([rope, body]);

  container.setSize(12, 24);
  container.setInteractive({ useHandCursor: true });
  return container;
}

/** One swing pass: rotate to +amplitude, then -amplitude, then recurse at
 * half the amplitude — settling back to angle 0 once the amplitude decays
 * below SWING_MIN_DEGREES. */
function swingStep(scene: Phaser.Scene, container: Phaser.GameObjects.Container, amplitude: number): void {
  if (amplitude < SWING_MIN_DEGREES) {
    container.setAngle(0);
    return;
  }
  scene.tweens.add({
    targets: container,
    angle: amplitude,
    duration: SWING_STEP_MS,
    ease: "Sine.InOut",
    onComplete: () => {
      scene.tweens.add({
        targets: container,
        angle: -amplitude,
        duration: SWING_STEP_MS,
        ease: "Sine.InOut",
        onComplete: () => swingStep(scene, container, amplitude * SWING_DAMPING),
      });
    },
  });
}

function onClick(scene: Phaser.Scene, root: Phaser.GameObjects.GameObject): void {
  const container = root as Phaser.GameObjects.Container;
  swingStep(scene, container, SWING_START_DEGREES);
}

export const lantern: InteractableDef = {
  id: "lantern",
  place,
  onClick,
};
