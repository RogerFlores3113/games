// The camp state machine's setup and derived-state layer (Phase 9, Plan 04,
// spec §6.1 Core). Phase, actor, and outcome are DERIVED from CampState on
// every call (mirrors hanabi/endgame.ts: fixed-order independent checks, no
// else-if chain on partial state, nothing cached). Play stops when the
// outcome is decided: currentActorSeatId returns null and Plan 05's
// legality rejects every action with camp_over. Hook-supplied seat ids
// (leaderFor) are validated at the point of storage, converting a bad
// composed hook into a setup-time throw rather than a later soft-lock or
// exception escaping applyCampAction (WR-04).

import { assertPlayerCount, buildObjectiveDeck, complementOf, dealHands } from "./deck";
import { objectiveStatuses, nextObjectivePicker } from "./objectives";
import { baseRules, type CoreRules } from "./rules";
import { mintCardId, seedToRngState } from "../shuffle";
import type { CampOutcome, CampPhase, CampState, Objective, ObjectiveSlot } from "./state";

function isCardBearingSlot(slot: ObjectiveSlot): boolean {
  return slot.kind === "win-card" || slot.kind === "ordered";
}

/** Validates objectiveSlots before any work that could index out of range
 * (minting ids, slicing the objective deck). Throws a plain Error
 * describing the first violation found. */
function validateSlots(
  slots: readonly ObjectiveSlot[],
  totalTricks: number,
  availableObjectiveCards: number,
): void {
  if (slots.length === 0) {
    throw new Error("createCamp: objectiveSlots must not be empty");
  }

  const cardBearingCount = slots.filter(isCardBearingSlot).length;
  if (cardBearingCount > availableObjectiveCards) {
    throw new Error(
      `createCamp: ${cardBearingCount} card-bearing objective slots requested but only ${availableObjectiveCards} objective-deck cards are available`,
    );
  }

  let sawLast = false;
  const seenOrders = new Set<number>();
  for (const slot of slots) {
    if (slot.kind === "exactly-n") {
      if (!Number.isInteger(slot.n) || slot.n < 0 || slot.n > totalTricks) {
        throw new Error(
          `createCamp: exactly-n slot n=${slot.n} must be an integer in [0, ${totalTricks}]`,
        );
      }
    }

    if (slot.kind === "ordered") {
      if (slot.order === "last") {
        if (sawLast) {
          throw new Error(`createCamp: more than one ordered slot marked "last"`);
        }
        sawLast = true;
      } else {
        if (!Number.isInteger(slot.order) || slot.order <= 0) {
          throw new Error(
            `createCamp: ordered slot order=${slot.order} must be a positive integer or "last"`,
          );
        }
        if (seenOrders.has(slot.order)) {
          throw new Error(`createCamp: duplicate ordered slot order=${slot.order}`);
        }
        seenOrders.add(slot.order);
      }
    }
  }
}

/** Deals, finds the leader, and flips objectives from the top of a second,
 * separately shuffled deck. Deterministic from (seatIds, seed,
 * objectiveSlots); rejects malformed setup input with a thrown Error.
 * Stores no seed or RNG state on the returned CampState. */
