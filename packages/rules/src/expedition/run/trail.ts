// The stages between two camps, in order: the item draft, the event after
// every other camp, the route vote, the shop before a shop camp, then the
// loadout that sets out. The shop follows the route vote, so the crew shops
// knowing the camp it chose. Pure and keyed by the run length alone, since a
// length fixes where its boss and shop camps are; the web reads it to show
// the way ahead.

import { EVENT_EVERY, RUN_LENGTHS, SHOP_CAMPS } from "./balance";
import type { RunLength } from "./types";

export type Leg = "shop" | "draft" | "event" | "route" | "loadout";

export function isBossCamp(length: RunLength, camp: number): boolean {
  return RUN_LENGTHS[length].bossCamps.some((boss) => boss.at === camp);
}

/** A shop opens before this camp, after its route vote (SHOP_CAMPS). */
export function isShopCamp(length: RunLength, camp: number): boolean {
  return SHOP_CAMPS[length].includes(camp);
}

/** Camp 1 is fixed (the Jungle), so it has no route vote, and no event or
 * shop comes before it. */
export function legsTo(length: RunLength, next: number): readonly Leg[] {
  const event = next > 1 && (next - 2) % EVENT_EVERY === 0;
  const shop = next > 1 && isShopCamp(length, next);
  return ["draft", ...(event ? (["event"] as const) : []), ...(next > 1 ? (["route"] as const) : []), ...(shop ? (["shop"] as const) : []), "loadout"];
}

/** A failed (or restarted) camp goes back to its loadout, through the shop
 * again before a shop camp. */
export function replayLegs(length: RunLength, camp: number): readonly Leg[] {
  return isShopCamp(length, camp) ? ["shop", "loadout"] : ["loadout"];
}

/** The draft before `next` offers bundles of two after a boss camp. */
export function draftsBundles(length: RunLength, next: number): boolean {
  return isBossCamp(length, next - 1);
}
