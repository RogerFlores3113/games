import { describe, expect, it } from "vitest";
import { CATALOG } from "../run/catalog";
import { attemptOf } from "../run/attempt";
import { createRun, runStatus } from "../run/lifecycle";
import { campStack } from "../run/stack";
import { rulesFor } from "../run/compose";
import type { RunState } from "../run/types";
import { checkRunState } from "./check";
import { applyRunAction } from "../run/stages/registry";
import { botMove } from "./autoplay";
import { DEV_SHORTCUTS } from "./shortcuts";

const SEATS = ["a", "b", "c"];
const fresh = (): RunState => createRun({ seatIds: SEATS, seed: "shortcuts" });
const run = (id: keyof typeof DEV_SHORTCUTS, state: RunState, params: Record<string, string | number> = {}): RunState =>
  DEV_SHORTCUTS[id].apply(state, params, CATALOG);

describe("dev shortcuts", () => {
  const camp6 = { length: "standard", camp: 6, stage: "camp" } as const;

  it("jump-to-camp deals a fresh attempt of the chosen camp", () => {
    const jumped = run("jump-to-camp", fresh(), camp6);
    expect(jumped.stage.tag).toBe("camp");
    expect(jumped.stage.tag === "camp" && jumped.stage.camp.index).toBe(6);
    expect(jumped.plan?.length).toBe("standard");
    expect(attemptOf(jumped)?.attemptNumber).toBe(1);
    // The temple: four seat objectives, the Sun, and the capybara's one more at half strength.
    expect(campStack(jumped, CATALOG).map((layer) => `${layer.def.id}:${layer.strength}`)).toEqual(["magma:full", "fair:full", "temple:full", "capybara:half"]);
    expect(attemptOf(jumped)?.camp.objectives).toHaveLength(6);
    expect(jumped.history).toEqual([]);
    expect(checkRunState(jumped, CATALOG)).toEqual([]);
  });

  it("jump-to-camp arrives at the loadout of a long run's last camp, or deals a short run's", () => {
    const loadout = run("jump-to-camp", fresh(), { length: "long", camp: 8, stage: "loadout" });
    expect([loadout.stage.tag, loadout.stage.tag === "loadout" && loadout.stage.camp.index, loadout.plan?.length]).toEqual(["loadout", 8, "long"]);
    expect(attemptOf(loadout)).toBeNull();
    expect(checkRunState(loadout, CATALOG)).toEqual([]);

    const short = run("jump-to-camp", fresh(), { length: "short", camp: 4, stage: "camp" });
    expect([short.stage.tag, short.stage.tag === "camp" && short.stage.camp.index, short.plan?.length]).toEqual(["camp", 4, "short"]);
    expect(attemptOf(short)?.camp.objectives.map((o) => o.kind)).toEqual(["win-card", "win-card", "no-tricks", "win-card"]);
    expect(attemptOf(short)?.camp.objectives[3]).toMatchObject({ kind: "win-card", target: { kind: "joker", joker: "sun" } });
  });

  it("jump-to-camp refuses a camp past the length's last", () => {
    expect(() => run("jump-to-camp", fresh(), { length: "short", camp: 5, stage: "camp" })).toThrow("camp must be a whole number from 1 to 4");
  });

  it("jump-to-final-camp matches jump-to-camp at the run's last camp", () => {
    expect(run("jump-to-final-camp", fresh())).toEqual(run("jump-to-camp", fresh(), camp6));
  });

  it("end-run ends the run won or lost", () => {
    const won = run("end-run", fresh(), { outcome: "won" });
    expect(runStatus(won)).toBe("won");
    expect(won.stage).toEqual({ tag: "ended", result: "won" });
    expect(runStatus(run("end-run", fresh(), { outcome: "lost" }))).toBe("lost");
  });

  it("force-camp failed spends a supply, records the failure and reopens the loadout", () => {
    const failed = run("force-camp", fresh(), { outcome: "failed" });
    expect(failed.supplies).toBe(2);
    expect(failed.history).toEqual([{ camp: 1, attempt: 1, location: "jungle", weather: "fair", status: "failed", suppliesSpent: 1, coins: 0 }]);
    expect(failed.stage.tag).toBe("loadout");
  });

  it("force-camp failed at 1 supply ends the run lost", () => {
    const last = run("set-supplies", fresh(), { supplies: 1 });
    const lost = run("force-camp", last, { outcome: "failed" });
    expect(lost.supplies).toBe(0);
    expect(lost.stage).toEqual({ tag: "ended", result: "lost" });
    expect(runStatus(lost)).toBe("lost");
  });

  it("force-camp cleared opens the draft with an offer for every seat and pays the purse", () => {
    const cleared = run("force-camp", fresh(), { outcome: "cleared" });
    expect(cleared.stage.tag).toBe("draft");
    expect(cleared.stage.tag === "draft" && cleared.stage.cleared).toBe(1);
    expect(cleared.seats.every((s) => s.offers.length === 1)).toBe(true);
    // The crew seats the Businessman, whose two empty slots paid 5 at the deal.
    expect(cleared.purse).toBe(cleared.history[0]!.coins + 5);
    expect(cleared.history[0]).toMatchObject({ camp: 1, attempt: 1, location: "jungle", weather: "fair", status: "cleared", suppliesSpent: 0 });
  });

  it("force-camp refuses once the run is over", () => {
    expect(() => run("force-camp", run("end-run", fresh(), { outcome: "lost" }), { outcome: "failed" })).toThrow("the run is already lost");
  });

  it("set-character refuses a character another seat holds", () => {
    const crewed = run("set-character", fresh(), { seat: "a", character: "explorer" });
    expect(() => run("set-character", crewed, { seat: "b", character: "explorer" })).toThrow("explorer already belongs to a");
  });

  it("give-item mints an instance, equipped while a slot is free, and refuses a non-item", () => {
    const given = ["bait", "parrot", "puffball"].reduce((state, item) => run("give-item", state, { seat: "a", item }), fresh());
    expect(given.seats[0]!.items).toEqual([
      { uid: "it0", itemId: "bait" },
      { uid: "it1", itemId: "parrot" },
      { uid: "it2", itemId: "puffball" },
    ]);
    expect(given.seats[0]!.equipped).toEqual(["it0", "it1"]);
    expect(given.itemSerial).toBe(3);
    expect(() => run("give-item", fresh(), { seat: "a", item: "explorer" })).toThrow("item must be one of:");
  });

  it("set-upgrade sets or clears an upgrade of the seat's own character only", () => {
    const explorer = run("set-character", fresh(), { seat: "a", character: "explorer" });
    const upgraded = run("set-upgrade", explorer, { seat: "a", upgrade: "explorer.reshape" });
    expect(upgraded.seats[0]!.upgradeId).toBe("explorer.reshape");
    expect(run("set-upgrade", upgraded, { seat: "a", upgrade: "none" }).seats[0]!.upgradeId).toBeNull();
    expect(() => run("set-upgrade", explorer, { seat: "a", upgrade: "leader.delegate" })).toThrow("leader.delegate belongs to leader, not a's explorer");
  });

  it("set-supplies sets supplies within bounds", () => {
    expect(run("set-supplies", fresh(), { supplies: 4 }).supplies).toBe(4);
    expect(() => run("set-supplies", fresh(), { supplies: 5 })).toThrow("supplies must be a whole number from 0 to 4");
  });

  it("set-purse sets the purse within bounds", () => {
    expect(run("set-purse", fresh(), { purse: 12 }).purse).toBe(12);
    expect(() => run("set-purse", fresh(), { purse: 1000 })).toThrow("purse must be a whole number from 0 to 999");
    expect(() => run("set-purse", fresh(), { purse: -1 })).toThrow("purse must be a whole number from 0 to 999");
  });

  it("move-card moves a card and keeps the state legal", () => {
    const dealt = run("jump-to-camp", fresh(), { length: "standard", camp: 1, stage: "camp" });
    const hands = attemptOf(dealt)!.camp.hands;
    const card = hands[0]!.cards[0]!;
    const moved = run("move-card", dealt, { card: card.id, to: "b" });
    const after = attemptOf(moved)!.camp.hands;
    expect(after[0]!.cards.length).toBe(hands[0]!.cards.length - 1);
    expect(after[1]!.cards.at(-1)).toEqual(card);
    expect(checkRunState(moved, CATALOG)).toEqual([]);
  });

  it("move-card refuses before a deal and offers no cards", () => {
    const [field] = DEV_SHORTCUTS["move-card"].fields(fresh());
    expect(field).toMatchObject({ name: "card", kind: "choice", options: [] });
    expect(() => run("move-card", fresh(), { card: "x", to: "a" })).toThrow("there is no dealt camp to move cards in");
  });

  it("set-objective-owner assigns and clears an owner", () => {
    const dealt = run("jump-to-camp", fresh(), { length: "standard", camp: 1, stage: "camp" });
    const id = attemptOf(dealt)!.camp.objectives[0]!.id;
    const owned = run("set-objective-owner", dealt, { objective: id, seat: "c" });
    expect(attemptOf(owned)!.camp.objectives[0]!.ownerSeatId).toBe("c");
    expect(attemptOf(run("set-objective-owner", owned, { objective: id, seat: "none" }))!.camp.objectives[0]!.ownerSeatId).toBeNull();
  });

  it("set-spec sets a loadout's location and weather, and re-deals a dealt camp under them", () => {
    const loadout = run("set-spec", run("jump-to-camp", fresh(), { length: "standard", camp: 2, stage: "loadout" }), { location: "clifftop", weather: "thunderstorm" });
    expect(loadout.stage.tag === "loadout" && [loadout.stage.camp.location, loadout.stage.camp.weather]).toEqual(["clifftop", "thunderstorm"]);
    expect(checkRunState(loadout, CATALOG)).toEqual([]);

    const dealt = run("jump-to-camp", fresh(), camp6);
    const stormy = run("set-spec", dealt, { location: "clearing", weather: "rain" });
    expect(stormy.stage.tag === "camp" && [stormy.stage.camp.index, stormy.stage.camp.location, stormy.stage.camp.weather]).toEqual([6, "clearing", "rain"]);
    expect(attemptOf(stormy)?.attemptNumber).toBe(1);
    expect(checkRunState(stormy, CATALOG)).toEqual([]);
  });

  it("set-spec offers the camp's own location and weather first, and refuses outside a loadout or camp or with an unknown id", () => {
    const dealt = run("set-spec", run("jump-to-camp", fresh(), camp6), { location: "clifftop", weather: "rain" });
    const [location, weather] = DEV_SHORTCUTS["set-spec"].fields(dealt, CATALOG);
    expect(location).toMatchObject({
      name: "location",
      options: [{ value: "clifftop" }, { value: "clearing" }, { value: "jungle" }, { value: "desert" }, { value: "cave" }, { value: "magma" }],
    });
    expect(weather).toMatchObject({ name: "weather", options: [{ value: "rain" }, { value: "fair" }, { value: "downpour" }, { value: "fog" }, { value: "thunderstorm" }, { value: "night" }] });
    expect(() => run("set-spec", dealt, { location: "cave", weather: "night" })).toThrow("cave never has night");
    expect(() => run("set-spec", fresh(), { location: "jungle", weather: "rain" })).toThrow("set-spec works in a loadout or a camp");
    expect(() => run("set-spec", dealt, { location: "rain", weather: "rain" })).toThrow(/location must be one of/);
  });

  it("set-plan-boss sets a boss camp's boss, survives a jump there, and re-deals that camp in play", () => {
    const loadout = run("jump-to-camp", fresh(), { length: "standard", camp: 2, stage: "loadout" });
    const planned = run("set-plan-boss", loadout, { camp: "3", boss: "crocodile" });
    expect(planned.plan?.bosses[0]).toEqual({ at: 3, tier: "animal", modId: "crocodile" });
    expect(planned.stage).toEqual(loadout.stage);

    const atCamp = run("jump-to-camp", planned, { length: "standard", camp: 3, stage: "camp" });
    expect(atCamp.plan?.bosses[0]?.modId).toBe("crocodile");
    const capybara = run("set-plan-boss", atCamp, { camp: "3", boss: "capybara" });
    expect(attemptOf(capybara)?.camp.objectives.length).toBe((attemptOf(atCamp)?.camp.objectives.length ?? 0) + 2);
    expect(checkRunState(capybara, CATALOG)).toEqual([]);

    expect(DEV_SHORTCUTS["set-plan-boss"].fields(atCamp, CATALOG)[0]).toMatchObject({ options: [{ value: "3" }] });
    expect(() => run("set-plan-boss", atCamp, { camp: "6", boss: "tiger" })).toThrow(/camp must be one of: 3/);
    expect(run("set-plan-boss", atCamp, { camp: "3", boss: "none" }).plan?.bosses[0]?.modId).toBeNull();
  });

  it("set-plan-boss sets a Long run's disaster, which a jump to camp 6 deals", () => {
    const loadout = run("jump-to-camp", fresh(), { length: "long", camp: 5, stage: "loadout" });
    const planned = run("set-plan-boss", loadout, { camp: "6", boss: "tornado" });
    expect(planned.plan?.bosses[1]).toEqual({ at: 6, tier: "disaster", modId: "tornado" });
    expect(() => run("set-plan-boss", loadout, { camp: "6", boss: "tiger" })).toThrow(/tiger is not a disaster boss/);
    const atCamp = run("jump-to-camp", planned, { length: "long", camp: 6, stage: "camp" });
    expect(atCamp.stage.tag === "camp" && atCamp.stage.camp.index).toBe(6);
    expect(campStack(atCamp, CATALOG).map((l) => l.def.id)).toContain("tornado");
    expect(checkRunState(atCamp, CATALOG)).toEqual([]);
  });
});

