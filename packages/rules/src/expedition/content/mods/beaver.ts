import { SUITS } from "../../deck";
import type { ExpeditionCard, Suit } from "../../state";
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
      const suit = dammed(ctx, state.currentTrick.index, every);
      if (suit === null || !ctx.affects(seatId)) return prev(state, seatId);
      const isDammed = (card: ExpeditionCard) => card.identity.kind === "standard" && card.identity.suit === suit;
      const hand = state.hands.find((h) => h.seatId === seatId)?.cards ?? [];
      // A joker is no suit, so a hand of the dammed suit and jokers plays as usual.
      if (!hand.some((card) => card.identity.kind === "standard" && !isDammed(card))) return prev(state, seatId);
      // Otherwise the dammed cards are out of play, even when their suit is led.
      return prev({ ...state, hands: state.hands.map((h) => (h.seatId === seatId ? { ...h, cards: h.cards.filter((card) => !isDammed(card)) } : h)) }, seatId);
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
  text: "The beaver dams one suit, moving on each trick: you can't play it, even when it is led, unless it is the only suit in your hand.",
  full: body(1),
  half: body(2),
});
