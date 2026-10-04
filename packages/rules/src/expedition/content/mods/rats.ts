import { defineBoss } from "./mod-def";

export const rats = defineBoss({
  id: "rats",
  kind: "animal",
  name: "Rats",
  weight: 1,
  text: "Rats chew through the packs, so everyone has one fewer item slot.",
  full: {
    rules: () => ({ itemSlots: (prev) => (run, seatId) => Math.max(0, prev(run, seatId) - 1) }),
  },
  half: {
    rules: (ctx) => ({
      itemSlots: (prev) => (run, seatId) => (ctx.run.seatIds.slice(0, 2).includes(seatId) ? Math.max(0, prev(run, seatId) - 1) : prev(run, seatId)),
    }),
  },
});