describe("dev shortcuts for the character seams", () => {
  const act = (state: RunState, seatId: string, action: Parameters<typeof applyRunAction>[2]): RunState => {
    const result = applyRunAction(state, seatId, action, CATALOG);
    if (!result.ok) throw new Error(result.error);
    return result.state;
  };
  const routeVote = (): RunState => {
    let state = run("force-camp", run("jump-to-camp", fresh(), { length: "standard", camp: 1, stage: "camp" }), { outcome: "cleared" });
    while (state.stage.tag === "draft") state = act(state, state.seats.find((s) => s.offers.length > 0)!.seatId, { type: "pick-bundle", bundle: 0 });
    return state;
  };

  it("reroll-route draws one option's place and event again and counts the reroll", () => {
    const vote = routeVote();
    const rerolled = run("reroll-route", vote, { option: "a" });
    if (rerolled.stage.tag !== "route" || vote.stage.tag !== "route") throw new Error("expected the route vote");
    expect(rerolled.stage.options.map((o) => o.reroll)).toEqual(vote.stage.options.map((o, i) => (i === 0 ? 1 : 0)));
    expect(rerolled.stage.options[0]!.next.slots).toEqual(vote.stage.options[0]!.next.slots);
    expect(checkRunState(rerolled, CATALOG)).toEqual([]);
    expect(() => run("reroll-route", fresh(), { option: "a" })).toThrow("reroll-route works at a route vote");
  });

  it("set-route-swap swaps the next animal boss camp's boss, and refuses a boss of another tier", () => {
    const swapped = run("set-route-swap", routeVote(), { option: "b", boss: "beaver" });
    if (swapped.stage.tag !== "route") throw new Error("expected the route vote");
    expect(swapped.stage.options.find((o) => o.id === "b")!.swapBoss).toEqual({ at: 3, modId: "beaver" });
    expect(checkRunState(swapped, CATALOG)).toEqual([]);
    expect(() => run("set-route-swap", routeVote(), { option: "b", boss: "tornado" })).toThrow("tornado is not an animal boss");
  });

  it("void-last-trick returns the last trick's cards to their hands", () => {
    let state = run("jump-to-camp", fresh(), { length: "standard", camp: 1, stage: "camp" });
    while ((attemptOf(state)?.camp.completedTricks.length ?? 0) === 0) {
      const move = botMove(state, SEATS, CATALOG)!;
      state = act(state, move.seatId, move.request);
    }
    const voided = run("void-last-trick", state);
    const camp = attemptOf(voided)!.camp;
    expect([camp.completedTricks.length, camp.voidedTricks.map((t) => t.index)]).toEqual([0, [0]]);
    expect(checkRunState(voided, CATALOG)).toEqual([]);
    expect(() => run("void-last-trick", voided)).toThrow("there is no completed trick to void");
  });

  it("queue-offer queues a special offer behind the seat's own", () => {
    const queued = run("queue-offer", run("force-camp", run("jump-to-camp", fresh(), camp2), { outcome: "cleared" }), { seat: "b" });
    expect(queued.seats.find((s) => s.seatId === "b")!.offers.map((o) => o.kind)).toEqual(["standard", "special"]);
    expect(checkRunState(queued, CATALOG)).toEqual([]);
  });
});

