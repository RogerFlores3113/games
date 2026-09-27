// Trained Monkey (Plan 10-10, spec §5.1, GEAR-03). One of two v1 "table
// gear" items (the other is commandeer.ts's Machete).
//
// The user swaps a card of their own choice for a random card drawn from a
// chosen teammate's hand. Card conservation and the own-hand-only own-card
// rule (T-10-11) are both the toolkit's job (toolkit.ts's swap-cards op and
// validateTargets's own-card check) — this file supplies only the
// GEAR-06 "no cards to take" reason and the single `swap-cards` op.
//
// T-10-34: the own-card target is attacker-controlled input; validateTargets
// resolves it ONLY through findOwnCard (toolkit.ts), so a card id from
// another seat's hand (e.g. p2's, when the teammate target is p1) is
// invalid_target before this file's canTarget/apply ever run.
//
// Randomness: ctx.randomCardIdFrom draws from the carried seeded RNG only
// (STREAMS.gear), never Math.random — matching Spyglass's own randomness
// discipline from an earlier wave.

import type { GearDef } from "./gear-def";

export const pickpocket: GearDef = {
  id: "pickpocket",
  name: "Trained Monkey",
  size: 2,
  window: "between-tricks",
  text: "Swap a card of your choice for a random card from a chosen teammate's hand.",
  downside: "The card you get may be worse.",
  targets: [{ kind: "teammate" }, { kind: "own-card" }],
  canTarget(ctx) {
    if (ctx.handSize(ctx.targets[0]!) === 0) {
      return "They have no cards";
    }
    return true;
  },
  apply(ctx) {
    const teammateSeatId = ctx.targets[0]!;
    const ownCardId = ctx.targets[1]!;
    const taken = ctx.randomCardIdFrom(teammateSeatId, "take");
    if (taken === null) {
      // Unreachable: canTarget already refused an empty teammate hand.
      throw new Error("pickpocket: apply: teammate hand is empty");
    }
    return [{ op: "swap-cards", seatA: ctx.self, cardIdA: ownCardId, seatB: teammateSeatId, cardIdB: taken }];
  },
};
