// One behavior test per catalogue source, driven through the real engine:
// useAbility / applyRunAction for the action, rulesFor and the per-seat view
// for what it did. Camps are hand-built (hands, objectives, tricks) on top of
// a dealt run, so every expected value is a literal read off the fixture.

import { describe, expect, it } from "vitest";
import { toExpeditionPlayerView } from "../adapter/view";
import { checkCampOutcome, currentActorSeatId } from "../camp";
import { evaluateObjective } from "../objectives";
import type { CampState, CompletedTrick, ExpeditionCard, Objective, StandardIdentity, StandardRank, Suit } from "../state";
import { trickWinner } from "../trick";
import { abilityStatus, useAbility } from "../run/abilities";
import { FAILED_ATTEMPT_COINS, FAILURE_COST, PRICE_BANDS, WHISPERS_PER_CAMP } from "../run/balance";
import { CATALOG } from "../run/catalog";
import { rulesFor } from "../run/compose";
import { attemptOf, withAttempt } from "../run/attempt";
import { advanceTo, setupRun, testCatalog } from "../run/run-test-support";
import { createRun, openShop } from "../run/lifecycle";
import { campIndex } from "../run/plan";
import { applyRunAction } from "../run/stages/registry";
import { resolvedPlay } from "../test-support";
import { defineItem } from "./source-def";
import { campCardIds } from "../run/toolkit";
import type { RunAction, RunAt, RunState } from "../run/types";
import type { ExpeditionAttemptView, ExpeditionView } from "../adapter/view-types";
import { remaining } from "../run/usage";
import { currentWindow, gatedPendingSeatIds } from "../run/windows";

const SEATS = ["p0", "p1", "p2"] as const;

function attemptViewOf(view: ExpeditionView): ExpeditionAttemptView {
  if (view.stage.tag !== "camp") throw new Error(`expected the camp stage, got ${view.stage.tag}`);
  return view.stage.attempt;
}
const FILLERS = ["jd", "explorer", "cartographer", "leader", "pack-rat"];

const std = (id: string, suit: Suit, rank: StandardRank): ExpeditionCard => ({ id, identity: { kind: "standard", suit, rank } });
const ident = (suit: Suit, rank: StandardRank): StandardIdentity => ({ kind: "standard", suit, rank });

/** A win-card objective no fixture card ever settles, so a camp stays in play. */
const PENDING: Objective = { id: "pending", kind: "win-card", target: ident("clubs", 2), ownerSeatId: "p2" };

function winCard(id: string, target: StandardIdentity, ownerSeatId: string | null): Objective {
  return { id, kind: "win-card", target, ownerSeatId };
}

function trick(index: number, leaderSeatId: string, plays: readonly (readonly [string, ExpeditionCard])[]): CompletedTrick {
  const played = plays.map(([seatId, card]) => resolvedPlay(seatId, card));
  return { index, leaderSeatId, plays: played, winnerSeatId: trickWinner(played, played[0]!.card.identity) };
}

const X14 = std("x", "spades", 14);
const Y12 = std("y", "spades", 12);
const Z4 = std("z", "spades", 4);
/** Won by p0 with the spades 14. */
const WON_BY_P0 = trick(0, "p0", [["p0", X14], ["p1", Y12], ["p2", Z4]]);
/** Won by p1 with the spades 12. */
const WON_BY_P1 = trick(0, "p0", [["p0", std("x", "spades", 9)], ["p1", Y12], ["p2", Z4]]);

type Spec = {
  character?: string;
  /** p1's and p2's characters, instead of the fillers. */
  mates?: readonly [string, string];
  /** p1's items. */
  mateKit?: readonly string[];
  kit?: readonly string[];
  camp?: number;
  supplies?: number;
  purse?: number;
  hands?: Partial<Record<(typeof SEATS)[number], ExpeditionCard[]>>;
  objectives?: Objective[];
  tricks?: CompletedTrick[];
  deck?: StandardIdentity[];
  totalTricks?: number;
  leader?: string;
};

function crew(spec: Spec): RunState {
  const character = spec.character ?? "jd";
  const [p1, p2] = spec.mates ?? FILLERS.filter((id) => id !== character);
  return setupRun({
    seatIds: SEATS,
    seed: "catalogue",
    catalog: CATALOG,
    ...(spec.camp === undefined ? {} : { camp: spec.camp }),
    ...(spec.supplies === undefined ? {} : { supplies: spec.supplies }),
    ...(spec.purse === undefined ? {} : { purse: spec.purse }),
    characters: { p0: character, p1: p1!, p2: p2! },
    upgrades: Object.fromEntries((spec.kit ?? []).filter((id) => CATALOG.sources[id]!.kind === "upgrade").map((id) => ["p0", id])),
    items: { p0: (spec.kit ?? []).filter((id) => CATALOG.sources[id]!.kind === "item"), p1: spec.mateKit ?? [] },
  });
}

/** A run between tricks whose camp is exactly the spec's. */
function table(spec: Spec = {}): RunState {
  const run = advanceTo(crew(spec), "between-tricks", CATALOG);
  const camp = attemptOf(run)!.camp;
  const hands = {
    p0: [std("a", "spades", 9)],
    p1: [std("b", "spades", 6)],
    p2: [std("c", "spades", 4)],
    ...spec.hands,
  };
  const tricks = spec.tricks ?? [];
  const built: CampState = {
    ...camp,
    hands: SEATS.map((seatId) => ({ seatId, cards: hands[seatId] })),
    objectives: spec.objectives ?? [PENDING],
    objectiveDeck: spec.deck ?? [],
    completedTricks: tricks,
    totalTricks: spec.totalTricks ?? 3,
    currentTrick: { index: tricks.length, leaderSeatId: spec.leader ?? tricks.at(-1)?.winnerSeatId ?? "p0", plays: [] },
  };
  return withAttempt(run, { ...attemptOf(run)!, camp: built });
}

/** A failed win-card objective owned by p1 whose card p0 won, with one
 * objective-deck identity (spades 7) still in p2's hand. */
function failedTable(spec: Spec = {}): RunState {
  return table({
    ...spec,
    hands: { p2: [std("d", "spades", 7)] },
    objectives: [winCard("o1", ident("spades", 14), "p1")],
    tricks: [WON_BY_P0],
    deck: [ident("spades", 7)],
  });
}

function act(run: RunState, seatId: string, action: RunAction): RunState {
  const result = applyRunAction(run, seatId, action, CATALOG);
  if (!result.ok) throw new Error(`${seatId} ${JSON.stringify(action)} refused: ${result.error}`);
  return result.state;
}

/** The key a seat uses a source through: its first equipped instance of an
 * item, else the id itself (a character or an upgrade). */
const keyOf = (run: RunState, seatId: string, sourceId: string): string => {
  const seat = run.seats.find((s) => s.seatId === seatId)!;
  return seat.items.find((item) => item.itemId === sourceId && seat.equipped.includes(item.uid))?.uid ?? sourceId;
};
const use = (run: RunState, seatId: string, sourceId: string, targets: readonly string[]) =>
  act(run, seatId, { type: "use-ability", sourceKey: keyOf(run, seatId, sourceId), targets });
/** Without the dispatcher's settle, so a rescued camp stays inspectable. */
const rescue = (run: RunState, seatId: string, sourceId: string, targets: readonly string[]) => {
  const result = useAbility(run, seatId, keyOf(run, seatId, sourceId), targets, CATALOG);
  if (!result.ok) throw new Error(`${seatId} ${sourceId} refused: ${result.error}`);
  return result.state;
};
const play = (run: RunState, seatId: string, cardId: string) => act(run, seatId, { type: "play-card", cardId });
const whisper = (run: RunState, from: string, to: string, cardId: string) => act(run, from, { type: "whisper", targetSeatId: to, cardId });
const refusal = (run: RunState, seatId: string, sourceId: string, targets: readonly string[]) => {
  const result = useAbility(run, seatId, keyOf(run, seatId, sourceId), targets, CATALOG);
  return result.ok ? "ok" : result.error;
};

const camp = (run: RunState): CampState => attemptOf(run)!.camp;
const handIds = (run: RunState, seatId: string) => camp(run).hands.find((h) => h.seatId === seatId)!.cards.map((c) => c.id);
const rules = (run: RunState) => rulesFor(run, CATALOG);
const whisperAllowance = (run: RunState) => SEATS.map((seatId) => rules(run).whispersPerCamp(run, seatId));
const objectiveOf = (run: RunState, id: string) => camp(run).objectives.find((o) => o.id === id)!;
const revealsFor = (run: RunState, seatId: string) => attemptViewOf(toExpeditionPlayerView(run, seatId, CATALOG)).reveals;

