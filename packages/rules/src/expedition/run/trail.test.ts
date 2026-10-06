// The stages between two camps (owner decisions, 2026-10-05): the shop
// before a boss camp, the item draft, the event after every other camp, the
// route vote, then the loadout that sets out. Driven through applyRunAction
// the way the room drives it; camps are settled through the real settle.

import { describe, expect, it } from "vitest";
import { absentSeatAction } from "./absent";
import { dealCamp, settleCamp } from "./lifecycle";
import { horizon } from "./plan";
import { plainItem, setupRun, testCatalog } from "./run-test-support";
import { applyRunAction } from "./stages/registry";
import { legsTo, replayLegs } from "./trail";
import { createRun } from "./lifecycle";
import { CATALOG } from "./catalog";
import type { Catalog, RunAction, RunAt, RunLength, RunState, StageTag } from "./types";

const catalog = testCatalog({ items: Object.fromEntries(["c-1", "c-2", "c-3", "c-4", "c-5"].map((id) => [id, plainItem(id)])) });
const SEATS = ["p0", "p1", "p2"];

function act(run: RunState, seatId: string, action: RunAction): RunState {
  const result = applyRunAction(run, seatId, action, catalog);
  if (!result.ok) throw new Error(`${seatId} ${action.type} at ${run.stage.tag}: ${result.error}`);
  return result.state;
}

/** Every seat makes the stage's plain move (pick, abstain, ready) until a
 * camp is dealt; returns the stage tags passed on the way. */
function walkToCamp(start: RunState): { readonly run: RunAt<"camp">; readonly legs: StageTag[] } {
  let run = start;
  const legs: StageTag[] = [];
  for (let step = 0; step < 50 && run.stage.tag !== "camp"; step++) {
    if (legs.at(-1) !== run.stage.tag) legs.push(run.stage.tag);
    const stage = run.stage;
    const seatId = run.seatIds.find((id) => {
      if (stage.tag === "draft") return run.seats.find((s) => s.seatId === id)!.offers.length > 0;
      if (stage.tag === "route") return !Object.hasOwn(stage.ballots, id);
      if (stage.tag === "shop" || stage.tag === "event" || stage.tag === "loadout") return !Object.hasOwn(stage.ready, id);
      return false;
    })!;
    // A long run fills a pack: the absent pass discards to make room.
    const action: RunAction = stage.tag === "draft" ? absentSeatAction(run, seatId, catalog)! : stage.tag === "route" ? { type: "vote", choice: null } : { type: "ready" };
    run = act(run, seatId, action);
  }
  return { run: run as RunAt<"camp">, legs };
}

function mustered(length: RunLength): RunState {
  let run = createRun({ seatIds: SEATS, seed: `trail-${length}` });
  SEATS.forEach((seatId, i) => {
    run = act(run, seatId, { type: "pick-character", characterId: `plain-${i + 1}` });
    run = act(run, seatId, { type: "vote", choice: length });
    run = act(run, seatId, { type: "lock-in" });
  });
  return run;
}

/** The stages before each camp of a whole run, every camp cleared. */
function legsOfRun(length: RunLength): StageTag[][] {
  const out: StageTag[][] = [];
  let run = mustered(length);
  for (;;) {
    const walked = walkToCamp(run);
    out.push(walked.legs);
    const settled = settleCamp(walked.run, "cleared", catalog);
    if (settled.stage.tag === "ended") return out;
    run = settled;
  }
}

describe("legsTo: the stages before each camp", () => {
  it("Short: a draft before camp 1, events after camps 1 and 3, the shop before the temple", () => {
    expect([1, 2, 3, 4].map((k) => legsTo("short", k))).toEqual([
      ["draft", "loadout"],
      ["draft", "event", "route", "loadout"],
      ["draft", "route", "loadout"],
      ["shop", "draft", "event", "route", "loadout"],
    ]);
  });

  it("Standard: shops before the animal at camp 3 and the temple at camp 6", () => {
    expect([1, 2, 3, 4, 5, 6].map((k) => legsTo("standard", k))).toEqual([
      ["draft", "loadout"],
      ["draft", "event", "route", "loadout"],
      ["shop", "draft", "route", "loadout"],
      ["draft", "event", "route", "loadout"],
      ["draft", "route", "loadout"],
      ["shop", "draft", "event", "route", "loadout"],
    ]);
  });

  it("Long: shops before camps 3, 6 and 8; events after camps 1, 3, 5 and 7", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((k) => legsTo("long", k))).toEqual([
      ["draft", "loadout"],
      ["draft", "event", "route", "loadout"],
      ["shop", "draft", "route", "loadout"],
      ["draft", "event", "route", "loadout"],
      ["draft", "route", "loadout"],
      ["shop", "draft", "event", "route", "loadout"],
      ["draft", "route", "loadout"],
      ["shop", "draft", "event", "route", "loadout"],
    ]);
  });

  it("a replay goes back through the shop only before a boss camp", () => {
    expect([1, 2, 3, 6].map((k) => replayLegs("standard", k))).toEqual([["loadout"], ["loadout"], ["shop", "loadout"], ["shop", "loadout"]]);
  });
});

