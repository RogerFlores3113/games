// The engine seams the nine characters stand on (spec unit 12), each driven
// by a test-only source. With no such source every seam answers as before,
// which the rest of the suite already pins.

import { describe, expect, it } from "vitest";
import { applyCampAction } from "../actions";
import { campPhase, currentActorSeatId } from "../camp";
import { toExpeditionPlayerView } from "../adapter/view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "../adapter/view-leak-check";
import { ability, defineCharacter, defineItem, defineUpgrade, itemAbility, type CharacterDef, type PassiveAbility, type SourceReactions, type ActiveAbility } from "../content/source-def";
import type { RuleModifier } from "./run-rules";
import type { CampState, StandardIdentity } from "../state";
import { abilityStatus, useAbility } from "./abilities";
import { attemptOf, withAttempt } from "./attempt";
import { rulesFor } from "./compose";
import { createRun, dealCamp, settleCamp } from "./lifecycle";
import { campIndex } from "./plan";
import { routeOptions } from "./route";
import { advanceTo, plainItem, setupRun, setupShop, testCatalog } from "./run-test-support";
import { choicesFor, stepsFor } from "./targets";
import { applyRunAction } from "./stages/registry";
import { applyToolkitOps, campCardIds, type ToolkitOp } from "./toolkit";
import type { Catalog, RunAction, RunAt, RunState } from "./types";
import { remaining } from "./usage";
import { currentWindow } from "./windows";

const SEATS = ["p0", "p1", "p2"];

/** A character holding only what a test gives it, with two plain upgrades. */
function seamCharacter(id: string, parts: { readonly active?: ActiveAbility; readonly passive?: PassiveAbility; readonly on?: SourceReactions }): CharacterDef {
  return defineCharacter({
    id,
    name: id,
    theme: "A test seam",
    power: id,
    text: "Tests a seam.",
    ...parts,
    upgrades: [defineUpgrade({ id: `${id}.a`, name: `${id} A`, text: "Nothing happens." }), defineUpgrade({ id: `${id}.b`, name: `${id} B`, text: "Nothing happens." })],
  });
}

const passive = (modifier: (seatId: string) => RuleModifier, foldsLast?: true): PassiveAbility => ({ modifier: (owner) => modifier(owner.seatId), ...(foldsLast ? { foldsLast } : {}) });

function catalogWith(...characters: CharacterDef[]): Catalog {
  return testCatalog({
    characters: Object.fromEntries(characters.map((c) => [c.id, c])),
    items: { "item-a": plainItem("item-a"), "item-b": plainItem("item-b"), "item-c": plainItem("item-c"), "item-r": plainItem("item-r", { rarity: "rare", price: 5 }) },
  });
}

function act(run: RunState, seatId: string, action: RunAction, catalog: Catalog): RunState {
  const result = applyRunAction(run, seatId, action, catalog);
  if (!result.ok) throw new Error(`${seatId} ${action.type}: ${result.error}`);
  return result.state;
}

function use(run: RunState, seatId: string, key: string, targets: readonly string[], catalog: Catalog): RunState {
  const result = useAbility(run, seatId, key, targets, catalog);
  if (!result.ok) throw new Error(`${seatId} use ${key}: ${result.error}`);
  return result.state;
}

function leakFree(run: RunState, catalog: Catalog): void {
  for (const seatId of run.seatIds) {
    const view = toExpeditionPlayerView(run, seatId, catalog);
    const secrets = secretsForExpeditionSeat(run, seatId, catalog, run.seed);
    expect(checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets })).toEqual([]);
  }
}

/** A cleared camp 1 with every seat's offer dealt: the draft stage. */
function draftOf(run: RunState, catalog: Catalog): RunAt<"draft"> {
  const dealt = dealCamp(run as RunAt<"loadout">, catalog);
  const cleared = withAttempt(dealt, { ...dealt.stage.attempt, camp: { ...dealt.stage.attempt.camp, objectives: [] } }) as RunAt<"camp">;
  return settleCamp(cleared, "cleared", catalog) as RunAt<"draft">;
}

/** Every seat takes its first bundle, then readies through any event,
 * until the route vote opens. */
function routeOf(run: RunState, catalog: Catalog): RunAt<"route"> {
  let next = run;
  while (next.stage.tag === "draft") {
    const seat = next.seats.find((s) => s.offers.length > 0)!;
    next = act(next, seat.seatId, { type: "pick-bundle", bundle: 0 }, catalog);
  }
  for (const seatId of SEATS) if (next.stage.tag === "event") next = act(next, seatId, { type: "ready" }, catalog);
  return next as RunAt<"route">;
}

