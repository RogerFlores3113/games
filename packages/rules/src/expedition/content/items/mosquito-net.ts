import { defineItem } from "../source-def";

export const mosquitoNet = defineItem({
  id: "mosquito-net",
  name: "Mosquito Net",
  text: "Boss twists can't stop your whispers.",
  // A passive layers after the boss, so it lifts a boss's silence for its
  // owner; an effect such as Rain Poncho's layers later and still wins.
  passive: {
    modifier: (owner) => ({
      whisperAllowed: (prev) => (run, seatId) => seatId === owner.seatId || prev(run, seatId),
    }),
  },
});