/** A camp one trick from clearing: p0 wins with the spades 14 and owns that objective. */
function clearableTable(spec: Spec): RunState {
  return table({
    ...spec,
    hands: { p0: [std("a", "spades", 14)], p1: [std("b", "spades", 3)], p2: [std("c", "spades", 4)] },
    objectives: [winCard("o1", ident("spades", 14), "p0")],
    totalTricks: 1,
    leader: "p0",
  });
}

const playOut = (run: RunState) => play(play(play(run, "p0", "a"), "p1", "b"), "p2", "c");

describe("J.D.", () => {
  it("Lucky Start gives J.D. one random item when the length vote opens the run", () => {
    let run = createRun({ seatIds: SEATS, seed: "beginner" });
    for (const [seatId, characterId] of [["p0", "jd"], ["p1", "leader"], ["p2", "explorer"]] as const) run = act(run, seatId, { type: "pick-character", characterId });
    for (const seatId of SEATS) run = act(act(run, seatId, { type: "vote", choice: "short" }), seatId, { type: "lock-in" });
    expect(run.stage.tag).toBe("draft");
    expect(run.seats.map((s) => [s.items, s.equipped])).toEqual([[[{ uid: "it0", itemId: "mosquito-net" }], ["it0"]], [[], []], [[], []]]);
  });

  it("J.D.'s hidden luck adds 5 to every route's chance of fair weather, up to 100, but never makes the Clifftop fair", () => {
    const run = table({ character: "jd" });
    expect([rules(run).normalWeatherChance(run, 80), rules(run).normalWeatherChance(run, 98), rules(run).normalWeatherChance(run, 0)]).toEqual([85, 100, 0]);
    const without = table({ character: "leader", mates: ["explorer", "cartographer"] });
    expect(rules(without).normalWeatherChance(without, 80)).toBe(80);
  });

  it("Blend In keeps the rats from J.D.'s slots", () => {
    const run = crew({ character: "jd", kit: ["jd.blend-in"], camp: 3 });
    const rats = { ...run, plan: { ...run.plan!, bosses: run.plan!.bosses.map((b) => (b.at === 3 ? { ...b, modId: "rats" } : b)) } };
    expect(SEATS.map((seatId) => rules(rats).itemSlots(rats, seatId))).toEqual([2, 1, 1]);
  });

  it("Free Spirit clears an ordered objective won out of order, from the rescue window", () => {
    const objectives: Objective[] = [
      { id: "o1", kind: "ordered", target: ident("clubs", 2), order: 1, ownerSeatId: "p2" },
      { id: "o2", kind: "ordered", target: ident("spades", 14), order: 2, ownerSeatId: "p0" },
    ];
    const start = table({ character: "jd", kit: ["jd.free-spirit"], objectives, tricks: [WON_BY_P0] });
    expect(currentWindow(start, rules(start))).toBe("rescue");
    const run = rescue(start, "p0", "jd.free-spirit", []);
    expect(objectives.map((o) => rules(run).objectiveStatus(camp(run), objectiveOf(run, o.id)))).toEqual(["pending", "done"]);
    expect(checkCampOutcome(camp(run), rules(run)).status).toBe("in_progress");
  });

  it("Rule Breaker lets J.D. play off the led suit for this trick only", () => {
    const hands = { p0: [std("a", "spades", 9), std("h", "hearts", 5)], p2: [std("c", "spades", 4), std("c2", "spades", 3)], p1: [std("b", "spades", 6), std("b2", "spades", 2)] };
    const led = play(table({ character: "jd", kit: ["jd.rule-breaker"], hands, leader: "p2", totalTricks: 2 }), "p2", "c");
    expect(rules(led).legalPlays(camp(led), "p0").map((c) => c.id)).toEqual(["a"]);
    const broken = use(led, "p0", "jd.rule-breaker", []);
    expect(rules(broken).legalPlays(camp(broken), "p0").map((c) => c.id)).toEqual(["a", "h"]);
    const next = play(play(play(broken, "p0", "h"), "p1", "b"), "p1", "b2");
    expect(camp(next).completedTricks[0]!.winnerSeatId).toBe("p1");
    expect(rules(play(next, "p2", "c2")).legalPlays(camp(play(next, "p2", "c2")), "p0").map((c) => c.id)).toEqual(["a"]);
  });
});

describe("Leader", () => {
  it("Megaphone lets the Leader whisper once more each camp", () => {
    const run = table({ character: "leader", mates: ["jd", "explorer"] });
    expect(whisperAllowance(run)).toEqual([3, 2, 2]);
  });

  it("Open Ears lets the Leader hear each teammate's first whisper of the camp, and only the first", () => {
    const hands = { p1: [std("b1", "hearts", 5), std("b2", "hearts", 6)] };
    const start = table({ character: "leader", kit: ["leader.open-ears"], mates: ["jd", "explorer"], mateKit: ["rain-poncho"], hands });
    const first = whisper(use(start, "p1", "rain-poncho", []), "p1", "p2", "b1");
    expect(revealsFor(first, "p0").map((r) => r.cardId)).toEqual(["b1"]);
    const second = whisper(first, "p1", "p2", "b2");
    expect(revealsFor(second, "p0").map((r) => r.cardId)).toEqual(["b1"]);
    expect(revealsFor(second, "p2").map((r) => r.cardId)).toEqual(["b1", "b2"]);
  });

  it("Delegate hands one of the Leader's whispers to a teammate, until none are left", () => {
    const start = table({ character: "leader", kit: ["leader.delegate"], mates: ["jd", "explorer"] });
    expect(whisperAllowance(start)).toEqual([3, 2, 2]); // an upgrade adds no whisper now
    const once = use(start, "p0", "leader.delegate", ["seat:p1"]);
    expect(whisperAllowance(once)).toEqual([2, 3, 2]);
    const thrice = use(use(once, "p0", "leader.delegate", ["seat:p2"]), "p0", "leader.delegate", ["seat:p2"]);
    expect(whisperAllowance(thrice)).toEqual([0, 3, 4]);
    // The Leader had three whispers to hand over, so none are left now.
    expect(refusal(thrice, "p0", "leader.delegate", ["seat:p1"])).toBe("ability_spent");
  });

  it("Momentum gives the Leader a whisper per trick won, and no other bonus reaches them", () => {
    const start = table({ character: "leader", kit: ["leader.momentum", "smoke-signal"], mates: ["jd", "explorer"] });
    expect(whisperAllowance(start)).toEqual([3, 2, 2]);
    const smoked = use(start, "p0", "smoke-signal", []);
    expect(whisperAllowance(smoked)).toEqual([3, 3, 3]);
    const won = table({ character: "leader", kit: ["leader.momentum"], mates: ["jd", "explorer"], tricks: [WON_BY_P0] });
    expect(whisperAllowance(won)).toEqual([4, 2, 2]);
  });
});

describe("Explorer", () => {
  it("Compass makes a card count one rank higher for winning, not for objectives, once per camp", () => {
    const run = use(table({ character: "explorer", mates: ["jd", "leader"] }), "p0", "explorer", ["value:a:10"]);
    const card = camp(run).hands[0]!.cards[0]!;
    expect([rules(run).rankOf(card), rules(run).identityOf(card)]).toEqual([10, ident("spades", 9)]);
    expect(refusal(run, "p0", "explorer", ["value:a:8"])).toBe("ability_spent");
  });

  it("Second Wind lets the Compass work twice per camp", () => {
    const once = use(table({ character: "explorer", kit: ["explorer.second-wind"], mates: ["jd", "leader"] }), "p0", "explorer", ["value:a:10"]);
    const twice = use(once, "p0", "explorer", ["value:a:8"]);
    expect(remaining(twice, "p0", "explorer", CATALOG)).toEqual({ kind: "uses", left: 0, of: 2 });
  });

  it("True Form makes the changed card count as its new card for objectives too", () => {
    const run = use(table({ character: "explorer", kit: ["explorer.true-form"], mates: ["jd", "leader"] }), "p0", "explorer", ["value:a:10"]);
    const card = camp(run).hands[0]!.cards[0]!;
    expect([rules(run).rankOf(card), rules(run).identityOf(card)]).toEqual([10, ident("spades", 10)]);
  });

  it("Reshape shifts an open objective's card instead, sharing the Compass's use", () => {
    const start = table({ character: "explorer", kit: ["explorer.reshape"], mates: ["jd", "leader"], objectives: [winCard("o1", ident("spades", 7), "p0")] });
    const run = use(start, "p0", "explorer.reshape", ["objective-value:o1:8"]);
    expect(objectiveOf(run, "o1")).toEqual(winCard("o1", ident("spades", 8), "p0"));
    expect([refusal(run, "p0", "explorer", ["value:a:10"]), refusal(run, "p0", "explorer.reshape", ["objective-value:o1:9"])]).toEqual(["ability_spent", "ability_spent"]);
  });

  it("Reshape never shifts an objective onto a card already won or on the table", () => {
    const start = table({
      character: "explorer",
      kit: ["explorer.reshape"],
      mates: ["jd", "leader"],
      hands: { p0: [std("a", "spades", 9)], p1: [std("b", "spades", 6)], p2: [std("c", "hearts", 5)] },
      objectives: [winCard("o1", ident("spades", 13), "p0"), winCard("o2", ident("hearts", 6), "p2")],
      tricks: [WON_BY_P1],
      leader: "p2",
    });
    const midTrick = play(start, "p2", "c");
    const status = abilityStatus(midTrick, "p0", "explorer.reshape", CATALOG);
    if (status === null || !status.usable) throw new Error("expected Reshape to be usable on p0's turn");
    expect(status.steps[0]!.choices).toEqual(["objective-value:o1:14", "objective-value:o2:7"]);
    expect(refusal(midTrick, "p0", "explorer.reshape", ["objective-value:o1:12"])).toBe("invalid_target");
  });
});

