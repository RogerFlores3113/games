// The shop in the loadout before a boss camp: prices spend the shared
// purse, each refusal, the replay visit, and no shop before a plain camp.

import { describe, expect, it } from "vitest";
import { attemptOf } from "./attempt";
import { settleCamp } from "./lifecycle";
import { campIndex } from "./plan";
import { plainItem, setupRun, testCatalog } from "./run-test-support";
import { stockFor } from "./shop";
import { applyRunAction } from "./stages/registry";
import type { RunAt, RunState } from "./types";

const catalog = testCatalog({
  items: Object.fromEntries(
    [plainItem("c-1", { price: 2 }), plainItem("c-2", { price: 3 }), plainItem("c-3", { price: 4 }), plainItem("r-1", { rarity: "rare", price: 5 })].map((def) => [def.id, def]),
  ),
});
const SEATS = ["p0", "p1", "p2"];
const SEED = "shop-seed";

/** The loadout of camp 3 of a standard run, an animal boss camp. */
function shopRun(opts: { purse?: number; supplies?: number } = {}): RunAt<"loadout"> {
  return setupRun({ seatIds: SEATS, seed: SEED, catalog, camp: 3, purse: opts.purse ?? 20, supplies: opts.supplies }) as RunAt<"loadout">;
}

function act(run: RunState, seatId: string, action: Parameters<typeof applyRunAction>[2]): RunState {
  const result = applyRunAction(run, seatId, action, catalog);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const refusal = (run: RunState, seatId: string, stockId: string) => applyRunAction(run, seatId, { type: "buy", stockId }, catalog);

describe("the shop", () => {
  it("stocks supplies and three distinct items before a boss camp", () => {
    expect(shopRun().stage.stock).toEqual([
      { stockId: "supplies", what: { kind: "supplies" }, price: 6, soldTo: null },
      { stockId: "item0", what: { kind: "item", itemId: "c-2" }, price: 3, soldTo: null },
      { stockId: "item1", what: { kind: "item", itemId: "c-3" }, price: 4, soldTo: null },
      { stockId: "item2", what: { kind: "item", itemId: "c-1" }, price: 2, soldTo: null },
    ]);
  });

  it("is closed before a plain camp: every buy is not_a_choice", () => {
    const plain = setupRun({ seatIds: SEATS, seed: SEED, catalog, camp: 2, purse: 20 });
    expect(plain.stage).toMatchObject({ tag: "loadout", stock: null });
    expect(refusal(plain, "p0", "supplies")).toEqual({ ok: false, error: "not_a_choice" });
    expect(refusal(plain, "p0", "upgrade:plain-1.a")).toEqual({ ok: false, error: "not_a_choice" });
  });

  it("a supply spends its price from the shared purse", () => {
    const run = act(shopRun({ purse: 20, supplies: 2 }), "p1", { type: "buy", stockId: "supplies" });
    expect([run.purse, run.supplies]).toEqual([14, 3]);
  });

  it("refuses a buy the purse cannot cover as cannot_afford", () => {
    expect(refusal(shopRun({ purse: 5, supplies: 2 }), "p0", "supplies")).toEqual({ ok: false, error: "cannot_afford" });
    expect(refusal(shopRun({ purse: 7 }), "p0", "upgrade:plain-1.a")).toEqual({ ok: false, error: "cannot_afford" });
  });

  it("refuses a supply at the cap as supplies_full", () => {
    expect(refusal(shopRun({ supplies: 4 }), "p0", "supplies")).toEqual({ ok: false, error: "supplies_full" });
  });

  it("mints a bought item to the buyer, marks it sold, and refuses it after as sold_out", () => {
    const run = act(shopRun(), "p1", { type: "buy", stockId: "item0" }) as RunAt<"loadout">;
    expect(run.purse).toBe(17);
    expect(run.seats[1]!.items).toEqual([{ uid: "it0", itemId: "c-2" }]);
    expect(run.seats[1]!.equipped).toEqual(["it0"]);
    expect(run.stage.stock![1]).toEqual({ stockId: "item0", what: { kind: "item", itemId: "c-2" }, price: 3, soldTo: "p1" });
    expect(refusal(run, "p2", "item0")).toEqual({ ok: false, error: "sold_out" });
  });

  it("sells a seat its own character's upgrade once: upgrade_owned after, not_your_upgrade for another's", () => {
    const run = act(shopRun(), "p0", { type: "buy", stockId: "upgrade:plain-1.a" });
    expect([run.purse, run.seats[0]!.upgradeId]).toEqual([12, "plain-1.a"]);
    expect(refusal(run, "p0", "upgrade:plain-1.b")).toEqual({ ok: false, error: "upgrade_owned" });
    expect(refusal(run, "p1", "upgrade:plain-1.b")).toEqual({ ok: false, error: "not_your_upgrade" });
    expect(refusal(run, "p1", "upgrade:nobody.x")).toEqual({ ok: false, error: "not_your_upgrade" });
  });

  it("refuses an unknown stock id as not_a_choice, and any buy after the seat's ready as already_ready", () => {
    expect(refusal(shopRun(), "p0", "item7")).toEqual({ ok: false, error: "not_a_choice" });
    expect(refusal(shopRun(), "p0", "toString")).toEqual({ ok: false, error: "not_a_choice" });
    expect(refusal(act(shopRun(), "p0", { type: "ready" }), "p0", "supplies")).toEqual({ ok: false, error: "already_ready" });
  });

  it("a failed boss camp's replay is a new visit with the same stock, unsold", () => {
    const first = shopRun();
    let run = act(first, "p0", { type: "buy", stockId: "item1" });
    for (const seatId of SEATS) run = act(run, seatId, { type: "ready" });
    expect(attemptOf(run)).not.toBeNull();
    const replay = settleCamp(run as RunAt<"camp">, "failed", catalog);
    expect(replay.stage).toMatchObject({ tag: "loadout", stock: first.stage.stock });
    expect(stockFor(SEED, campIndex(3), catalog)).toEqual(first.stage.stock);
  });
});
