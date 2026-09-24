// Whole-camp fast-check simulation properties (Phase 9, Plan 06). Drives
// camps end-to-end through driveCamp (test-support.ts), which applies every
// step through the real applyCampAction transition — these properties are
// the phase's evidence for ROADMAP success criteria 2 (joker-suit following
// across deck sizes inside real play) and part of criterion 4 (whole-camp
// confirmation of XRULE-01..04, 06, 08). The assertion oracles below
// deliberately restate the spec's rule text (follow-suit, forced joker,
// trick winner, leader) independently of trick.ts/leader.ts, rather than
// calling those modules — this is the point of a property test proving the
// real engine, not a self-confirming rerun of the engine's own code (see
// test-support.ts's T-03-24 header for the analogous discipline on the
// enumerator side).

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { identitiesEqual } from "./deck";
import { checkCampOutcome, createCamp } from "./camp";
import { objectiveStatuses } from "./objectives";
import { driveCamp, enumerateLegalActions, locateAllCards } from "./test-support";
import type { CardIdentity, ObjectiveSlot, PlayerCount } from "./state";

const HAND_SIZE: Record<PlayerCount, number> = { 3: 18, 4: 13, 5: 10 };
const DEAL_SIZE: Record<PlayerCount, number> = { 3: 54, 4: 52, 5: 50 };

type RawSlotSpec = {
  cardBearingKinds: readonly ("win-card" | "ordered")[];
  includeLast: boolean;
  trickCount: { kind: "no-tricks" } | { kind: "exactly-n"; nRaw: number } | undefined;
};

const rawSlotsArb: fc.Arbitrary<RawSlotSpec> = fc.record({
  cardBearingKinds: fc.array(fc.constantFrom<"win-card" | "ordered">("win-card", "ordered"), {
    minLength: 1,
    maxLength: 5,
  }),
  includeLast: fc.boolean(),
  trickCount: fc.option(
    fc.oneof(
      fc.constant<{ kind: "no-tricks" }>({ kind: "no-tricks" }),
      fc.nat({ max: 18 }).map((nRaw) => ({ kind: "exactly-n" as const, nRaw })),
    ),
    { nil: undefined },
  ),
});

/** Assigns ordered markers 1, 2, 3... in order of appearance, optionally
 * converting the LAST ordered slot's marker to "last"; then clamps an
 * exactly-n slot's n to the camp's actual hand size for playerCount, since
 * createCamp rejects n outside [0, totalTricks]. */
function buildObjectiveSlots(playerCount: PlayerCount, raw: RawSlotSpec): ObjectiveSlot[] {
  let orderCounter = 0;
  const slots: ObjectiveSlot[] = raw.cardBearingKinds.map((kind) => {
    if (kind === "win-card") return { kind: "win-card" };
    orderCounter++;
    return { kind: "ordered", order: orderCounter };
  });

  if (raw.includeLast) {
    const lastOrderedIndex = slots.reduce((found, slot, i) => (slot.kind === "ordered" ? i : found), -1);
    if (lastOrderedIndex >= 0) {
      slots[lastOrderedIndex] = { kind: "ordered", order: "last" };
    }
  }

  if (raw.trickCount !== undefined) {
    if (raw.trickCount.kind === "no-tricks") {
      slots.push({ kind: "no-tricks" });
    } else {
      slots.push({ kind: "exactly-n", n: Math.min(raw.trickCount.nRaw, HAND_SIZE[playerCount]) });
    }
  }

  return slots;
}

const campInputArb = fc
  .tuple(
    fc.constantFrom(3, 4, 5) as fc.Arbitrary<PlayerCount>,
    fc.stringMatching(/^[0-9a-f]{32}$/),
    fc.array(fc.nat({ max: 40 }), { minLength: 1, maxLength: 80 }),
    rawSlotsArb,
  )
  .map(([playerCount, seed, choices, raw]) => ({
    playerCount,
    seed,
    choices,
    objectiveSlots: buildObjectiveSlots(playerCount, raw),
  }));

function seatIdsFor(playerCount: PlayerCount): string[] {
  return Array.from({ length: playerCount }, (_, i) => `seat-${i}`);
}