describe("a whole run passes through those stages", () => {
  it.each(["short", "standard", "long"] as const)("%s", (length) => {
    const count = { short: 4, standard: 6, long: 8 }[length];
    expect(legsOfRun(length)).toEqual(Array.from({ length: count }, (_, i) => legsTo(length, i + 1)));
  });

  it("the last lock-in opens the draft before camp 1, then camp 1's loadout in the Jungle", () => {
    const run = mustered("standard");
    expect(run.stage).toEqual({ tag: "draft", next: 1 });
    const walked = walkToCamp(run);
    expect(walked.run.stage.camp).toMatchObject({ index: 1, location: "jungle", weather: "fair" });
  });

  it("the event stage names its event and the camp it leads to; the route vote follows it", () => {
    let run = settleCamp(walkToCamp(mustered("standard")).run, "cleared", catalog);
    while (run.stage.tag === "draft") run = act(run, run.seats.find((s) => s.offers.length > 0)!.seatId, { type: "pick-bundle", bundle: 0 });
    expect(run.stage).toEqual({ tag: "event", next: 2, event: "event", ready: {} });
    for (const seatId of SEATS) run = act(run, seatId, { type: "ready" });
    expect(run.stage).toMatchObject({ tag: "route", from: 1 });
    for (const seatId of SEATS) run = act(run, seatId, { type: "vote", choice: "a" });
    expect(run.stage).toMatchObject({ tag: "loadout", camp: { index: 2 }, ready: {} });
  });
});

describe("the shop stage", () => {
  /** Camp 2 of a standard run, cleared: the shop before the animal at camp 3. */
  function atShop(purse = 20): RunAt<"shop"> {
    const run = setupRun({ seatIds: SEATS, seed: "shop-stage", catalog, camp: 2, purse });
    const settled = settleCamp(dealCamp(run as RunAt<"loadout">, catalog), "cleared", catalog);
    return settled as RunAt<"shop">;
  }

  it("opens after the camp before a boss camp, with the stock and no offers dealt yet", () => {
    const shop = atShop();
    expect(shop.stage).toMatchObject({ tag: "shop", next: 3, camp: null, ready: {} });
    expect(shop.stage.stock.map((e) => e.stockId)).toEqual(["supplies", "item0", "item1", "item2"]);
    expect(shop.seats.map((s) => s.offers)).toEqual([[], [], []]);
  });

  it("accepts buys and readies; the last ready opens the draft", () => {
    let run: RunState = act(atShop(), "p0", { type: "buy", stockId: "item0" });
    expect(run.seats[0]!.items).toHaveLength(1);
    for (const seatId of SEATS) run = act(run, seatId, { type: "ready" });
    expect(run.stage).toEqual({ tag: "draft", next: 3 });
    expect(run.seats.map((s) => s.offers.length)).toEqual([1, 1, 1]);
  });

  it("a failed boss camp goes back through the same shop, then that camp's loadout", () => {
    let run: RunState = atShop();
    run = walkToCamp(run).run;
    const spec = (run as RunAt<"camp">).stage.camp;
    const failed = settleCamp(run as RunAt<"camp">, "failed", catalog);
    expect(failed.stage).toMatchObject({ tag: "shop", next: 3, camp: spec, stock: atShop().stage.stock });
    let replay = failed;
    for (const seatId of SEATS) replay = act(replay, seatId, { type: "ready" });
    expect(replay.stage).toMatchObject({ tag: "loadout", camp: spec });
  });

  it("a failed plain camp reopens its loadout with no shop", () => {
    const run = setupRun({ seatIds: SEATS, seed: "shop-stage", catalog, camp: 2 });
    const failed = settleCamp(dealCamp(run as RunAt<"loadout">, catalog), "failed", catalog);
    expect(failed.stage).toMatchObject({ tag: "loadout", camp: { index: 2 } });
  });

  it("the loadout has no shop any more: buy is wrong_stage there", () => {
    const run = setupRun({ seatIds: SEATS, seed: "shop-stage", catalog, camp: 3, purse: 20 });
    expect(applyRunAction(run, "p0", { type: "buy", stockId: "supplies" }, catalog)).toEqual({ ok: false, error: "wrong_stage" });
  });

  it("the boss ahead stays beyond the horizon at the shop, the draft and the event, until the route preview", () => {
    const shop = atShop();
    expect(horizon(shop)).toBe(2);
    let run: RunState = shop;
    for (const seatId of SEATS) run = act(run, seatId, { type: "ready" });
    expect([run.stage.tag, horizon(run)]).toEqual(["draft", 2]);
    while (run.stage.tag === "draft") run = act(run, run.seats.find((s) => s.offers.length > 0)!.seatId, { type: "pick-bundle", bundle: 0 });
    expect([run.stage.tag, horizon(run)]).toEqual(["route", 3]);
  });
});

