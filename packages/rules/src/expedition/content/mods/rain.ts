import { WASHES } from "../../run/balance";
import { crewWhispers } from "../../run/whisper";
import { defineMod, type ModBody, type ModCtx } from "./mod-def";

type Wash = { readonly spared: number; readonly exposed: number };

function washes(ctx: ModCtx, seats: number, wash: Wash): number {
  return Math.max(0, seats - wash.spared) + (ctx.exposed ? wash.exposed : 0);
}

/** Rain and Downpour: the crew's first whispers each camp wash away. */
export function washingBody(wash: Wash): ModBody {
  return {
    rules: (ctx) => ({ washedWhispers: (prev) => (run) => prev(run) + washes(ctx, run.seatIds.length, wash) }),
    status: (ctx) => {
      const of = washes(ctx, ctx.run.seatIds.length, wash);
      return [{ kind: "washes", left: Math.max(0, of - crewWhispers(ctx.run)), of }];
    },
  };
}

export const rain = defineMod({
  id: "rain",
  kind: "weather",
  name: "Rain",
  weight: 3,
  text: "Rain drowns out the crew's first whispers, one for each player beyond two.",
  full: washingBody(WASHES.rain),
});
