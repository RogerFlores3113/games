// Failure-timing properties for exactly-n, no-tricks and ordered objectives
// (Phase 9, Plan 06/07, XRULE-07). The oracles below independently restate
// spec §5.2 plus objectives.ts's A-TIE/A-LAST/A-END assumptions directly
// from `completedTricks` — they never call `evaluateObjective` or any other
// objectives.ts helper (countTricksWon, tricksRemaining, trickContaining)
// internally, so this is a genuine proof against the engine, not a
// self-confirming rerun of it. `evaluateObjective` is used ONLY on the
// comparison side of assertions, and directly in the camp-stop property
// (which tests camp.ts's checkCampOutcome against objectives.ts's real
// evaluator — both real engine functions, not the independent oracle).
//
// WR-02 (09-07): `orderedOracle` is a PAIR-BASED restatement of spec §5.2,
// not a transcription of orderedKind.evaluate's control flow. It shares no
// unresolved/resolved branch split with the implementation, and its marker
// comparison (markerPrecedes) never maps "last" to Number.POSITIVE_INFINITY
// the way objectives.ts's own markerValue does. The prior oracle copied the
// evaluator branch for branch, so it reproduced the evaluator's own bugs
// (WR-01) instead of catching them.
//
// A-LOST: the oracles treat a target as lost when its printed card burned,
// counted as another identity, or was discarded, and whichever of its win or
// its loss came first decides; a target unresolved after the final trick
// fails. The raw sequence marks random plays burned or counted-as and
// discards a random card, so monotonicity is proven over those too.
//
// The "raw trick sequence" property below builds CampState prefixes
// directly from a hand-rolled trick sequence, NOT via driveCamp or
// applyCampAction. Those helpers halt play at the first objective failure
// (XRULE-07/08), so they can never reach the post-failure states this
// property needs to prove monotonicity (WR-01) over.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { identitiesEqual } from "./deck";
import { checkCampOutcome, createCamp } from "./camp";
import { evaluateObjective } from "./objectives";
import { driveCamp } from "./test-support";
import type {
  CampState,
  CardIdentity,
  CompletedTrick,
  Discard,
  ExactlyNObjective,
  ExpeditionCard,
  Hand,
  Objective,
  ObjectiveKind,
  ObjectiveSlot,
  ObjectiveStatus,
  OrderedObjective,
  OrderMarker,
  PlayerCount,
  ResolvedPlay,
  StandardIdentity,
} from "./state";

const HAND_SIZE: Record<PlayerCount, number> = { 3: 18, 4: 13, 5: 10 };

function seatIdsFor(playerCount: PlayerCount): string[] {
  return Array.from({ length: playerCount }, (_, i) => `seat-${i}`);
}

// --- Local data helpers (deliberately NOT imported from objectives.ts) ---

function wonTricksBy(state: CampState, seatId: string): number {
  return state.completedTricks.filter((t) => t.winnerSeatId === seatId).length;
}

function remainingTricks(state: CampState): number {
  return state.totalTricks - state.completedTricks.length;
}

/** The first completed trick an unburned play counting as `target` sits
 * in, unless the printed target card was lost before it (A-LOST). */
function trickResolutionFor(state: CampState, target: CardIdentity): { index: number; winnerSeatId: string } | undefined {
  const lost = lossOf(state, target);
  for (const trick of state.completedTricks) {
    if (lost !== undefined && trick.index > lost) return undefined;
    for (const play of trick.plays) {
      if (!play.burned && identitiesEqual(play.countsAs ?? play.card.identity, target)) {
        return { index: trick.index, winnerSeatId: trick.winnerSeatId };
      }
    }
  }
  return undefined;
}

/** When the printed target card left play: the trick it burned in or was
 * read as another card in, or between the tricks around its discard. */
function lossOf(state: CampState, target: CardIdentity): number | undefined {
  for (const trick of state.completedTricks) {
    for (const play of trick.plays) {
      if (identitiesEqual(play.card.identity, target) && (play.burned || play.countsAs !== null)) return trick.index;
    }
  }
  const discard = state.discards.find((d) => identitiesEqual(d.card.identity, target));
  return discard === undefined ? undefined : discard.afterTrick - 0.5;
}

/** Win-card per spec §5.2 plus A-LOST: decided by the earlier of its win and
 * its loss; unresolved after the final trick, it failed. */
