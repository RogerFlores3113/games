// The shop before a boss camp: prices spend the shared purse, each
// refusal, the replay visit, and no shop before a plain camp.

import { describe, expect, it } from "vitest";
import { SHOP, SHOP_SHARE_PORTION, SUPPLIES_MAX, SUPPLY_PRICE } from "./balance";
import { attemptOf } from "./attempt";
import { settleCamp } from "./lifecycle";
import { campIndex } from "./plan";
import { plainItem, setupRun, setupShop, testCatalog } from "./run-test-support";
import { potOf, shareOf, splitPurse, stockFor } from "./shop";
import { applyRunAction } from "./stages/registry";
import type { RunAt, RunState } from "./types";

const catalog = testCatalog({
  items: Object.fromEntries(
    [plainItem("c-1", { price: 2 }), plainItem("c-2", { price: 3 }), plainItem("c-3", { price: 4 }), plainItem("r-1", { rarity: "rare", price: 5 })].map((def) => [def.id, def]),
  ),
});
const SEATS = ["p0", "p1", "p2"];
const SEED = "shop-seed";

/** The shop before camp 3 of a standard run, an animal boss camp. */
function shopRun(opts: { purse?: number; supplies?: number } = {}): RunAt<"shop"> {
  return setupShop({ seatIds: SEATS, seed: SEED, catalog, camp: 3, purse: opts.purse ?? 20, supplies: opts.supplies });
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

  it("is not a stage before a plain camp: the loadout refuses every buy as wrong_stage", () => {
    const plain = setupRun({ seatIds: SEATS, seed: SEED, catalog, camp: 2, purse: 20 });
    expect(refusal(plain, "p0", "supplies")).toEqual({ ok: false, error: "wrong_stage" });
    expect(refusal(plain, "p0", "upgrade:plain-1.a")).toEqual({ ok: false, error: "wrong_stage" });
  });

  it("a supply spends its price from the shared purse", () => {
    const run = act(shopRun({ purse: 20, supplies: 2 }), "p1", { type: "buy", stockId: "supplies" });
    expect([run.purse, run.supplies]).toEqual([20 - SUPPLY_PRICE, 3]);
  });

  it("refuses a buy the purse cannot cover as cannot_afford", () => {
    expect(refusal(shopRun({ purse: 5, supplies: 2 }), "p0", "supplies")).toEqual({ ok: false, error: "cannot_afford" });
    expect(refusal(shopRun({ purse: SHOP.upgradePrice - 1 }), "p0", "upgrade:plain-1.a")).toEqual({ ok: false, error: "cannot_afford" });
  });

  it("refuses a supply at the cap as supplies_full", () => {
    expect(refusal(shopRun({ supplies: SUPPLIES_MAX }), "p0", "supplies")).toEqual({ ok: false, error: "supplies_full" });
  });

  it("mints a bought item to the buyer, marks it sold, and refuses it after as sold_out", () => {
    const run = act(shopRun(), "p1", { type: "buy", stockId: "item0" }) as RunAt<"shop">;
    expect(run.purse).toBe(17);
    expect(run.seats[1]!.items).toEqual([{ uid: "it0", itemId: "c-2" }]);
    expect(run.seats[1]!.equipped).toEqual(["it0"]);
    expect(run.stage.stock[1]).toEqual({ stockId: "item0", what: { kind: "item", itemId: "c-2" }, price: 3, soldTo: "p1" });
    expect(refusal(run, "p2", "item0")).toEqual({ ok: false, error: "sold_out" });
  });

  it("sells a seat its own character's upgrade once: upgrade_owned after, not_your_upgrade for another's", () => {
    const run = act(shopRun(), "p0", { type: "buy", stockId: "upgrade:plain-1.a" });
    expect([run.purse, run.seats[0]!.upgradeId]).toEqual([20 - SHOP.upgradePrice, "plain-1.a"]);
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
    let run: RunState = act(first, "p0", { type: "buy", stockId: "item1" });
    let loadout = setupRun({ seatIds: SEATS, seed: SEED, catalog, camp: 3 });
    loadout = { ...loadout, seats: run.seats, purse: run.purse, itemSerial: run.itemSerial };
    for (const seatId of SEATS) loadout = act(loadout, seatId, { type: "ready" });
    expect(attemptOf(loadout)).not.toBeNull();
    run = settleCamp(loadout as RunAt<"camp">, "failed", catalog);
    expect(run.stage).toMatchObject({ tag: "shop", next: 3, stock: first.stage.stock });
    expect(stockFor(SEED, campIndex(3), catalog)).toEqual(first.stage.stock);
  });
});

