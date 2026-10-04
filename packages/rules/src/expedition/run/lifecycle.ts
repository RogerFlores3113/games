// Creating a run, dealing a camp and settling it. The stage handlers in
// stages/ call these; nothing else moves a run between camps.

import { assertPlayerCount } from "../deck";
import { createCamp } from "../camp";
import { rulesFor } from "./compose";
import { draftOfferFor } from "./draft";
import { resolveTuned } from "../content/source-def";
import { currentStamp, ownerOf } from "./usage";
import { PURSE_START, SUPPLIES_START, objectiveSlotsFor, payoutFor } from "./balance";
import { bossAt, isFinalCamp } from "./plan";
import { planOf, type CampSpec } from "./route";
import { attemptSeed } from "./rng";
import { nextAttemptNumber } from "./attempt";
import { react } from "./react";
import { campSlots } from "./stack";
import { stockFor } from "./shop";
import type { CampIndex, CampResult, Catalog, RunAt, RunState, RunStatus, SeatRun } from "./types";

/** The run in muster: every seat still picks a character and votes a
 * length. Throws for a player count outside 3-5, duplicate seat ids, or an
 * empty seed. */
export function createRun(input: { seatIds: readonly string[]; seed: string }): RunState {
  const { seatIds, seed } = input;
  assertPlayerCount(seatIds.length);
  if (new Set(seatIds).size !== seatIds.length) throw new Error("createRun: seatIds must not contain duplicates");
  if (seed.length === 0) throw new Error("createRun: seed must not be empty");

  const seats: SeatRun[] = seatIds.map((seatId) => ({ seatId, characterId: null, upgradeId: null, items: [], equipped: [], offers: [], ledger: [] }));
  return {
    seed,
    seatIds: [...seatIds],
    seats,
    purse: PURSE_START,
    supplies: SUPPLIES_START,
    plan: null,
    history: [],
    lastVote: null,
    itemSerial: 0,
    stage: { tag: "muster", ballots: {} },
  };
}

export function runStatus(run: RunState): RunStatus {
  return run.stage.tag === "ended" ? run.stage.result : "in_progress";
}

/** The loadout of `camp`, with the shop open before a boss camp. Every
 * visit draws the stock afresh from the same streams, so a replay of a boss
 * camp offers the same stock, unsold. */
export function openLoadout(run: RunState, camp: CampSpec, catalog: Catalog): RunAt<"loadout"> {
  const stock = bossAt(planOf(run), camp.index) === null ? null : stockFor(run.seed, camp.index, catalog);
  return withinSlots({ ...run, stage: { tag: "loadout", camp, stock, ready: {} } }, catalog);
}

/** A camp rule may give fewer slots than the set carried in (Rats): the
 * last equipped items go back to the backpack, so the loadout never opens
 * on a set its seat could not ready with. */
function withinSlots(run: RunAt<"loadout">, catalog: Catalog): RunAt<"loadout"> {
  const rules = rulesFor(run, catalog);
  const seats = run.seats.map((seat) => {
    const slots = Math.max(0, rules.itemSlots(run, seat.seatId));
    return seat.equipped.length > slots ? { ...seat, equipped: seat.equipped.slice(0, slots) } : seat;
  });
  return seats.some((seat, i) => seat !== run.seats[i]) ? { ...run, seats } : run;
}

/** Deals a fresh attempt of the loadout's camp (RUN-02: a replay is a fresh
 * deal and fresh objectives), with every stack layer's slots, and lets the
 * camp's modifiers react to the deal. */
export function dealCamp(run: RunAt<"loadout">, catalog: Catalog): RunAt<"camp"> {
  const spec = run.stage.camp;
  const attemptNumber = nextAttemptNumber(run, spec.index);
  const slots = objectiveSlotsFor(run.seed, { ...spec, slots: campSlots(run, spec, catalog) }, attemptNumber);
  const camp = createCamp({ seatIds: run.seatIds, seed: attemptSeed(run.seed, spec.index, attemptNumber), objectiveSlots: slots }, rulesFor(run, catalog));
  const dealt: RunAt<"camp"> = { ...run, stage: { tag: "camp", camp: spec, attempt: { attemptNumber, effects: [], reveals: [], log: [], camp } } };
  return react(dealt, [{ type: "camp-dealt" }], catalog);
}

function settleFailure(run: RunAt<"camp">, catalog: Catalog): RunState {
  const cost = rulesFor(run, catalog).failureCost(run);
  if (!Number.isInteger(cost) || cost < 1) throw new Error(`settleCamp: failureCost must be an integer >= 1, got ${cost}`);
  const spec = run.stage.camp;
  const result: CampResult = { camp: spec.index, attempt: run.stage.attempt.attemptNumber, status: "failed", suppliesSpent: cost, coins: 0 };
  const supplies = Math.max(0, run.supplies - cost);
  const settled: RunState = { ...run, supplies, history: [...run.history, result] };
  return supplies === 0 ? { ...settled, stage: { tag: "ended", result: "lost" } } : openLoadout(settled, spec, catalog);
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
  const seats = regained.map((seat) => ({ ...seat, offers: [draftOfferFor(run.seed, spec.index, seat, 0, catalog)] }));
  return { ...settled, seats, stage: { tag: "draft", cleared: spec.index, payout: coins } };
}

/** A failure spends rules.failureCost (computed before the attempt is torn
 * down) and reopens the loadout for the same spec, or ends the run at 0
 * supplies. A clear pays into the purse, regains pools, and deals every seat
 * a private draft offer, or wins the run at the final camp. */
export function settleCamp(run: RunAt<"camp">, status: CampResult["status"], catalog: Catalog): RunState {
  return status === "failed" ? settleFailure(run, catalog) : settleClear(run, catalog);
}
