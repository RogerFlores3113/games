/**
 * The dev/test-only Playwright bridge (SCENE-12, spec §7.5). This is the
 * ONLY file in the codebase permitted to name `__expeditionTest` — enforced
 * by `check-expedition-build.mjs` (production build output) and by every
 * other file under `apps/web/components`/`apps/web/lib` never containing
 * the string. `ExpeditionPhaserMount.tsx` imports this module ONLY inside a
 * literal, un-aliased `process.env.NODE_ENV !== "production"` branch — never
 * refactor that check into a variable or helper (RESEARCH.md Pitfall 3).
 *
 * `window.__expeditionTest` stays a SINGLE persistent object across
 * installs: `install` increments `liveGames`/sets `ready = true`; the
 * returned uninstall decrements `liveGames` and sets `ready = false` only
 * once it reaches 0. Multiple simultaneous installs (Strict Mode's dev-only
 * double mount) are supported — the bridge's getters always read from the
 * MOST RECENTLY installed game.
 */
import type Phaser from "phaser";
import type { ExpeditionSceneStore } from "../../../lib/expedition/expedition-scene-store";
import type { SceneKey } from "../../../lib/expedition/build-scene-model";
import type { ActiveModel } from "../../../lib/expedition/expedition-scene-store";
import type { ObjectIndex } from "./object-index";
import type { LayoutEntry } from "../../../lib/expedition/layout-audit";
import { STAGE_WIDTH } from "../../../lib/expedition/compute-zoom";

export interface ExpeditionTestBridge {
  ready: boolean;
  liveGames: number;
  /** The store's scene, once its Phaser scene is running. */
  readonly scene: SceneKey | null;
  readonly model: ActiveModel | null;
  /** Every registered object's page-CSS-px CENTRE + scaled size, keyed by
   * its test-bridge id. */
  objects(): Record<string, { x: number; y: number; width: number; height: number }>;
  /** `objects()[id]`'s centre, or `null` if `id` is not currently
   * registered/visible. */
  positionOf(id: string): { x: number; y: number } | null;
  /** Every visible text object and interactive object in the active scene,
   * in stage px (640x360), for the UI-tour layout audit. */
  layout(): LayoutEntry[];
}

declare global {
  interface Window {
    __expeditionTest?: ExpeditionTestBridge;
  }
}

interface Install {
  game: Phaser.Game;
  store: ExpeditionSceneStore;
  index: ObjectIndex;
}

const installs: Install[] = [];

function current(): Install | null {
  return installs.length > 0 ? installs[installs.length - 1]! : null;
}

type DisplayObject = Phaser.GameObjects.GameObject & {
  visible?: boolean;
  alpha?: number;
  list?: Phaser.GameObjects.GameObject[];
  text?: string;
  getBounds?: () => Phaser.Geom.Rectangle;
};

function collectLayout(install: Install): LayoutEntry[] {
  const rect = install.index.entries();
  const idByBounds = new Map<string, string>();
  for (const e of rect) {
    idByBounds.set(`${e.bounds.x},${e.bounds.y},${e.bounds.width},${e.bounds.height}`, e.id);
  }
  const out: LayoutEntry[] = [];
  const walk = (obj: DisplayObject, parentAlpha: number): void => {
    if (!obj.active || obj.visible === false) return;
    const alpha = parentAlpha * (obj.alpha ?? 1);
    if (alpha <= 0 || typeof obj.getBounds !== "function") return;
    const b = obj.getBounds();
    const box = { x: b.x, y: b.y, w: b.width, h: b.height };
    const typeName = obj.type;
    if ((typeName === "BitmapText" || typeName === "Text") && typeof obj.text === "string") {
      out.push({ kind: "text", label: obj.text, ...box });
    } else if (obj.input?.enabled) {
      const id = idByBounds.get(`${b.x},${b.y},${b.width},${b.height}`);
      out.push({ kind: "interactive", label: id ?? (obj.name || typeName), ...box });
    }
    if (Array.isArray(obj.list)) {
      for (const child of obj.list) walk(child as DisplayObject, alpha);
    }
  };
  for (const scene of install.game.scene.getScenes(true)) {
    for (const obj of scene.children.list) walk(obj as DisplayObject, 1);
  }
  return out;
}

function ensureBridge(): ExpeditionTestBridge {
  const existing = window.__expeditionTest;
  if (existing) return existing;

  const bridge: ExpeditionTestBridge = {
    ready: false,
    liveGames: 0,
    get scene() {
      const install = current();
      const key = install?.store.getState().sceneKey ?? null;
      // A scene loads its sprites in preload(); it has drawn nothing to
      // click until it is running.
      return key !== null && install!.game.scene.isActive(key) ? key : null;
    },
    get model() {
      return current()?.store.getState().model ?? null;
    },
    objects() {
      const install = current();
      if (install === null) return {};
      const rect = install.game.canvas.getBoundingClientRect();
      const scale = rect.width / STAGE_WIDTH;
      const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
      for (const entry of install.index.entries()) {
        out[entry.id] = {
          x: rect.left + (entry.bounds.x + entry.bounds.width / 2) * scale,
          y: rect.top + (entry.bounds.y + entry.bounds.height / 2) * scale,
          width: entry.bounds.width * scale,
          height: entry.bounds.height * scale,
        };
      }
      return out;
    },
    layout() {
      const install = current();
      if (install === null) return [];
      return collectLayout(install);
    },
    positionOf(id) {
      const found = bridge.objects()[id];
      return found ? { x: found.x, y: found.y } : null;
    },
  };
  window.__expeditionTest = bridge;
  return bridge;
}

/** Registers `game`/`store`/`index` as the current live install. Returns an
 * uninstall function the caller MUST invoke on unmount/destroy. */
export function installTestBridge(args: Install): () => void {
  const bridge = ensureBridge();
  installs.push(args);
  bridge.liveGames = installs.length;
  bridge.ready = true;

  let uninstalled = false;
  return () => {
    if (uninstalled) return;
    uninstalled = true;
    const idx = installs.indexOf(args);
    if (idx !== -1) installs.splice(idx, 1);
    const active = window.__expeditionTest;
    if (!active) return;
    active.liveGames = installs.length;
    if (installs.length === 0) {
      active.ready = false;
    }
  };
}
