// The six-camp run's state machine: create, derive status and phase, muster,
// dealing each attempt, and camp settlement (supplies, pool regain, drafts,
// replay, advance, win and loss). The dispatcher calls settleIfDecided after
// every accepted RunAction.
//
// DERIVE, DON'T CACHE: runStatus/runPhase/nextAttemptNumber are recomputed
// from RunState on every call. RunState never stores a `phase` or `status`
// field (Phase 9's CampState discipline).
//
// THE LOOP: muster (every seat picks a character) -> fireside -> (every seat
// ready) startAttempt deals -> camp (playing, with a rescue pause when a
// seat can answer a failed objective) -> settleIfDecided -> fireside
// (replay, no draft, D-01) or fireside-with-drafts (cleared, next camp) or
// ended (camp 6 cleared, won; supplies at 0, lost).
//
// D-01: a failed camp returns to the fireside for a replay with NO draft.
//
// RUN-06 (structural reset-on-replay): startAttempt always builds a fresh
// AttemptState (effects/reveals/log all empty). Ledgers live on the seats
// and need no reset: per-camp limits count by stamp.

import { assertPlayerCount } from "../deck";
import { createCamp, checkCampOutcome } from "../camp";
import { rulesFor } from "./compose";
import { draftOfferFor } from "./draft";
import { resolveTuned } from "../content/source-def";
import { currentStamp, ownerOf } from "./usage";
import { FINAL_CAMP, STARTING_SUPPLIES, objectiveSlotsFor } from "./balance";
import { attemptSeed } from "./rng";
import { currentWindow, gatedPendingSeatIds } from "./windows";
import type {
  CampNumber,
  CampResult,
  Catalog,
  RunPhase,
  RunState,
  RunStatus,
  SeatRun,
} from "./types";

/** Validates (seatIds, seed) and returns the run in muster: every seat
 * still has to pick a character, with full supplies. Throws for a player
 * count outside 3-5, duplicate seat ids, or an empty seed. */
export function createRun(input: { seatIds: readonly string[]; seed: string }): RunState {
  const { seatIds, seed } = input;

  assertPlayerCount(seatIds.length);
  if (new Set(seatIds).size !== seatIds.length) {
    throw new Error("createRun: seatIds must not contain duplicates");
  }
  if (seed.length === 0) {
    throw new Error("createRun: seed must not be empty");
  }

  const seats: SeatRun[] = seatIds.map((seatId) => ({ seatId, characterId: null, kit: [], draftOffer: null, ledger: [] }));

  return {
    seed,
    seatIds: [...seatIds],
    campNumber: 1,
    supplies: STARTING_SUPPLIES,
    seats,
    readySeatIds: [],
    attempt: null,
    history: [],
  };
}

/** Derived, never stored: lost once supplies run out; won once history ends
 * with FINAL_CAMP succeeded; otherwise in progress. */
export function runStatus(run: RunState): RunStatus {
  if (run.supplies <= 0) return "lost";
  const last = run.history[run.history.length - 1];
  if (last !== undefined && last.campNumber === FINAL_CAMP && last.status === "succeeded") {
    return "won";
  }
  return "in_progress";
}

/** Derived, never stored: ended once runStatus leaves in_progress; muster
 * while any seat has no character; fireside with no attempt; camp once
 * dealt. */
export function runPhase(run: RunState): RunPhase {
  if (runStatus(run) !== "in_progress") return "ended";
  if (run.seats.some((seat) => seat.characterId === null)) return "muster";
  if (run.attempt === null) return "fireside";
  return "camp";
}

/** 1-based: 1 + however many history entries already recorded this exact
 * campNumber (each recorded entry is one completed attempt). */
export function nextAttemptNumber(run: RunState): number {
  return 1 + run.history.filter((entry) => entry.campNumber === run.campNumber).length;
}

/** Starts and deals a fresh attempt at the current camp from
 * attemptSeed(seed, N, A) and objectiveSlotsFor(seed, N, A) (RUN-02: a
 * replay is a fresh deal and fresh objectives). Requires every seat ready at
 * the fireside, and resets readySeatIds. */
