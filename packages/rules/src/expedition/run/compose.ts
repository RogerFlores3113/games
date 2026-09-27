// Phase 10 hook-composition engine (Plan 03, spec §6.1).
//
// COMPOSITION ORDER: base -> active boss twist -> each seat's equipped
// passives (seat order, then loadout order) -> active effects (in the order
// stored on attempt.effects). Every layer's RuleModifier maps the PREVIOUS
// layer's answer to its own, per hook (run-rules.ts's own header repeats
// this contract; this file is what actually folds it).
//
// isTrump IS FOLDED FIRST, separately from every other hook (WR-03,
// Plan 10-01): composeRules first folds every layer's isTrump mapper over
// trick.ts's default isTrump, THEN builds the base CoreRules layer via
// baseRulesWith(composedIsTrump). This is what lets an isTrump-only layer
// (e.g. "spades are trump") change trickWinner and legalPlays with no other
// code path — those two hooks are DERIVED from baseRulesWith's isTrumpFn
// closure, not independently folded like the rest of RunRules.
//
// NO CACHE (T-10-08): this module holds no Map, WeakMap or module-level
// mutable state. rulesFor recomputes ruleLayersFor and composeRules fresh on
// every call; RunState is plain JSON, so "the same RunState" always
// recomposes to the same RunRules, and a changed RunState (e.g. a new
// attempt.effects entry) always recomposes to a new one.
//
// POLICY A3 (content-defect throw): an equipped/effect-referencing gear id
// or a stored boss id absent from the Catalog is a content bug, not a player
// error — ruleLayersFor throws a plain Error naming the missing id, matching
// the Plan 10-01 policy for composed rule-hook defects.
//
// D-02: the active boss twist is read from RunState.bossTwists (fixed per
// boss camp at first arrival), never redrawn here. D-04: bossCancelled
// suppresses the boss layer for the current attempt only — activeBossId
// returns null while it is set, so the boss's RuleModifier is simply never
// added to the layer list for this attempt.
//
// RESET-ON-REPLAY (RUN-06) falls out structurally: a fresh AttemptState has
// no effects and bossCancelled === false, so a replay's first rulesFor call
// naturally omits both the old effects layer and any prior cancellation —
// there is nothing here to reset by hand.

import { baseRulesWith } from "../rules";
import { isTrump } from "../trick";
import type { CardIdentity } from "../state";
import { HOOK_NAMES, baseRunHooks, type HookName, type RuleModifier, type RunRules } from "./run-rules";
import type { Catalog, RunState } from "./types";

/** Folds every layer's isTrump mapper, in order, over trick.ts's default
 * isTrump predicate. Layers with no isTrump entry pass the previous answer
 * through unchanged. */
function composeIsTrump(layers: readonly RuleModifier[]): (identity: CardIdentity) => boolean {
  return layers.reduce<(identity: CardIdentity) => boolean>((prev, layer) => {
    return layer.isTrump === undefined ? prev : layer.isTrump(prev);
  }, isTrump);
}

/** Folds `layers` into one RunRules value. isTrump is folded first and
 * separately (WR-03); every other hook in HOOK_NAMES is folded over the
 * base layer built from the composed isTrump. */
export function composeRules(layers: readonly RuleModifier[]): RunRules {
  const composedIsTrump = composeIsTrump(layers);
  const base: RunRules = { ...baseRulesWith(composedIsTrump), ...baseRunHooks };

  let result = base;
  for (const name of HOOK_NAMES) {
    if (name === "isTrump") continue; // already folded above
    const key = name as HookName;
    result = layers.reduce<RunRules>((acc, layer) => {
      const mapper = layer[key];
      if (mapper === undefined) return acc;
      // One narrowing cast per hook (objectives.ts's registry-dispatch
      // idiom): RuleModifier's mapped-type shape guarantees mapper takes and
      // returns RunRules[key] for this exact key, but TS cannot see that
      // through a runtime-selected `key`.
      const nextValue = (mapper as (prev: RunRules[typeof key]) => RunRules[typeof key])(acc[key]);
      return { ...acc, [key]: nextValue };
    }, result);
  }
  return result;
}

/** The active boss's id for this exact RunState, or null when there is no
 * attempt, the twist was cancelled this attempt (D-04), or campNumber isn't
 * a boss camp. Never redraws (D-02): only reads the stored bossTwists. */
export function activeBossId(run: RunState): string | null {
  if (run.attempt === null || run.attempt.bossCancelled) return null;
  if (run.campNumber !== 3 && run.campNumber !== 6) return null;
  return run.bossTwists[run.campNumber];
}

/** Builds the ordered layer list for `run` under `catalog`: active boss ->
 * each seat's equipped passives (seat order, then loadout order) -> each
 * attempt effect's effectModifier, in attempt.effects order. Throws a named
 * Error for any gear/boss id missing from the catalog (POLICY A3). */
export function ruleLayersFor(run: RunState, catalog: Catalog): RuleModifier[] {
  const layers: RuleModifier[] = [];

  const bossId = activeBossId(run);
  if (bossId !== null) {
    const bossDef = catalog.bosses[bossId];
    if (bossDef === undefined) {
      throw new Error(`ruleLayersFor: bossTwists names unknown boss id "${bossId}"`);
    }
    layers.push(bossDef.modifiers);
  }

  for (const seat of run.seats) {
    for (const gearId of seat.equippedGearIds) {
      const gearDef = catalog.gear[gearId];
      if (gearDef === undefined) {
        throw new Error(`ruleLayersFor: seat "${seat.seatId}" has unknown equipped gear id "${gearId}"`);
      }
      if (gearDef.passiveModifier !== undefined) {
        layers.push(gearDef.passiveModifier(seat.seatId));
      }
    }
  }

  if (run.attempt !== null) {
    for (const effect of run.attempt.effects) {
      const gearDef = catalog.gear[effect.gearId];
      if (gearDef === undefined) {
        throw new Error(`ruleLayersFor: active effect names unknown gear id "${effect.gearId}"`);
      }
      if (gearDef.effectModifier !== undefined) {
        layers.push(gearDef.effectModifier(effect));
      }
    }
  }

  return layers;
}

/** The single entry point every later Phase 10 plan calls: RunRules composed
 * fresh for this exact (run, catalog) pair, recomputed on every call. */
export function rulesFor(run: RunState, catalog: Catalog): RunRules {
  return composeRules(ruleLayersFor(run, catalog));
}
