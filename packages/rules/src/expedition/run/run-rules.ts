// Phase 10 rule-hook layering type contract (Plan 02).
//
// LABELED DEVIATION: RunRules lives BESIDE CoreRules (a `CoreRules &
// RunHooks` intersection) rather than being folded into rules.ts's own
// CoreRules type. This keeps Core (rules.ts) importing nothing from run/,
// so the Core layer never names a source id (per rules.ts's own
// header contract).
//
// COMPOSITION ORDER (spec §6.1, "each hook receives the previous layer's
// answer"): base -> live passives (seat order, then each
// seat's [character, ...kit] order) -> active effects (in the order they
// were added).
// A RuleModifier is a function from the previous layer's hook to this
// layer's hook; composing a full RunRules means folding every layer's
// RuleModifier, hook by hook, in that fixed order.
//
// Rules are RECOMPUTED on every call and are NEVER cached: RunState is
// plain JSON data (ActiveEffect entries, not stored functions), so a
// composed RunRules value is always rebuilt fresh from that data via each
// source's `passive.modifier`/`active.effect`. This is
// what lets Phase 11 persist RunState with no special-casing of "live"
// rule objects.

import type { CoreRules } from "../rules";
import type { RunState } from "./types";

export type RunHooks = {
  whisperAllowed(run: RunState, seatId: string): boolean;
  whisperAudience(run: RunState, seatId: string, targetSeatId: string): readonly string[];
  whispersPerCamp(run: RunState, seatId: string): number;
  failureCost(run: RunState): number;
};

export type RunRules = CoreRules & RunHooks;
export type HookName = keyof RunRules;

// Spec §6.1 "each hook receives the previous layer's answer": a layer maps
// the previous layer's hook to its own.
export type RuleModifier = { readonly [K in HookName]?: (prev: RunRules[K]) => RunRules[K] };

// Built from an object literal typed Record<HookName, true> so that adding
// a hook to RunRules without listing it here is a compile error (mirrors
// objectives.ts's KindRegistry exhaustiveness idiom).
const HOOK_NAME_SET: Record<HookName, true> = {
  deckFor: true,
  objectiveDeckFor: true,
  leaderFor: true,
  identityOf: true,
  isTrump: true,
  rankOf: true,
  trickWinner: true,
  legalPlays: true,
  burns: true,
  nextLeader: true,
  objectiveStatus: true,
  goals: true,
  whisperAllowed: true,
  whisperAudience: true,
  whispersPerCamp: true,
  failureCost: true,
};

export const HOOK_NAMES: readonly HookName[] = Object.keys(HOOK_NAME_SET) as HookName[];

export const baseRunHooks: RunHooks = {
  whisperAllowed(_run, _seatId) {
    return true;
  },
  whisperAudience(_run, _seatId, targetSeatId) {
    return [targetSeatId];
  },
  whispersPerCamp(_run, _seatId) {
    return 1;
  },
  failureCost(_run) {
    return 1;
  },
};
