// Signal Whistle (Plan 10-08, spec §5.1, GEAR-01). One of the two v1 gear
// items that touch the Whisper economy (the other is broadcast.ts's Signal
// Flare).
//
// LABELED MODELING CHOICE: the Whistle is written as an ACTIVATED gear item,
// not a passive, even though its effect ("whisper a second time this camp")
// reads like a passive capacity bump. It is modeled this way because RUN-06
// requires every gear's used/effect state to be scoped to the CURRENT
// ATTEMPT and reset on replay — and the toolkit's only mechanism for that is
// an `add-modifier` op appended to `attempt.effects` (an ActiveEffect),
// exactly like every other activated gear (Camouflage, Flare, Poncho). A
// `passiveModifier` would apply unconditionally from the moment the gear is
// equipped, with no "used" flag and no per-camp gate — the Whistle's own
// text ("using it lets you...") and this plan's must_haves both require a
// deliberate use, once per camp, before the second Whisper is legal. So:
// `apply` returns `add-modifier`, `effectModifier` raises `whispersPerCamp`
// by exactly 1 for its owner, and `gearAvailability`'s existing isGearSpent
// check (toolkit.ts) is what makes a second use of the Whistle itself
// `gear_already_used` — the gear item's own once-per-camp cap, independent
// of the Whisper's own cap.
//
// GEAR-06: when Monsoon/Rain Poncho (or any boss/gear layer) has already set
// whisperAllowed to false, using the Whistle is refused with the exact
// reason spec §5.1 names for "gear that whispers is blocked too".

import type { GearDef } from "./gear-def";

export const chatter: GearDef = {
  id: "chatter",
  name: "Signal Whistle",
  size: 1,
  window: "between-tricks",
  text: "Whisper a second time this camp.",
  targets: [],
  canUse(ctx) {
    if (!ctx.rules.whisperAllowed(ctx.run, ctx.self)) {
      return "Whispers are blocked this camp";
    }
    return true;
  },
  apply(_ctx) {
    return [{ op: "add-modifier", lasts: "attempt", params: {}, audience: "public" }];
  },
  effectModifier(effect) {
    return {
      whispersPerCamp(prev) {
        return (run, seatId) => {
          const base = prev(run, seatId);
          return seatId === effect.seatId ? base + 1 : base;
        };
      },
    };
  },
};
