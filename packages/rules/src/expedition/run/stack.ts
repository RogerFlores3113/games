// The camp's modifier stack: the one composition list that compose, react,
// the view, the route preview and the leak check all read.
//
// Fold order: the location (unless a pairing cancels it), the weather
// (unless cancelled), the pairing's added def, the planned boss or the
// temple, then at the temple each earlier boss at half strength, in the
// order the crew faced them.

import { bodyOf, type ModBody, type ModCtx, type ModDef, type ModId, type Strength } from "../content/mods/mod-def";
import type { PairingRule } from "../content/mods/pairings";
import type { CampSpec, SlotTemplate } from "./route";
import { attemptOf, nextAttemptNumber } from "./attempt";
import { bossAt, helpersFor } from "./plan";
import { STREAMS, seededIndex } from "./rng";
import type { Catalog, RunState } from "./types";

export type StackLayer = { readonly def: ModDef; readonly strength: Strength; readonly body: ModBody };

/** POLICY A3: an id the catalogue lacks is a content defect. */
export function modDef(catalog: Catalog, id: ModId): ModDef {
  if (!Object.hasOwn(catalog.mods, id)) throw new Error(`stack: unknown camp modifier "${id}"`);
  return catalog.mods[id]!;
}

/** The pairing rule a location and weather meet under, or null. */
export function pairingRuleFor(location: ModId, weather: ModId, catalog: Catalog): PairingRule | null {
  return catalog.pairings.find((rule) => rule.location === location && rule.weathers.includes(weather)) ?? null;
}

/** The def a camp's pairing adds, or null. */
export function pairingOf(spec: CampSpec, catalog: Catalog): ModId | null {
  const rule = pairingRuleFor(spec.location, spec.weather, catalog);
  return rule === null || rule.result === "never" ? null : rule.result.adds;
}

/** The stack for a camp spec, whether or not the run is at it (the route
 * preview reads the stack of a camp ahead). */
export function stackFor(run: RunState, spec: CampSpec, catalog: Catalog): readonly StackLayer[] {
  const rule = pairingRuleFor(spec.location, spec.weather, catalog);
  const result = rule === null || rule.result === "never" ? null : rule.result;
  const cancelled = result?.cancels ?? [];
  const ids = [spec.location, spec.weather].filter((id) => !cancelled.includes(id));
  if (result?.adds != null) ids.push(result.adds);
  const boss = run.plan === null ? null : bossAt(run.plan, spec.index)?.modId ?? null;
  if (boss !== null) ids.push(boss);
  const helpers = run.plan === null ? [] : helpersFor(run.plan, spec.index).map((helper) => helper.modId!);
  return [...ids.map((id) => layerOf(catalog, id, "full")), ...helpers.map((id) => layerOf(catalog, id, "half"))];
}

function layerOf(catalog: Catalog, id: ModId, strength: Strength): StackLayer {
  const def = modDef(catalog, id);
  return { def, strength, body: bodyOf(def, strength) };
}

/** The spec of the loadout or camp the run is at; null in every other stage. */
export function specOf(run: RunState): CampSpec | null {
  return run.stage.tag === "loadout" || run.stage.tag === "camp" ? run.stage.camp : null;
}

/** The stack of the loadout or camp the run is at; [] in every other stage. */
export function campStack(run: RunState, catalog: Catalog): readonly StackLayer[] {
  const spec = specOf(run);
  return spec === null ? [] : stackFor(run, spec, catalog);
}

/** A layer's context. Its rolls belong to the dealt attempt, or in the
 * loadout to the attempt the loadout will deal. */
export function modCtx(run: RunState, spec: CampSpec, layer: { readonly def: ModDef; readonly strength: Strength }): ModCtx {
  const attemptNumber = attemptOf(run)?.attemptNumber ?? nextAttemptNumber(run, spec.index);
  return {
    run,
    spec,
    strength: layer.strength,
    camp: attemptOf(run)?.camp ?? null,
    roll: (label, n) => seededIndex(run.seed, STREAMS.modRule(layer.def.id, layer.strength, spec.index, attemptNumber, label), n),
  };
}

/** The spec's objective slots after every stack layer's `slots`. */
export function campSlots(run: RunState, spec: CampSpec, catalog: Catalog): readonly SlotTemplate[] {
  return stackFor(run, spec, catalog).reduce<readonly SlotTemplate[]>((slots, layer) => (layer.body.slots === undefined ? slots : layer.body.slots(slots)), spec.slots);
}
