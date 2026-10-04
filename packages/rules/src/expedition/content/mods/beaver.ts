import { SUITS } from "../../deck";
import type { Suit } from "../../state";
import { defineBoss, type ModBody, type ModCtx } from "./mod-def";

/** The suit dammed on `trick`: every `every`th trick, from a rolled suit,
 * moving one suit along per trick. */
function dammed(ctx: ModCtx, trick: number, every: number): Suit | null {
  if (trick % every !== 0) return null;
  return SUITS[(ctx.roll("start", SUITS.length) + trick) % SUITS.length]!;
}

const body = (every: number): ModBody => ({
  rules: (ctx) => ({
    legalPlays: (prev) => (state, seatId) => {
      const legal = prev(state, seatId);
      const suit = dammed(ctx, state.currentTrick.index, every);
      if (suit === null || !ctx.affects(seatId)) return legal;
      const open = legal.filter((card) => card.identity.kind !== "standard" || card.identity.suit !== suit);
      // The dammed suit stays playable when no other suit is; a joker is never the only way out.
      return open.some((card) => card.identity.kind === "standard") ? open : legal;
    },
  }),
  status: (ctx) => {
    const suit = ctx.camp === null ? null : dammed(ctx, ctx.camp.currentTrick.index, every);
    return suit === null ? [] : [{ kind: "dam", suit }];
  },
});

export const beaver = defineBoss({
  id: "beaver",
  kind: "animal",
  name: "Beaver",
  weight: 1,
  text: "The beaver dams one suit, moving on each trick, and you may play it only when you have no other suit to play.",
  full: body(1),
  half: body(2),
});
