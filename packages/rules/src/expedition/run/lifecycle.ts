// Creating a run, dealing a camp and settling it. The stage handlers in
// stages/ call these; nothing else moves a run between camps.

import { assertPlayerCount } from "../deck";
import { createCamp } from "../camp";
import { rulesFor } from "./compose";
import { EVENTS } from "../content/events/registry";
import { draftOfferFor } from "./draft";
import { currentStamp, ownerOf } from "./usage";
import { PURSE_START, SUPPLIES_START, objectiveSlotsFor, payoutFor } from "./balance";
import { campIndex, isFinalCamp } from "./plan";
import { firstCampSpec, planOf, routeOptions, type CampSpec } from "./route";
import { STREAMS, attemptSeed, seededIndex } from "./rng";
import { legsTo, replayLegs, type Leg } from "./trail";
import { refitSlots } from "./items";
import { nextAttemptNumber } from "./attempt";
import { react } from "./react";
import { campSlots } from "./stack";
import { stockFor } from "./shop";
import { rejoinBack } from "./crew";
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
    kicked: [],
    purse: PURSE_START,
    supplies: SUPPLIES_START,
    plan: null,
    history: [],
    lastVote: null,
    itemSerial: 0,
    stage: { tag: "muster", ballots: {}, locked: {} },
  };
}

export function runStatus(run: RunState): RunStatus {
  return run.stage.tag === "ended" ? run.stage.result : "in_progress";
}

/** The loadout of `camp`. Kicked seats that are back rejoin here. */
export function openLoadout(run: RunState, camp: CampSpec, catalog: Catalog): RunAt<"loadout"> {
  return withinSlots({ ...rejoinBack(run, catalog), stage: { tag: "loadout", camp, ready: {} } }, catalog);
}

/** The shop before boss camp `next`. Every visit draws the stock afresh from
 * the same streams, so a replay of a boss camp offers the same stock, unsold. */
function openShop(run: RunState, next: CampIndex, camp: CampSpec | null, catalog: Catalog): RunAt<"shop"> {
  return { ...run, stage: { tag: "shop", next, camp, stock: stockFor(run.seed, next, catalog), ready: {} } };
}

/** The draft before camp `next`: every seat is dealt the offers its
 * composed draftShapes name, in order, behind any offer an ability queued. */
function openDraft(run: RunState, next: CampIndex, catalog: Catalog): RunAt<"draft"> {
  const drafting: RunAt<"draft"> = { ...run, stage: { tag: "draft", next } };
  const rules = rulesFor(drafting, catalog);
  const seats = run.seats.map((seat) => ({
    ...seat,
    offers: [...seat.offers, ...rules.draftShapes(drafting, seat.seatId).map((shape, ordinal) => draftOfferFor(run.seed, next - 1, seat, ordinal, catalog, shape))],
  }));
  return { ...drafting, seats };
}

/** The event before camp `next`: one of EVENTS, ids sorted, on its own stream. */
function openEvent(run: RunState, next: CampIndex): RunAt<"event"> {
  const events = Object.keys(EVENTS).sort();
  const event = events[seededIndex(run.seed, STREAMS.event(next), events.length)]!;
  return { ...run, stage: { tag: "event", next, event, ready: {} } };
}

/** Opens one stage on the way to camp `next` (run/trail.ts). The route vote
 * opens the loadout of the camp it chooses, so a loadout opened here is
 * camp 1's, which has no route. */
export function openLeg(run: RunState, next: CampIndex, leg: Leg, catalog: Catalog): RunState {
  switch (leg) {
    case "shop":
      return openShop(run, next, null, catalog);
    case "draft":
      return openDraft(run, next, catalog);
    case "event":
      return openEvent(run, next);
    case "route":
      return { ...run, stage: { tag: "route", from: campIndex(next - 1), options: routeOptions(run, campIndex(next - 1), catalog), ballots: {} } };
    case "loadout":
      if (next !== 1) throw new Error(`openLeg: camp ${next}'s loadout opens from its route vote`);
      return openLoadout(run, firstCampSpec(planOf(run).length), catalog);
  }
}

/** The stage after `after` on the way to camp `next`, or the first one. */
export function openLegAfter(run: RunState, next: CampIndex, after: Leg | null, catalog: Catalog): RunState {
  const legs = legsTo(planOf(run).length, next);
  const leg = legs[after === null ? 0 : legs.indexOf(after) + 1];
  if (leg === undefined) throw new Error(`openLegAfter: nothing follows ${after} before camp ${next}`);
  return openLeg(run, next, leg, catalog);
}

/** A failed or restarted camp opens again: through its shop before a boss
 * camp, then its loadout with the same spec. */
export function reopenCamp(run: RunState, camp: CampSpec, catalog: Catalog): RunState {
  return replayLegs(planOf(run).length, camp.index)[0] === "shop" ? refitSlots(openShop(run, camp.index, camp, catalog), catalog) : openLoadout(run, camp, catalog);
}

/** A camp rule may give fewer slots than the set carried in (Rats): the
 * last equipped items go back to the backpack, so the loadout never opens
 * on a set its seat could not ready with. */
export function withinSlots(run: RunAt<"loadout">, catalog: Catalog): RunAt<"loadout"> {
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
  const result: CampResult = { camp: spec.index, attempt: run.stage.attempt.attemptNumber, location: spec.location, weather: spec.weather, status: "failed", suppliesSpent: cost, coins: 0 };
  const supplies = Math.max(0, run.supplies - cost);
  const settled: RunState = { ...run, supplies, history: [...run.history, result] };
  return supplies === 0 ? { ...settled, stage: { tag: "ended", result: "lost" } } : reopenCamp(settled, spec, catalog);
}

/** A cleared camp opens the way to the next one. */
function settleClear(run: RunAt<"camp">, catalog: Catalog): RunState {
  const spec = run.stage.camp;
  const coins = payoutFor(run.stage.attempt.camp);
  const result: CampResult = { camp: spec.index, attempt: run.stage.attempt.attemptNumber, location: spec.location, weather: spec.weather, status: "cleared", suppliesSpent: 0, coins };
  const settled: RunState = { ...run, purse: run.purse + coins, history: [...run.history, result] };
  if (isFinalCamp(planOf(run), spec.index)) return { ...settled, stage: { tag: "ended", result: "won" } };
  return openLegAfter(settled, campIndex(spec.index + 1), null, catalog);
}

/** The camp-settled reactions run first, at the camp. A failure spends
 * rules.failureCost (computed before the attempt is torn down) and reopens
 * the same spec (through the shop before a boss camp), or ends the run at 0
 * supplies. A clear pays into the purse and opens the stages before the next
 * camp, or wins the run at the final camp. */
export function settleCamp(run: RunAt<"camp">, status: "cleared" | "failed", catalog: Catalog): RunState {
  const reacted = react(run, [{ type: "camp-settled", status }], catalog);
  const settled = status === "failed" ? settleFailure(reacted, catalog) : settleClear(reacted, catalog);
  return settled.stage.tag === "loadout" ? settled : refitSlots(settled, catalog);
}
