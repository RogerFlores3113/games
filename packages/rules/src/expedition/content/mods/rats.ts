import { defineBoss } from "./mod-def";

export const rats = defineBoss({
  id: "rats",
  kind: "animal",
  name: "Rats",
  weight: 1,
  text: "Rats chew through the packs, so everyone has one fewer item slot.",
  full: {
    rules: (ctx) => ({ itemSlots: (prev) => (run, seatId) => (ctx.affects(seatId) ? Math.max(0, prev(run, seatId) - 1) : prev(run, seatId)) }),
  },
  half: {
    rules: (ctx) => ({
      itemSlots: (prev) => (run, seatId) => (ctx.run.seatIds.slice(0, 2).includes(seatId) && ctx.affects(seatId) ? Math.max(0, prev(run, seatId) - 1) : prev(run, seatId)),
    }),
  },
});
