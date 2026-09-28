/**
 * The SCENE-09 interactable contract (D-16, spec 5.4). Every registered
 * entry is fun-only: `place` builds a click-reactive placeholder object at
 * an anchor and `onClick` runs a purely visual reaction to it. No entry may
 * import the room socket, room store, scene store, or reach the
 * action-handling chokepoint, a socket, or the network — enforced by
 * interactables.contract.test.ts's source scan, not by this interface
 * alone. No `phaser` value import (type-only), so this file loads in Node.
 */
import type Phaser from "phaser";

export interface InteractableDef {
  /** Equal to its own key in INTERACTABLE_REGISTRY. */
  id: string;
  /** Builds and returns the interactive root game object, already
   * `setInteractive` with a hit area, positioned at `anchor`. */
  place(scene: Phaser.Scene, anchor: { x: number; y: number }): Phaser.GameObjects.GameObject;
  /** A purely visual reaction to a click on `root`. Never touches game
   * state or the server. */
  onClick(scene: Phaser.Scene, root: Phaser.GameObjects.GameObject): void;
  /** Mascot only: 3-5 short tip/joke lines, each at most 32 chars. */
  lines?: readonly string[];
}
