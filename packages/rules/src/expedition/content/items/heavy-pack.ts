import type { RunState } from "../../run/types";
import { extraWhisper } from "../helpers";
import { defineItem } from "../source-def";

const ID = "heavy-pack";
/** Supplies a failed camp costs the crew while anyone carries a Heavy Pack. */
const EXTRA_FAILURE_COST = 1;

/** The crew's first equipped Heavy Pack, in seat order: the one copy that
 * adds the cost, so more packs never stack it. */
function costlyPack(run: RunState): string | undefined {
  return run.seats.flatMap((seat) => seat.equipped.filter((uid) => seat.items.some((item) => item.uid === uid && item.itemId === ID)))[0];
}

export const heavyPack = defineItem({
  id: ID,
  name: "Heavy Pack",
  rarity: "common",
  price: 3,
  text: "Whisper once more each camp; failing costs the crew 1 more supply, and packs don't stack.",
  passive: {
    modifier: (owner, sourceKey) => ({
      ...extraWhisper(owner.seatId),
      failureCost: (prev) => (run) => prev(run) + (sourceKey === costlyPack(run) ? EXTRA_FAILURE_COST : 0),
    }),
  },
});