function winCardOracle(state: CampState, objective: { ownerSeatId: string | null; target: CardIdentity }): ObjectiveStatus {
  if (objective.ownerSeatId === null) return "pending";
  const mine = trickResolutionFor(state, objective.target);
  if (mine !== undefined) return mine.winnerSeatId === objective.ownerSeatId ? "done" : "failed";
  if (lossOf(state, objective.target) !== undefined || remainingTricks(state) === 0) return "failed";
  return "pending";
}

/** True iff marker `a` must be won no later than marker `b` (spec §5.2's
 * ordering relation), with NO numeric mapping of "last" (WR-02: the prior
 * oracle's Number.POSITIVE_INFINITY marker value mirrored the evaluator's
 * own markerValue helper line for line). Equal markers never precede one
 * another. "last" never precedes anything (it must resolve after every
 * numbered marker). Anything other than "last" precedes "last". Two numbered
 * markers compare with plain `<`. */
function markerPrecedes(a: OrderMarker, b: OrderMarker): boolean {
  if (a === b) return false;
  if (b === "last") return a !== "last";
  if (a === "last") return false;
  return a < b;
}

// --- Independent oracles (spec §5.2 + A-TIE/A-LAST/A-END, restated) ---

function exactlyNOracle(state: CampState, objective: ExactlyNObjective): ObjectiveStatus {
  if (objective.ownerSeatId === null) return "pending";
  const won = wonTricksBy(state, objective.ownerSeatId);
  const remaining = remainingTricks(state);
  if (won > objective.n) return "failed"; // exceeded
  if (won + remaining < objective.n) return "failed"; // unreachable
  if (remaining === 0) return won === objective.n ? "done" : "failed";
  return "pending";
}

function noTricksOracle(state: CampState, objective: { ownerSeatId: string | null }): ObjectiveStatus {
  if (objective.ownerSeatId === null) return "pending";
  const won = wonTricksBy(state, objective.ownerSeatId);
  if (won > 0) return "failed";
  return remainingTricks(state) === 0 ? "done" : "pending";
}

/** WR-02: a pair-based restatement of spec §5.2's "ordered" row, sharing no
 * control flow with orderedKind.evaluate's unresolved/resolved branch split.
 * Failure holds iff any of:
 *   F0 (A-LOST) — this objective's card was lost before any win of it, or
 *      it is unresolved after the final trick;
 *   F1 (base win-card rule) — this objective's own card was resolved by a
 *      trick whose winner is not this objective's owner;
 *   F2 (A-LAST) — this objective is marked "last", its own card is resolved,
 *      and it did not resolve in the camp's actual final trick;
 *   F3 (a broken pair) — for some OTHER ordered objective with a different
 *      marker, the pair (lo, hi) ordered by markerPrecedes has its "hi" side
 *      resolved while its "lo" side is either unresolved or resolved at a
 *      strictly later trick index (equal indices are in order — A-TIE).
 * Otherwise: "done" once this objective's own card is resolved, else
 * "pending" (unowned objectives are "pending" unconditionally). */
function orderedOracle(
  state: CampState,
  objective: OrderedObjective,
  allOrdered: readonly OrderedObjective[],
): ObjectiveStatus {
  if (objective.ownerSeatId === null) return "pending";

  const mine = trickResolutionFor(state, objective.target);

  // F0: A-LOST.
  if (mine === undefined && lossOf(state, objective.target) !== undefined) return "failed";

  // F1: base win-card rule.
  if (mine !== undefined && mine.winnerSeatId !== objective.ownerSeatId) return "failed";

  // F2: A-LAST.
  if (objective.order === "last" && mine !== undefined && mine.index !== state.totalTricks - 1) {
    return "failed";
  }

  // F3: a broken pair against every OTHER ordered objective with a
  // different marker.
  for (const other of allOrdered) {
    if (other.id === objective.id || other.order === objective.order) continue;

    const otherRes = trickResolutionFor(state, other.target);
    const thisFirst = markerPrecedes(objective.order, other.order);
    const loRes = thisFirst ? mine : otherRes;
    const hiRes = thisFirst ? otherRes : mine;

    if (hiRes !== undefined && (loRes === undefined || loRes.index > hiRes.index)) {
      return "failed";
    }
  }

  if (mine !== undefined) return "done";
  return remainingTricks(state) === 0 ? "failed" : "pending";
}

// --- Generators ---