/** Every seat takes its first bundle, then readies through any event,
 * until the route vote opens. */
function toRoute(run: RunState): RunState {
  let next = run;
  for (let i = 0; i < 9 && next.stage.tag === "draft"; i++) {
    const seat = next.seats.find((s) => s.offers.length > 0)!;
    next = act(next, seat.seatId, { type: "pick-bundle", bundle: 0 });
  }
  for (const seatId of SEATS) if (next.stage.tag === "event") next = act(next, seatId, { type: "ready" });
  return next;
}

/** The shop before shop camp `camp`, from the crew's loadout there. */
const shopOf = (run: RunState, camp: number): RunState => {
  if (run.stage.tag !== "loadout" || run.stage.camp.index !== camp) throw new Error(`shopOf: expected camp ${camp}'s loadout`);
  return openShop(run, run.stage.camp, CATALOG);
};

describe("Businessman", () => {
  it("Bottom Line pays 2 coins for one empty slot taken into camp, 5 for two and none for none", () => {
    expect([[], ["bait"], ["bait", "parrot"]].map((kit) => table({ character: "businessman", kit }).purse)).toEqual([5, 2, 0]);
  });

  it("sells an item at the shop for half its price, at least 1, and only at the shop", () => {
    const shop = shopOf(crew({ character: "businessman", kit: ["trail-map", "bait"], camp: 3 }), 3);
    const sold = use(shop, "p0", "businessman", ["item:it0"]);
    expect([sold.seats[0]!.items, sold.purse]).toEqual([[{ uid: "it1", itemId: "bait" }], 2]);
    expect(use(sold, "p0", "businessman", ["item:it1"]).purse).toBe(3);
    expect(refusal(crew({ character: "businessman", kit: ["bait"], camp: 2 }), "p0", "businessman", ["item:it0"])).toBe("ability_unavailable");
  });

  it("Cash Out skips the draft for 4 coins", () => {
    const draft = playOut(clearableTable({ character: "businessman" }));
    expect(draft.stage.tag).toBe("draft");
    const skipped = use(draft, "p0", "businessman.cash-out", []);
    expect([skipped.seats[0]!.offers, skipped.purse - draft.purse]).toEqual([[], 4]);
  });

  it("the Pop-up Shop sells its stock into anyone's free slot at its own prices, and a refresh costs 1, then 2", () => {
    const start = table({ character: "businessman", kit: ["businessman.pop-up-shop"], purse: 20 });
    const shop = (r: RunState) => abilityStatus(r, "p0", "businessman.pop-up-shop", CATALOG);
    const first = shop(start);
    if (first === null || !first.usable) throw new Error("expected the shop open");
    const buys = first.steps[0]!.choices.filter((id) => id.startsWith("option:buy:"));
    expect(buys).toHaveLength(9);
    expect(first.steps[0]!.choices.at(-1)).toBe("option:refresh:1");
    const forP1 = buys.find((id) => id.startsWith("option:buy:0:") && id.endsWith(":p1"))!;
    const itemId = forP1.split(":")[3]!;
    const bought = use(start, "p0", "businessman.pop-up-shop", [forP1]);
    const price = { 1: 2, 2: 4, 3: 5, 4: 7, 5: 9 }[CATALOG.items[itemId]!.price]!;
    expect(forP1.split(":")[4]).toBe(String(price));
    expect([bought.purse, bought.seats[1]!.items.map((i) => i.itemId).at(-1)]).toEqual([start.purse - price, itemId]);
    const after = shop(bought);
    if (after === null || !after.usable) throw new Error("expected the shop open");
    expect(after.steps[0]!.choices.some((id) => id.startsWith("option:buy:0:"))).toBe(false);
    const refreshed = use(bought, "p0", "businessman.pop-up-shop", ["option:refresh:1"]);
    expect(refreshed.purse).toBe(bought.purse - 1);
    expect(use(refreshed, "p0", "businessman.pop-up-shop", ["option:refresh:2"]).purse).toBe(refreshed.purse - 2);
  });

  it("Buyout clears a camp whose tricks ran out with a failed objective, for 10 coins each", () => {
    const start = table({
      character: "businessman",
      kit: ["businessman.buyout"],
      purse: 25,
      hands: { p0: [std("a", "spades", 14)], p1: [std("b", "spades", 3)], p2: [std("c", "spades", 4)] },
      objectives: [winCard("o1", ident("spades", 14), "p1"), winCard("o2", ident("spades", 4), "p2")],
      totalTricks: 1,
      leader: "p0",
    });
    const failed = play(play(play(start, "p0", "a"), "p1", "b"), "p2", "c");
    expect(currentWindow(failed, rules(failed))).toBe("rescue");
    const bought = rescue(failed, "p0", "businessman.buyout", []);
    expect([camp(bought).objectives, bought.purse, checkCampOutcome(camp(bought), rules(bought)).status]).toEqual([[], failed.purse - 20, "succeeded"]);
  });

  it("Haggle takes 1 coin off everything the Businessman buys at the shop", () => {
    const shop = shopOf(crew({ character: "businessman", kit: ["businessman.haggle"], camp: 3, purse: 20 }), 3);
    expect([rules(shop).shopPrice(shop, "p0", 6), rules(shop).shopPrice(shop, "p1", 6), rules(shop).shopPrice(shop, "p0", 1)]).toEqual([5, 6, 1]);
    expect(act(shop, "p0", { type: "buy", stockId: "supplies" }).purse).toBe(15);
  });
});

describe("Pack Rat", () => {
  it("Big Pack carries three items, and after each draft picks one of three Pack Rat items", () => {
    const start = clearableTable({ character: "pack-rat" });
    expect(SEATS.map((seatId) => rules(start).itemSlots(start, seatId))).toEqual([3, 2, 2]);
    const draft = playOut(start);
    const exclusive = Object.values(CATALOG.items).filter((item) => item.exclusiveTo === "pack-rat").map((item) => item.id);
    const [standard, packRat] = draft.seats[0]!.offers;
    expect(draft.seats[0]!.offers.map((offer) => offer.bundles.map((bundle) => bundle.length))).toEqual([[1, 1, 1], [1, 1, 1]]);
    expect(draft.seats[0]!.offers.map((offer) => offer.kind)).toEqual(["standard", "special"]);
    expect(standard!.bundles.flat().some((id) => exclusive.includes(id))).toBe(false);
    expect(packRat!.bundles.flat().filter((id) => exclusive.includes(id))).toHaveLength(3);
    expect(new Set(packRat!.bundles.flat()).size).toBe(3);
    expect(draft.seats[1]!.offers.map((offer) => offer.bundles.map((bundle) => bundle.length))).toEqual([[1, 1, 1]]);
    const both = act(act(draft, "p0", { type: "pick-bundle", bundle: 0 }), "p0", { type: "pick-bundle", bundle: 2 });
    expect(both.seats[0]!.items.map((item) => item.itemId)).toEqual([...standard!.bundles[0]!, packRat!.bundles[2]![0]!]);
    expect(both.seats[0]!.offers).toEqual([]);
  });

  it("Quartermaster hands an item to a teammate in the loadout", () => {
    const loadout = crew({ character: "pack-rat", kit: ["pack-rat.quartermaster", "bait", "parrot"] });
    const given = use(loadout, "p0", "pack-rat.quartermaster", ["item:it0", "seat:p1"]);
    expect(given.seats.slice(0, 2).map((s) => [s.items.map((i) => i.itemId), s.equipped])).toEqual([
      [["parrot"], ["it1"]],
      [["bait"], ["it0"]],
    ]);
  });

  it("Pack Animal swaps a carried item for a backpack one mid-camp, once", () => {
    const start = table({ character: "pack-rat", kit: ["pack-rat.pack-animal", "bait", "parrot", "whetstone", "puffball"] });
    expect(start.seats[0]!.equipped).toEqual(["it0", "it1", "it2"]);
    const swapped = use(start, "p0", "pack-rat.pack-animal", ["item:it0", "item:it3"]);
    expect(swapped.seats[0]!.equipped).toEqual(["it1", "it2", "it3"]);
    expect(refusal(swapped, "p0", "pack-rat.pack-animal", ["item:it1", "item:it0"])).toBe("ability_spent");
  });

  it("Sturdy Straps makes the first item use each camp free", () => {
    const start = table({ character: "pack-rat", kit: ["pack-rat.sturdy-straps", "rain-poncho", "smoke-signal"] });
    const once = use(start, "p0", "rain-poncho", []);
    expect(remaining(once, "p0", "it0", CATALOG)).toEqual({ kind: "uses", left: 2, of: 2 });
    const twice = use(use(once, "p0", "rain-poncho", []), "p0", "smoke-signal", []);
    expect([remaining(twice, "p0", "it0", CATALOG), remaining(twice, "p0", "it1", CATALOG)]).toEqual([
      { kind: "uses", left: 1, of: 2 },
      { kind: "uses", left: 1, of: 2 },
    ]);
  });
});