describe("stage windows", () => {
  const purser = seamCharacter("purser", {
    active: ability({ window: ["loadout", "draft", "route"], limit: { kind: "per-camp", times: 1 }, targets: [], apply: () => [{ op: "adjust-coins", delta: 1 }] }),
  });
  const catalog = catalogWith(purser);
  const loadout = setupRun({ seatIds: SEATS, seed: "windows", catalog, characters: { p0: "purser" } });

  it("opens the loadout window in the loadout, stamped with the attempt it will deal", () => {
    expect(currentWindow(loadout, rulesFor(loadout, catalog))).toBe("loadout");
    const used = use(loadout, "p0", "purser", [], catalog);
    expect(used.purse).toBe(1);
    expect(used.seats[0]!.ledger).toEqual([{ kind: "used", sourceKey: "purser", at: { camp: 1, attempt: 1, trick: 0 } }]);
    expect(used.stage.tag).toBe("loadout");
  });

  it("counts a loadout use against the coming camp's per-camp limit", () => {
    const dealt = advanceTo(use(loadout, "p0", "purser", [], catalog), "objective-pick", catalog);
    expect(remaining(dealt, "p0", "purser", catalog)).toEqual({ kind: "uses", left: 0, of: 1 });
  });

  it("closes the loadout window for a seat once it is ready", () => {
    const ready = act(loadout, "p0", { type: "ready" }, catalog);
    expect(useAbility(ready, "p0", "purser", [], catalog)).toEqual({ ok: false, error: "wrong_window" });
  });

  it("opens the draft window to a seat with an offer, and the route window to all", () => {
    const draft = draftOf(loadout, catalog);
    expect(currentWindow(draft, rulesFor(draft, catalog))).toBe("draft");
    expect(use(draft, "p0", "purser", [], catalog).purse).toBe(draft.purse + 1);
    const picked = act(draft, "p0", { type: "pick-bundle", bundle: 0 }, catalog);
    expect(useAbility(picked, "p0", "purser", [], catalog)).toEqual({ ok: false, error: "wrong_window" });
    const route = routeOf(draft, catalog);
    expect(currentWindow(route, rulesFor(route, catalog))).toBe("route");
    expect(use(route, "p0", "purser", [], catalog).purse).toBe(route.purse + 1);
  });

  it("is closed in a camp", () => {
    const camp = advanceTo(loadout, "between-tricks", catalog);
    expect(useAbility(camp, "p0", "purser", [], catalog)).toEqual({ ok: false, error: "wrong_window" });
  });

  it("lets a draft-window ability drop the head offer for coins, moving on once nobody has one", () => {
    const skipper = seamCharacter("skipper", {
      active: ability({ window: "draft", limit: { kind: "per-run", times: 9 }, targets: [], apply: (ctx) => [{ op: "drop-offer", seatId: ctx.self }, { op: "adjust-coins", delta: 4 }] }),
    });
    const cat = catalogWith(skipper);
    let run: RunState = draftOf(setupRun({ seatIds: SEATS, seed: "skip", catalog: cat, characters: { p0: "skipper" } }), cat);
    const purse = run.purse;
    run = use(run, "p0", "skipper", [], cat);
    expect(run.seats[0]!.offers).toEqual([]);
    expect(run.purse).toBe(purse + 4);
    run = act(act(run, "p1", { type: "pick-bundle", bundle: 0 }, cat), "p2", { type: "pick-bundle", bundle: 0 }, cat);
    expect(run.stage.tag).toBe("event");
  });
});

describe("route hooks: normalWeatherChance, routeOptionCount, swapsBoss and reroll-route", () => {
  const routesWith = (character: CharacterDef, seed: string) => {
    const catalog = catalogWith(character);
    return { catalog, draft: draftOf(setupRun({ seatIds: SEATS, seed, catalog, characters: { p0: character.id } }), catalog) };
  };

  it("draws every route's weather fair at 100 and never at 0", () => {
    for (let n = 0; n < 12; n++) {
      const sunny = routesWith(seamCharacter("sunny", { passive: passive(() => ({ normalWeatherChance: () => () => 100 })) }), `sun-${n}`);
      const stormy = routesWith(seamCharacter("stormy", { passive: passive(() => ({ normalWeatherChance: () => () => 0 })) }), `sun-${n}`);
      expect(routeOptions(sunny.draft, campIndex(1), sunny.catalog).map((o) => o.next.weather).every((w) => w === "fair")).toBe(true);
      expect(routeOptions(stormy.draft, campIndex(1), stormy.catalog).map((o) => o.next.weather).some((w) => w === "fair")).toBe(false);
    }
  });

  it("offers the count the crew's rules name", () => {
    for (let n = 0; n < 12; n++) {
      const three = routesWith(seamCharacter("three", { passive: passive(() => ({ routeOptionCount: () => () => 3 })) }), `count-${n}`);
      expect(routeOptions(three.draft, campIndex(1), three.catalog).map((o) => o.id)).toEqual(["a", "b", "c"]);
    }
    const broken = routesWith(seamCharacter("four", { passive: passive(() => ({ routeOptionCount: () => () => 4 })) }), "count");
    expect(() => routeOptions(broken.draft, campIndex(1), broken.catalog)).toThrow("route: routeOptionCount gave 4, outside 1 to 3");
  });

  const swapper = seamCharacter("swapper", { passive: passive(() => ({ routeOptionCount: () => () => 3, swapsBoss: () => (_run, option) => option === 2 })) });

  it("sends the third route to another boss of the next boss camp's tier, written into the plan when chosen", () => {
    const { catalog, draft } = routesWith(swapper, "seam-seed-swap-route");
    const planned = draft.plan!.bosses.find((b) => b.at === 3)!;
    const options = routeOptions(draft, campIndex(1), catalog);
    expect(options.map((o) => o.swapBoss === null)).toEqual([true, true, false]);
    const swap = options[2]!.swapBoss!;
    expect(swap.at).toBe(3);
    expect(catalog.mods[swap.modId]!.kind).toBe("animal");
    expect(swap.modId).not.toBe(planned.modId);
    let route: RunState = routeOf(draft, catalog);
    for (const seatId of SEATS) route = act(route, seatId, { type: "vote", choice: "c" }, catalog);
    expect(route.stage.tag).toBe("loadout");
    expect(route.plan!.bosses.find((b) => b.at === 3)!.modId).toBe(swap.modId);
  });

  it("keeps a swap beyond the horizon out of every view, and shows the route swaps", () => {
    const { catalog, draft } = routesWith(swapper, "seam-seed-swap-route");
    const route = routeOf(draft, catalog);
    const swap = route.stage.options[2]!.swapBoss!;
    for (const seatId of SEATS) {
      const view = toExpeditionPlayerView(route, seatId, catalog);
      if (view.stage.tag !== "route") throw new Error("expected the route vote");
      expect(view.stage.options.map((o) => o.swapsBoss)).toEqual([false, false, true]);
      expect(JSON.stringify(view).includes(swap.modId)).toBe(false);
      expect(secretsForExpeditionSeat(route, seatId, catalog).hiddenIds).toContain(swap.modId);
    }
    leakFree(route, catalog);
  });

  it("rerolls an option's location and weather on the next reroll's streams for supplies", () => {
    const rerolling = seamCharacter("rerolling", {
      passive: passive(() => ({ routeOptionCount: () => () => 3 })),
      active: ability({
        window: "route",
        limit: { kind: "supplies", cost: 1 },
        targets: [{ kind: "route-option" }],
        apply: (ctx) => [{ op: "reroll-route", option: ctx.targets[0].option.id }],
      }),
    });
    const catalog = catalogWith(rerolling);
    const route = routeOf(draftOf(setupRun({ seatIds: SEATS, seed: "reroll", catalog, characters: { p0: "rerolling" } }), catalog), catalog);
    const before = route.stage.options;
    const after = use(route, "p0", "rerolling", ["route:b"], catalog);
    if (after.stage.tag !== "route") throw new Error("expected the route vote");
    expect(after.supplies).toBe(route.supplies - 1);
    expect(after.stage.options[0]).toEqual(before[0]);
    expect(after.stage.options[2]).toEqual(before[2]);
    expect(after.stage.options[1]!.reroll).toBe(1);
    expect(after.stage.options[1]!.next.slots).toEqual(before[1]!.next.slots);
    expect([before[1]!.next.location, after.stage.options[1]!.next.location]).toEqual(["jungle", "cave"]);
    expect(after.stage.options[1]!.next).toEqual({ ...before[1]!.next, location: "cave", weather: "fair" });
    const twice = use(after, "p0", "rerolling", ["route:b"], catalog);
    if (twice.stage.tag !== "route") throw new Error("expected the route vote");
    expect(twice.stage.options[1]!.reroll).toBe(2);
  });
});