const playerCountArb = fc.constantFrom(3, 4, 5) as fc.Arbitrary<PlayerCount>;
const seedArb = fc.stringMatching(/^[0-9a-f]{32}$/);
const choicesArb = fc.array(fc.nat({ max: 40 }), { minLength: 1, maxLength: 80 });

/** Biased toward the hard exactly-n case: n drawn from the upper range so
 * unreachability (won + remaining < n) happens mid-camp, not only at the
 * very end. An exactly-n slot is present in EVERY generated run. */
const exactlyNCampArb = fc
  .tuple(
    playerCountArb,
    seedArb,
    choicesArb,
    fc.integer({ min: 3, max: 18 }),
    fc.array(fc.constantFrom<"win-card" | "ordered">("win-card", "ordered"), { minLength: 0, maxLength: 2 }),
  )
  .map(([playerCount, seed, choices, nRaw, extraKinds]) => {
    let orderCounter = 0;
    const extraSlots: ObjectiveSlot[] = extraKinds.map((kind) => {
      if (kind === "win-card") return { kind: "win-card" };
      orderCounter++;
      return { kind: "ordered", order: orderCounter };
    });
    const n = Math.min(nRaw, HAND_SIZE[playerCount]);
    const objectiveSlots: ObjectiveSlot[] = [...extraSlots, { kind: "exactly-n", n }];
    return { playerCount, seed, choices, objectiveSlots };
  });

const noTricksCampArb = fc
  .tuple(playerCountArb, seedArb, choicesArb)
  .map(([playerCount, seed, choices]) => ({
    playerCount,
    seed,
    choices,
    objectiveSlots: [{ kind: "no-tricks" as const }],
  }));

/** At least two ordered slots (markers 1 and 2), optionally a third marked
 * "last", present in EVERY generated run. */
const orderedCampArb = fc
  .tuple(playerCountArb, seedArb, choicesArb, fc.boolean())
  .map(([playerCount, seed, choices, includeLast]) => {
    const objectiveSlots: ObjectiveSlot[] = [
      { kind: "ordered", order: 1 },
      { kind: "ordered", order: 2 },
    ];
    if (includeLast) objectiveSlots.push({ kind: "ordered", order: "last" });
    return { playerCount, seed, choices, objectiveSlots };
  });

/** A general mix of every kind, for the camp-stop property (not biased
 * toward any single kind's hard case). */
const generalCampArb = fc
  .tuple(
    playerCountArb,
    seedArb,
    choicesArb,
    fc.array(fc.constantFrom<"win-card" | "ordered">("win-card", "ordered"), { minLength: 1, maxLength: 4 }),
    fc.boolean(),
    fc.option(
      fc.oneof(
        fc.constant<{ kind: "no-tricks" }>({ kind: "no-tricks" }),
        fc.nat({ max: 18 }).map((nRaw) => ({ kind: "exactly-n" as const, nRaw })),
      ),
      { nil: undefined },
    ),
  )
  .map(([playerCount, seed, choices, cardBearingKinds, includeLast, trickCount]) => {
    let orderCounter = 0;
    const slots: ObjectiveSlot[] = cardBearingKinds.map((kind) => {
      if (kind === "win-card") return { kind: "win-card" };
      orderCounter++;
      return { kind: "ordered", order: orderCounter };
    });
    if (includeLast) {
      const lastOrderedIndex = slots.reduce((found, slot, i) => (slot.kind === "ordered" ? i : found), -1);
      if (lastOrderedIndex >= 0) slots[lastOrderedIndex] = { kind: "ordered", order: "last" };
    }
    if (trickCount !== undefined) {
      if (trickCount.kind === "no-tricks") {
        slots.push({ kind: "no-tricks" });
      } else {
        slots.push({ kind: "exactly-n", n: Math.min(trickCount.nRaw, HAND_SIZE[playerCount]) });
      }
    }
    return { playerCount, seed, choices, objectiveSlots: slots };
  });

/** Builds every prefix (k = 0..totalTricks) of a CampState directly from a
 * hand-rolled raw trick sequence — never via driveCamp/applyCampAction,
 * which halt at the first objective failure (see file header). Winners are
 * deliberately arbitrary (drawn from winnerPicks, not computed by
 * trickWinner): the evaluator's documented contract is "correct at ANY
 * CampState", and a Phase 10 hook (e.g. a holder swap) can produce a
 * completedTricks sequence no real deterministic trick-taking play would.
 * Ordered objectives always outnumber 1 (orderedCount in [2,3], optionally
 * plus "last") so post-failure pair checks are exercised on every run. */