describe("Sturdy Straps and supply items", () => {
  it("never make a supply item free, and a supply item does not use the Straps up", () => {
    const start = table({ character: "pack-rat", kit: ["pack-rat.sturdy-straps", "first-aid-kit", "rain-poncho"], supplies: 3 });
    const healed = use(start, "p0", "first-aid-kit", ["supplies"]);
    expect(healed.supplies).toBe(4);
    expect(healed.seats[0]!.items.map((item) => item.itemId)).toEqual(["rain-poncho"]);
    const poncho = use(healed, "p0", "rain-poncho", []);
    expect(remaining(poncho, "p0", keyOf(poncho, "p0", "rain-poncho"), CATALOG)).toEqual({ kind: "uses", left: 2, of: 2 });
    const again = use(poncho, "p0", "rain-poncho", []);
    expect(remaining(again, "p0", keyOf(again, "p0", "rain-poncho"), CATALOG)).toEqual({ kind: "uses", left: 1, of: 2 });
  });

  it("the Straps' free use goes to the first other item even after a supply item", () => {
    const start = table({ character: "pack-rat", kit: ["pack-rat.sturdy-straps", "trail-rations", "rain-poncho"], supplies: 3 });
    const rules1 = rules(start);
    const [rations, poncho] = [keyOf(start, "p0", "trail-rations"), keyOf(start, "p0", "rain-poncho")];
    expect([rules1.freeUse(start, "p0", rations), rules1.freeUse(start, "p0", poncho)]).toEqual([false, true]);
  });
});

describe("Cartographer", () => {
  it("Mapmaker offers three routes, the third to another animal boss, and rerolls one for a supply", () => {
    const route = toRoute(playOut(clearableTable({ character: "cartographer", supplies: 3 })));
    if (route.stage.tag !== "route") throw new Error("expected the route vote");
    expect(route.stage.options.map((o) => [o.id, o.swapBoss?.at ?? null])).toEqual([["a", null], ["b", null], ["c", 3]]);
    expect(CATALOG.mods[route.stage.options[2]!.swapBoss!.modId]!.kind).toBe("animal");
    const rerolled = use(route, "p0", "cartographer", ["route:b"]);
    if (rerolled.stage.tag !== "route") throw new Error("expected the route vote");
    expect([rerolled.supplies, rerolled.stage.options[1]!.reroll, rerolled.stage.options[0]]).toEqual([2, 1, route.stage.options[0]]);
  });

  it("Redraw replaces an unclaimed card objective's target with the deck's next card", () => {
    const start = advanceTo(crew({ character: "cartographer", camp: 2 }), "objective-pick", CATALOG);
    const before = camp(start);
    const open = before.objectives.find((o) => o.ownerSeatId === null && o.kind === "win-card")!;
    const run = use(start, "p0", "cartographer.redraw", [`objective:${open.id}`]);
    const after = camp(run);
    expect(objectiveOf(run, open.id)).toEqual({ ...open, target: before.objectiveDeck[0] });
    expect(after.objectiveDeck).toEqual(before.objectiveDeck.slice(1));
  });

  it("Survey keeps the card a Desert's mirage will hide face down", () => {
    const loadout = crew({ character: "cartographer", kit: ["cartographer.survey"], camp: 2 });
    if (loadout.stage.tag !== "loadout") throw new Error("expected a loadout");
    const desert: RunState = { ...loadout, stage: { ...loadout.stage, camp: { ...loadout.stage.camp, location: "desert", weather: "fair" } } };
    const view = toExpeditionPlayerView(desert, "p0", CATALOG);
    if (view.stage.tag !== "loadout") throw new Error("expected a loadout view");
    const survey = [{ kind: "win-card", target: ident("clubs", 6) }, { kind: "hidden" }];
    expect(view.stage.camp.survey).toEqual(survey);
    const dealt = attemptViewOf(toExpeditionPlayerView(advanceTo(desert, "objective-pick", CATALOG), "p0", CATALOG)).camp.objectives;
    expect(dealt.map((o) => ("target" in o ? { kind: o.kind, target: o.target } : { kind: o.kind }))).toEqual(survey);
  });

  it("Survey shows the Cartographer alone each route's coming objectives", () => {
    const route = toRoute(playOut(clearableTable({ character: "cartographer", kit: ["cartographer.survey"] })));
    const surveys = (seatId: string) => {
      const view = toExpeditionPlayerView(route, seatId, CATALOG);
      if (view.stage.tag !== "route") throw new Error("expected the route vote");
      return view.stage.options.map((o) => o.next.survey?.length ?? null);
    };
    expect(surveys("p0").every((n) => n !== null && n > 0)).toBe(true);
    expect(surveys("p1")).toEqual([null, null, null]);
  });

  it("Treasure Map gives every player two special one-item drafts and the crew 10 coins", () => {
    const draft = playOut(clearableTable({ character: "cartographer", kit: ["cartographer.treasure-map"] }));
    const mapped = use(draft, "p0", "cartographer.treasure-map", []);
    expect(mapped.purse).toBe(draft.purse + 10);
    for (const seat of mapped.seats) {
      expect(seat.offers.map((o) => o.kind)).toEqual(["standard", "special", "special"]);
      for (const offer of seat.offers.slice(1)) expect(offer.bundles.map((b) => b.length)).toEqual([1, 1, 1]);
    }
    expect(refusal(mapped, "p0", "cartographer.treasure-map", [])).toBe("ability_spent");
  });
});

describe("Magician", () => {
  const hands = { p0: [std("a", "spades", 9)], p1: [std("b1", "hearts", 5), std("b2", "hearts", 6)], p2: [std("c1", "clubs", 8), std("c2", "clubs", 9)] };

  it("Card Trick swaps a card of yours for one from a teammate's fanned hand, once per camp", () => {
    const run = use(table({ character: "magician", hands }), "p0", "magician", ["card:a", "fan:p1:0"]);
    expect([handIds(run, "p0").length, ["b1", "b2"]].flat().length).toBe(3);
    expect(["b1", "b2"]).toContain(handIds(run, "p0")[0]);
    expect(handIds(run, "p1").sort()).toEqual(["a", ...["b1", "b2"].filter((id) => id !== handIds(run, "p0")[0])].sort());
    expect(refusal(run, "p0", "magician", ["card:" + handIds(run, "p0")[0], "fan:p2:0"])).toBe("ability_spent");
  });

  it("Double Act adds two swaps that trade with whispers, one count for both", () => {
    const start = table({ character: "magician", kit: ["magician.double-act"], hands });
    expect([whisperAllowance(start)[0], remaining(start, "p0", "magician", CATALOG)]).toEqual([4, { kind: "whispers", left: 4 }]);
    const swapped = use(start, "p0", "magician", ["card:a", "fan:p1:0"]);
    expect([whisperAllowance(swapped)[0], remaining(swapped, "p0", "magician", CATALOG)]).toEqual([3, { kind: "whispers", left: 3 }]);
    const whispered = whisper(swapped, "p0", "p2", handIds(swapped, "p0")[0]!);
    expect(remaining(whispered, "p0", "magician", CATALOG)).toEqual({ kind: "whispers", left: 2 });
  });

  it("Misdirection swaps cards between two teammates' hands, from the Magician's two swaps", () => {
    const run = use(table({ character: "magician", kit: ["magician.misdirection"], hands }), "p0", "magician.misdirection", ["fan:p1:0", "fan:p2:0"]);
    expect(handIds(run, "p0")).toEqual(["a"]);
    expect([handIds(run, "p1").filter((id) => id.startsWith("c")).length, handIds(run, "p2").filter((id) => id.startsWith("b")).length]).toEqual([1, 1]);
    expect(remaining(run, "p0", "magician", CATALOG)).toEqual({ kind: "uses", left: 1, of: 2 });
  });

  it("Switcheroo spends both swaps to swap two players' open objectives", () => {
    const objectives = [winCard("o1", ident("hearts", 9), "p1"), winCard("o2", ident("clubs", 3), "p2")];
    const start = table({ character: "magician", kit: ["magician.switcheroo"], hands, objectives });
    const run = use(start, "p0", "magician.switcheroo", ["seat:p1", "seat:p2"]);
    expect([objectiveOf(run, "o1").ownerSeatId, objectiveOf(run, "o2").ownerSeatId]).toEqual(["p2", "p1"]);
    expect(remaining(run, "p0", "magician", CATALOG)).toEqual({ kind: "uses", left: 0, of: 2 });
    const swappedFirst = use(start, "p0", "magician", ["card:a", "fan:p1:0"]);
    expect(refusal(swappedFirst, "p0", "magician.switcheroo", ["seat:p1", "seat:p2"])).toBe("ability_spent");
  });
});

