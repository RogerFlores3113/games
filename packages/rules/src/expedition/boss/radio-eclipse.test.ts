// Tests for Monsoon (radio-silence.ts) and Eclipse (eclipse.ts) — Plan
// 10-12, BOSS-01. Fixtures drive exclusively through applyRunAction and the
// run-test-support helpers (setupRun/advanceTo), per this plan's own
// <interfaces> note, except for the pure eclipseDeckFor/eclipseRemovedCards
// unit checks which need no run at all.

import { describe, expect, it } from "vitest";
import { applyRunAction } from "../run/run-actions";
import { advanceTo, setupRun } from "../run/run-test-support";
import { rulesFor } from "../run/compose";
import { currentActorSeatId } from "../camp";
import type { Catalog, CampNumber } from "../run/types";
import { radioSilence } from "./radio-silence";
import { eclipse, eclipseDeckFor, eclipseRemovedCards } from "./eclipse";
import { identitiesEqual } from "../deck";
import { trickWinner } from "../trick";
import type { CardIdentity, PlayerCount, TrickPlay } from "../state";

const SEED = "radio-eclipse-seed";

function makeCatalog(): Catalog {
  return {
    gear: {},
    bosses: { "radio-silence": radioSilence, eclipse },
  };
}

describe("Monsoon (radio-silence)", () => {
  const SEAT_IDS = ["p0", "p1", "p2"] as const;

  it("at a boss camp with Monsoon, any seat's whisper is blocked at between-tricks", () => {
    const catalog = makeCatalog();
    const run = advanceTo(
      setupRun({
        seatIds: [...SEAT_IDS],
        seed: SEED,
        catalog,
        campNumber: 3 as CampNumber,
        bossTwists: { 3: "radio-silence", 6: null },
      }),
      "between-tricks",
      catalog,
    );

    for (const seatId of SEAT_IDS) {
      const targetSeatId = SEAT_IDS.find((id) => id !== seatId)!;
      const cardId = run.attempt!.camp!.hands.find((h) => h.seatId === seatId)!.cards[0]!.id;
      const result = applyRunAction(run, seatId, { type: "whisper", targetSeatId, cardId }, catalog);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toBe("whisper_blocked");
    }
  });

  it("at camp 2 with the same catalog and no active boss, a whisper succeeds", () => {
    const catalog = makeCatalog();
    const run = advanceTo(
      setupRun({
        seatIds: [...SEAT_IDS],
        seed: SEED,
        catalog,
        campNumber: 2 as CampNumber,
      }),
      "between-tricks",
      catalog,
    );

    const cardId = run.attempt!.camp!.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;
    const result = applyRunAction(run, "p0", { type: "whisper", targetSeatId: "p1", cardId }, catalog);
    expect(result.ok).toBe(true);
  });
});

describe("Eclipse deck (eclipseDeckFor / eclipseRemovedCards)", () => {
  function hasJoker(deck: readonly CardIdentity[]): boolean {
    return deck.some((c) => c.kind === "joker");
  }

  function has(deck: readonly CardIdentity[], identity: CardIdentity): boolean {
    return deck.some((c) => identitiesEqual(c, identity));
  }

  it("deck sizes are 51 (3p), 52 (4p), 50 (5p)", () => {
    expect(eclipseDeckFor(3).length).toBe(51);
    expect(eclipseDeckFor(4).length).toBe(52);
    expect(eclipseDeckFor(5).length).toBe(50);
  });

  it("none contain a joker", () => {
    for (const playerCount of [3, 4, 5] as const) {
      expect(hasJoker(eclipseDeckFor(playerCount))).toBe(false);
    }
  });

  it("3p lacks 2♣", () => {
    expect(has(eclipseDeckFor(3), { kind: "standard", suit: "clubs", rank: 2 })).toBe(false);
  });

  it("4p contains every standard card", () => {
    const deck = eclipseDeckFor(4);
    expect(deck.length).toBe(52);
    expect(eclipseRemovedCards(4)).toEqual([]);
  });

  it("5p lacks 2♣ and 2♦ but contains 2♥ and 2♠", () => {
    const deck = eclipseDeckFor(5);
    expect(has(deck, { kind: "standard", suit: "clubs", rank: 2 })).toBe(false);
    expect(has(deck, { kind: "standard", suit: "diamonds", rank: 2 })).toBe(false);
    expect(has(deck, { kind: "standard", suit: "hearts", rank: 2 })).toBe(true);
    expect(has(deck, { kind: "standard", suit: "spades", rank: 2 })).toBe(true);
  });
});

