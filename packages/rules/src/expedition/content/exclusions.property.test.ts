// fast-check proof that "can't win" effects stack safely: any mix of
// Puffball (a seat) and Bait (a card) exclusions, in any order, still names
// a seat that played, and never one an effect excluded while another play
// was left standing.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { CATALOG } from "../run/catalog";
import { composeRules } from "../run/compose";
import type { ActiveEffect } from "../run/types";
import type { EffectParams } from "./source-def";
import type { ExpeditionCard, Suit, TrickPlay } from "../state";
import { sourceDef } from "../run/usage";

const SUITS: readonly Suit[] = ["spades", "hearts", "diamonds", "clubs"];

const cardArb = fc.oneof(
  fc.record({ suit: fc.constantFrom(...SUITS), rank: fc.integer({ min: 2, max: 14 }) }).map(
    ({ suit, rank }) => ({ kind: "standard", suit, rank }) as ExpeditionCard["identity"],
  ),
  fc.constantFrom("sun", "moon").map((joker) => ({ kind: "joker", joker }) as ExpeditionCard["identity"]),
);

const trickArb = fc.integer({ min: 3, max: 5 }).chain((n) =>
  fc.array(cardArb, { minLength: n, maxLength: n }).map((identities): TrickPlay[] =>
    identities.map((identity, i) => ({ seatId: `p${i}`, card: { id: `c${i}`, identity } })),
  ),
);

type Exclusion = { readonly sourceId: "puffball" | "bait"; readonly index: number };

const exclusionsArb = fc.array(
  fc.record({ sourceId: fc.constantFrom("puffball" as const, "bait" as const), index: fc.nat({ max: 4 }) }),
  { maxLength: 8 },
);

function effectFor(exclusion: Exclusion, plays: readonly TrickPlay[]): ActiveEffect {
  const target = plays[exclusion.index % plays.length]!;
  const params: EffectParams = exclusion.sourceId === "bait" ? { cardId: target.card.id } : {};
  const seatId = exclusion.sourceId === "puffball" ? target.seatId : "p0";
  return { sourceId: exclusion.sourceId, seatId, atTrick: 0, lasts: "trick", params, audience: "public" };
}

describe("property: stacked can't-win effects", () => {
  it("always name a seat that played, and a non-excluded one whenever any play is left", () => {
    fc.assert(
      fc.property(trickArb, exclusionsArb, (plays, exclusions) => {
        const effects = exclusions.map((exclusion) => effectFor(exclusion, plays));
        const rules = composeRules(effects.map((effect) => sourceDef(CATALOG, effect.sourceId).active!.effect!(effect)));
        const excluded = new Set(exclusions.map((exclusion) => plays[exclusion.index % plays.length]!.seatId));

        const winner = rules.trickWinner(plays);

        expect(plays.map((play) => play.seatId)).toContain(winner);
        if (plays.some((play) => !excluded.has(play.seatId))) expect(excluded.has(winner)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
