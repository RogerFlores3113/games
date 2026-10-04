// A1: the run carries only its `seed` string, never generator state. Every
// draw derives a fresh sfc32 stream by a unique name, via
// seedToRngState(seed, stream) in ../../shuffle.ts.
//
// STREAMS is the single builder for every run-level draw-site name. Two
// draws never share a name; rng.test.ts proves it pairwise over a grid of
// every builder's arguments.

import { nextRandom, seedToRngState } from "../../shuffle";

export function attemptSeed(seed: string, campIndex: number, attemptNumber: number): string {
  return `${seed}:camp${campIndex}:attempt${attemptNumber}`;
}

export type RouteField = "location" | "fair" | "weather" | "event" | "mix" | "boss";
/** An item draw rolls its rarity, then picks an item of that rarity. */
export type ItemDrawPart = "rarity" | "pick";

export const STREAMS = {
  lengthVote(): string {
    return "expedition-vote:length";
  },
  /** `nextCamp` is the camp the route leads to. */
  plannedBoss(tier: "animal" | "disaster"): string {
    return `expedition-plan:${tier}`;
  },
  routeVote(nextCamp: number): string {
    return `expedition-vote:route:camp${nextCamp}`;
  },
  routeCount(nextCamp: number): string {
    return `expedition-route:camp${nextCamp}:count`;
  },
  /** `reroll` counts the option's rerolls; the mix and boss draw at 0 only. */
  routeField(nextCamp: number, reroll: number, option: number, field: RouteField): string {
    return `expedition-route:camp${nextCamp}:reroll${reroll}:option${option}:${field}`;
  },
  draftItem(clearedCamp: number, seatId: string, offer: number, bundle: number, item: number, part: ItemDrawPart): string {
    return `expedition-draft:camp${clearedCamp}:seat${seatId}:offer${offer}:bundle${bundle}:item${item}:${part}`;
  },
  /** A replay of the boss camp is a new visit with the same names, so the same stock. */
  shopItem(campIndex: number, item: number, part: ItemDrawPart): string {
    return `expedition-shop:camp${campIndex}:item${item}:${part}`;
  },
  trickCountKind(campIndex: number, attemptNumber: number): string {
    return `expedition-trickcount-kind:camp${campIndex}:attempt${attemptNumber}`;
  },
  trickCountN(campIndex: number, attemptNumber: number): string {
    return `expedition-trickcount-n:camp${campIndex}:attempt${attemptNumber}`;
  },
  ability(campIndex: number, attemptNumber: number, seatId: string, useIndex: number, draw: number): string {
    return `expedition-ability:camp${campIndex}:attempt${attemptNumber}:seat${seatId}:use${useIndex}:draw${draw}`;
  },
  /** Item `item` of bundle `bundle` of an offer an ability draws (`ctx.drawOffer`), its j-th draw. */
  abilityItem(campIndex: number, attemptNumber: number, seatId: string, useIndex: number, draw: number, bundle: number, item: number, part: ItemDrawPart): string {
    return `expedition-ability:camp${campIndex}:attempt${attemptNumber}:seat${seatId}:use${useIndex}:draw${draw}:bundle${bundle}:item${item}:${part}`;
  },
  /** The order a seat sees a teammate's hand fanned in, until its next use. */
  fan(campIndex: number, attemptNumber: number, seatId: string, ofSeatId: string, useIndex: number): string {
    return `expedition-fan:camp${campIndex}:attempt${attemptNumber}:seat${seatId}:of${ofSeatId}:use${useIndex}`;
  },
  /** An option target's `scope.roll(label)`; the same label repeats within an attempt. */
  option(campIndex: number, attemptNumber: number, seatId: string, label: string): string {
    return `expedition-option:camp${campIndex}:attempt${attemptNumber}:seat${seatId}:${label}`;
  },
  /** The n-th objective added to a camp by an ability, minted after the deal's. */
  addedObjective(campIndex: number, attemptNumber: number, n: number): string {
    return `expedition-objective-added:camp${campIndex}:attempt${attemptNumber}:n${n}`;
  },
  /** A source's j-th draw while reacting to one event; `place` is
   * `camp{k}:attempt{A}`, or `muster` before the first camp. */
  sourceDraw(sourceKey: string, seatId: string, place: string, eventKey: string, draw: number): string {
    return `expedition-source:${sourceKey}:seat${seatId}:${place}:on:${eventKey}:draw${draw}`;
  },
  /** Item `item` of bundle `bundle` of an offer a source draws while reacting. */
  sourceItem(sourceKey: string, seatId: string, place: string, eventKey: string, draw: number, bundle: number, item: number, part: ItemDrawPart): string {
    return `expedition-source:${sourceKey}:seat${seatId}:${place}:on:${eventKey}:draw${draw}:bundle${bundle}:item${item}:${part}`;
  },
  /** A camp modifier's `ctx.roll(label)`; the same label repeats within an attempt. */
  modRule(modId: string, strength: string, campIndex: number, attemptNumber: number, label: string): string {
    return `expedition-mod:${modId}:${strength}:camp${campIndex}:attempt${attemptNumber}:rule:${label}`;
  },
  /** A camp modifier's j-th `ctx.draw` or `ctx.randomCards` while reacting to one event. */
  modDraw(modId: string, strength: string, campIndex: number, attemptNumber: number, eventKey: string, draw: number): string {
    return `expedition-mod:${modId}:${strength}:camp${campIndex}:attempt${attemptNumber}:on:${eventKey}:draw${draw}`;
  },
};

/** Seeded 0..n-1 draw. Throws for a non-positive-integer n. */
export function seededIndex(seed: string, stream: string, n: number): number {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`seededIndex: n must be a positive integer, got ${n}`);
  }
  const state = seedToRngState(seed, stream);
  const { value } = nextRandom(state);
  return Math.floor((value / 4294967296) * n);
}
