// Phase 12, Plan 02: a phaser-free, function-free display catalogue of the
// gear and boss-twist catalogues, exported from @games/rules for the web
// client. This is an explicit ALLOWLIST projection for client display — it
// must never carry a function or a RuleModifier (mirrors view.ts's allowlist
// discipline for ExpeditionView). GEAR_DISPLAY/BOSS_DISPLAY are pure data:
// JSON.parse(JSON.stringify(v)) must deep-equal v for every value.
//
// This file lives under adapter/ (not a top-level expedition/*.ts) because
// purity.test.ts's Core fence forbids top-level files from importing
// ./run, ./gear or ./boss — this module imports GEAR_REGISTRY/BOSS_REGISTRY
// directly, so it must live in a nested directory.

import { GEAR_REGISTRY } from "../gear/registry";
import { BOSS_REGISTRY } from "../boss/registry";
import type { GearWindow, TargetKind } from "../gear/gear-def";

export type ExpeditionTargetKind = TargetKind;
/** The windows production gear uses. In-trick and rescue are open to test
 * gear only until gear gives way to abilities. */
export type ExpeditionGearWindow = Exclude<GearWindow, "in-trick" | "rescue">;

function displayWindow(id: string, window: GearWindow): ExpeditionGearWindow {
  if (window === "in-trick" || window === "rescue") {
    throw new Error(`GEAR_DISPLAY: production gear "${id}" uses the ${window} window`);
  }
  return window;
}

export type GearDisplay = {
  id: string;
  name: string;
  size: number;
  window: ExpeditionGearWindow;
  text: string;
  downside: string | null;
  targets: ExpeditionTargetKind[];
};

export type BossDisplay = { id: string; name: string; text: string };

export const GEAR_DISPLAY: Readonly<Record<string, GearDisplay>> = Object.fromEntries(
  Object.entries(GEAR_REGISTRY).map(([id, def]) => [
    id,
    {
      id: def.id,
      name: def.name,
      size: def.size,
      window: displayWindow(def.id, def.window),
      text: def.text,
      downside: def.downside ?? null,
      targets: def.targets.map((t) => t.kind),
    },
  ]),
);

export const BOSS_DISPLAY: Readonly<Record<string, BossDisplay>> = Object.fromEntries(
  Object.entries(BOSS_REGISTRY).map(([id, def]) => [
    id,
    {
      id: def.id,
      name: def.name,
      text: def.text,
    },
  ]),
);