describe("draftShapes, shopPrice and the offers ops", () => {
  it("deals each seat the offers its draftShapes name after a clear, in order", () => {
    const lean = seamCharacter("lean", {
      passive: passive((self) => ({ draftShapes: (prev) => (run, seatId) => (seatId === self ? [{ ...prev(run, seatId)[0]!, options: 1, bundleSize: 1 }, { ...prev(run, seatId)[0]!, options: 2 }] : prev(run, seatId)) })),
    });
    const catalog = catalogWith(lean);
    const draft = draftOf(setupRun({ seatIds: SEATS, seed: "shape", catalog, characters: { p0: "lean" } }), catalog);
    expect(draft.seats.map((s) => s.offers.map((offer) => offer.bundles.map((b) => b.length)))).toEqual([[[1], [1, 1]], [[1, 1, 1]], [[1, 1, 1]]]);
  });

  it("charges a seat the price its shopPrice names", () => {
    const haggler = seamCharacter("haggler", { passive: passive((self) => ({ shopPrice: (prev) => (run, seatId, price) => (seatId === self ? price - 1 : prev(run, seatId, price)) })) });
    const catalog = catalogWith(haggler);
    const shop = setupShop({ seatIds: SEATS, seed: "haggle", catalog, characters: { p0: "haggler" }, camp: 3, purse: 20 });
    const item = shop.stage.stock.find((e) => e.what.kind === "item")!;
    expect(act(shop, "p0", { type: "buy", stockId: item.stockId }, catalog).purse).toBe(20 - (item.price - 1));
    expect(act(shop, "p1", { type: "buy", stockId: item.stockId }, catalog).purse).toBe(20 - item.price);
    const view = toExpeditionPlayerView(shop, "p0", catalog);
    if (view.stage.tag !== "shop") throw new Error("expected the shop");
    expect(view.stage.shop.stock.find((e) => e.stockId === item.stockId)!.price).toBe(item.price - 1);
  });

  it("queues special offers drawn with the ability's shape behind the standard one, never repeating a one-item option", () => {
    const mapper = seamCharacter("mapper", {
      active: ability({
        window: "draft",
        limit: { kind: "per-run", times: 1 },
        targets: [],
        apply: (ctx) => [
          ...ctx.run.seatIds.flatMap((seatId) => [0, 1].map((): ToolkitOp => ({ op: "add-offer", seatId, offer: ctx.drawOffer(seatId, { options: 3, bundleSize: 1, exclusive: 0, rareChance: 100 }) }))),
          { op: "adjust-coins", delta: 10 },
        ],
      }),
    });
    const catalog = catalogWith(mapper);
    const draft = draftOf(setupRun({ seatIds: SEATS, seed: "seam-seed-treasure-map", catalog, characters: { p0: "mapper" } }), catalog);
    const after = use(draft, "p0", "mapper", [], catalog);
    expect(after.purse).toBe(draft.purse + 10);
    for (const seat of after.seats) expect(seat.offers.map((o) => o.kind)).toEqual(["standard", "special", "special"]);
    expect(after.seats.map((seat) => seat.offers.slice(1).map((offer) => offer.bundles.flat()))).toEqual([
      [["item-r", "item-b", "item-c"], ["item-r", "item-a", "item-c"]],
      [["item-r", "item-c", "item-a"], ["item-r", "item-a", "item-b"]],
      [["item-r", "item-c", "item-b"], ["item-r", "item-c", "item-a"]],
    ]);
    const view = toExpeditionPlayerView(act(after, "p1", { type: "pick-bundle", bundle: 0 }, catalog), "p1", catalog);
    if (view.stage.tag !== "draft") throw new Error("expected the draft");
    expect(view.stage.yourOffer).toEqual({ kind: "special", bundles: [["item-r"], ["item-c"], ["item-a"]] });
    leakFree(after, catalog);
  });
});

