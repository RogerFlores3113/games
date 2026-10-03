/**
 * Red panda mascot interactable (D-16, spec 5.4, SCENE-09): the idling
 * panda plus a click bubble showing one of a short static rotation of
 * tip/joke lines (UI-SPEC Copywriting); each click also plays the cheer or
 * the flop strip, alternating, before it settles back to idle. Reactions
 * to game events (a happy bounce on a completed objective, a sad collapse
 * on a failed camp) are not built here. Fun only —
 * never touches game state or the server (SCENE-09).
 */
import type Phaser from "phaser";
import { WORLD_LABEL_FONT } from "../font/font-keys";
import { PALETTE, toPhaserColor } from "../palette";
import { PANEL_ALPHA } from "../draw/ui-kit";
import { ART } from "../art/art-registry";
import { placeArt, playArtThenIdle } from "../art/place-art";
import { ZONES } from "../layout";
import type { InteractableDef } from "./interactable-def";

const LINES: readonly string[] = [
  "Psst - the Sun always wins.",
  "I once ate a whole supply crate.",
  "Fireflies make good snacks.",
  "The stump has seen things.",
];

const BUBBLE_LIFETIME_MS = 3000;
const BUBBLE_GAP = 2;
/** Clicks alternate between these reactions. */
const REACTIONS = ["mascot-cheer", "mascot-flop"] as const;

/** Next-line index, per placed root — a closure-free Map keyed by the root
 * object (per the plan's own interface note), not a module-level counter. */
const LINE_INDEX = new WeakMap<Phaser.GameObjects.GameObject, number>();
/** The currently-shown bubble for a root, if any, so a second click (or the
 * lifetime timer) can dismiss the right one. */
const ACTIVE_BUBBLE = new WeakMap<Phaser.GameObjects.GameObject, Phaser.GameObjects.Container>();

const PANDA = new WeakMap<Phaser.GameObjects.GameObject, Phaser.GameObjects.Sprite>();

function place(scene: Phaser.Scene, anchor: { x: number; y: number }): Phaser.GameObjects.GameObject {
  const x = Math.round(anchor.x);
  const y = Math.round(anchor.y);
  const container = scene.add.container(x, y);

  const art = ART["mascot-panda"];
  const panda = placeArt(scene, "mascot-panda", 0, 0);
  container.add(panda);
  PANDA.set(container, panda);
  container.setSize(art.w, art.h);
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
  const panda = PANDA.get(root);
  if (panda !== undefined) playArtThenIdle(panda, REACTIONS[index % REACTIONS.length]!, 2, "mascot-panda");

  const container = root as Phaser.GameObjects.Container;
  // Wrapped and right-aligned inside the actions zone so it never leaves the
  // stage.
  const zone = ZONES.actions;
  const right = zone.x + zone.w - 2;
  const bottom = container.y - ART["mascot-panda"].h / 2 - BUBBLE_GAP - 1;
  const words = scene.add.bitmapText(right, bottom, WORLD_LABEL_FONT, line).setMaxWidth(zone.w - 4).setOrigin(1, 1);
  const backing = scene.add.rectangle(right + 2, bottom + 1, words.width + 4, words.height + 2, toPhaserColor(PALETTE.plate), PANEL_ALPHA).setOrigin(1, 1);
  const bubble = scene.add.container(0, 0, [backing, words]).setDepth(1000);
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
