/**
 * Fireflies interactable (D-16, spec 5.4): 5-7 small glowing pixels
 * drifting near the anchor in a fixed, looping tween. Clicking scatters
 * them outward, then they tween back to their drift positions. Fixed dot
 * count, no spawning (T-12-15: no unbounded object growth). Fun only —
 * never touches game state or the server (SCENE-09).
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import type { InteractableDef } from "./interactable-def";

const FIREFLY_COUNT = 6;
const DRIFT_RADIUS = 8;
const DRIFT_WOBBLE = 3;
const DRIFT_DURATION_MS = 1400;
const SCATTER_RADIUS = 20;
const SCATTER_DURATION_MS = 280;

interface FireflyDot {
  dot: Phaser.GameObjects.Ellipse;
  homeX: number;
  homeY: number;
}

/** Keyed by each entry's own container root — never a module-level array —
 * so multiple placed instances (unlikely for this fun-only entry, but kept
 * consistent with mascot.ts's per-root state pattern) never share state. */
const DOTS = new WeakMap<Phaser.GameObjects.GameObject, FireflyDot[]>();

function place(scene: Phaser.Scene, anchor: { x: number; y: number }): Phaser.GameObjects.GameObject {
  const x = Math.round(anchor.x);
  const y = Math.round(anchor.y);
  const container = scene.add.container(x, y);
  const color = toPhaserColor(PALETTE.done);

  const dots: FireflyDot[] = [];
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const angleDeg = (360 / FIREFLY_COUNT) * i;
    const rad = (angleDeg * Math.PI) / 180;
    const homeX = Math.round(Math.cos(rad) * DRIFT_RADIUS);
    const homeY = Math.round(Math.sin(rad) * DRIFT_RADIUS);
    const dot = scene.add.ellipse(homeX, homeY, 2, 2, color);
    container.add(dot);
    dots.push({ dot, homeX, homeY });

    scene.tweens.add({
      targets: dot,
      x: homeX + Math.round(Math.cos(rad) * DRIFT_WOBBLE),
      y: homeY + Math.round(Math.sin(rad) * DRIFT_WOBBLE),
      duration: DRIFT_DURATION_MS + i * 60,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }
  DOTS.set(container, dots);

  const span = (DRIFT_RADIUS + DRIFT_WOBBLE) * 2;
  container.setSize(span, span);
  container.setInteractive({ useHandCursor: true });
  return container;
}

function onClick(scene: Phaser.Scene, root: Phaser.GameObjects.GameObject): void {
  const dots = DOTS.get(root);
  if (!dots) return;

  for (const { dot, homeX, homeY } of dots) {
    const angle = Math.atan2(homeY || 1, homeX || 1) + (Math.random() - 0.5);
    const outX = homeX + Math.round(Math.cos(angle) * SCATTER_RADIUS);
    const outY = homeY + Math.round(Math.sin(angle) * SCATTER_RADIUS);

    scene.tweens.add({
      targets: dot,
      x: outX,
      y: outY,
      duration: SCATTER_DURATION_MS,
      ease: "Cubic.Out",
      yoyo: true,
      onYoyo: () => {
        dot.setPosition(outX, outY);
      },
      onComplete: () => {
        dot.setPosition(homeX, homeY);
      },
    });
  }
}

export const fireflies: InteractableDef = {
  id: "fireflies",
  place,
  onClick,
};
