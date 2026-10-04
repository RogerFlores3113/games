import { defineBoss, type ModBody, type ModCtx } from "./mod-def";

const ACE = 14;

const onTrick = (ctx: ModCtx, odd: boolean): boolean => !odd || (ctx.camp !== null && ctx.camp.currentTrick.index % 2 === 1);

const body = (odd: boolean): ModBody => ({
  rules: (ctx) => ({
    objectiveDeckFor: (prev) => (deck) => prev(deck).filter((identity) => identity.rank !== ACE),
    burns: (prev) => (plays, led, winnerOf) => {
      const burned = prev(plays, led, winnerOf);
      if (!onTrick(ctx, odd)) return burned;
      const kept = plays.filter((p) => !burned.includes(p.card.id));
      const top = kept.find((p) => p.seatId === winnerOf(kept))!;
      return [...burned, top.card.id];
    },
  }),
  status: (ctx) => (odd && ctx.camp !== null ? [{ kind: "alternating", activeNow: onTrick(ctx, odd) }] : []),
});

export const meteor = defineBoss({
  id: "meteor",
  kind: "disaster",
  name: "Meteor shower",
  weight: 1,
  text: "The card that would win each trick is vaporized, Sun and Moon included, so the next best wins, and no Ace is ever an objective.",
  full: body(false),
  half: body(true),
});