describe("the coins limit", () => {
  const vendor = seamCharacter("vendor", {
    active: ability({ window: "between-tricks", limit: { kind: "coins", cost: ({ uses }) => uses.thisCamp + 1 }, targets: [], apply: () => [] }),
  });
  const catalog = catalogWith(vendor);
  const camp = advanceTo(setupRun({ seatIds: SEATS, seed: "coins", catalog, characters: { p0: "vendor" }, purse: 3 }), "between-tricks", catalog);

  it("spends a price that climbs with the camp's uses, and refuses one the purse can't meet", () => {
    expect(remaining(camp, "p0", "vendor", catalog)).toEqual({ kind: "coins", cost: 1 });
    const once = use(camp, "p0", "vendor", [], catalog);
    expect(once.purse).toBe(2);
    expect(remaining(once, "p0", "vendor", catalog)).toEqual({ kind: "coins", cost: 2 });
    const twice = use(once, "p0", "vendor", [], catalog);
    expect(twice.purse).toBe(0);
    expect(useAbility(twice, "p0", "vendor", [], catalog)).toEqual({ ok: false, error: "cannot_afford" });
    expect(abilityStatus(twice, "p0", "vendor", catalog)).toMatchObject({ usable: false, error: "cannot_afford", reason: "Needs 3 coins, the crew has 0" });
  });

  it("projects the price as the coins remaining view", () => {
    const seat = toExpeditionPlayerView(camp, "p1", catalog).seats[0]!;
    expect(seat.usage).toEqual([{ sourceKey: "vendor", remaining: { kind: "coins", cost: 1 } }]);
  });
});

describe("freeUse", () => {
  const sturdy = seamCharacter("sturdy", {
    passive: passive((self) => ({
      freeUse: (prev) => (run, seatId, key) => (seatId === self && !run.seats.find((s) => s.seatId === self)!.ledger.some((e) => e.kind === "used") ? true : prev(run, seatId, key)),
    })),
  });
  const once = defineItem({ id: "once", name: "Once", rarity: "common", price: 2, uses: { kind: "single-use" }, text: "Does nothing.", active: itemAbility({ window: "between-tricks", targets: [], apply: () => [] }) });
  const catalog = testCatalog({ characters: { sturdy }, items: { once } });

  it("keeps a free use's instance and its uses, and spends the next use", () => {
    const camp = advanceTo(setupRun({ seatIds: SEATS, seed: "free", catalog, characters: { p0: "sturdy" }, items: { p0: ["once"] } }), "between-tricks", catalog);
    const free = use(camp, "p0", "it0", [], catalog);
    expect(free.seats[0]!.items).toEqual([{ uid: "it0", itemId: "once" }]);
    expect(free.seats[0]!.ledger).toEqual([{ kind: "used", sourceKey: "it0", at: { camp: 1, attempt: 1, trick: 0 }, free: true }]);
    expect(remaining(free, "p0", "it0", catalog)).toEqual({ kind: "uses", left: 1, of: 1 });
    expect(use(free, "p0", "it0", [], catalog).seats[0]!.items).toEqual([]);
  });
});

describe("foldsLast", () => {
  it("folds a passive after every effect, so it has the last word", () => {
    const counted = seamCharacter("counted", { passive: passive((self) => ({ whispersPerCamp: (prev) => (run, seatId) => (seatId === self ? 7 : prev(run, seatId)) }), true) });
    const shouter = defineItem({
      id: "shouter",
      name: "Shouter",
      rarity: "common",
      price: 2,
      uses: { kind: "per-camp" },
      text: "Whisper once more.",
      active: itemAbility({ window: "between-tricks", targets: [], apply: () => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: {} }], effect: () => ({ whispersPerCamp: (prev) => (run, seatId) => prev(run, seatId) + 1 }) }),
    });
    const catalog = testCatalog({ characters: { counted }, items: { shouter } });
    const camp = advanceTo(setupRun({ seatIds: SEATS, seed: "last", catalog, characters: { p0: "counted" }, items: { p1: ["shouter"] } }), "between-tricks", catalog);
    const shouted = use(camp, "p1", "it0", [], catalog);
    const rules = rulesFor(shouted, catalog);
    expect([rules.whispersPerCamp(shouted, "p0"), rules.whispersPerCamp(shouted, "p1")]).toEqual([7, 2]);
  });
});

describe("affectsSeat", () => {
  const blended = seamCharacter("blended", {
    passive: passive((self) => ({
      affectsSeat: (prev) => (run, seatId, origin) =>
        seatId === self && origin.kind === "mod" && run.plan!.bosses.some((b) => b.modId === origin.modId && b.tier === "animal") ? false : prev(run, seatId, origin),
    })),
  });
  const catalog = catalogWith(blended);

  function bossLoadout(boss: string, seed: string, cat: Catalog = catalog): RunAt<"loadout"> {
    const run = setupRun({ seatIds: SEATS, seed, catalog: cat, characters: cat === catalog ? { p0: "blended" } : {}, camp: 3 });
    return { ...run, plan: { ...run.plan!, bosses: run.plan!.bosses.map((b) => (b.at === 3 ? { ...b, modId: boss } : b)) } } as RunAt<"loadout">;
  }

  it("keeps the rats from the seat it does not reach", () => {
    const rats = bossLoadout("rats", "blend");
    const rules = rulesFor(rats, catalog);
    expect(SEATS.map((seatId) => rules.itemSlots(rats, seatId))).toEqual([2, 1, 1]);
  });

  it("does not lose the camp when the crocodile watches that seat win", () => {
    const facing = (run: RunState) => {
      const view = toExpeditionPlayerView(run, "p1", catalog);
      if (view.stage.tag !== "camp") throw new Error("expected a camp");
      return view.stage.mods.find((m) => m.id === "crocodile")!.status[0];
    };
    const seed = Array.from({ length: 40 }, (_, n) => `croc-${n}`).find((s) => facing(dealCamp(bossLoadout("crocodile", s), catalog))?.kind === "facing" && (facing(dealCamp(bossLoadout("crocodile", s), catalog)) as { seatId: string }).seatId === "p0")!;
    const wonBy = (run: RunAt<"camp">, winner: string): CampState => ({ ...run.stage.attempt.camp, completedTricks: [{ index: 0, leaderSeatId: winner, plays: [], winnerSeatId: winner }] });
    const blendedCamp = dealCamp(bossLoadout("crocodile", seed), catalog);
    const plainCatalog = catalogWith();
    const plainCamp = dealCamp(bossLoadout("crocodile", seed, plainCatalog), plainCatalog);
    const croc = (run: RunAt<"camp">, cat: Catalog) => rulesFor(run, cat).goals(wonBy(run, "p0"), []).find((g) => g.id === "crocodile")!.status;
    expect([croc(blendedCamp, catalog), croc(plainCamp, plainCatalog)]).toEqual(["done", "failed"]);
  });

  it("reaches every seat of a crew without such a source", () => {
    const plainCatalog = catalogWith();
    const rats = bossLoadout("rats", "blend", plainCatalog);
    const rules = rulesFor(rats, plainCatalog);
    expect(SEATS.map((seatId) => rules.itemSlots(rats, seatId))).toEqual([1, 1, 1]);
  });
});

