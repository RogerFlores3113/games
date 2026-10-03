// The six-camp run's state machine: create, derive status and phase, muster,
// boss drawing, the gated pre-deal wait, dealing each attempt, face-down
// assignment, and camp settlement (supplies, pool regain, drafts, replay,
// advance, win and loss). The dispatcher calls advanceRun after every
// accepted RunAction.
//
// DERIVE, DON'T CACHE: runStatus/runPhase/nextAttemptNumber are recomputed
// from RunState on every call. RunState never stores a `phase` or `status`
// field (Phase 9's CampState discipline).
//
// THE LOOP: muster (every seat picks a character) -> fireside -> (every seat
// ready) startAttempt -> pre-deal (only while a seat can still fire or pass a
// pre-deal ability) -> dealAttempt -> camp (playing, with a rescue pause when
// a seat can answer a failed objective) -> settleIfDecided -> fireside
// (replay, no draft, D-01) or fireside-with-drafts (cleared, next camp) or
// ended (camp 6 cleared, won; supplies at 0, lost).
//
// D-01: a failed camp returns to the fireside for a replay with NO draft.
// D-02: a boss camp's twist is drawn once, on first arrival, and kept
// through every replay — startAttempt only draws when bossTwists[N] is
// still null.
// D-03: camp 6's twist pool excludes camp 3's twist, so a run never repeats
// a boss twist.
//
// RUN-06 (structural reset-on-replay): startAttempt always builds a fresh
// AttemptState (effects/reveals/log all empty, bossCancelled false). Ledgers
// live on the seats and need no reset: per-camp limits count by stamp.

import { assertPlayerCount } from "../deck";
import { shuffleWithSeed } from "../../shuffle";
import { createCamp, checkCampOutcome } from "../camp";
import type { CampState } from "../state";
import { rulesFor } from "./compose";
import { draftOfferFor } from "./draft";
import { resolveTuned } from "../content/source-def";
import { currentStamp, ownerOf } from "./usage";
import { BOSS_CAMPS, FINAL_CAMP, STARTING_SUPPLIES, objectiveSlotsFor } from "./balance";
import { attemptSeed, STREAMS, seededIndex } from "./rng";
import { currentWindow, gatedPendingSeatIds } from "./windows";
import type {
  AttemptState,
  BossCampNumber,
  CampNumber,
  CampResult,
  Catalog,
  RunPhase,
  RunState,
  RunStatus,
  SeatRun,
} from "./types";

function isBossCampNumber(n: CampNumber): n is BossCampNumber {
  return BOSS_CAMPS.includes(n as BossCampNumber);
}

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
    bossTwists: { 3: null, 6: null },
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
 * while any seat has no character; fireside with no attempt; pre-deal with
 * an attempt but no camp yet; camp once dealt. */
export function runPhase(run: RunState): RunPhase {
  if (runStatus(run) !== "in_progress") return "ended";
  if (run.seats.some((seat) => seat.characterId === null)) return "muster";
  if (run.attempt === null) return "fireside";
  if (run.attempt.camp === null) return "pre-deal";
  return "camp";
}

/** 1-based: 1 + however many history entries already recorded this exact
 * campNumber (each recorded entry is one completed attempt). */
export function nextAttemptNumber(run: RunState): number {
  return 1 + run.history.filter((entry) => entry.campNumber === run.campNumber).length;
}

/** D-02/D-03: sorts the pool, removes `excludedId` (camp 6 excludes camp
 * 3's twist), and returns null when nothing is left (a catalog with no
 * eligible boss gives a camp with no twist). Never redraws once set — the
 * caller (startAttempt) only calls this when bossTwists[N] is still null. */
export function drawBossTwist(
  seed: string,
  campNumber: number,
  bossIds: readonly string[],
  excludedId: string | null,
): string | null {
  const pool = [...bossIds].filter((id) => id !== excludedId).sort();
  if (pool.length === 0) return null;
  return pool[seededIndex(seed, STREAMS.boss(campNumber), pool.length)]!;
}

/** Starts a fresh attempt at the current camp: requires every seat ready at
 * the fireside, draws the boss twist on first arrival only (D-02/D-03),
 * resets readySeatIds, and hands off to advanceRun to deal (or wait on the
 * pre-deal window) and settle. */
