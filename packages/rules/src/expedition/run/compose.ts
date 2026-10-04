// The hook-composition engine.
//
// COMPOSITION ORDER: base -> each camp-stack layer's `rules` (location,
// weather, pairing, boss) -> each seat's live passives (seat order, then
// [character, upgrade, ...equipped] order) -> live effects (in the order
// stored on the attempt) -> the passives marked foldsLast. Bosses fold after
// weather so a boss can refine a weather; passives fold after both so an
// item can lift a camp rule for its owner (Mosquito Net under Rain);
// effects win over them, and a foldsLast passive over everything. Every layer's
// RuleModifier maps the PREVIOUS layer's answer to its own, per hook.
//
// THE CARD-READING HOOKS ARE FOLDED FIRST, separately from every other hook
// (WR-03): identityOf, then isTrump, then rankOf, whose default reads the
// strength of what the card counts as. The base CoreRules layer is built
// from that reading, so a layer changing only how a card reads (e.g.
// "spades are trump") changes trickWinner, legalPlays and burns with no
// other code path.
//
// NO CACHE (T-10-08): this module holds no Map, WeakMap or module-level
// mutable state. rulesFor recomputes ruleLayersFor and composeRules fresh on
// every call; RunState is plain JSON, so "the same RunState" always
// recomposes to the same RunRules.
//
// POLICY A3 (content-defect throw): a live or effect-referencing id absent
// from the Catalog is a content bug, not a player error: ruleLayersFor
// throws a plain Error naming the missing id.
//
// RESET-ON-REPLAY (RUN-06) falls out structurally: a fresh AttemptState has
// no effects, so a replay's first rulesFor call omits the old effects.

import { baseRulesWith } from "../rules";
import { cardReading, isTrump } from "../trick";
import { HOOK_NAMES, baseRunHooks, type HookName, type RuleModifier, type RunRules } from "./run-rules";
import type { ActiveEffect, Catalog, RunState, SeatEffect } from "./types";
import { defOfKey, liveSourceKeys, ownerOf, sourceDef } from "./usage";
import { attemptOf } from "./attempt";
import { bodyOf } from "../content/mods/mod-def";
import { campStack, modCtx, modDef, specOf } from "./stack";

const CARD_HOOKS = ["identityOf", "isTrump", "rankOf"] as const;
type CardHook = (typeof CARD_HOOKS)[number];

/** Folds one card-reading hook across every layer, in order, over its
 * Core default. Layers with no entry pass the previous answer through. */
function foldCardHook<K extends CardHook>(layers: readonly RuleModifier[], key: K, initial: RunRules[K]): RunRules[K] {
  return layers.reduce<RunRules[K]>((prev, layer) => {
    const mapper = layer[key] as ((prev: RunRules[K]) => RunRules[K]) | undefined;
    return mapper === undefined ? prev : mapper(prev);
  }, initial);
}

/** Folds `layers` into one RunRules value. The card-reading hooks are folded
 * first and separately (WR-03); every other hook in HOOK_NAMES is folded over
 * the base layer built from them. */
export function composeRules(layers: readonly RuleModifier[]): RunRules {
  const identityOf = foldCardHook(layers, "identityOf", (card) => card.identity);
  const composedIsTrump = foldCardHook(layers, "isTrump", isTrump);
  const rankOf = foldCardHook(layers, "rankOf", cardReading({ identityOf }).rankOf);
  const base: RunRules = { ...baseRulesWith(cardReading({ identityOf, isTrump: composedIsTrump, rankOf })), ...baseRunHooks };

  let result = base;
  for (const name of HOOK_NAMES) {
    if ((CARD_HOOKS as readonly string[]).includes(name)) continue; // already folded above
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

/** The rule layer an effect switches on: a seat ability's `active.effect`
 * or a camp modifier's `body.effect`. */
function effectLayer(run: RunState, effect: ActiveEffect, catalog: Catalog): RuleModifier {
  const origin = effect.origin;
  if (origin.kind === "seat") {
    const toLayer = sourceDef(catalog, origin.sourceId).active?.effect;
    if (toLayer === undefined) throw new Error(`ruleLayersFor: effect from "${origin.sourceId}" has no active.effect`);
    return toLayer(effect as SeatEffect, run);
  }
  const def = modDef(catalog, origin.modId);
  const toLayer = bodyOf(def, origin.strength).effect;
  const spec = specOf(run);
  if (toLayer === undefined || spec === null) throw new Error(`ruleLayersFor: effect from "${origin.modId}" has no body.effect`);
  return toLayer(effect, modCtx(run, spec, { def, strength: origin.strength }, catalog));
}

/** Each seat's live passives, in seat order and then [character, upgrade,
 * ...equipped] order; `last` picks the passives that fold after the effects. */
function passiveLayers(run: RunState, catalog: Catalog, last: boolean): RuleModifier[] {
  return run.seats.flatMap((seat) => {
    const owner = ownerOf(seat);
    return liveSourceKeys(seat, catalog).flatMap((key) => {
      const passive = defOfKey(seat, key, catalog).passive;
      return passive === undefined || (passive.foldsLast === true) !== last ? [] : [passive.modifier(owner)];
    });
  });
}

/** The attempt's live effects, in stored order; `seatOnly` drops the camp
 * modifiers' own. */
function effectLayers(run: RunState, catalog: Catalog, seatOnly: boolean): RuleModifier[] {
  const attempt = attemptOf(run);
  if (attempt === null) return [];
  const trickIndex = attempt.camp.currentTrick.index;
  // A trick-scoped effect bends only the trick it was stamped with:
  // applyCampAction resolves trickWinner while currentTrick.index still
  // equals atTrick, and the next trick's index drops the layer.
  return attempt.effects
    .filter((effect) => !(effect.lasts === "trick" && effect.atTrick !== trickIndex) && !(seatOnly && effect.origin.kind === "mod"))
    .map((effect) => effectLayer(run, effect, catalog));
}

/** Builds the ordered layer list for `run` under `catalog`: each camp-stack
 * layer's `rules` -> each seat's live passives (seat order, then
 * [character, upgrade, ...equipped] order) -> each live attempt effect's
 * layer, in attempt.effects order -> the passives marked `foldsLast`, so a
 * rule that must have the last word (Momentum's whisper count) gets it.
 * Throws a named Error for any id missing from the catalog (POLICY A3). */
export function ruleLayersFor(run: RunState, catalog: Catalog): RuleModifier[] {
  const spec = specOf(run);
  const stack = spec === null ? [] : campStack(run, catalog).flatMap((layer) => (layer.body.rules === undefined ? [] : [layer.body.rules(modCtx(run, spec, layer, catalog))]));
  return [...stack, ...passiveLayers(run, catalog, false), ...effectLayers(run, catalog, false), ...passiveLayers(run, catalog, true)];
}

/** The rules the seats alone make: passives and seat effects, without the
 * camp modifiers. A camp modifier asks these (`ctx.affects`) while its own
 * layer is being built. */
export function seatRulesFor(run: RunState, catalog: Catalog): RunRules {
  return composeRules([...passiveLayers(run, catalog, false), ...effectLayers(run, catalog, true), ...passiveLayers(run, catalog, true)]);
}

/** The single entry point every later Phase 10 plan calls: RunRules composed
 * fresh for this exact (run, catalog) pair, recomputed on every call. */
export function rulesFor(run: RunState, catalog: Catalog): RunRules {
  return composeRules(ruleLayersFor(run, catalog));
}