describe("draft offers", () => {
  const sizes = (run: RunState) => run.seats.map((s) => s.offers.map((offer) => offer.bundles.map((bundle) => bundle.length)));

  /** The draft before camp `next` of a run of `length`, every seat's offers dealt. */
  function draftBefore(length: RunLength, next: number, opts: { readonly characters?: Record<string, string>; readonly catalog?: Catalog } = {}): RunState {
    if (next === 1) return mustered(length);
    const using = opts.catalog ?? catalog;
    const run = setupRun({ seatIds: SEATS, seed: `draft-${length}-${next}`, catalog: using, length, camp: next - 1, characters: opts.characters });
    let settled = settleCamp(dealCamp(run as RunAt<"loadout">, using), "cleared", using);
    for (const seatId of SEATS) {
      if (settled.stage.tag !== "shop") break;
      const result = applyRunAction(settled, seatId, { type: "ready" }, using);
      if (!result.ok) throw new Error(result.error);
      settled = result.state;
    }
    return settled;
  }

  it("before camp 1 every seat is offered three single items, all different", () => {
    const run = draftBefore("standard", 1);
    expect(sizes(run)).toEqual([[[1, 1, 1]], [[1, 1, 1]], [[1, 1, 1]]]);
    for (const seat of run.seats) expect(new Set(seat.offers[0]!.bundles.flat()).size).toBe(3);
  });

  it("after a plain camp the offer is three single items", () => {
    for (const [length, next] of [["standard", 2], ["standard", 3], ["standard", 5], ["long", 6], ["long", 8]] as const) {
      expect(draftBefore(length, next).stage).toMatchObject({ tag: "draft", next });
      expect(sizes(draftBefore(length, next))).toEqual([[[1, 1, 1]], [[1, 1, 1]], [[1, 1, 1]]]);
    }
  });

  it("after a boss camp the offer is three bundles of two items", () => {
    for (const [length, next] of [["standard", 4], ["long", 4], ["long", 7]] as const) {
      expect(sizes(draftBefore(length, next))).toEqual([[[2, 2, 2]], [[2, 2, 2]], [[2, 2, 2]]]);
    }
  });

  it("taking a single item mints one instance", () => {
    const run = draftBefore("standard", 2);
    const offered = run.seats[0]!.offers[0]!.bundles[1]![0]!;
    const taken = act(run, "p0", { type: "pick-bundle", bundle: 1 });
    expect(taken.seats[0]!.items.map((item) => item.itemId)).toEqual([offered]);
  });

  it("the Pack Rat picks one of three Pack Rat items after every draft, single or bundles", () => {
    const pick = (run: RunState) => run.seats.find((s) => s.characterId === "pack-rat")!.offers.map((offer) => offer.bundles.map((bundle) => bundle.length));
    const packRat = { characters: { p0: "pack-rat" }, catalog: CATALOG };
    expect(pick(draftBefore("standard", 2, packRat))).toEqual([[1, 1, 1], [1, 1, 1]]);
    expect(pick(draftBefore("standard", 4, packRat))).toEqual([[2, 2, 2], [1, 1, 1]]);
    const items = (run: RunState) => run.seats[0]!.offers[1]!.bundles.flat().map((id) => CATALOG.items[id]!.exclusiveTo);
    expect(items(draftBefore("standard", 2, packRat))).toEqual(["pack-rat", "pack-rat", "pack-rat"]);
  });
});
