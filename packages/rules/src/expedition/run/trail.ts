// The stages between two camps, in order: the shop before a boss camp, the
// item draft, the event after every other camp, the route vote, then the
// loadout that sets out. Pure and keyed by the run length alone, since a
// length fixes where its boss camps are; the web reads it to show the way
// ahead.

import { EVENT_EVERY, RUN_LENGTHS } from "./balance";
import type { RunLength } from "./types";

export type Leg = "shop" | "draft" | "event" | "route" | "loadout";

export function isBossCamp(length: RunLength, camp: number): boolean {
  return RUN_LENGTHS[length].bossCamps.some((boss) => boss.at === camp);
}

/** Camp 1 is fixed (the Jungle), so it has no route vote, and no event
 * comes before it. */
export function legsTo(length: RunLength, next: number): readonly Leg[] {
  const event = next > 1 && (next - 2) % EVENT_EVERY === 0;
  return [...(isBossCamp(length, next) ? (["shop"] as const) : []), "draft", ...(event ? (["event"] as const) : []), ...(next > 1 ? (["route"] as const) : []), "loadout"];
}

/** A failed (or restarted) camp goes back to its loadout, through the shop
 * again before a boss camp. */
export function replayLegs(length: RunLength, camp: number): readonly Leg[] {
  return isBossCamp(length, camp) ? ["shop", "loadout"] : ["loadout"];
}

/** The draft before `next` offers bundles of two after a boss camp. */
export function draftsBundles(length: RunLength, next: number): boolean {
  return isBossCamp(length, next - 1);
}