describe("shop shares", () => {
  const shares = (run: RunState) => (run.stage.tag === "shop" ? run.stage.shares : null);
  const give = (run: RunState, seatId: string, to: string, coins: number) => applyRunAction(run, seatId, { type: "give-coins", to, coins }, catalog);

  it("splits the purse when the shop opens: SHOP_SHARE_PORTION of it dealt out evenly, the rest is the pot", () => {
    const run = shopRun({ purse: 20 });
    const each = Math.floor((20 * SHOP_SHARE_PORTION) / 3);
    expect(shares(run)).toEqual({ p0: each, p1: each, p2: each });
    expect(potOf(run)).toBe(20 - 3 * each);
    const small = Math.floor((4 * SHOP_SHARE_PORTION) / 3);
    expect(splitPurse({ ...run, purse: 4 })).toEqual({ p0: small, p1: small, p2: small });
    expect(potOf({ ...run, purse: 4, stage: { ...run.stage, shares: splitPurse({ ...run, purse: 4 }) } })).toBe(4 - 3 * small);
  });

  it("deals the SHOP_SHARE_PORTION of the purse out evenly and leaves the rest as the pot, for any crew size", () => {
    const run = shopRun({ purse: 20 });
    for (const [seats, purse] of [[3, 20], [4, 17], [5, 30], [3, 1]] as const) {
      const ids = ["p0", "p1", "p2", "p3", "p4"].slice(0, seats);
      const split = splitPurse({ ...run, seatIds: ids, purse });
      const each = Math.floor((purse * SHOP_SHARE_PORTION) / seats);
      expect(Object.keys(split)).toEqual(ids);
      expect(Object.values(split).every((share) => share === each)).toBe(true);
      expect(purse - seats * each).toBeGreaterThanOrEqual(purse * (1 - SHOP_SHARE_PORTION));
      if (SHOP_SHARE_PORTION === 1) expect(purse - seats * each).toBe(purse % seats);
    }
    const four = Math.floor((17 * SHOP_SHARE_PORTION) / 4);
    expect(Object.values(splitPurse({ ...run, seatIds: ["p0", "p1", "p2", "p3"], purse: 17 }))).toEqual([four, four, four, four]);
  });

  it("a buy spends the buyer's share first, then the pot", () => {
    const each = Math.floor((20 * SHOP_SHARE_PORTION) / 3);
    const pot = 20 - 3 * each;
    let run = act(shopRun({ purse: 20 }), "p0", { type: "buy", stockId: "item0" }); // 3: all from the share
    expect([run.purse, shares(run), potOf(run as RunAt<"shop">)]).toEqual([17, { p0: each - 3, p1: each, p2: each }, pot]);
    run = act(run, "p0", { type: "buy", stockId: "item1" }); // 4: the rest of the share, then 1 from the pot
    expect([run.purse, shares(run), potOf(run as RunAt<"shop">)]).toEqual([13, { p0: 0, p1: each, p2: each }, pot - 1]);
    expect(shareOf(run as RunAt<"shop">, "p1")).toBe(each);
  });

  it("a share and the pot together reach an upgrade; the pot runs dry for the next buyer", () => {
    const each = Math.floor((20 * SHOP_SHARE_PORTION) / 3);
    const pot = 20 - 3 * each;
    const run = shopRun({ purse: 20 });
    expect(each).toBeGreaterThanOrEqual(SHOP.upgradePrice); // a share alone reaches an upgrade
    const bought = act(run, "p0", { type: "buy", stockId: "upgrade:plain-1.a" });
    expect([bought.purse, shares(bought), potOf(bought as RunAt<"shop">)]).toEqual([20 - SHOP.upgradePrice, { p0: each - SHOP.upgradePrice, p1: each, p2: each }, pot]);
    const drained = shopRun({ purse: 20, supplies: 2 });
    const spent = act(drained, "p0", { type: "buy", stockId: "supplies" }); // SUPPLY_PRICE: all from p0's share
    expect([spent.purse, shares(spent)?.p0, potOf(spent as RunAt<"shop">)]).toEqual([20 - SUPPLY_PRICE, each - SUPPLY_PRICE, pot]);
    // p0's leftover share plus the small pot cannot cover a second supply, but p1's own share still buys.
    expect(refusal(spent, "p0", "supplies")).toEqual({ ok: false, error: "cannot_afford" });
    expect(refusal(spent, "p1", "item0")).toEqual({ ok: true, state: expect.anything() });
  });

  it("give-coins moves coins from the giver's share to a teammate's, and a ready teammate may receive", () => {
    let run = act(shopRun({ purse: 20 }), "p1", { type: "ready" });
    run = act(run, "p0", { type: "give-coins", to: "p1", coins: 2 });
    const each = Math.floor((20 * SHOP_SHARE_PORTION) / 3);
    expect(shares(run)).toEqual({ p0: each - 2, p1: each + 2, p2: each });
    expect(run.purse).toBe(20);
  });

  it("refuses give-coins: already_ready, not_a_teammate (self or unknown), cannot_afford (too little, zero), wrong_stage outside the shop", () => {
    const run = shopRun({ purse: 20 });
    expect(give(act(run, "p0", { type: "ready" }), "p0", "p1", 1)).toEqual({ ok: false, error: "already_ready" });
    expect(give(run, "p0", "p0", 1)).toEqual({ ok: false, error: "not_a_teammate" });
    expect(give(run, "p0", "nobody", 1)).toEqual({ ok: false, error: "not_a_teammate" });
    expect(give(run, "p0", "toString", 1)).toEqual({ ok: false, error: "not_a_teammate" });
    expect(give(run, "p0", "p1", Math.floor((20 * SHOP_SHARE_PORTION) / 3) + 1)).toEqual({ ok: false, error: "cannot_afford" });
    expect(give(run, "p0", "p1", 0)).toEqual({ ok: false, error: "cannot_afford" });
    const plain = setupRun({ seatIds: SEATS, seed: SEED, catalog, camp: 2, purse: 20 });
    expect(give(plain, "p0", "p1", 1)).toEqual({ ok: false, error: "wrong_stage" });
  });

  it("a replayed shop visit splits the purse afresh", () => {
    let run: RunState = act(shopRun({ purse: 20 }), "p0", { type: "buy", stockId: "item0" });
    let loadout = setupRun({ seatIds: SEATS, seed: SEED, catalog, camp: 3 });
    loadout = { ...loadout, seats: run.seats, purse: run.purse, itemSerial: run.itemSerial };
    for (const seatId of SEATS) loadout = act(loadout, seatId, { type: "ready" });
    run = settleCamp(loadout as RunAt<"camp">, "failed", catalog);
    expect(run.stage.tag).toBe("shop");
    // 17 coins plus the failed attempt's consolation, split three ways.
    expect(shares(run)).toEqual(splitPurse(run));
  });
});