describe("Eclipse at camp 3 (deal, leader, hand sizes)", () => {
  const EXPECTED_HAND_SIZE: Record<PlayerCount, number> = { 3: 17, 4: 13, 5: 10 };

  for (const playerCount of [3, 4, 5] as const) {
    it(`playerCount=${playerCount}: hand size ${EXPECTED_HAND_SIZE[playerCount]}, no jokers dealt, leader is A♠ holder, and picks first`, () => {
      const catalog = makeCatalog();
      const seatIds = Array.from({ length: playerCount }, (_, i) => `p${i}`);
      const run = advanceTo(
        setupRun({
          seatIds,
          seed: SEED,
          catalog,
          campNumber: 3 as CampNumber,
          bossTwists: { 3: "eclipse", 6: null },
        }),
        "objective-pick",
        catalog,
      );

      const camp = run.attempt!.camp!;
      for (const hand of camp.hands) {
        expect(hand.cards.length).toBe(EXPECTED_HAND_SIZE[playerCount]);
        expect(hand.cards.every((c) => c.identity.kind !== "joker")).toBe(true);
      }

      expect(camp.removedCards.some((c) => c.kind === "joker" && c.joker === "sun")).toBe(true);
      expect(camp.removedCards.some((c) => c.kind === "joker" && c.joker === "moon")).toBe(true);

      const aceOfSpadesHolder = camp.hands.find((h) =>
        h.cards.some((c) => c.identity.kind === "standard" && c.identity.suit === "spades" && c.identity.rank === 14),
      )!;
      expect(camp.expeditionLeaderSeatId).toBe(aceOfSpadesHolder.seatId);

      // The expedition leader is the first objective picker (D-09's window
      // is not open yet at objective-pick; only the leader may act).
      const result = applyRunAction(
        run,
        camp.expeditionLeaderSeatId,
        { type: "pick-objective", objectiveId: camp.objectives[0]!.id },
        catalog,
      );
      expect(result.ok).toBe(true);
    });
  }
});

describe("Eclipse tricks", () => {
  const SEAT_IDS = ["p0", "p1", "p2"] as const;

  it("driving one full trick with first legal plays, the winner is the highest card of the led suit", () => {
    const catalog = makeCatalog();
    const run = advanceTo(
      setupRun({
        seatIds: [...SEAT_IDS],
        seed: SEED,
        catalog,
        campNumber: 3 as CampNumber,
        bossTwists: { 3: "eclipse", 6: null },
      }),
      "between-tricks",
      catalog,
    );

    const rules = rulesFor(run, catalog);
    let state = run;

    for (let i = 0; i < SEAT_IDS.length; i++) {
      const camp = state.attempt!.camp!;
      const actorSeatId = currentActorSeatId(camp, rules);
      expect(actorSeatId).not.toBeNull();
      const legal = rules.legalPlays(camp, actorSeatId!);
      expect(legal.length).toBeGreaterThan(0);
      const cardId = legal[0]!.id;

      const result = applyRunAction(state, actorSeatId!, { type: "play-card", cardId }, catalog);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
    }

    const completed = state.attempt!.camp!.completedTricks;
    expect(completed.length).toBe(1);
    const trick = completed[0]!;

    const led = trick.plays[0]!.card.identity;
    const ledSuit = led.kind === "standard" ? led.suit : null;
    expect(ledSuit).not.toBeNull();

    const followingPlays: TrickPlay[] = trick.plays.filter(
      (p) => p.card.identity.kind === "standard" && p.card.identity.suit === ledSuit,
    );
    const expectedWinner = followingPlays.reduce((best, p) => {
      const bestRank = best.card.identity.kind === "standard" ? best.card.identity.rank : -1;
      const rank = p.card.identity.kind === "standard" ? p.card.identity.rank : -1;
      return rank > bestRank ? p : best;
    });

    expect(trick.winnerSeatId).toBe(expectedWinner.seatId);
  });

  it("(sanity) rulesFor(run).trickWinner on a trick with no jokers equals the base answer", () => {
    const catalog = makeCatalog();
    const run = advanceTo(
      setupRun({
        seatIds: [...SEAT_IDS],
        seed: SEED,
        catalog,
        campNumber: 3 as CampNumber,
        bossTwists: { 3: "eclipse", 6: null },
      }),
      "between-tricks",
      catalog,
    );

    const rules = rulesFor(run, catalog);
    const hands = run.attempt!.camp!.hands;
    const plays: TrickPlay[] = hands.map((h) => ({ seatId: h.seatId, card: h.cards[0]! }));

    expect(rules.trickWinner(plays)).toBe(trickWinner(plays));
  });
});
