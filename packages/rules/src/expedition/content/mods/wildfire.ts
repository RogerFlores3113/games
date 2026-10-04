import type { TrickPlay } from "../../state";
import { defineBoss, type ModBody, type ModCtx } from "./mod-def";

/** The lowest printed standard card; a tie burns the earliest. The Sun and
 * Moon never burn. */
function lowest(plays: readonly TrickPlay[]): TrickPlay | null {
  let low: { readonly play: TrickPlay; readonly rank: number } | null = null;
  for (const play of plays) {
    const identity = play.card.identity;
    if (identity.kind === "standard" && (low === null || identity.rank < low.rank)) low = { play, rank: identity.rank };
  }
  return low?.play ?? null;
}

const onTrick = (ctx: ModCtx, odd: boolean): boolean => !odd || (ctx.camp !== null && ctx.camp.currentTrick.index % 2 === 1);

const body = (odd: boolean): ModBody => ({
  rules: (ctx) => ({
    burns: (prev) => (plays, led, winnerOf) => {
      const burned = prev(plays, led, winnerOf);
      const low = onTrick(ctx, odd) ? lowest(plays.filter((p) => !burned.includes(p.card.id))) : null;
      return low === null ? burned : [...burned, low.card.id];
    },
  }),
  status: (ctx) => (odd && ctx.camp !== null ? [{ kind: "alternating", activeNow: onTrick(ctx, odd) }] : []),
});

export const wildfire = defineBoss({
  id: "wildfire",
  kind: "disaster",
  name: "Wildfire",
  weight: 1,
  text: "The lowest card of every trick burns, so it can't win the trick or count for an objective.",
  full: body(false),
  half: body(true),
});