describe("item ops: grant-item, give-item, drop-item and swap-slots", () => {
  const charged = defineItem({ id: "charged", name: "Charged", rarity: "common", price: 3, uses: { kind: "charges", n: 2 }, text: "Does nothing.", active: itemAbility({ window: ["between-tricks", "loadout"], targets: [], apply: () => [] }) });
  const catalog = testCatalog({ items: { charged, "item-a": plainItem("item-a"), "item-b": plainItem("item-b") } });
  const origin = { kind: "seat", seatId: "p0", sourceKey: "test", sourceId: "test" } as const;
  const apply = (run: RunState, ops: readonly ToolkitOp[]) => applyToolkitOps(run, origin, ops, rulesFor(run, catalog), catalog);
  const loadout = setupRun({ seatIds: SEATS, seed: "items", catalog, items: { p0: ["charged", "item-a", "item-b"], p1: ["item-a", "item-b"] } });

  it("grants a new instance, equipped while a slot is free, else into the backpack", () => {
    const granted = apply(loadout, [{ op: "grant-item", seatId: "p2", itemId: "item-a" }, { op: "grant-item", seatId: "p1", itemId: "item-b" }]);
    expect(granted.seats.map((s) => [s.items.map((i) => i.uid), s.equipped])).toEqual([
      [["it0", "it1", "it2"], ["it0", "it1"]],
      [["it3", "it4", "it6"], ["it3", "it4"]],
      [["it5"], ["it5"]],
    ]);
    expect(() => apply(loadout, [{ op: "grant-item", seatId: "p2", itemId: "nothing" }])).toThrow("toolkit: grant-item: unknown item nothing");
  });

  it("gives an instance away with the uses it has spent", () => {
    const spent = use(loadout, "p0", "it0", [], catalog);
    const given = apply(spent, [{ op: "give-item", fromSeatId: "p0", uid: "it0", toSeatId: "p2" }]);
    expect(given.seats.map((s) => s.equipped)).toEqual([["it1"], ["it3", "it4"], ["it0"]]);
    expect(remaining(given, "p2", "it0", catalog)).toEqual({ kind: "uses", left: 1, of: 2 });
    expect(() => apply(loadout, [{ op: "give-item", fromSeatId: "p1", uid: "it0", toSeatId: "p2" }])).toThrow("toolkit: give-item: it0 is not p1's to give to p2");
  });

  it("drops an owned instance from the slots or the backpack", () => {
    expect(apply(loadout, [{ op: "drop-item", seatId: "p0", uid: "it2" }]).seats[0]!.items.map((i) => i.uid)).toEqual(["it0", "it1"]);
    expect(apply(loadout, [{ op: "drop-item", seatId: "p0", uid: "it0" }]).seats[0]!.equipped).toEqual(["it1"]);
    expect(() => apply(loadout, [{ op: "drop-item", seatId: "p1", uid: "it0" }])).toThrow("toolkit: drop-item: p1 does not own it0");
  });

  it("swaps a carried item for a backpack one mid-camp, within the slots", () => {
    const camp = advanceTo(loadout, "between-tricks", catalog);
    expect(apply(camp, [{ op: "swap-slots", seatId: "p0", unequip: "it0", equip: "it2" }]).seats[0]!.equipped).toEqual(["it1", "it2"]);
    expect(() => apply(camp, [{ op: "swap-slots", seatId: "p0", unequip: null, equip: "it2" }])).toThrow("toolkit: swap-slots: more items than slots");
    expect(() => apply(camp, [{ op: "swap-slots", seatId: "p0", unequip: "it2", equip: null }])).toThrow("toolkit: swap-slots: it2 is not equipped");
  });

  it("offers the seat's own items as targets, by where they are", () => {
    const camp = advanceTo(loadout, "between-tricks", catalog);
    const rules = rulesFor(camp, catalog);
    const scope = { run: camp, seatId: "p0", camp: attemptOf(camp)!.camp, rules, catalog };
    const ids = (where: "equipped" | "backpack" | "any") => stepsFor(scope, [{ kind: "item", where }])[0]!.choices;
    expect([ids("equipped"), ids("backpack"), ids("any")]).toEqual([["item:it0", "item:it1"], ["item:it2"], ["item:it0", "item:it1", "item:it2"]]);
  });
});

