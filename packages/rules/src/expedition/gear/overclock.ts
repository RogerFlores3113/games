// Energy Tonic (Plan 10-11, spec §5.1, GEAR-04). The v1 passive: unlike
// every other v1 gear item, it defines no effect function at all — a
// passive is "always active" the instant it is equipped (toolkit.ts's own
// gearAvailability refuses ANY use-gear attempt on a `window: "passive"`
// def with the fixed reason "Passive gear is always active", which is why
// this file defines no canUse/effect function of its own to guard against).
//
// STACKING (spec §5.1, discretion note in 10-CONTEXT.md): D-05 allows
// several players to each own and equip their own Tonic, so
// ruleLayersFor (compose.ts) pushes one passiveModifier layer PER seat that
// has "overclock" equipped. Each layer independently:
//   - raises ONLY ITS OWNER's capacity by +2 (the `seatId === ownerSeatId`
//     guard is the T-10-37 mitigation: a second seat's Tonic must never
//     leak capacity onto a seat that doesn't own it);
//   - raises the CAMP-WIDE failureCost by +1, unconditionally — this hook
//     has no seatId parameter (run-rules.ts's own RunHooks contract), so
//     "two owners -> failure costs 3" (base 1 + 1 + 1) falls out of folding
//     two independent +1 layers, not from any per-owner counting logic here.
//
// T-10-26 (run-actions.ts's own comment): set-loadout computes capacity
// WITH the proposed loadout already in place, so equipping the Tonic in the
// very same set-loadout call that also equips a size-3 item is legal in one
// step — capacityOf(candidateRun, seatId, catalog) already sees this
// layer's own +2.

import type { GearDef } from "./gear-def";

export const overclock: GearDef = {
  id: "overclock",
  name: "Energy Tonic",
  size: 0,
  window: "passive",
  text: "While equipped: +2 capacity.",
  downside: "If this camp fails, it costs 1 extra supply.",
  targets: [],
  passiveModifier(ownerSeatId) {
    return {
      capacity(prev) {
        return (run, seatId) => (seatId === ownerSeatId ? prev(run, seatId) + 2 : prev(run, seatId));
      },
      failureCost(prev) {
        return (run) => prev(run) + 1;
      },
    };
  },
};
