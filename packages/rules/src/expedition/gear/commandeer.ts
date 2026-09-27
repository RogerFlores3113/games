// Machete (Plan 10-10, spec §5.1, GEAR-03, D-09). The second v1 "table
// gear" item (the other is pickpocket.ts's Trained Monkey).
//
// D-09 exactly: usable in ANY between-tricks window, including before trick
// 1, where it takes the first lead from the expedition leader. Objective
// picking happens before the between-tricks window ever opens (campPhase's
// own ordering, camp.ts), so the expedition leader still picks the first
// objective regardless of whether Machete is used before trick 1 — this
// file never touches expeditionLeaderSeatId, only currentTrick.leaderSeatId.
//
// IMPLEMENTATION CHOICE (labeled): this sets the OPEN trick's leader
// directly through the toolkit's set-next-leader op, rather than overriding
// the nextLeader rule hook. By the time the between-tricks window is open,
// the PREVIOUS trick (if any) has already completed and nextLeader has
// already run to produce camp.currentTrick.leaderSeatId — there is no
// pending nextLeader call left to intercept for "before trick 1" (there is
// no previous trick to have a winner at all). Mutating the already-computed
// leader field is therefore the only mechanism that also covers the
// before-trick-1 case D-09 requires.
//
// set-next-leader (toolkit.ts) itself only guards "no trick already in
// progress" (camp.currentTrick.plays.length === 0) — the SAME guard that
// currentWindow's D-13 check already enforces to even open this window, so
// by the time apply() runs here, the toolkit's own guard is structurally
// satisfied.

import type { GearDef } from "./gear-def";

export const commandeer: GearDef = {
  id: "commandeer",
  name: "Machete",
  size: 2,
  window: "between-tricks",
  text: "You lead the next trick instead of the last trick's winner.",
  targets: [],
  canUse(ctx) {
    if (ctx.camp!.currentTrick.leaderSeatId === ctx.self) {
      return "You already lead the next trick";
    }
    return true;
  },
  apply(ctx) {
    return [{ op: "set-next-leader", seatId: ctx.self }];
  },
};