describe("property: whole-camp simulation", () => {
  it("terminates, and conserves every dealt card with no collisions", () => {
    fc.assert(
      fc.property(campInputArb, ({ playerCount, seed, choices, objectiveSlots }) => {
        const initial = createCamp({ seatIds: seatIdsFor(playerCount), seed, objectiveSlots });
        const { states } = driveCamp(initial, choices);

        const final = states[states.length - 1]!;
        expect(checkCampOutcome(final).status).not.toBe("in_progress");
        expect(final.completedTricks.length).toBeLessThanOrEqual(final.totalTricks);

        for (const state of states) {
          const located = locateAllCards(state);
          expect(located.size).toBe(DEAL_SIZE[playerCount]);
          for (const location of located.values()) {
            expect(location.includes("+")).toBe(false);
          }

          const dealtIdentities: CardIdentity[] = [];
          for (const hand of state.hands) for (const c of hand.cards) dealtIdentities.push(c.identity);
          for (const trick of state.completedTricks) for (const p of trick.plays) dealtIdentities.push(p.card.identity);
          for (const p of state.currentTrick.plays) dealtIdentities.push(p.card.identity);

          for (const removed of state.removedCards) {
            expect(dealtIdentities.some((identity) => identitiesEqual(identity, removed))).toBe(false);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("obeys the spec's follow-suit, forced-joker, trick-winner and leader text at every accepted action, and the Sun holder picks and leads first", () => {
    fc.assert(
      fc.property(campInputArb, ({ playerCount, seed, choices, objectiveSlots }) => {
        const initial = createCamp({ seatIds: seatIdsFor(playerCount), seed, objectiveSlots });

        const sunHolder = initial.hands.find((h) =>
          h.cards.some((c) => c.identity.kind === "joker" && c.identity.joker === "sun"),
        );
        expect(sunHolder).toBeDefined();
        expect(initial.expeditionLeaderSeatId).toBe(sunHolder!.seatId);
        expect(initial.currentTrick.leaderSeatId).toBe(initial.expeditionLeaderSeatId);

        const { states, actions } = driveCamp(initial, choices);

        expect(actions.length).toBeGreaterThan(0);
        expect(actions[0]!.action.type).toBe("pick-objective");
        expect(actions[0]!.seatId).toBe(initial.expeditionLeaderSeatId);

        for (let i = 0; i < actions.length; i++) {
          const { seatId, action } = actions[i]!;
          if (action.type !== "play-card") continue;

          const before = states[i]!;
          const after = states[i + 1]!;

          const handBefore = before.hands.find((h) => h.seatId === seatId)!.cards;
          const played = handBefore.find((c) => c.id === action.cardId)!;
          const led = before.currentTrick.plays.length === 0 ? null : before.currentTrick.plays[0]!.card.identity;

          if (led !== null && led.kind === "joker") {
            const otherJoker = led.joker === "sun" ? "moon" : "sun";
            const holdsOther = handBefore.some(
              (c) => c.identity.kind === "joker" && c.identity.joker === otherJoker,
            );
            if (holdsOther) {
              expect(played.identity.kind).toBe("joker");
              if (played.identity.kind === "joker") expect(played.identity.joker).toBe(otherJoker);
            }
          } else if (led !== null && led.kind === "standard") {
            const holdsSuit = handBefore.some(
              (c) => c.identity.kind === "standard" && c.identity.suit === led.suit,
            );
            if (holdsSuit) {
              expect(played.identity.kind).toBe("standard");
              if (played.identity.kind === "standard") expect(played.identity.suit).toBe(led.suit);
            }
          }

          const completedNow = after.completedTricks.length > before.completedTricks.length;
          if (!completedNow) continue;

          const trick = after.completedTricks[after.completedTricks.length - 1]!;
          const sunPlay = trick.plays.find(
            (p) => p.card.identity.kind === "joker" && p.card.identity.joker === "sun",
          );
          const moonPlay = trick.plays.find(
            (p) => p.card.identity.kind === "joker" && p.card.identity.joker === "moon",
          );

          let expectedWinner: string;
          if (sunPlay !== undefined) {
            expectedWinner = sunPlay.seatId;
          } else if (moonPlay !== undefined) {
            expectedWinner = moonPlay.seatId;
          } else {
            const ledIdentity = trick.plays[0]!.card.identity;
            expect(ledIdentity.kind).toBe("standard");
            const ledSuit = ledIdentity.kind === "standard" ? ledIdentity.suit : null;
            let bestRank = -1;
            let bestSeat: string | null = null;
            for (const play of trick.plays) {
              const identity = play.card.identity;
              if (identity.kind === "standard" && identity.suit === ledSuit && identity.rank > bestRank) {
                bestRank = identity.rank;
                bestSeat = play.seatId;
              }
            }
            expect(bestSeat).not.toBeNull();
            expectedWinner = bestSeat!;
          }

          expect(trick.winnerSeatId).toBe(expectedWinner);
          if (after.completedTricks.length < after.totalTricks) {
            expect(after.currentTrick.leaderSeatId).toBe(expectedWinner);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("keeps objective statuses monotone across every step, and enumerateLegalActions is non-empty exactly while in_progress", () => {
    fc.assert(
      fc.property(campInputArb, ({ playerCount, seed, choices, objectiveSlots }) => {
        const initial = createCamp({ seatIds: seatIdsFor(playerCount), seed, objectiveSlots });
        const { states } = driveCamp(initial, choices);

        for (const state of states) {
          const outcome = checkCampOutcome(state);
          const legalCount = enumerateLegalActions(state).length;
          if (outcome.status === "in_progress") {
            expect(legalCount).toBeGreaterThan(0);
          } else {
            expect(legalCount).toBe(0);
          }
        }

        let previousStatuses = new Map(objectiveStatuses(states[0]!).map((s) => [s.objectiveId, s.status]));
        for (let i = 1; i < states.length; i++) {
          const currentStatuses = new Map(objectiveStatuses(states[i]!).map((s) => [s.objectiveId, s.status]));
          for (const [id, prevStatus] of previousStatuses) {
            const nowStatus = currentStatuses.get(id)!;
            if (prevStatus === "failed") expect(nowStatus).toBe("failed");
            if (prevStatus === "done") expect(nowStatus).toBe("done");
          }
          previousStatuses = currentStatuses;
        }
      }),
      { numRuns: 200 },
    );
  });
});