const camp2 = { length: "standard", camp: 2, stage: "camp" } as const;

describe("dev shortcuts for a solo playtest", () => {
  it("jump-to-camp arrives at the route vote that leads to the camp, its draft skipped", () => {
    const vote = run("jump-to-camp", fresh(), { length: "long", camp: 6, stage: "route" });
    expect(vote.stage.tag === "route" && vote.stage.from).toBe(5);
    expect(vote.history.map((h) => [h.camp, h.status])).toEqual([[5, "cleared"]]);
    expect(vote.seats.every((s) => s.offers.length === 0)).toBe(true);
    expect(checkRunState(vote, CATALOG)).toEqual([]);
    expect(() => run("jump-to-camp", fresh(), { length: "long", camp: 1, stage: "route" })).toThrow("camp 1 has no route vote before it");
  });

  it("jump-to-camp arrives at the shop before a boss camp, and names the shops when the camp has none", () => {
    const shop = run("jump-to-camp", fresh(), { length: "long", camp: 6, stage: "shop" });
    expect(shop.stage.tag === "loadout" && [shop.stage.camp.index, shop.stage.stock?.length]).toEqual([6, 4]);
    expect(() => run("jump-to-camp", fresh(), { length: "long", camp: 5, stage: "shop" })).toThrow("camp 5 has no shop: a long run's shops are before camps 3, 6, 8");
  });

  it("next-stage moves every seat on: muster to camp 1's loadout, the loadout to the table, the table to its end", () => {
    const loadout = run("next-stage", fresh());
    expect(loadout.stage.tag === "loadout" && loadout.stage.camp.index).toBe(1);
    expect(loadout.seats.every((s) => s.characterId !== null)).toBe(true);
    const table = run("next-stage", loadout);
    expect(table.stage.tag).toBe("camp");
    const after = run("next-stage", table);
    expect(after.history).toHaveLength(1);
    expect(checkRunState(after, CATALOG)).toEqual([]);
    expect(() => run("next-stage", run("end-run", fresh(), { outcome: "won" }))).toThrow("the run is already won");
  });

  it("add-coins adds ten, and add-supply adds one until supplies are full", () => {
    expect(run("add-coins", fresh()).purse).toBe(10);
    expect(run("add-supply", fresh()).supplies).toBe(4);
    expect(() => run("add-supply", run("add-supply", fresh()))).toThrow("supplies are full (4 of 4)");
  });

  it("set-objective-status decides an objective done or failed whatever the tricks say, and back", () => {
    const dealt = run("jump-to-camp", fresh(), { length: "standard", camp: 2, stage: "camp" });
    const [first, second] = attemptOf(dealt)!.camp.objectives;
    const status = (state: RunState, id: string) => rulesFor(state, CATALOG).objectiveStatus(attemptOf(state)!.camp, attemptOf(state)!.camp.objectives.find((o) => o.id === id)!);
    const done = run("set-objective-status", dealt, { objective: first!.id, status: "done" });
    expect([status(done, first!.id), status(done, second!.id)]).toEqual(["done", "pending"]);
    expect(checkRunState(done, CATALOG)).toEqual([]);
    expect(status(run("set-objective-status", done, { objective: first!.id, status: "play" }), first!.id)).toBe("pending");
  });

  it("set-objective-status settles a camp it decides: every objective done clears it, a failed one fails it", () => {
    const dealt = run("jump-to-camp", fresh(), { length: "standard", camp: 2, stage: "camp" });
    const ids = attemptOf(dealt)!.camp.objectives.map((o) => o.id);
    const cleared = ids.reduce((state, objective) => run("set-objective-status", state, { objective, status: "done" }), dealt);
    expect([cleared.stage.tag, cleared.history.at(-1)?.status]).toEqual(["draft", "cleared"]);
    const failed = run("set-objective-status", dealt, { objective: ids[0]!, status: "failed" });
    expect([failed.stage.tag, failed.history.at(-1)?.status, failed.supplies]).toEqual(["loadout", "failed", 2]);
    expect(() => run("set-objective-status", run("force-camp", dealt, { outcome: "cleared" }), { objective: ids[0]!, status: "done" })).toThrow("there is no dealt camp with objectives");
  });
});
