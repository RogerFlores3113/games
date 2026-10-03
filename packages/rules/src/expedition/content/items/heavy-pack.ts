import { extraWhisper } from "../helpers";
import { defineItem } from "../source-def";

export const heavyPack = defineItem({
  id: "heavy-pack",
  name: "Heavy Pack",
  text: "You may whisper once more each camp, but a failed camp costs 1 more supply.",
  passive: {
    modifier: (owner) => ({
      ...extraWhisper(owner.seatId),
      failureCost: (prev) => (run) => prev(run) + 1,
    }),
  },
});
