import type { CardIdentity, Suit } from "../../state";
import { defineBoss, type ModBody, type ModCtx } from "./mod-def";

const RED: Readonly<Partial<Record<Suit, Suit>>> = { spades: "diamonds", clubs: "hearts" };

function risen(ctx: ModCtx, period: number): boolean {
  return ctx.camp !== null && ctx.camp.currentTrick.index % period === period - 1;
}

/** The moon is up on the trick in play when its index is period - 1 mod period. */
const body = (period: number): ModBody => ({
  rules: (ctx) => ({
    identityOf: (prev) => (card) => {
      const identity = prev(card);
      if (identity.kind !== "standard" || !risen(ctx, period)) return identity;
      const suit = RED[identity.suit];
      return suit === undefined ? identity : ({ ...identity, suit } satisfies CardIdentity);
    },
  }),
  status: (ctx) => (ctx.camp === null ? [] : [{ kind: "alternating", activeNow: risen(ctx, period) }]),
});

export const bloodMoon = defineBoss({
  id: "blood-moon",
  kind: "disaster",
  name: "Blood Moon",
  weight: 1,
  text: "On every other trick the blood moon turns spades into diamonds and clubs into hearts.",
  full: body(2),
  half: body(4),
});
