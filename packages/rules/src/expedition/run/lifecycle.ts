// Creating a run, dealing a camp and settling it. The stage handlers in
// stages/ call these; nothing else moves a run between camps.

import { assertPlayerCount } from "../deck";
import { createCamp } from "../camp";
import { rulesFor } from "./compose";
import { draftOfferFor } from "./draft";
import { resolveTuned } from "../content/source-def";
import { currentStamp, ownerOf } from "./usage";
import { SUPPLIES_START, objectiveSlotsFor, payoutFor } from "./balance";
import { isFinalCamp } from "./plan";
import { planOf, type CampSpec } from "./route";
import { attemptSeed } from "./rng";
import type { CampIndex, CampResult, Catalog, RunAt, RunState, RunStatus, SeatRun } from "./types";

/** The run in muster: every seat still picks a character and votes a
 * length. Throws for a player count outside 3-5, duplicate seat ids, or an
 * empty seed. */
export function createRun(input: { seatIds: readonly string[]; seed: string }): RunState {
  const { seatIds, seed } = input;
  assertPlayerCount(seatIds.length);
  if (new Set(seatIds).size !== seatIds.length) throw new Error("createRun: seatIds must not contain duplicates");
  if (seed.length === 0) throw new Error("createRun: seed must not be empty");

  const seats: SeatRun[] = seatIds.map((seatId) => ({ seatId, characterId: null, kit: [], draftOffer: null, ledger: [] }));
  return {
    seed,
    seatIds: [...seatIds],
    seats,
    purse: 0,
    supplies: SUPPLIES_START,
    plan: null,
    history: [],
    lastVote: null,
    stage: { tag: "muster", ballots: {} },
  };
}

export function runStatus(run: RunState): RunStatus {
  return run.stage.tag === "ended" ? run.stage.result : "in_progress";
}

/** 1 + the attempts already recorded at this camp. */
export function nextAttemptNumber(run: RunState, at: CampIndex): number {
  return 1 + run.history.filter((entry) => entry.camp === at).length;
}

export function openLoadout(run: RunState, camp: CampSpec): RunAt<"loadout"> {
  return { ...run, stage: { tag: "loadout", camp, ready: {} } };
}

/** Deals a fresh attempt of the loadout's camp (RUN-02: a replay is a fresh
 * deal and fresh objectives). */
export function dealCamp(run: RunAt<"loadout">, catalog: Catalog): RunAt<"camp"> {
  const spec = run.stage.camp;
  const attemptNumber = nextAttemptNumber(run, spec.index);
  const camp = createCamp(
    { seatIds: run.seatIds, seed: attemptSeed(run.seed, spec.index, attemptNumber), objectiveSlots: objectiveSlotsFor(run.seed, spec, attemptNumber) },
    rulesFor(run, catalog),
  );
  return { ...run, stage: { tag: "camp", camp: spec, attempt: { attemptNumber, effects: [], reveals: [], log: [], camp } } };
}

function settleFailure(run: RunAt<"camp">, catalog: Catalog): RunState {
  const cost = rulesFor(run, catalog).failureCost(run);
  if (!Number.isInteger(cost) || cost < 1) throw new Error(`settleCamp: failureCost must be an integer >= 1, got ${cost}`);
  const spec = run.stage.camp;
  const result: CampResult = { camp: spec.index, attempt: run.stage.attempt.attemptNumber, status: "failed", suppliesSpent: cost, coins: 0 };
  const supplies = Math.max(0, run.supplies - cost);
  const settled: RunState = { ...run, supplies, history: [...run.history, result] };
  return supplies === 0 ? { ...settled, stage: { tag: "ended", result: "lost" } } : openLoadout(settled, spec);
}

function settleClear(run: RunAt<"camp">, catalog: Catalog): RunState {
  const spec = run.stage.camp;
  const coins = payoutFor(run.stage.attempt.camp);
  const result: CampResult = { camp: spec.index, attempt: run.stage.attempt.attemptNumber, status: "cleared", suppliesSpent: 0, coins };
  const at = currentStamp(run)!;
  const regained = run.seats.map((seat) => {
    const pool = seat.characterId === null ? undefined : catalog.characters[seat.characterId]?.pool;
    if (pool === undefined) return seat;
    return { ...seat, ledger: [...seat.ledger, { kind: "regained" as const, amount: resolveTuned(pool.regain, ownerOf(seat)), at }] };
  });
  const settled: RunState = { ...run, purse: run.purse + coins, seats: regained, history: [...run.history, result] };
  if (isFinalCamp(planOf(run), spec.index)) return { ...settled, stage: { tag: "ended", result: "won" } };
  const seats = regained.map((seat) => ({ ...seat, draftOffer: draftOfferFor(run.seed, spec.index, seat, catalog) }));
  return { ...settled, seats, stage: { tag: "draft", cleared: spec.index, payout: coins } };
}

/** A failure spends rules.failureCost (computed before the attempt is torn
 * down) and reopens the loadout for the same spec, or ends the run at 0
 * supplies. A clear pays into the purse, regains pools, and deals every seat
 * a private draft offer, or wins the run at the final camp. */
export function settleCamp(run: RunAt<"camp">, status: CampResult["status"], catalog: Catalog): RunState {
  return status === "failed" ? settleFailure(run, catalog) : settleClear(run, catalog);
}
