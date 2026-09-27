// Mutiny boss twist (Plan 10-13, BOSS-01). PROVISIONAL placeholder (owner
// note, 10-CONTEXT.md, 2026-09-26): too close to The Crew's own "mutiny"
// twist. Replacing it later touches only this file plus the Plan 10-14
// catalogue registry line — nothing else names "mutiny".
//
// Pure catalogue data: a single failureChecks override, composed exactly
// like any other boss/gear RuleModifier (run/compose.ts's ruleLayersFor).
// The leader it checks is always the CAMP's expedition leader
// (CampState.expeditionLeaderSeatId) — the seat fixed for the whole camp at
// deal time — even if Machete (commandeer) later changed who actually led
// trick 1's play. Fires exactly once, the moment completedTricks[0] exists
// and that trick's winner is the expedition leader; a later trick's winner
// never matters.

import type { BossDef } from "./boss-def";
import type { CampState } from "../state";

export const mutiny: BossDef = {
  id: "mutiny",
  name: "Mutiny",
  text: "The leader must not win the first trick, or the camp fails.",
  modifiers: {
    failureChecks: (prev) => (state: CampState) =>
      state.completedTricks[0]?.winnerSeatId === state.expeditionLeaderSeatId
        ? [...prev(state), "mutiny"]
        : prev(state),
  },
};