describe("Perfumist", () => {
  it("Pink Mist, raised by the trick's leader, sends every card of the trick back to its hand", () => {
    const start = table({ character: "perfumist", leader: "p0", totalTricks: 2, hands: { p0: [std("a", "spades", 9), std("a2", "spades", 2)], p1: [std("b", "spades", 6), std("b2", "spades", 3)], p2: [std("c", "spades", 4), std("c2", "spades", 5)] } });
    const misted = use(start, "p0", "perfumist", []);
    const after = play(play(play(misted, "p0", "a"), "p1", "b"), "p2", "c");
    expect([camp(after).completedTricks, camp(after).voidedTricks.length, handIds(after, "p0").sort()]).toEqual([[], 1, ["a", "a2"]]);
    expect(refusal(table({ character: "perfumist", leader: "p1" }), "p0", "perfumist", [])).toBe("ability_unavailable");
  });

  it("the Perfumist whispers once until upgraded", () => {
    expect(whisperAllowance(table({ character: "perfumist" }))[0]).toBe(1);
    // Items still add to an unupgraded Perfumist's one whisper.
    expect(whisperAllowance(table({ character: "perfumist", kit: ["heavy-pack"] }))[0]).toBe(2);
    expect(whisperAllowance(table({ character: "perfumist", kit: ["perfumist.turncoat", "rain-poncho"] }))[0]).toBe(WHISPERS_PER_CAMP); // upgraded: the normal count, with no cut and no upgrade bonus
  });

  it("Turncoat changes the led suit mid-trick, so the next players follow the new suit", () => {
    const hands = { p0: [std("a", "spades", 9), std("h", "hearts", 5)], p1: [std("b", "spades", 12)], p2: [std("c", "spades", 4)] };
    const led = play(table({ character: "perfumist", kit: ["perfumist.turncoat"], hands, leader: "p2" }), "p2", "c");
    const turned = use(led, "p0", "perfumist.turncoat", ["option:hearts"]);
    expect(rules(turned).legalPlays(camp(turned), "p0").map((c) => c.id)).toEqual(["h"]);
    const done = play(play(turned, "p0", "h"), "p1", "b");
    expect(camp(done).completedTricks[0]!.winnerSeatId).toBe("p0");
  });

  it("Upside Down makes the lowest card win this trick", () => {
    const hands = { p0: [std("a", "spades", 3)], p1: [std("b", "spades", 12)], p2: [std("c", "spades", 9)] };
    const led = play(table({ character: "perfumist", kit: ["perfumist.upside-down"], hands, leader: "p2" }), "p2", "c");
    const flipped = use(led, "p0", "perfumist.upside-down", ["board"]);
    expect(camp(play(play(flipped, "p0", "a"), "p1", "b")).completedTricks[0]!.winnerSeatId).toBe("p0");
  });

  it("Smelling Salts turns the trick that just failed the camp into a hallucination, once per run", () => {
    const start = table({ character: "perfumist", kit: ["perfumist.smelling-salts"], hands: { p0: [std("a", "spades", 14)], p1: [std("b", "spades", 3)], p2: [std("c", "spades", 4)] }, objectives: [winCard("o1", ident("spades", 14), "p1")], totalTricks: 1, leader: "p0" });
    const failed = playOut(start);
    expect(currentWindow(failed, rules(failed))).toBe("rescue");
    const saved = rescue(failed, "p0", "perfumist.smelling-salts", []);
    expect([camp(saved).completedTricks, camp(saved).voidedTricks.length, rules(saved).objectiveStatus(camp(saved), objectiveOf(saved, "o1"))]).toEqual([[], 1, "pending"]);
    expect(remaining(saved, "p0", "perfumist.smelling-salts", CATALOG)).toEqual({ kind: "uses", left: 0, of: 1 });
  });

  it("an objective failed with a trick on the table opens no rescue, so Smelling Salts is refused", () => {
    const start = table({ character: "perfumist", kit: ["perfumist.smelling-salts"], hands: { p0: [std("a", "spades", 9)], p1: [std("b", "spades", 6)], p2: [std("c", "hearts", 5)] }, objectives: [winCard("o1", ident("spades", 14), "p1")], tricks: [WON_BY_P0], leader: "p0" });
    const midTrick = withAttempt(start, { ...attemptOf(start)!, camp: { ...camp(start), hands: camp(start).hands.map((h) => (h.seatId === "p0" ? { ...h, cards: [] } : h)), currentTrick: { ...camp(start).currentTrick, plays: [{ seatId: "p0", card: std("a", "spades", 9) }] } } });
    expect(currentWindow(midTrick, rules(midTrick))).toBeNull();
    expect(refusal(midTrick, "p0", "perfumist.smelling-salts", [])).toBe("wrong_window");
  });
});

describe("Hermit", () => {
  it("the vow drops one of the Hermit's objectives, and a trick the Hermit then wins earns a new one instead of failing the camp", () => {
    const hands = { p0: [std("a", "spades", 14), std("a2", "spades", 13)], p1: [std("b", "spades", 3), std("b2", "spades", 2)], p2: [std("c", "spades", 4), std("c2", "spades", 5)] };
    const start = table({ character: "hermit", objectives: [winCard("mine", ident("hearts", 9), "p0"), PENDING], hands, deck: [ident("spades", 2), ident("spades", 5)], totalTricks: 2, leader: "p0" });
    const vowed = use(start, "p0", "hermit", ["objective:mine"]);
    expect(camp(vowed).objectives.map((o) => o.id)).toEqual(["pending"]);
    expect(rules(vowed).goals(camp(vowed), [])).toEqual([]);
    const won = playOut(vowed);
    expect(camp(won).completedTricks[0]!.winnerSeatId).toBe("p0");
    expect(campOutcome(won)).toEqual({ status: "in_progress" });
    const taken = camp(won).objectives.filter((o) => o.ownerSeatId === "p0");
    expect(taken.map((o) => [o.kind, "target" in o ? o.target : null])).toEqual([["win-card", ident("spades", 2)]]);
    expect(camp(won).objectiveDeck).toEqual([ident("spades", 5)]);
    // Without a vow a win earns nothing, and the vow is refused once a trick is won.
    const unvowed = playOut(start);
    expect(camp(unvowed).objectives.filter((o) => o.ownerSeatId === "p0").map((o) => o.id)).toEqual(["mine"]);
    expect(refusal(table({ character: "hermit", objectives: [winCard("mine", ident("hearts", 9), "p0")], tricks: [WON_BY_P0] }), "p0", "hermit", ["objective:mine"])).toBe("ability_unavailable");
  });

  it("the vow's new objective only draws a card some hand still holds", () => {
    const hands = { p0: [std("a", "spades", 14), std("a2", "spades", 13)], p1: [std("b", "spades", 3), std("b2", "spades", 2)], p2: [std("c", "spades", 4), std("c2", "spades", 5)] };
    // The deck's first card (hearts 2) is in no hand; the next (spades 2) is.
    const start = table({ character: "hermit", objectives: [winCard("mine", ident("hearts", 9), "p0"), PENDING], hands, deck: [ident("hearts", 2), ident("spades", 2)], totalTricks: 2, leader: "p0" });
    const won = playOut(use(start, "p0", "hermit", ["objective:mine"]));
    expect(camp(won).objectives.filter((o) => o.ownerSeatId === "p0").map((o) => ("target" in o ? o.target : null))).toEqual([ident("spades", 2)]);
    expect(camp(won).objectiveDeck).toEqual([ident("hearts", 2)]);
  });

  it("Burden lets the vow drop two objectives, each earning a new one after the Hermit's first win, and adds no objective of its own", () => {
    const dealt = advanceTo(crew({ character: "hermit", kit: ["hermit.burden"] }), "objective-pick", CATALOG);
    const plain = advanceTo(crew({ character: "hermit" }), "objective-pick", CATALOG);
    expect(camp(dealt).objectives.length).toBe(camp(plain).objectives.length);
    expect(remaining(dealt, "p0", "hermit", CATALOG)).toEqual({ kind: "uses", left: 2, of: 2 });
    const hands = { p0: [std("a", "spades", 14), std("a2", "spades", 13)], p1: [std("b", "spades", 3), std("b2", "spades", 2)], p2: [std("c", "spades", 4), std("c2", "spades", 5)] };
    const objectives = [winCard("m1", ident("hearts", 9), "p0"), winCard("m2", ident("hearts", 8), "p0"), PENDING];
    const start = table({ character: "hermit", kit: ["hermit.burden"], objectives, hands, deck: [ident("spades", 2), ident("spades", 5)], totalTricks: 2, leader: "p0" });
    const vowed = use(use(start, "p0", "hermit", ["objective:m1"]), "p0", "hermit", ["objective:m2"]);
    const won = playOut(vowed);
    expect(camp(won).objectives.filter((o) => o.ownerSeatId === "p0").map((o) => ("target" in o ? o.target : null))).toEqual([ident("spades", 2), ident("spades", 5)]);
  });

  it("First Pick takes the first objective of every camp", () => {
    const picking = advanceTo(crew({ character: "hermit", kit: ["hermit.first-pick"] }), "objective-pick", CATALOG);
    expect(currentActorSeatId(camp(picking), rules(picking))).toBe("p0");
  });

  it("Alms gives a teammate one more whisper for each objective the Hermit drops", () => {
    const start = table({ character: "hermit", kit: ["hermit.alms"], objectives: [winCard("mine", ident("hearts", 9), "p0"), PENDING] });
    expect(refusal(start, "p0", "hermit.alms", ["seat:p1"])).toBe("ability_unavailable");
    const given = use(use(start, "p0", "hermit", ["objective:mine"]), "p0", "hermit.alms", ["seat:p1"]);
    expect(whisperAllowance(given)).toEqual([2, 3, 2]);
    expect(refusal(given, "p0", "hermit.alms", ["seat:p2"])).toBe("ability_unavailable");
  });
});