export function startAttempt(run: RunState, catalog: Catalog): RunState {
  if (runPhase(run) !== "fireside") {
    throw new Error("startAttempt: run is not at the fireside");
  }
  if (!run.seatIds.every((seatId) => run.readySeatIds.includes(seatId))) {
    throw new Error("startAttempt: not every seat is ready");
  }

  let bossTwists = run.bossTwists;
  if (isBossCampNumber(run.campNumber) && bossTwists[run.campNumber] === null) {
    const excluded = run.campNumber === 6 ? bossTwists[3] : null;
    const drawn = drawBossTwist(run.seed, run.campNumber, Object.keys(catalog.bosses), excluded);
    bossTwists = { ...bossTwists, [run.campNumber]: drawn };
  }

  const attempt: AttemptState = {
    attemptNumber: nextAttemptNumber(run),
    bossCancelled: false,
    effects: [],
    reveals: [],
    log: [],
    camp: null,
  };

  const next: RunState = { ...run, bossTwists, attempt, readySeatIds: [] };
  return advanceRun(next, catalog);
}

/** Deals this attempt's camp from attemptSeed(seed, N, A) and
 * objectiveSlotsFor(seed, N, A) (RUN-02: a replay is a fresh deal and fresh
 * objectives), applying face-down assignment (Thick Fog) when the composed
 * rules call for it. */
export function dealAttempt(run: RunState, catalog: Catalog): RunState {
  if (run.attempt === null) {
    throw new Error("dealAttempt: no attempt in progress");
  }
  const attempt = run.attempt;
  const rules = rulesFor(run, catalog);
  const campNumber = run.campNumber;
  const attemptNumber = attempt.attemptNumber;

  let camp = createCamp(
    {
      seatIds: run.seatIds,
      seed: attemptSeed(run.seed, campNumber, attemptNumber),
      objectiveSlots: objectiveSlotsFor(run.seed, campNumber, attemptNumber),
    },
    rules,
  );

  if (rules.objectiveAssignment(run) === "face-down") {
    camp = assignFaceDown(camp, run.seed, campNumber, attemptNumber);
  }

  return { ...run, attempt: { ...attempt, camp } };
}

/** A5 (discretion): objectives are shuffled on their own stream, then handed
 * round-robin starting from the expedition leader; seats beyond the
 * objective count get none. */
export function assignFaceDown(camp: CampState, seed: string, campNumber: number, attemptNumber: number): CampState {
  const shuffledObjectiveIds = shuffleWithSeed(
    camp.objectives.map((objective) => objective.id),
    seed,
    STREAMS.faceDown(campNumber, attemptNumber),
  );

  const leaderIndex = camp.seatIds.indexOf(camp.expeditionLeaderSeatId);
  const ownerByObjectiveId = new Map<string, string>();
  shuffledObjectiveIds.forEach((objectiveId, i) => {
    const seatId = camp.seatIds[(leaderIndex + i) % camp.seatIds.length]!;
    ownerByObjectiveId.set(objectiveId, seatId);
  });

  const objectives = camp.objectives.map((objective) => ({
    ...objective,
    ownerSeatId: ownerByObjectiveId.get(objective.id) ?? null,
  }));

  return { ...camp, objectives };
}

/** Settles a decided camp (no-op while still in_progress, or before a camp
 * even exists). A failure spends rules.failureCost(run) supplies — computed
 * BEFORE the attempt is cleared — and returns to the fireside with NO draft
 * (D-01), unless the rescue window still waits on a seat. A success regains
 * each pooled character's pool, then advances the camp and deals every seat
 * a fresh private offer, or ends the run at FINAL_CAMP (won). Supplies
 * reaching 0 makes runStatus "lost". */
export function settleIfDecided(run: RunState, catalog: Catalog): RunState {
  if (run.attempt === null || run.attempt.camp === null) return run;
  const attempt = run.attempt;
  const camp = run.attempt.camp;
  const rules = rulesFor(run, catalog);
  const outcome = checkCampOutcome(camp, rules);

  if (outcome.status === "in_progress") return run;

  if (outcome.status === "failed") {
    // A camp failed only by failed objectives waits while a seat can still
    // rescue it (the rescue window); otherwise it fails in this same call.
    if (currentWindow(run, rules) === "rescue" && gatedPendingSeatIds(run, catalog).length > 0) return run;
    // Computed while the attempt (and its effects layer) still exists.
    const cost = rules.failureCost(run);
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

  // succeeded
  const result: CampResult = {
    campNumber: run.campNumber,
    attemptNumber: attempt.attemptNumber,
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

/** The single entry point every RunAction handler (Plan 10-07) calls after
 * an accepted action: deals once the pre-deal wait is clear, then settles if
 * the resulting (or already-existing) camp is decided. */
export function advanceRun(run: RunState, catalog: Catalog): RunState {
  let next = run;
  if (runPhase(next) === "pre-deal" && gatedPendingSeatIds(next, catalog).length === 0) {
    next = dealAttempt(next, catalog);
  }
  return settleIfDecided(next, catalog);
}
