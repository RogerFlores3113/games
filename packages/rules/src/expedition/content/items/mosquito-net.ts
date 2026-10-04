import { defineItem } from "../source-def";

export const mosquitoNet = defineItem({
  id: "mosquito-net",
  name: "Mosquito Net",
  rarity: "rare",
  price: 4,
  text: "Nothing can stop your whispers.",
  passive: {
    modifier: (owner) => ({
      whisperAllowed: (prev) => (run, seatId) => seatId === owner.seatId || prev(run, seatId),
    }),
  },
});