describe("objectives: objectivePicker, add-objective and retarget-objective", () => {
  it("lets a seat pick before the leader, then the usual order runs from the leader", () => {
    const eager = seamCharacter("eager", { passive: passive((self) => ({ objectivePicker: (prev) => (state, picked) => (picked === 0 ? self : prev(state, picked - 1)) })) });
    const catalog = catalogWith(eager);
    const camp = advanceTo(setupRun({ seatIds: SEATS, seed: "eager", catalog, characters: { p2: "eager" }, camp: 3 }), "objective-pick", catalog);
    const state = attemptOf(camp)!.camp;
    const order: string[] = [];
    let picking: CampState = state;
    const rules = rulesFor(camp, catalog);
    while (campPhase(picking, rules) === "objective-pick") {
      const actor = currentActorSeatId(picking, rules)!;
      order.push(actor);
      const result = applyCampAction(picking, actor, { type: "pick-objective", objectiveId: picking.objectives.find((o) => o.ownerSeatId === null)!.id }, rules);
      if (!result.ok) throw new Error(result.error);
      picking = result.state;
    }
    const leader = state.expeditionLeaderSeatId;
    const fromLeader = SEATS.map((_, i) => SEATS[(SEATS.indexOf(leader) + i) % SEATS.length]!);
    expect(order).toEqual(["p2", ...fromLeader, ...fromLeader].slice(0, state.objectives.length));
  });

  const catalog = catalogWith();
  const origin = { kind: "seat", seatId: "p0", sourceKey: "test", sourceId: "test" } as const;

  it("adds a win-card objective from the deck under a minted id", () => {
    const camp = advanceTo(setupRun({ seatIds: SEATS, seed: "burden", catalog }), "between-tricks", catalog);
    const before = attemptOf(camp)!.camp;
    const added = applyToolkitOps(camp, origin, [{ op: "add-objective", ownerSeatId: "p0" }], rulesFor(camp, catalog), catalog);
    const after = attemptOf(added)!.camp;
    const fresh = after.objectives.at(-1)!;
    expect(after.objectives.length).toBe(before.objectives.length + 1);
    expect(fresh).toEqual({ id: fresh.id, kind: "win-card", target: before.objectiveDeck[0], ownerSeatId: "p0" });
    expect(fresh.id).toMatch(/^[a-z]{8}$/);
    expect(new Set([...campCardIds(after), ...after.objectives.map((o) => o.id)]).size).toBe(campCardIds(after).length + after.objectives.length);
    expect(after.objectiveDeck).toEqual(before.objectiveDeck.slice(1));
  });

  it("shifts a pending card objective's target by its objective-value choice", () => {
    const reshaper = seamCharacter("reshaper", {
      active: ability({
        window: "between-tricks",
        limit: { kind: "per-camp", times: 1 },
        targets: [{ kind: "objective-value", spread: 1 }],
        apply: (ctx) => [{ op: "retarget-objective", objectiveId: ctx.targets[0].objective.id, target: ctx.targets[0].target }],
      }),
    });
    const cat = catalogWith(reshaper);
    const camp = advanceTo(setupRun({ seatIds: SEATS, seed: "reshape", catalog: cat, characters: { p0: "reshaper" } }), "between-tricks", cat);
    const objective = attemptOf(camp)!.camp.objectives[0]!;
    const target = (objective as { target: StandardIdentity }).target;
    const status = abilityStatus(camp, "p0", "reshaper", cat);
    if (status === null || !status.usable) throw new Error("expected Reshape to be usable");
    const up = `objective-value:${objective.id}:${target.rank + 1}`;
    expect(status.steps[0]!.choices).toContain(up);
    const shifted = use(camp, "p0", "reshaper", [up], cat);
    expect(attemptOf(shifted)!.camp.objectives[0]).toEqual({ ...objective, target: { ...target, rank: target.rank + 1 } });
  });
});