describe("items", () => {
  it("Trained Monkey swaps a card for one a teammate whispered to you, and conserves cards", () => {
    const hands = { p0: [std("a1", "hearts", 5), std("a2", "hearts", 6)], p1: [Y12] };
    const whispered = whisper(table({ kit: ["trained-monkey"], hands }), "p1", "p0", "y");
    const run = use(whispered, "p0", "trained-monkey", ["card:a1", "whisper:0"]);
    expect(handIds(run, "p0")).toEqual(["y", "a2"]);
    expect(handIds(run, "p1")).toEqual(["a1"]);
    expect(campCardIds(camp(run))).toEqual(campCardIds(camp(whispered)));
    expect(refusal(run, "p0", "trained-monkey", ["card:a2", "whisper:0"])).toBe("ability_spent");
  });

  it("Trained Monkey has no whisper to name before one is received, and refuses a card the whisperer no longer holds", () => {
    const hands = { p0: [std("a1", "hearts", 5)], p1: [Y12], p2: [Z4] };
    const start = table({ kit: ["trained-monkey"], hands });
    expect(refusal(start, "p0", "trained-monkey", ["card:a1", "whisper:0"])).toBe("ability_unavailable");
    const whispered = whisper(start, "p1", "p0", "y");
    const attempt = attemptOf(whispered)!;
    const moved = withAttempt(whispered, { ...attempt, camp: { ...attempt.camp, hands: attempt.camp.hands.map((h) => (h.seatId === "p1" ? { ...h, cards: [] } : h.seatId === "p2" ? { ...h, cards: [Z4, Y12] } : h)) } });
    expect(refusal(moved, "p0", "trained-monkey", ["card:a1", "whisper:0"])).toBe("invalid_target");
  });

  it("a Whetstone rank ends when Trained Monkey moves the card to a teammate", () => {
    const sharpened = std("a5", "spades", 5);
    const hands = { p0: [sharpened, std("a2", "hearts", 6)], p1: [std("b1", "diamonds", 9)] };
    const honed = use(whisper(table({ kit: ["whetstone", "trained-monkey"], hands }), "p1", "p0", "b1"), "p0", "whetstone", ["value:a5:7"]);
    expect(rules(honed).rankOf(sharpened)).toBe(7);
    const swapped = use(honed, "p0", "trained-monkey", ["card:a5", "whisper:0"]);
    expect(handIds(swapped, "p1")).toEqual(["a5"]);
    expect(rules(swapped).rankOf(sharpened)).toBe(5);
    const p1Hand = attemptViewOf(toExpeditionPlayerView(swapped, "p1", CATALOG)).camp.yourHand;
    expect(p1Hand.map((card) => [card.id, card.effectiveRank])).toEqual([["a5", null]]);
  });

  it("Pack Mule moves a won trick's winner and is refused for a trick that settles a card objective", () => {
    const run = use(table({ kit: ["pack-mule"], tricks: [WON_BY_P0] }), "p0", "pack-mule", ["trick:0", "seat:p1"]);
    expect(camp(run).completedTricks[0]!.winnerSeatId).toBe("p1");
    const settling = table({ kit: ["pack-mule"], tricks: [WON_BY_P0], objectives: [winCard("o1", ident("spades", 14), "p0"), PENDING] });
    expect(refusal(settling, "p0", "pack-mule", ["trick:0", "seat:p1"])).toBe("invalid_target");
  });

  it("Parrot tells a teammate one suit you hold none of, privately to the two of you", () => {
    const hands = { p0: [std("a", "spades", 9), std("a2", "hearts", 6)] };
    const start = table({ kit: ["parrot"], hands });
    expect(refusal(start, "p0", "parrot", ["option:spades", "seat:p1"])).toBe("invalid_target");
    expect(refusal(start, "p0", "parrot", ["option:hearts", "seat:p1"])).toBe("invalid_target");
    const run = use(start, "p0", "parrot", ["option:clubs", "seat:p1"]);
    expect(attemptOf(run)!.log.filter((l) => l.event.startsWith("void-signal:"))).toEqual([
      { event: "void-signal:clubs", actorSeatId: "p0", subjectSeatIds: ["p1"], sourceId: "parrot", audience: ["p0", "p1"] },
    ]);
    const eventsFor = (seatId: string) => attemptViewOf(toExpeditionPlayerView(run, seatId, CATALOG)).log.map((l) => l.event);
    expect(eventsFor("p0")).toContain("void-signal:clubs");
    expect(eventsFor("p1")).toContain("void-signal:clubs");
    expect(eventsFor("p2")).not.toContain("void-signal:clubs");
    expect(JSON.stringify(toExpeditionPlayerView(run, "p2", CATALOG))).not.toContain("void-signal");
    expect(refusal(run, "p0", "parrot", ["option:diamonds", "seat:p2"])).toBe("ability_spent");
  });

  it("Parrot can't be used by a seat that holds every suit", () => {
    const hands = { p0: [std("a", "spades", 9), std("a2", "hearts", 6), std("a3", "diamonds", 6), std("a4", "clubs", 6)] };
    expect(refusal(table({ kit: ["parrot"], hands }), "p0", "parrot", ["option:clubs", "seat:p1"])).toBe("ability_unavailable");
  });

  it("Trail Map swaps pending objectives and leaves a done one", () => {
    const objectives = [
      winCard("done", ident("spades", 14), "p0"),
      winCard("mine", ident("hearts", 5), "p0"),
      winCard("theirs", ident("hearts", 6), "p1"),
    ];
    const run = use(table({ kit: ["trail-map"], objectives, tricks: [WON_BY_P0] }), "p0", "trail-map", ["seat:p1"]);
    expect(camp(run).objectives.map((o) => [o.id, o.ownerSeatId])).toEqual([
      ["done", "p0"],
      ["mine", "p1"],
      ["theirs", "p0"],
    ]);
  });

  it("Rain Poncho gives its owner one more whisper this camp, on each of its two charges", () => {
    const start = table({ kit: ["rain-poncho"] });
    expect(whisperAllowance(start)).toEqual([2, 2, 2]);
    const once = use(start, "p0", "rain-poncho", []);
    expect(whisperAllowance(once)).toEqual([3, 2, 2]);
    const twice = use(once, "p0", "rain-poncho", []);
    expect(whisperAllowance(twice)).toEqual([4, 2, 2]);
    expect(twice.seats[0]!.items).toEqual([]);
    expect(refusal(twice, "p0", "rain-poncho", [])).toBe("not_owned");
  });

  it("Rain Poncho keeps its owner's whispers from washing away, and leaves the rest of the crew's washes", () => {
    const seatIds = ["p0", "p1", "p2", "p3", "p4"];
    const loadout = setupRun({ seatIds, seed: "poncho", catalog: CATALOG, camp: 2, items: { p0: ["rain-poncho"] } }) as RunAt<"loadout">;
    const raining: RunAt<"loadout"> = { ...loadout, stage: { ...loadout.stage, camp: { ...loadout.stage.camp, location: "jungle", weather: "rain" } } };
    const start = advanceTo(raining, "between-tricks", CATALOG);
    expect(rules(start).washProof(start, "p0")).toBe(false);
    const proofed = use(start, "p0", "rain-poncho", []);
    expect([rules(proofed).washProof(proofed, "p0"), rules(proofed).washProof(proofed, "p1")]).toEqual([true, false]);
    const cardOf = (run: RunState, seatId: string, index = 0) => camp(run).hands.find((h) => h.seatId === seatId)!.cards[index]!.id;
    const heard = whisper(proofed, "p0", "p2", cardOf(proofed, "p0"));
    expect(attemptOf(heard)!.log.at(-1)!.event).toBe("whisper");
    expect(attemptOf(heard)!.reveals.map((r) => r.audience)).toEqual([["p2"]]);
    const washed = whisper(heard, "p1", "p2", cardOf(heard, "p1"));
    expect(attemptOf(washed)!.log.at(-1)!.event).toBe("whisper-washed");
  });

  it("Smoke Signal gives everyone one more whisper, costs no supply, and has two charges", () => {
    const start = table({ kit: ["smoke-signal"], supplies: 3 });
    expect(whisperAllowance(start)).toEqual([2, 2, 2]);
    const run = use(start, "p0", "smoke-signal", []);
    expect(whisperAllowance(run)).toEqual([3, 3, 3]);
    expect(run.supplies).toBe(3);
    const twice = use(run, "p0", "smoke-signal", []);
    expect(whisperAllowance(twice)).toEqual([4, 4, 4]);
    expect(twice.seats[0]!.items).toEqual([]);
  });

  it("Whetstone shifts a card by up to two and leaves its owner", () => {
    const hands = { p0: [std("a5", "spades", 5)] };
    const start = table({ kit: ["whetstone"], hands });
    expect(refusal(start, "p0", "whetstone", ["value:a5:8"])).toBe("invalid_target");
    const run = use(start, "p0", "whetstone", ["value:a5:7"]);
    expect(rules(run).rankOf(hands.p0[0]!)).toBe(7);
    expect(run.seats[0]!.items).toEqual([]);
  });

  it("Puffball makes its user lose the next trick only", () => {
    const hands = {
      p0: [std("a14", "spades", 14), std("a13", "spades", 13)],
      p1: [std("b3", "spades", 3), std("b2", "spades", 2)],
      p2: [std("c4", "spades", 4), std("c5", "spades", 5)],
    };
    const start = use(table({ kit: ["puffball"], hands, leader: "p0" }), "p0", "puffball", ["seat:p0"]);
    const first = play(play(play(start, "p0", "a14"), "p1", "b3"), "p2", "c4");
    expect(camp(first).completedTricks[0]!.winnerSeatId).toBe("p2");
    const second = play(play(play(first, "p2", "c5"), "p0", "a13"), "p1", "b2");
    expect(camp(second).completedTricks[1]!.winnerSeatId).toBe("p0");
  });

  it("Puffball used on your turn makes you lose the trick in progress", () => {
    const hands = { p0: [std("a5", "spades", 5)], p1: [std("b13", "spades", 13)], p2: [std("c4", "spades", 4)] };
    const led = play(table({ mateKit: ["puffball"], hands, leader: "p0" }), "p0", "a5");
    expect(refusal(led, "p0", "puffball", ["seat:p0"])).toBe("not_owned");
    const puffed = use(led, "p1", "puffball", ["seat:p1"]);
    const done = play(play(puffed, "p1", "b13"), "p2", "c4");
    expect(camp(done).completedTricks[0]!.winnerSeatId).toBe("p0");
  });

  it("Whetstone also works on your turn, in a trick", () => {
    const hands = { p0: [std("a5", "spades", 5)], p1: [std("b6", "spades", 6)], p2: [std("c9", "spades", 9)] };
    const led = play(table({ kit: ["whetstone"], hands, leader: "p2" }), "p2", "c9");
    const honed = use(led, "p0", "whetstone", ["value:a5:7"]);
    expect(rules(honed).rankOf(hands.p0[0]!)).toBe(7);
  });

  it("Puffballs that exclude every seat leave the trick to the base rules", () => {
    const hands = {
      p0: [std("a14", "spades", 14)],
      p1: [std("b3", "spades", 3)],
      p2: [std("c4", "spades", 4)],
    };
    const start = table({ hands, leader: "p0" });
    const stocked: RunState = { ...start, seats: start.seats.map((seat, i) => ({ ...seat, items: [{ uid: `it${i}`, itemId: "puffball" }], equipped: [`it${i}`] })) };
    const puffed = SEATS.reduce<RunState>((run, seatId) => use(run, seatId, "puffball", [`seat:${seatId}`]), stocked);
    const done = play(play(play(puffed, "p0", "a14"), "p1", "b3"), "p2", "c4");
    expect(camp(done).completedTricks[0]!.winnerSeatId).toBe("p0");
  });

  it("Bait makes a table card lose this trick only", () => {
    const hands = {
      p0: [std("a9", "spades", 9), std("a8", "spades", 8)],
      p1: [std("b6", "spades", 6), std("b7", "spades", 7)],
      p2: [std("c14", "spades", 14), std("c3", "spades", 3)],
    };
    const led = play(table({ kit: ["bait"], hands, leader: "p2" }), "p2", "c14");
    const baited = use(led, "p0", "bait", ["card:c14"]);
    const plays = [
      { seatId: "p2", card: hands.p2[0]! },
      { seatId: "p0", card: hands.p0[0]! },
    ];
    expect(rules(baited).trickWinner(plays, plays[0]!.card.identity)).toBe("p0");
    const next = play(play(baited, "p0", "a9"), "p1", "b6");
    expect(camp(next).completedTricks[0]!.winnerSeatId).toBe("p0");
    expect(rules(next).trickWinner(plays, plays[0]!.card.identity)).toBe("p2");
  });

  it("Bait on the only card of the led suit hands the trick to the highest card left, the first played on a tie", () => {
    const hands = {
      p0: [std("a9", "hearts", 9), std("a8", "hearts", 8)],
      p1: [std("b9", "clubs", 9), std("b7", "clubs", 7)],
      p2: [std("c14", "spades", 14), std("c3", "spades", 3)],
    };
    const led = play(table({ kit: ["bait"], hands, leader: "p2" }), "p2", "c14");
    const baited = use(led, "p0", "bait", ["card:c14"]);
    const done = play(play(baited, "p0", "a9"), "p1", "b9");
    expect(camp(done).completedTricks[0]!.winnerSeatId).toBe("p0");
  });

  it("Camouflage removes the objective and later fails the camp via a broken guard, with no rescue", () => {
    const objectives = [winCard("mine", ident("hearts", 5), "p0"), PENDING];
    const hands = { p0: [std("a", "spades", 14)], p1: [std("b", "spades", 3)], p2: [std("c", "spades", 4)] };
    const hidden = use(table({ kit: ["camouflage"], objectives, hands, leader: "p0", supplies: 3 }), "p0", "camouflage", ["objective:mine"]);
    expect(camp(hidden).objectives.map((o) => o.id)).toEqual(["pending"]);
    expect(campOutcome(hidden)).toEqual({ status: "in_progress" });

    const exposed = withAttempt(hidden, { ...attemptOf(hidden)!, camp: { ...camp(hidden), completedTricks: [WON_BY_P0] } });
    expect(campOutcome(exposed)).toEqual({ status: "failed", failedObjectiveIds: [], failedGoalIds: ["camouflage:p0"] });
    expect(currentWindow(exposed, rules(exposed))).not.toBe("rescue");

    const failed = playOut(hidden);
    expect(failed.stage.tag).toBe("loadout");
    expect(failed.history.at(-1)).toMatchObject({ camp: 1, status: "failed", suppliesSpent: 1 });
    expect(failed.supplies).toBe(2);
  });

  it("Rope Ladder removes a failed objective and leaves its owner", () => {
    const run = rescue(failedTable({ kit: ["rope-ladder"] }), "p0", "rope-ladder", ["objective:o1"]);
    expect(camp(run).objectives).toEqual([]);
    expect(run.seats[0]!.items).toEqual([]);
  });

  it("Heavy Pack adds a whisper and takes 2 coins from the purse when a camp fails, and no supply", () => {
    const failing = (kit: readonly string[], purse: number) => {
      const start = table({
        kit,
        supplies: 3,
        purse,
        hands: { p0: [std("a", "spades", 14)], p1: [std("b", "spades", 3)], p2: [std("c", "spades", 4)] },
        objectives: [winCard("o1", ident("spades", 14), "p1")],
        totalTricks: 1,
        leader: "p0",
      });
      return { start, end: playOut(start) };
    };
    const packed = failing(["heavy-pack"], 5);
    expect(whisperAllowance(packed.start)).toEqual([3, 2, 2]);
    expect(packed.end.history.at(-1)!.status).toBe("failed");
    expect(packed.end.supplies).toBe(failing([], 5).end.supplies);
    // The consolation is paid first and the pack takes 2 coins back: a failed camp nets FAILED_ATTEMPT_COINS - 2.
    expect(packed.end.purse).toBe(5 + FAILED_ATTEMPT_COINS - 2);
    expect(failing([], 5).end.purse).toBe(5 + FAILED_ATTEMPT_COINS);
    // The purse never goes below 0.
    expect(failing(["heavy-pack"], 0).end.purse).toBe(0);
  });

  it("Heavy Packs share one 2-coin loss across the crew, however many are equipped", () => {
    const start = table({
      kit: ["heavy-pack", "heavy-pack"],
      mateKit: ["heavy-pack"],
      supplies: 4,
      purse: 10,
      hands: { p0: [std("a", "spades", 14)], p1: [std("b", "spades", 3)], p2: [std("c", "spades", 4)] },
      objectives: [winCard("o1", ident("spades", 14), "p1")],
      totalTricks: 1,
      leader: "p0",
    });
    expect(whisperAllowance(start)).toEqual([4, 3, 2]);
    expect(rules(start).failureCoins(start)).toBe(2);
    expect(rules(start).failureCost(start)).toBe(FAILURE_COST);
    expect(playOut(start).purse).toBe(10 + FAILED_ATTEMPT_COINS - 2);
    expect(playOut(start).supplies).toBe(4 - FAILURE_COST);
  });

  it("Trail Rations make a failed camp cost no supply, and cost nothing when the camp is rescued another way", () => {
    const failed = use(failedTable({ kit: ["trail-rations"], supplies: 3 }), "p0", "trail-rations", []);
    expect(failed.stage.tag).toBe("loadout");
    expect(failed.history.at(-1)).toMatchObject({ status: "failed", suppliesSpent: 0 });
    expect(failed.supplies).toBe(3);
    expect(failed.seats[0]!.items).toEqual([]);
    const rescued = use(failedTable({ kit: ["rope-ladder", "trail-rations"], supplies: 3 }), "p0", "rope-ladder", ["objective:o1"]);
    expect(rescued.history.at(-1)).toMatchObject({ status: "cleared" });
    expect(rescued.supplies).toBe(3);
    // Unused rations leave the next failure at its normal cost.
    const normal = rescue(failedTable({ kit: ["trail-rations"], supplies: 3 }), "p0", "trail-rations", []);
    expect(rules(normal).failureCost(normal)).toBe(0);
    expect(rules(failedTable({ supplies: 3 })).failureCost(failedTable({ supplies: 3 }))).toBe(FAILURE_COST);
  });

  it("Conch Shell picks who leads the next trick, even before the camp's first", () => {
    const hands = { p0: [std("a", "spades", 9)], p1: [std("b", "spades", 6)], p2: [std("c", "spades", 4)] };
    const start = table({ kit: ["conch-shell"], hands, leader: "p0" });
    const chosen = use(start, "p0", "conch-shell", ["seat:p2"]);
    expect(camp(chosen).currentTrick.leaderSeatId).toBe("p2");
    expect(chosen.seats[0]!.items).toEqual([]);
    const done = play(play(play(chosen, "p2", "c"), "p0", "a"), "p1", "b");
    expect(camp(done).completedTricks[0]!.leaderSeatId).toBe("p2");
    const midTrick = play(start, "p0", "a");
    expect(refusal(midTrick, "p0", "conch-shell", ["seat:p2"])).toBe("wrong_window");
  });

  it("Pocket Glass shows its owner two random cards of a teammate's hand", () => {
    const hands = { p1: [std("b1", "diamonds", 9), std("b2", "diamonds", 8), std("b3", "clubs", 7)] };
    const run = use(table({ kit: ["pocket-glass"], hands }), "p0", "pocket-glass", ["hand:p1"]);
    const seen = revealsFor(run, "p0");
    expect(seen).toHaveLength(2);
    expect(new Set(seen.map((r) => r.cardId)).size).toBe(2);
    expect(revealsFor(run, "p2")).toEqual([]);
  });

  it("Signal Flare makes your next whisper reach every teammate, and only that one", () => {
    const hands = { p0: [std("a1", "spades", 9), std("a2", "spades", 8), std("a3", "spades", 7)] };
    const start = use(use(table({ kit: ["rain-poncho", "signal-flare"], hands }), "p0", "rain-poncho", []), "p0", "rain-poncho", []);
    const lit = use(start, "p0", "signal-flare", []);
    const first = whisper(lit, "p0", "p1", "a1");
    expect(attemptOf(first)!.reveals.map((r) => r.audience)).toEqual([["p1", "p2"]]);
    expect(revealsFor(first, "p2").map((r) => r.cardId)).toEqual(["a1"]);
    const second = whisper(first, "p0", "p1", "a2");
    expect(attemptOf(second)!.reveals.map((r) => r.audience)).toEqual([["p1", "p2"], ["p1"]]);
    // A whisper sent before the flare is lit stays between the two.
    const early = whisper(use(table({ kit: ["rain-poncho", "signal-flare"], hands }), "p0", "rain-poncho", []), "p0", "p1", "a1");
    const later = whisper(use(early, "p0", "signal-flare", []), "p0", "p1", "a2");
    expect(attemptOf(later)!.reveals.map((r) => r.audience)).toEqual([["p1"], ["p1", "p2"]]);
  });

  it("the second round's prices and rarities", () => {
    const at = (id: string) => [CATALOG.items[id]!.rarity, CATALOG.items[id]!.price];
    expect([at("rope-ladder"), at("heavy-pack"), at("smoke-signal"), at("trail-rations"), at("conch-shell"), at("parrot"), at("signal-flare"), at("rain-poncho"), at("trained-monkey")]).toEqual([
      ["rare", 6], ["uncommon", 3], ["rare", 5], ["rare", 5], ["uncommon", 3], ["common", 1], ["common", 1], ["uncommon", 3], ["rare", 5],
    ]);
    expect(CATALOG.items["trail-rations"]!.noFreeUse).toBe(true);
    expect(CATALOG.items["first-aid-kit"]!.noFreeUse).toBe(true);
    expect(CATALOG.items["trail-rations"]!.uses).toEqual({ kind: "single-use" });
    expect(CATALOG.items["conch-shell"]!.uses).toEqual({ kind: "single-use" });
  });

  it("Mosquito Net lets its owner whisper through a layer that forbids it", () => {
    const gag = defineItem({ id: "gag", name: "Gag", rarity: "common", price: 2, text: "Nobody may whisper.", passive: { modifier: () => ({ whisperAllowed: () => () => false }) } });
    const catalog = testCatalog({ characters: CATALOG.characters, items: { ...CATALOG.items, gag } });
    const run = advanceTo(setupRun({ seatIds: SEATS, seed: "catalogue", catalog, items: { p0: ["gag", "mosquito-net"] } }), "between-tricks", catalog);
    expect(SEATS.map((seatId) => rulesFor(run, catalog).whisperAllowed(run, seatId))).toEqual([true, false, false]);
  });
});

function campOutcome(run: RunState) {
  return checkCampOutcome(camp(run), rules(run));
}

describe("item rarity and price", () => {
  it("prices every item inside its rarity's band", () => {
    const items = Object.values(CATALOG.items);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const band = PRICE_BANDS[item.rarity];
      expect(item.price, `${item.id} (${item.rarity})`).toBeGreaterThanOrEqual(band.min);
      expect(item.price, `${item.id} (${item.rarity})`).toBeLessThanOrEqual(band.max);
    }
  });

  it("has items of all three rarities", () => {
    const rarities = new Set(Object.values(CATALOG.items).map((item) => item.rarity));
    expect([...rarities].sort()).toEqual(["common", "rare", "uncommon"]);
  });
});
