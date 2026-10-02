/**
 * A plain reference table from a test-bridge object id (spec §7.5: `hand:Q♥`,
 * `gear:<id>`, `seat:<seatId>`, `objective:K♦`, `interactable:<id>`, ...) to
 * the live Phaser game object that currently represents it. Stores
 * references only — it never draws, never touches game state, and is
 * present in every build (dev, test, and production) since it carries no
 * test-only marker string itself; only `test-bridge.ts` is dev/test-only.
 *
 * `entries()` reports stage-coordinate bounds for active+visible objects
 * only, so a destroyed or hidden object never leaks a stale position to a
 * caller (the dev-only test bridge, once Plan 12-08's Task 3 wires it up).
 */
import type Phaser from "phaser";
import type { SceneKey } from "../../../lib/expedition/build-scene-model";

export type IndexedObject = Phaser.GameObjects.GameObject & {
  getBounds(): Phaser.Geom.Rectangle;
  active: boolean;
  visible: boolean;
};

interface Entry {
  sceneKey: SceneKey;
  obj: IndexedObject;
}

export interface ObjectIndexEntry {
  id: string;
  sceneKey: SceneKey;
  bounds: { x: number; y: number; width: number; height: number };
}

export class ObjectIndex {
  private readonly byId = new Map<string, Entry>();

  register(sceneKey: SceneKey, id: string, obj: IndexedObject): void {
    this.byId.set(id, { sceneKey, obj });
  }

  clearScene(sceneKey: SceneKey): void {
    for (const [id, entry] of this.byId) {
      if (entry.sceneKey === sceneKey) {
        this.byId.delete(id);
      }
    }
  }

  /** Whether stage point (x, y) lies inside `id`'s visible bounds. */
  contains(id: string, x: number, y: number): boolean {
    const entry = this.byId.get(id);
    if (entry === undefined || !entry.obj.active || !entry.obj.visible) return false;
    const b = entry.obj.getBounds();
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  }

  entries(): ObjectIndexEntry[] {
    const out: ObjectIndexEntry[] = [];
    for (const [id, entry] of this.byId) {
      if (!entry.obj.active || !entry.obj.visible) continue;
      const bounds = entry.obj.getBounds();
      out.push({
        id,
        sceneKey: entry.sceneKey,
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      });
    }
    return out;
  }
}