const rawSequenceCampArb = fc
  .tuple(
    playerCountArb,
    seedArb,
    fc.integer({ min: 2, max: 3 }),
    fc.boolean(),
    fc.boolean(),
    fc.nat({ max: 18 }),
    fc.array(fc.nat(), { minLength: 8, maxLength: 8 }),
    fc.array(fc.nat(), { minLength: 90, maxLength: 90 }),
    fc.array(fc.nat(), { minLength: 18, maxLength: 18 }),
    fc.array(fc.nat({ max: 11 }), { minLength: 90, maxLength: 90 }),
    fc.option(fc.tuple(fc.nat(), fc.nat(), fc.nat()), { nil: undefined }),
  )
  .map(
    ([
      playerCount,
      seed,
      orderedCount,
      includeLast,
      useNoTricks,
      nRaw,
      ownerPicks,
      playPicks,
      winnerPicks,
      fatePicks,
      discardPick,
    ]) => {
      const seatIds = seatIdsFor(playerCount);
      const totalTricks = HAND_SIZE[playerCount];

      const orderedSlots: ObjectiveSlot[] = Array.from({ length: orderedCount }, (_, i) => ({
        kind: "ordered" as const,
        order: i + 1,
      }));
      if (includeLast) orderedSlots.push({ kind: "ordered", order: "last" });

      const trickCountSlot: ObjectiveSlot = useNoTricks
        ? { kind: "no-tricks" }
        : { kind: "exactly-n", n: Math.min(nRaw, totalTricks) };

      const objectiveSlots: ObjectiveSlot[] = [...orderedSlots, { kind: "win-card" }, trickCountSlot];

      const initial = createCamp({ seatIds, seed, objectiveSlots });

      // Assign every objective an owner (bypassing the pick flow entirely —
      // this generator builds states directly, never via applyCampAction).
      const objectives: Objective[] = initial.objectives.map((objective, i) => ({
        ...objective,
        ownerSeatId: seatIds[ownerPicks[i % ownerPicks.length]! % playerCount]!,
      })) as Objective[];

      // Build all totalTricks CompletedTricks from a mutable working copy
      // of the dealt hands. Every seat plays in seatIds order every trick
      // (not real turn rotation — this is a raw sequence, not a played
      // game); each seat removes one card from its own working hand per
      // trick.
      const workingHands = new Map<string, ExpeditionCard[]>(
        initial.hands.map((hand) => [hand.seatId, [...hand.cards]]),
      );

      // One optional discard: a random card leaves a random hand after a
      // random trick and is never played.
      let discard: Discard | undefined;
      if (discardPick !== undefined) {
        const [seatPick, cardPick, afterPick] = discardPick;
        const seatId = seatIds[seatPick % playerCount]!;
        const hand = workingHands.get(seatId)!;
        const [gone] = hand.splice(cardPick % hand.length, 1);
        discard = { card: gone!, afterTrick: afterPick % totalTricks };
      }

      /** Mostly plain; sometimes burned, sometimes read as another card. */
      const fateFor = (pick: number, card: ExpeditionCard, seatId: string): ResolvedPlay => {
        if (pick === 0) return { seatId, card, countsAs: null, burned: true };
        if (pick === 1 && card.identity.kind === "standard") {
          return { seatId, card, countsAs: { kind: "standard", suit: card.identity.suit === "hearts" ? "spades" : "hearts", rank: card.identity.rank }, burned: false };
        }
        return { seatId, card, countsAs: null, burned: false };
      };

      let cursor = 0;
      let leaderSeatId = seatIds[0]!;
      const tricks: CompletedTrick[] = [];
      for (let t = 0; t < totalTricks; t++) {
        const plays: ResolvedPlay[] = seatIds.flatMap((seatId) => {
          const hand = workingHands.get(seatId)!;
          if (hand.length === 0) return [];
          const idx = playPicks[cursor % playPicks.length]! % hand.length;
          const fate = fatePicks[cursor % fatePicks.length]!;
          cursor++;
          const [playedCard] = hand.splice(idx, 1);
          return [fateFor(fate, playedCard!, seatId)];
        });
        const winnerSeatId = seatIds[winnerPicks[t % winnerPicks.length]! % playerCount]!;
        tricks.push({ index: t, leaderSeatId, plays, winnerSeatId });
        leaderSeatId = winnerSeatId;
      }

      // Build every prefix k = 0..totalTricks.
      const prefixes: CampState[] = [];
      for (let k = 0; k <= totalTricks; k++) {
        const completedTricks = tricks.slice(0, k);
        const discarded = discard !== undefined && k >= discard.afterTrick;
        const playedCardIds = new Set(completedTricks.flatMap((tr) => tr.plays.map((p) => p.card.id)));
        const hands: Hand[] = initial.hands.map((hand) => ({
          seatId: hand.seatId,
          cards: hand.cards.filter((c) => !playedCardIds.has(c.id)),
        }));
        prefixes.push({
          ...initial,
          objectives,
          completedTricks,
          hands: discarded ? hands.map((hand) => ({ ...hand, cards: hand.cards.filter((c) => c.id !== discard!.card.id) })) : hands,
          discards: discarded ? [discard!] : [],
          currentTrick: {
            index: k,
            leaderSeatId: k === 0 ? initial.expeditionLeaderSeatId : tricks[k - 1]!.winnerSeatId,
            plays: [],
          },
        });
      }

      return { prefixes, totalTricks };
    },
  );

