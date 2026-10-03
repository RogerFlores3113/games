// Thick Fog boss twist (Plan 10-13, BOSS-01). PROVISIONAL placeholder (owner
// note, 10-CONTEXT.md, 2026-09-26): too close to The Crew's own "blind
// orders" twist. Replacing it later touches only this file plus the Plan
// 10-14 catalogue registry line — nothing else names "blind-orders".
//
// Pure catalogue data: a single objectiveAssignment override, composed
// exactly like any other boss/gear RuleModifier (run/compose.ts's
// ruleLayersFor). The actual face-down assignment is the run layer's own
// seeded round-robin from the expedition leader (A5, Plan 10-05's
// assignFaceDown, driven by run/lifecycle.ts's dealAttempt whenever the
// composed objectiveAssignment hook answers "face-down"). This file only
// flips that hook; it never touches assignment logic itself.
//
// T-10-42 (threat register): "each player sees only their own" is NOT
// enforced here. Hiding another seat's objective ownership from a client's
// view is Phase 11's toPlayerView + leak-checker job — this file only
// arranges for every objective to be owned face-down at deal time.

import type { BossDef } from "./boss-def";

export const blindOrders: BossDef = {
  id: "blind-orders",
  name: "Thick Fog",
  text: "Objectives are dealt face down, and you see only your own.",
  modifiers: {
    objectiveAssignment: () => () => "face-down",
  },
};