export function startAttempt(run: RunState, catalog: Catalog): RunState {
  if (runPhase(run) !== "fireside") {
    throw new Error("startAttempt: run is not at the fireside");
  }
  if (!run.seatIds.every((seatId) => run.readySeatIds.includes(seatId))) {
    throw new Error("startAttempt: not every seat is ready");
  }

  const attemptNumber = nextAttemptNumber(run);
  const camp = createCamp(
    {
      seatIds: run.seatIds,
      seed: attemptSeed(run.seed, run.campNumber, attemptNumber),
      objectiveSlots: objectiveSlotsFor(run.seed, run.campNumber, attemptNumber),
    },
    rulesFor(run, catalog),
  );
  return { ...run, readySeatIds: [], attempt: { attemptNumber, effects: [], reveals: [], log: [], camp } };
}

/** Records the current attempt as failed: spends rules.failureCost(run),
 * computed BEFORE the attempt is cleared, and returns to the fireside with
 * NO draft (D-01). Supplies reaching 0 makes runStatus "lost". */
export function recordCampFailure(run: RunState, catalog: Catalog): RunState {
  if (run.attempt === null) throw new Error("recordCampFailure: no attempt in progress");
  const attempt = run.attempt;
  const cost = rulesFor(run, catalog).failureCost(run);
  if (!Number.isInteger(cost) || cost < 1) {
    throw new Error(`settleIfDecided: failureCost must be an integer >= 1, got ${cost}`);
  }
  const result: CampResult = {
    campNumber: run.campNumber,
    attemptNumber: attempt.attemptNumber,
    status: "failed",
    suppliesSpent: cost,
  };
  return {
    ...run,
    supplies: Math.max(0, run.supplies - cost),
    attempt: null,
    history: [...run.history, result],
  };
}

/** Records the current attempt as cleared: regains each pooled character's
 * pool, then advances the camp and deals every seat a fresh private offer,
 * or ends the run at FINAL_CAMP (won). */
export function recordCampSuccess(run: RunState, catalog: Catalog): RunState {
  if (run.attempt === null) throw new Error("recordCampSuccess: no attempt in progress");
  const result: CampResult = {
    campNumber: run.campNumber,
    attemptNumber: run.attempt.attemptNumber,
    status: "succeeded",
    suppliesSpent: 0,
  };
  const history = [...run.history, result];
  const at = currentStamp(run)!;
  const regained = run.seats.map((seat) => {
    const pool = seat.characterId === null ? undefined : catalog.characters[seat.characterId]?.pool;
    if (pool === undefined) return seat;
    return { ...seat, ledger: [...seat.ledger, { kind: "regained" as const, amount: resolveTuned(pool.regain, ownerOf(seat)), at }] };
  });

  if (run.campNumber === FINAL_CAMP) {
    return { ...run, seats: regained, attempt: null, history };
  }

  const nextCampNumber = (run.campNumber + 1) as CampNumber;
  const seats = regained.map((seat) => ({ ...seat, draftOffer: draftOfferFor(run.seed, nextCampNumber, seat, catalog) }));

  return { ...run, campNumber: nextCampNumber, seats, attempt: null, history };
}

/** Settles a decided camp (no-op while still in_progress, or with no
 * attempt). A camp failed only by failed objectives waits while a seat can
 * still rescue it (the rescue window). */
export function settleIfDecided(run: RunState, catalog: Catalog): RunState {
  if (run.attempt === null) return run;
  const rules = rulesFor(run, catalog);
  const outcome = checkCampOutcome(run.attempt.camp, rules);

  if (outcome.status === "in_progress") return run;
  if (outcome.status === "succeeded") return recordCampSuccess(run, catalog);
  if (currentWindow(run, rules) === "rescue" && gatedPendingSeatIds(run, catalog).length > 0) return run;
  return recordCampFailure(run, catalog);
}
