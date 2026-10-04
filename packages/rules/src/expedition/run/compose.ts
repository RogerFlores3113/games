// Phase 10 hook-composition engine (Plan 03, spec §6.1).
//
// COMPOSITION ORDER: base -> each seat's live passives
// (seat order, then [character, ...kit] order) -> active effects (in the
// order stored on attempt.effects). Every layer's RuleModifier maps the PREVIOUS
// layer's answer to its own, per hook (run-rules.ts's own header repeats
// this contract; this file is what actually folds it).
//
// isTrump AND rankOf ARE FOLDED FIRST, separately from every other hook (WR-03,
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
// POLICY A3 (content-defect throw): a live or effect-referencing source id
// absent from the Catalog is a content bug, not a player error — ruleLayersFor throws a plain Error naming the missing id, matching
// the Plan 10-01 policy for composed rule-hook defects.
//
// RESET-ON-REPLAY (RUN-06) falls out structurally: a fresh AttemptState has
// no effects, so a replay's first rulesFor call naturally omits the old
// effects layer — there is nothing here to reset by hand.

import { baseRulesWith } from "../rules";
import { isTrump, rankOf } from "../trick";
import { HOOK_NAMES, baseRunHooks, type HookName, type RuleModifier, type RunRules } from "./run-rules";
import type { Catalog, RunState } from "./types";
import { liveSourceIds, ownerOf, sourceDef } from "./usage";

/** Folds one card-reading hook across every layer, in order, over its
 * Core default. Layers with no entry pass the previous answer through. */
function foldCardHook<K extends "isTrump" | "rankOf">(layers: readonly RuleModifier[], key: K, initial: RunRules[K]): RunRules[K] {
  return layers.reduce<RunRules[K]>((prev, layer) => {
    const mapper = layer[key] as ((prev: RunRules[K]) => RunRules[K]) | undefined;
    return mapper === undefined ? prev : mapper(prev);
  }, initial);
}

/** Folds `layers` into one RunRules value. The card-reading hooks (isTrump
 * and rankOf) are folded first and separately (WR-03); every other hook in
 * HOOK_NAMES is folded over the base layer built from them. */
export function composeRules(layers: readonly RuleModifier[]): RunRules {
  const composedIsTrump = foldCardHook(layers, "isTrump", isTrump);
  const composedRankOf = foldCardHook(layers, "rankOf", rankOf);
  const base: RunRules = { ...baseRulesWith(composedIsTrump, composedRankOf), ...baseRunHooks };

  let result = base;
  for (const name of HOOK_NAMES) {
    if (name === "isTrump" || name === "rankOf") continue; // already folded above
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

/** Builds the ordered layer list for `run` under `catalog`: each seat's
 * live passives (seat order, then [character, ...kit] order) -> each live
 * attempt effect's `active.effect`, in attempt.effects order. Throws a named
 * Error for any source id missing from the catalog (POLICY A3). */
export function ruleLayersFor(run: RunState, catalog: Catalog): RuleModifier[] {
  const layers: RuleModifier[] = [];

  for (const seat of run.seats) {
    const owner = ownerOf(seat);
    for (const sourceId of liveSourceIds(seat)) {
      const passive = sourceDef(catalog, sourceId).passive;
      if (passive !== undefined) layers.push(passive.modifier(owner));
    }
  }

  if (run.attempt !== null) {
    const trickIndex = run.attempt.camp.currentTrick.index;
    for (const effect of run.attempt.effects) {
      // A trick-scoped effect bends only the trick it was stamped with:
      // applyCampAction resolves trickWinner while currentTrick.index still
      // equals atTrick, and the next trick's index drops the layer.
      if (effect.lasts === "trick" && effect.atTrick !== trickIndex) continue;
      const toLayer = sourceDef(catalog, effect.sourceId).active?.effect;
      if (toLayer === undefined) {
        throw new Error(`ruleLayersFor: effect from "${effect.sourceId}" has no active.effect`);
      }
      layers.push(toLayer(effect, run));
    }
  }

  return layers;
}

/** The single entry point every later Phase 10 plan calls: RunRules composed
 * fresh for this exact (run, catalog) pair, recomputed on every call. */
export function rulesFor(run: RunState, catalog: Catalog): RunRules {
  return composeRules(ruleLayersFor(run, catalog));
}