export function createCamp(
  input: { seatIds: readonly string[]; seed: string; objectiveSlots: readonly ObjectiveSlot[] },
  rules: CoreRules = baseRules,
): CampState {
  const { seatIds, seed, objectiveSlots } = input;

  const playerCount = assertPlayerCount(seatIds.length);
  if (new Set(seatIds).size !== seatIds.length) {
    throw new Error("createCamp: seatIds must not contain duplicates");
  }

  const deck = rules.deckFor(playerCount);
  const { hands, handSize } = dealHands({ seatIds, seed, deck });
  const removedCards = complementOf(deck);
  const totalTricks = handSize;

  const objectiveDeck = buildObjectiveDeck({ deck, seed });
  validateSlots(objectiveSlots, totalTricks, objectiveDeck.length);

  const objectiveDeckRemaining = objectiveDeck.slice();

  const takenIds = new Set<string>();
  for (const hand of hands) {
    for (const card of hand.cards) takenIds.add(card.id);
  }
  let idRng = seedToRngState(seed, "expedition-objective-ids");

  const objectives: Objective[] = objectiveSlots.map((slot) => {
    const minted = mintCardId(idRng, takenIds);
    idRng = minted.rng;
    takenIds.add(minted.id);
    const id = minted.id;

    if (slot.kind === "win-card") {
      const target = objectiveDeckRemaining.shift()!;
      return { id, kind: "win-card", target, ownerSeatId: null };
    }
    if (slot.kind === "ordered") {
      const target = objectiveDeckRemaining.shift()!;
      return { id, kind: "ordered", target, order: slot.order, ownerSeatId: null };
    }
    if (slot.kind === "no-tricks") {
      return { id, kind: "no-tricks", ownerSeatId: null };
    }
    return { id, kind: "exactly-n", n: slot.n, ownerSeatId: null };
  });

  const expeditionLeaderSeatId = rules.leaderFor(hands);
  if (!seatIds.includes(expeditionLeaderSeatId)) {
    throw new Error(
      `createCamp: leaderFor returned unknown seat ${expeditionLeaderSeatId}`,
    );
  }

  return {
    seatIds: [...seatIds],
    playerCount,
    removedCards,
    totalTricks,
    hands,
    expeditionLeaderSeatId,
    objectives,
    objectiveDeck: objectiveDeckRemaining,
    completedTricks: [],
    currentTrick: { index: 0, leaderSeatId: expeditionLeaderSeatId, plays: [] },
  };
}

/** Any failed objective, or any fired failure check, makes the outcome
 * failed; every objective done makes it succeeded; otherwise in_progress.
 * Recomputed fresh from state on every call — nothing cached. */
export function checkCampOutcome(state: CampState, rules: CoreRules = baseRules): CampOutcome {
  const statuses = objectiveStatuses(state);
  const failedObjectiveIds = statuses.filter((s) => s.status === "failed").map((s) => s.objectiveId);
  const firedFailureCheckIds = [...rules.failureChecks(state)];

  if (failedObjectiveIds.length > 0 || firedFailureCheckIds.length > 0) {
    return { status: "failed", failedObjectiveIds, firedFailureCheckIds };
  }
  if (statuses.every((s) => s.status === "done")) {
    return { status: "succeeded" };
  }
  return { status: "in_progress" };
}

/** objective-pick while any objective is unowned; playing once all owned and
 * the outcome is still in_progress; ended once the outcome is decided. */
export function campPhase(state: CampState, rules: CoreRules = baseRules): CampPhase {
  const outcome = checkCampOutcome(state, rules);
  if (outcome.status !== "in_progress") return "ended";
  const anyUnowned = state.objectives.some((o) => o.ownerSeatId === null);
  return anyUnowned ? "objective-pick" : "playing";
}

/** The seat that must act next, or null once the camp is decided (play
 * stops — see file header). */
export function currentActorSeatId(state: CampState, rules: CoreRules = baseRules): string | null {
  const phase = campPhase(state, rules);
  if (phase === "ended") return null;

  if (phase === "objective-pick") {
    const ownedCount = state.objectives.filter((o) => o.ownerSeatId !== null).length;
    return nextObjectivePicker(state.seatIds, state.expeditionLeaderSeatId, ownedCount);
  }

  const leaderIndex = state.seatIds.indexOf(state.currentTrick.leaderSeatId);
  if (leaderIndex === -1) {
    throw new Error(
      `currentActorSeatId: currentTrick.leaderSeatId "${state.currentTrick.leaderSeatId}" is not in seatIds`,
    );
  }
  return state.seatIds[(leaderIndex + state.currentTrick.plays.length) % state.seatIds.length]!;
}
