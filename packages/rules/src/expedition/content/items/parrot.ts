import { SUITS } from "../../deck";
import type { Suit } from "../../state";
import type { RunRules } from "../../run/run-rules";
import type { ExpeditionCard } from "../../state";
import { defineItem, itemAbility } from "../source-def";

/** The log event of a void signal: `void-signal:<suit>`. Private to the
 * signaller and the teammate told; the client words it as "<name> has no <suit>". */
export const VOID_SIGNAL = "void-signal:";

/** The suits none of `hand` reads as, jokers aside. */
function voidSuits(hand: readonly ExpeditionCard[], rules: RunRules): readonly Suit[] {
  const held = new Set<Suit>();
  for (const card of hand) {
    const identity = rules.identityOf(card);
    if (identity.kind === "standard") held.add(identity.suit);
  }
  return SUITS.filter((suit) => !held.has(suit));
}

export const parrot = defineItem({
  id: "parrot",
  name: "Parrot",
  rarity: "common",
  price: 1,
  uses: { kind: "per-camp" },
  text: "Tell a teammate one suit you have none of.",
  active: itemAbility({
    window: "between-tricks",
    targets: [
      {
        kind: "option",
        prompt: "Pick a suit you have none of",
        options: (scope) => voidSuits(scope.camp?.hands.find((h) => h.seatId === scope.seatId)?.cards ?? [], scope.rules),
      },
      { kind: "player", who: "teammate" },
    ],
    canUse: (ctx) => (voidSuits(ctx.ownHand(), ctx.rules).length > 0 ? true : "You hold every suit"),
    apply: (ctx) => [
      { op: "log", event: `${VOID_SIGNAL}${ctx.targets[0].value}`, subjectSeatIds: [ctx.targets[1].seatId], audience: [ctx.self, ctx.targets[1].seatId] },
    ],
  }),
});