describe("property: objective failure timing", () => {
  it("exactly-n objectives are failed/done/pending exactly per the spec at every state, including unreachable-before-exceeded", () => {
    let unreachableWhileFeasibleRuns = 0;

    fc.assert(
      fc.property(exactlyNCampArb, ({ playerCount, seed, choices, objectiveSlots }) => {
        const initial = createCamp({ seatIds: seatIdsFor(playerCount), seed, objectiveSlots });
        const targetId = initial.objectives.find((o) => o.kind === "exactly-n")!.id;
        const { states } = driveCamp(initial, choices);

        let sawUnreachableWhileFeasible = false;

        for (const state of states) {
          const live = state.objectives.find((o) => o.id === targetId)! as ExactlyNObjective;
          expect(evaluateObjective(state, live)).toBe(exactlyNOracle(state, live));

          if (live.ownerSeatId !== null) {
            const won = wonTricksBy(state, live.ownerSeatId);
            const remaining = remainingTricks(state);
            if (won <= live.n && remaining > 0 && won + remaining < live.n) {
              sawUnreachableWhileFeasible = true;
            }
          }
        }

        if (sawUnreachableWhileFeasible) unreachableWhileFeasibleRuns++;
      }),
      { numRuns: 200 },
    );

    expect(unreachableWhileFeasibleRuns).toBeGreaterThan(0);
  });

  it("no-tricks objectives are failed/done/pending exactly per the spec at every state", () => {
    fc.assert(
      fc.property(noTricksCampArb, ({ playerCount, seed, choices, objectiveSlots }) => {
        const initial = createCamp({ seatIds: seatIdsFor(playerCount), seed, objectiveSlots });
        const targetId = initial.objectives.find((o) => o.kind === "no-tricks")!.id;
        const { states } = driveCamp(initial, choices);

        for (const state of states) {
          const live = state.objectives.find((o) => o.id === targetId)!;
          expect(evaluateObjective(state, live)).toBe(noTricksOracle(state, live));
        }
      }),
      { numRuns: 200 },
    );
  });

  it("ordered objectives are failed/done/pending exactly per the spec's relative-order/last text at every state, including out-of-order failures", () => {
    let orderFailureRuns = 0;

    fc.assert(
      fc.property(orderedCampArb, ({ playerCount, seed, choices, objectiveSlots }) => {
        const initial = createCamp({ seatIds: seatIdsFor(playerCount), seed, objectiveSlots });
        const targetIds = initial.objectives.filter((o) => o.kind === "ordered").map((o) => o.id);
        const { states } = driveCamp(initial, choices);

        let sawOrderFailure = false;

        for (const state of states) {
          const liveOrdered = state.objectives.filter(
            (o): o is OrderedObjective => o.kind === "ordered" && targetIds.includes(o.id),
          );
          for (const objective of liveOrdered) {
            const expected = orderedOracle(state, objective, liveOrdered);
            expect(evaluateObjective(state, objective)).toBe(expected);

            if (expected === "failed") {
              const mine = trickResolutionFor(state, objective.target);
              const wrongWinner = mine !== undefined && mine.winnerSeatId !== objective.ownerSeatId;
              if (!wrongWinner) sawOrderFailure = true;
            }
          }
        }

        if (sawOrderFailure) orderFailureRuns++;
      }),
      { numRuns: 200 },
    );

    expect(orderFailureRuns).toBeGreaterThan(0);
  });

  it("the camp stops at exactly the first state any objective evaluates failed, matching checkCampOutcome's first failed state", () => {
    fc.assert(
      fc.property(generalCampArb, ({ playerCount, seed, choices, objectiveSlots }) => {
        const initial = createCamp({ seatIds: seatIdsFor(playerCount), seed, objectiveSlots });
        const { states } = driveCamp(initial, choices);

        const firstAnyObjectiveFailedIndex = states.findIndex((state) =>
          state.objectives.some((o: Objective) => evaluateObjective(state, o) === "failed"),
        );
        const firstOutcomeFailedIndex = states.findIndex(
          (state) => checkCampOutcome(state).status === "failed",
        );

        expect(firstOutcomeFailedIndex).toBe(firstAnyObjectiveFailedIndex);
        if (firstOutcomeFailedIndex !== -1) {
          // No states after it in driveCamp's output — play stops once the
          // outcome is decided (XRULE-07/08).
          expect(firstOutcomeFailedIndex).toBe(states.length - 1);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("every objective kind's failed status is absorbing across every prefix of a raw trick sequence that keeps playing past the first failure, burning, recounting and discarding cards, and card statuses match the independent oracles", () => {
    let failedThenOwnWonByOwnerRuns = 0;
    let lostFailures = 0;
    const failedBeforeEnd: Record<ObjectiveKind, number> = {
      "win-card": 0,
      ordered: 0,
      "no-tricks": 0,
      "exactly-n": 0,
    };

    fc.assert(
      fc.property(rawSequenceCampArb, ({ prefixes, totalTricks }) => {
        const prevStatus: Record<string, ObjectiveStatus> = {};
        // Objective ids that evaluated "failed" at some prefix while their
        // own card was NOT yet resolved (the WR-01 shape: non-vacuity A).
        const failedWhileUnresolved = new Set<string>();

        for (let k = 0; k < prefixes.length; k++) {
          const state = prefixes[k]!;
          const allOrdered = state.objectives.filter(
            (o): o is OrderedObjective => o.kind === "ordered",
          );

          for (const objective of state.objectives) {
            const status = evaluateObjective(state, objective);

            if (objective.kind === "ordered") {
              expect(status).toBe(orderedOracle(state, objective, allOrdered));
            }
            if (objective.kind === "win-card") {
              expect(status).toBe(winCardOracle(state, objective));
              if (status === "failed" && trickResolutionFor(state, objective.target) === undefined) lostFailures++;
            }

            // Monotonicity: failed is absorbing for every kind, at every
            // prefix — including prefixes past the first failure.
            if (prevStatus[objective.id] === "failed") {
              expect(status).toBe("failed");
            }

            if (status === "failed") {
              if (k < totalTricks) failedBeforeEnd[objective.kind]++;

              if (objective.kind === "ordered" && objective.ownerSeatId !== null) {
                const mine = trickResolutionFor(state, objective.target);
                if (mine === undefined) failedWhileUnresolved.add(objective.id);
              }
            }

            prevStatus[objective.id] = status;
          }
        }

        const finalState = prefixes[prefixes.length - 1]!;
        for (const objective of finalState.objectives) {
          if (objective.kind !== "ordered" || objective.ownerSeatId === null) continue;
          if (!failedWhileUnresolved.has(objective.id)) continue;
          const resolution = trickResolutionFor(finalState, objective.target);
          if (resolution !== undefined && resolution.winnerSeatId === objective.ownerSeatId) {
            failedThenOwnWonByOwnerRuns++;
          }
        }
      }),
      { numRuns: 300 },
    );

    // Non-vacuity A (WR-01 shape): the failed-then-own-card-won-by-owner
    // scenario actually occurred in the generated runs.
    expect(failedThenOwnWonByOwnerRuns).toBeGreaterThan(0);
    // A-LOST: a win-card failed with its target lost or never played.
    expect(lostFailures).toBeGreaterThan(0);

    // Non-vacuity B: each of the four kinds failed at some prefix before
    // the camp's final trick, so later prefixes genuinely exercised the
    // absorbing check (not just a single failure recorded at the end).
    expect(failedBeforeEnd["win-card"]).toBeGreaterThan(0);
    expect(failedBeforeEnd["ordered"]).toBeGreaterThan(0);
    expect(failedBeforeEnd["no-tricks"]).toBeGreaterThan(0);
    expect(failedBeforeEnd["exactly-n"]).toBeGreaterThan(0);
  });
});
