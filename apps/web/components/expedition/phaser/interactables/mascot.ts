/**
 * Red panda mascot interactable (D-16, spec 5.4, SCENE-09): a flat
 * placeholder body plus a click bubble showing one of a short static
 * rotation of tip/joke lines (UI-SPEC Copywriting). Reactions to game
 * events (a happy bounce on a completed objective, a sad collapse on a
 * failed camp) are deferred to Phase 14 and are NOT built here. Fun only —
 * never touches game state or the server (SCENE-09).
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { WORLD_LABEL_FONT } from "../font/font-keys";
import type { InteractableDef } from "./interactable-def";

const LINES: readonly string[] = [
  "Psst - the Sun always wins.",
  "I once ate a whole supply crate.",
  "Fireflies make good snacks.",
  "The stump has seen things.",
];

const BUBBLE_LIFETIME_MS = 3000;
const BUBBLE_OFFSET_Y = -20;

/** Next-line index, per placed root — a closure-free Map keyed by the root
 * object (per the plan's own interface note), not a module-level counter. */
const LINE_INDEX = new WeakMap<Phaser.GameObjects.GameObject, number>();
/** The currently-shown bubble for a root, if any, so a second click (or the
 * lifetime timer) can dismiss the right one. */
const ACTIVE_BUBBLE = new WeakMap<Phaser.GameObjects.GameObject, Phaser.GameObjects.BitmapText>();

function place(scene: Phaser.Scene, anchor: { x: number; y: number }): Phaser.GameObjects.GameObject {
  const x = Math.round(anchor.x);
  const y = Math.round(anchor.y);
  const container = scene.add.container(x, y);

  const body = scene.add.ellipse(0, 4, 18, 12, toPhaserColor(PALETTE.sun));
  const label = scene.add.bitmapText(0, -8, WORLD_LABEL_FONT, "Panda").setOrigin(0.5);
  container.add([body, label]);

  container.setSize(20, 20);
  container.setInteractive({ useHandCursor: true });
  return container;
}

function dismissBubble(root: Phaser.GameObjects.GameObject): void {
  const bubble = ACTIVE_BUBBLE.get(root);
  if (bubble) {
    bubble.destroy();
    ACTIVE_BUBBLE.delete(root);
  }
}

function onClick(scene: Phaser.Scene, root: Phaser.GameObjects.GameObject): void {
  dismissBubble(root);

  const index = LINE_INDEX.get(root) ?? 0;
  const line = LINES[index % LINES.length]!;
  LINE_INDEX.set(root, index + 1);

  const container = root as Phaser.GameObjects.Container;
  const bubble = scene.add
    .bitmapText(container.x, container.y + BUBBLE_OFFSET_Y, WORLD_LABEL_FONT, line)
    .setOrigin(0.5)
    .setDepth(1000);
  ACTIVE_BUBBLE.set(root, bubble);

  scene.time.delayedCall(BUBBLE_LIFETIME_MS, () => {
    if (ACTIVE_BUBBLE.get(root) === bubble) {
      bubble.destroy();
      ACTIVE_BUBBLE.delete(root);
    }
  });
}

export const mascot: InteractableDef = {
  id: "mascot",
  place,
  onClick,
  lines: LINES,
};