describe("hallucinations: voidsTrick and void-trick", () => {
  const mist = seamCharacter("mist", {
    active: ability({
      window: "between-tricks",
      limit: { kind: "per-camp", times: 1 },
      targets: [],
      canUse: (ctx) => (ctx.camp!.currentTrick.leaderSeatId === ctx.self ? true : "Only the trick's leader can raise the mist"),
      apply: () => [{ op: "add-modifier", lasts: "trick", audience: "public", params: {} }],
      effect: () => ({ voidsTrick: () => () => true }),
    }),
  });
  const salts = seamCharacter("salts", {
    active: ability({
      window: "rescue",
      limit: { kind: "per-run", times: 1 },
      targets: [{ kind: "won-trick" }],
      apply: (ctx) => [{ op: "void-trick", trickIndex: ctx.targets[0].trick.index }],
    }),
  });
  const catalog = catalogWith(mist, salts);

  function playTrick(run: RunState): { run: RunState; played: readonly { seatId: string; cardId: string }[] } {
    let next = run;
    const played: { seatId: string; cardId: string }[] = [];
    for (let i = 0; i < SEATS.length; i++) {
      const camp = attemptOf(next)!.camp;
      const rules = rulesFor(next, catalog);
      const actor = currentActorSeatId(camp, rules)!;
      const cardId = rules.legalPlays(camp, actor)[0]!.id;
      played.push({ seatId: actor, cardId });
      next = act(next, actor, { type: "play-card", cardId }, catalog);
    }
    return { run: next, played };
  }

  /** A between-tricks camp where `character` belongs to the seat that leads trick 0. */
  function ledBy(character: string, seed: string): { readonly camp: RunState; readonly leader: string } {
    const probe = advanceTo(setupRun({ seatIds: SEATS, seed, catalog }), "between-tricks", catalog);
    const leader = attemptOf(probe)!.camp.currentTrick.leaderSeatId;
    return { camp: advanceTo(setupRun({ seatIds: SEATS, seed, catalog, characters: { [leader]: character } }), "between-tricks", catalog), leader };
  }

  it("returns every card of a misted trick to its hand, records it, and lets the same leader lead again", () => {
    const { camp, leader } = ledBy("mist", "seam-seed-mist-trick");
    const before = attemptOf(camp)!.camp;
    const misted = use(camp, leader, "mist", [], catalog);
    const { run: after, played } = playTrick(misted);
    const voided = attemptOf(after)!.camp;
    const cardOf = (cardId: string) => before.hands.flatMap((h) => h.cards).find((c) => c.id === cardId)!;
    expect(voided.completedTricks).toEqual([]);
    expect(voided.voidedTricks).toEqual([{ index: 0, leaderSeatId: leader, plays: played.map((p) => ({ seatId: p.seatId, card: cardOf(p.cardId) })) }]);
    expect(voided.currentTrick).toEqual({ index: 1, leaderSeatId: leader, plays: [] });
    expect(voided.hands.map((h) => h.cards.map((c) => c.id).sort())).toEqual(before.hands.map((h) => h.cards.map((c) => c.id).sort()));
    const view = toExpeditionPlayerView(after, "p1", catalog);
    if (view.stage.tag !== "camp") throw new Error("expected a camp");
    expect(view.stage.attempt.camp.voidedTricks.map((t) => t.plays.map((p) => p.card.id))).toEqual([played.map((p) => p.cardId)]);
    leakFree(after, catalog);
    const next = playTrick(after).run;
    expect(attemptOf(next)!.camp.completedTricks.map((t) => t.index)).toEqual([1]);
  });

  it("reports the voided trick between the last play and the next trick's start", () => {
    const { camp, leader } = ledBy("mist", "seam-seed-mist-trick");
    const misted = use(camp, leader, "mist", [], catalog);
    let state = attemptOf(misted)!.camp;
    const rules = rulesFor(misted, catalog);
    let events: readonly { type: string }[] = [];
    for (let i = 0; i < SEATS.length; i++) {
      const actor = currentActorSeatId(state, rules)!;
      const result = applyCampAction(state, actor, { type: "play-card", cardId: rules.legalPlays(state, actor)[0]!.id }, rules);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
      events = result.events;
    }
    expect(events.map((e) => e.type)).toEqual(["card-played", "trick-voided", "trick-started"]);
  });

  it("turns the trick that just failed the camp into a hallucination from the rescue window", () => {
    const salted = seamCharacter("salted", {
      active: ability({ window: "rescue", limit: { kind: "per-run", times: 1 }, targets: [], apply: (ctx) => [{ op: "void-trick", trickIndex: ctx.camp!.completedTricks.at(-1)!.index }] }),
    });
    const cat = catalogWith(salted);
    const camp = advanceTo(setupRun({ seatIds: SEATS, seed: "salts", catalog: cat, characters: { p0: "salted" } }), "between-tricks", cat);
    const { run: played } = playTrickWith(camp, cat);
    const trick = attemptOf(played)!.camp.completedTricks[0]!;
    const lost = trick.plays.find((p) => p.seatId !== trick.winnerSeatId)!;
    const failing = { id: "obj-lost", kind: "win-card" as const, target: lost.card.identity, ownerSeatId: lost.seatId };
    const failed = withAttempt(played, { ...attemptOf(played)!, camp: { ...attemptOf(played)!.camp, objectives: [failing] } });
    expect(currentWindow(failed, rulesFor(failed, cat))).toBe("rescue");
    const saved = act(failed, "p0", { type: "use-ability", sourceKey: "salted", targets: [] }, cat);
    const after = attemptOf(saved)!.camp;
    expect(saved.stage.tag).toBe("camp");
    expect(after.completedTricks).toEqual([]);
    expect(after.voidedTricks.map((t) => [t.index, t.leaderSeatId])).toEqual([[0, trick.leaderSeatId]]);
    expect(after.currentTrick).toEqual({ index: 1, leaderSeatId: trick.leaderSeatId, plays: [] });
    expect(campPhase(after, rulesFor(saved, cat))).toBe("playing");
    expect(campCardIds(after)).toEqual(campCardIds(attemptOf(failed)!.camp));
  });
});

function playTrickWith(run: RunState, catalog: Catalog): { run: RunState } {
  let next = run;
  for (let i = 0; i < SEATS.length; i++) {
    const camp = attemptOf(next)!.camp;
    const rules = rulesFor(next, catalog);
    const actor = currentActorSeatId(camp, rules)!;
    next = act(next, actor, { type: "play-card", cardId: rules.legalPlays(camp, actor)[0]!.id }, catalog);
  }
  return { run: next };
}

describe("source reactions", () => {
  it("lets a character take a seeded item when the length vote opens the run", () => {
    const lucky = seamCharacter("lucky", {
      on: { "run-started": (ctx) => [{ op: "grant-item", seatId: ctx.self, itemId: ctx.drawOffer(ctx.self, { options: 1, bundleSize: 1, exclusive: 0, rareChance: 0 }).bundles[0]![0]! }] },
    });
    const catalog = catalogWith(lucky);
    let run = createRun({ seatIds: SEATS, seed: "lucky" });
    run = act(run, "p0", { type: "pick-character", characterId: "lucky" }, catalog);
    run = act(run, "p1", { type: "pick-character", characterId: "plain-1" }, catalog);
    run = act(run, "p2", { type: "pick-character", characterId: "plain-2" }, catalog);
    for (const seatId of SEATS) run = act(act(run, seatId, { type: "vote", choice: "short" }, catalog), seatId, { type: "lock-in" }, catalog);
    expect(run.stage.tag).toBe("draft");
    expect(run.seats.map((s) => [s.items, s.equipped])).toEqual([[[{ uid: "it0", itemId: "item-b" }], ["it0"]], [[], []], [[], []]]);
  });

  it("pays coins for empty slots when the camp is dealt, and on a clear when it settles", () => {
    const trader = seamCharacter("trader", {
      on: {
        "camp-dealt": (ctx) => {
          const empty = ctx.rules.itemSlots(ctx.run, ctx.self) - ctx.run.seats.find((s) => s.seatId === ctx.self)!.equipped.length;
          return empty === 0 ? [] : [{ op: "adjust-coins", delta: empty === 1 ? 2 : 5 }];
        },
        "camp-settled": (ctx) => (ctx.event.status === "cleared" ? [{ op: "adjust-coins", delta: 1 }] : []),
      },
    });
    const catalog = catalogWith(trader);
    const loadout = setupRun({ seatIds: SEATS, seed: "trader", catalog, characters: { p0: "trader" }, items: { p0: ["item-a"] } });
    const dealt = dealCamp(loadout as RunAt<"loadout">, catalog);
    expect(dealt.purse).toBe(2);
    const cleared = withAttempt(dealt, { ...dealt.stage.attempt, camp: { ...dealt.stage.attempt.camp, objectives: [] } }) as RunAt<"camp">;
    const settled = settleCamp(cleared, "cleared", catalog);
    expect(settled.purse).toBe(2 + 1 + settled.history.at(-1)!.coins);
    expect(settleCamp(cleared, "failed", catalog).purse).toBe(2);
  });
});

