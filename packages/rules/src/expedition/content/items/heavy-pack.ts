import type { RunState } from "../../run/types";
import { extraWhisper } from "../helpers";
import { defineItem } from "../source-def";

const ID = "heavy-pack";
/** Coins a failed camp takes from the crew's purse while anyone carries a Heavy Pack. */
const FAILURE_COIN_LOSS = 2;

/** The crew's first equipped Heavy Pack, in seat order: the one copy that
 * charges the coins, so more packs never stack it. */
function costlyPack(run: RunState): string | undefined {
  return run.seats.flatMap((seat) => seat.equipped.filter((uid) => seat.items.some((item) => item.uid === uid && item.itemId === ID)))[0];
}

export const heavyPack = defineItem({
  id: ID,
  name: "Heavy Pack",
  rarity: "common",
  price: 2,
  text: "Whisper once more each camp; a failed camp costs 2 coins, and packs don't stack.",
  passive: {
    modifier: (owner, sourceKey) => ({
      ...extraWhisper(owner.seatId),
      failureCoins: (prev) => (run) => prev(run) + (sourceKey === costlyPack(run) ? FAILURE_COIN_LOSS : 0),
    }),
  },
});
