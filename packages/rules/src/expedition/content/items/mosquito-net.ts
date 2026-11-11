import { defineItem } from "../source-def";

export const mosquitoNet = defineItem({
  id: "mosquito-net",
  name: "Mosquito Net",
  rarity: "common",
  price: 2,
  text: "Rain can't stop your whispers.",
  passive: {
    modifier: (owner) => ({
      whisperAllowed: (prev) => (run, seatId) => seatId === owner.seatId || prev(run, seatId),
    }),
  },
});