describe("surveys", () => {
  const surveyor = seamCharacter("surveyor", { passive: passive((self) => ({ surveys: (prev) => (run, seatId) => seatId === self || prev(run, seatId) })) });
  const catalog = catalogWith(surveyor);
  const route = routeOf(draftOf(setupRun({ seatIds: SEATS, seed: "seam-seed-survey-route", catalog, characters: { p0: "surveyor" } }), catalog), catalog);

  it("shows the surveyor, and only the surveyor, the objectives each route's camp will deal", () => {
    const own = toExpeditionPlayerView(route, "p0", catalog);
    const other = toExpeditionPlayerView(route, "p1", catalog);
    if (own.stage.tag !== "route" || other.stage.tag !== "route") throw new Error("expected the route vote");
    expect(own.stage.options.every((o) => o.next.survey !== null && o.next.survey.length === o.next.slotKinds.length)).toBe(true);
    expect(other.stage.options.map((o) => o.next.survey)).toEqual(other.stage.options.map(() => null));
    leakFree(route, catalog);
  });

  it("names the objectives the camp then deals", () => {
    const own = toExpeditionPlayerView(route, "p0", catalog);
    if (own.stage.tag !== "route") throw new Error("expected the route vote");
    const surveyed = own.stage.options[0]!.next.survey;
    let run: RunState = route;
    for (const seatId of SEATS) run = act(run, seatId, { type: "vote", choice: "a" }, catalog);
    for (const seatId of SEATS) run = act(run, seatId, { type: "ready" }, catalog);
    const dealt = attemptOf(run)!.camp.objectives.map((o) => (o.kind === "win-card" ? { kind: o.kind, target: o.target } : o.kind === "ordered" ? { kind: o.kind, target: o.target, order: o.order } : o.kind === "exactly-n" ? { kind: o.kind, n: o.n } : { kind: o.kind }));
    expect(surveyed).toEqual(dealt);
  });

  it("flags a survey shown to a seat that does not survey", () => {
    const view = toExpeditionPlayerView(route, "p0", catalog);
    const secrets = secretsForExpeditionSeat(route, "p1", catalog);
    expect(checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets })).toContain("structural:survey");
  });
});

describe("the fanned hand", () => {
  const catalog = catalogWith();

  it("offers each place in a teammate's fan and the cards shown to the seat, never naming an unseen card", () => {
    let camp = advanceTo(setupRun({ seatIds: SEATS, seed: "seam-seed-fanned-hand", catalog }), "between-tricks", catalog);
    const shown = attemptOf(camp)!.camp.hands.find((h) => h.seatId === "p1")!.cards[0]!.id;
    camp = act(camp, "p1", { type: "whisper", targetSeatId: "p0", cardId: shown }, catalog);
    const scope = { run: camp, seatId: "p0", camp: attemptOf(camp)!.camp, rules: rulesFor(camp, catalog), catalog };
    const choices = choicesFor(scope, { kind: "fanned-card" });
    const sizes = attemptOf(camp)!.camp.hands.filter((h) => h.seatId !== "p0").map((h) => h.cards.length);
    expect(choices.map((c) => c.id)).toEqual([
      ...Array.from({ length: sizes[0]! }, (_, i) => `fan:p1:${i}`),
      `fan:p1:known:${shown}`,
      ...Array.from({ length: sizes[1]! }, (_, i) => `fan:p2:${i}`),
    ]);
    expect(choices.find((c) => c.id === `fan:p1:known:${shown}`)!.target).toEqual({ kind: "fanned-card", seatId: "p1", cardId: shown });
    expect(new Set(choices.filter((c) => c.id.startsWith("fan:p1:") && !c.id.includes("known")).map((c) => (c.target as { cardId: string }).cardId))).toEqual(
      new Set(attemptOf(camp)!.camp.hands.find((h) => h.seatId === "p1")!.cards.map((c) => c.id)),
    );
    leakFree(camp, catalog);
  });

  it("lands a known card that left the hand on the fan's first place, so the choice never says where it went", () => {
    let camp = advanceTo(setupRun({ seatIds: SEATS, seed: "seam-seed-fanned-hand", catalog }), "between-tricks", catalog);
    const shown = attemptOf(camp)!.camp.hands.find((h) => h.seatId === "p1")!.cards[0]!.id;
    camp = act(camp, "p1", { type: "whisper", targetSeatId: "p0", cardId: shown }, catalog);
    const moved = applyToolkitOps(camp, { kind: "seat", seatId: "p1", sourceKey: "dev", sourceId: "dev" }, [{ op: "move-card", cardId: shown, fromSeatId: "p1", toSeatId: "p2" }], rulesFor(camp, catalog), catalog);
    const scope = { run: moved, seatId: "p0", camp: attemptOf(moved)!.camp, rules: rulesFor(moved, catalog), catalog };
    const choices = choicesFor(scope, { kind: "fanned-card" });
    const first = choices.find((c) => c.id === "fan:p1:0")!.target;
    expect(choices.find((c) => c.id === `fan:p1:known:${shown}`)!.target).toEqual(first);
  });
});
