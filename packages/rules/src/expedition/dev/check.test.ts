import { describe, expect, it } from "vitest";
import { cardLabel } from "../deck";
import { CATALOG } from "../run/catalog";
import { attemptOf, withAttempt } from "../run/attempt";
import { createRun } from "../run/lifecycle";
import type { RunState } from "../run/types";
import { campIndex } from "../run/plan";
import { applyRunAction } from "../run/stages/registry";
import { checkRunState } from "./check";
import { DEV_SHORTCUTS } from "./shortcuts";

const SEATS = ["a", "b", "c"];

function dealt(): RunState {
  return DEV_SHORTCUTS["jump-to-camp"].apply(createRun({ seatIds: SEATS, seed: "check" }), { length: "standard", camp: 1, stage: "camp" }, CATALOG);
}


describe("checkRunState", () => {
  it("counts a kicked seat's character and items, and flags a kicked seat still in the crew", () => {
    const run = dealt();
    const a = run.seats[0]!;
    const twin = { ...run, kicked: [{ seat: { ...a, seatId: "d" }, position: 3, back: false }] };
    expect(checkRunState(twin, CATALOG)).toContain(`character ${a.characterId} is held by more than one seat`);
    expect(checkRunState({ ...run, kicked: [{ seat: { ...a, characterId: null }, position: 0, back: false }] }, CATALOG)).toContain("kicked seat a is still in the crew");
  });

  it("flags loaded dice that name an objective or a modifier this camp lacks", () => {
    const run = dealt();
    const attempt = attemptOf(run)!;
    const loaded = withAttempt(run, { ...attempt, loaded: { rolls: { "dragon:full:start": 1 }, objectives: { nope: "done" } } });
    expect(checkRunState(loaded, CATALOG)).toEqual(["loaded dice decide objective nope, which is not in this camp", "loaded dice pin dragon:full:start, a roll of no known camp modifier"]);
  });

  it("passes a fresh run and a freshly dealt run", () => {
    expect(checkRunState(createRun({ seatIds: SEATS, seed: "check" }), CATALOG)).toEqual([]);
    expect(checkRunState(dealt(), CATALOG)).toEqual([]);
  });

  it("flags a card that appears twice", () => {
    const run = dealt();
    const camp = attemptOf(run)!.camp;
    const first = camp.hands[0]!.cards[0]!;
    const hands = camp.hands.map((h, i) => (i === 1 ? { ...h, cards: [first, ...h.cards.slice(1)] } : h));
    const broken = withAttempt(run, { ...attemptOf(run)!, camp: { ...camp, hands } });
    const problems = checkRunState(broken, CATALOG);
    expect(problems).toContain(`card id ${first.id} appears more than once`);
  });

  it("flags an edited card identity as a conservation break", () => {
    const run = dealt();
    const camp = attemptOf(run)!.camp;
    const [a, b] = camp.hands[0]!.cards;
    const hands = camp.hands.map((h, i) => (i === 0 ? { ...h, cards: [{ ...a!, identity: b!.identity }, ...h.cards.slice(1)] } : h));
    const broken = withAttempt(run, { ...attemptOf(run)!, camp: { ...camp, hands } });
    expect(checkRunState(broken, CATALOG).some((p) => /^card conservation: .+ appears 2 times, expected 1$/.test(p))).toBe(true);
  });

  it("names a duplicate character", () => {
    const run = createRun({ seatIds: SEATS, seed: "check" });
    const seats = run.seats.map((s) => ({ ...s, characterId: "explorer" }));
    expect(checkRunState({ ...run, seats }, CATALOG)).toEqual(["character explorer is held by more than one seat"]);
  });

  it("passes items given through the shortcut, and flags each broken instance, equipped set and upgrade", () => {
    const given = DEV_SHORTCUTS["give-item"].apply(DEV_SHORTCUTS["give-item"].apply(dealt(), { seat: "a", item: "bait" }, CATALOG), { seat: "b", item: "parrot" }, CATALOG);
    expect(checkRunState(given, CATALOG)).toEqual([]);
    const seats = given.seats.map((s) =>
      s.seatId === "a"
        ? { ...s, items: [...s.items, { uid: "it7", itemId: "nope" }, { uid: "x1", itemId: "bait" }], equipped: ["it0", "it0", "it9", "x1"], upgradeId: "leader.momentum" }
        : s.seatId === "b"
          ? { ...s, items: [...s.items, { uid: "it0", itemId: "bait" }], offers: [{ kind: "standard" as const, bundles: [["bait", "ghost"]] }] }
          : s,
    );
    expect(checkRunState({ ...given, seats }, CATALOG)).toEqual([
      "a: item uid it7 is not it<n> below itemSerial 2",
      "a: item it7 is unknown item nope",
      "a: item uid x1 is not it<n> below itemSerial 2",
      "a: it0 is equipped twice",
      "a: equipped it9 is not owned",
      "a: upgrade leader.momentum is not one of its character's",
      "b: draft offer holds unknown item ghost",
      "item uid it0 is owned more than once",
    ]);
  });

  it("flags more items equipped than the composed slots", () => {
    const given = ["bait", "parrot", "puffball"].reduce((run, item) => DEV_SHORTCUTS["give-item"].apply(run, { seat: "a", item }, CATALOG), dealt());
    const over = { ...given, seats: given.seats.map((s) => (s.seatId === "a" ? { ...s, equipped: ["it0", "it1", "it2"] } : s)) };
    expect(checkRunState(over, CATALOG)).toEqual(["a: 3 items equipped, 2 slots"]);
  });

  it("flags supplies out of range and a stray ready seat", () => {
    const loadout = DEV_SHORTCUTS["jump-to-camp"].apply(createRun({ seatIds: SEATS, seed: "check" }), { length: "standard", camp: 1, stage: "loadout" }, CATALOG);
    const run: RunState = { ...loadout, supplies: -1, stage: { ...(loadout.stage as Extract<RunState["stage"], { tag: "loadout" }>), ready: { zed: true } } };
    expect(checkRunState(run, CATALOG)).toEqual([
      "supplies must be a whole number from 0 to 4, got -1",
      "the ready list holds unknown seat zed",
    ]);
    expect(checkRunState({ ...loadout, supplies: 5 }, CATALOG)).toEqual(["supplies must be a whole number from 0 to 4, got 5"]);
  });

  it("flags a muster lock-in without a character and a ballot, or for an unknown seat", () => {
    const muster = createRun({ seatIds: SEATS, seed: "check" });
    const run: RunState = { ...muster, stage: { tag: "muster", ballots: {}, locked: { [SEATS[0]!]: true, zed: true } } };
    expect(checkRunState(run, CATALOG)).toEqual(["the lock-in list holds unknown seat zed", `${SEATS[0]} is locked in without a character and a ballot`]);
  });

  it("flags a run past muster that has no plan", () => {
    const loadout = DEV_SHORTCUTS["jump-to-camp"].apply(createRun({ seatIds: SEATS, seed: "check" }), { length: "standard", camp: 1, stage: "loadout" }, CATALOG);
    expect(checkRunState({ ...loadout, plan: null }, CATALOG)).toEqual([
      "a run at loadout needs a plan",
      "the loadout or camp is camp 1, outside the plan's camps 1 to 0",
    ]);
  });

  it("counts discarded cards toward conservation", () => {
    const run = dealt();
    const camp = attemptOf(run)!.camp;
    const [gone, ...rest] = camp.hands[0]!.cards;
    const hands = camp.hands.map((h, i) => (i === 0 ? { ...h, cards: rest } : h));
    const discarded = withAttempt(run, { ...attemptOf(run)!, camp: { ...camp, hands, discards: [{ card: gone!, afterTrick: 0 }] } });
    expect(checkRunState(discarded, CATALOG)).toEqual([]);
    const lost = withAttempt(run, { ...attemptOf(run)!, camp: { ...camp, hands } });
    expect(checkRunState(lost, CATALOG)).toContain(`card conservation: ${cardLabel(gone!.identity)} appears 0 times, expected 1`);
  });

  it("flags a spec whose location or weather is not a registered def of its kind", () => {
    const run = dealt();
    if (run.stage.tag !== "camp") throw new Error("expected a camp");
    const odd: RunState = { ...run, stage: { ...run.stage, camp: { ...run.stage.camp, location: "rain", weather: "volcano" } } };
    expect(checkRunState(odd, CATALOG)).toEqual(["the loadout or camp: rain is not a location", "the loadout or camp: volcano is not a weather"]);
  });
});

describe("checkRunState: the stages between camps", () => {
  const jump = (stage: string, camp: string) => DEV_SHORTCUTS["jump-to-camp"].apply(createRun({ seatIds: SEATS, seed: "check" }), { length: "standard", camp: Number(camp), stage }, CATALOG);

  it("passes a shop, a draft and an event the camp has", () => {
    for (const [stage, camp] of [["shop", "3"], ["draft", "1"], ["draft", "4"], ["event", "2"]]) expect(checkRunState(jump(stage!, camp!), CATALOG)).toEqual([]);
  });

  it("flags a shop, a draft or an event before a camp that has none, and an unknown event", () => {
    const shop = jump("shop", "3");
    if (shop.stage.tag !== "shop") throw new Error("expected the shop");
    expect(checkRunState({ ...shop, stage: { ...shop.stage, next: campIndex(4) } }, CATALOG)).toEqual(["a standard run has no shop before camp 4"]);
    const event = jump("event", "2");
    if (event.stage.tag !== "event") throw new Error("expected the event");
    expect(checkRunState({ ...event, stage: { ...event.stage, next: campIndex(3), event: "volcano" } }, CATALOG)).toEqual(["the event volcano is not a known event", "a standard run has no event before camp 3"]);
  });

  it("flags a backpack over its size between camps, but not one a camp rule overfilled", () => {
    const draft = jump("draft", "2");
    const items = Array.from({ length: 9 }, (_, i) => ({ uid: `it${i}`, itemId: "bait" }));
    const stuffed: RunState = { ...draft, itemSerial: 9, seats: draft.seats.map((s, i) => (i === 0 ? { ...s, items, equipped: ["it0", "it1"] } : s)) };
    expect(checkRunState(stuffed, CATALOG)).toEqual(["a: 7 items in the backpack, which holds 6"]);
    const camp = dealt();
    const overfull: RunState = { ...camp, itemSerial: 9, seats: camp.seats.map((s, i) => (i === 0 ? { ...s, items, equipped: ["it0", "it1"] } : s)) };
    expect(checkRunState(overfull, CATALOG).some((p) => p.includes("backpack"))).toBe(false);
  });
});

describe("checkRunState: the character seams' fields", () => {
  it("flags a route swap to a boss of another tier, and a negative reroll", () => {
    let run = DEV_SHORTCUTS["force-camp"].apply(dealt(), { outcome: "cleared" }, CATALOG);
    while (run.stage.tag === "draft") {
      const seat = run.seats.find((s) => s.offers.length > 0)!;
      const picked = applyRunAction(run, seat.seatId, { type: "pick-bundle", bundle: 0 }, CATALOG);
      if (!picked.ok) throw new Error(picked.error);
      run = picked.state;
    }
    for (const seatId of run.seatIds) {
      if (run.stage.tag !== "event") break;
      const readied = applyRunAction(run, seatId, { type: "ready" }, CATALOG);
      if (!readied.ok) throw new Error(readied.error);
      run = readied.state;
    }
    if (run.stage.tag !== "route") throw new Error("expected the route vote");
    const options = run.stage.options.map((o, i) => (i === 0 ? { ...o, reroll: -1, swapBoss: { at: campIndex(o.next.index + 1), modId: "tornado" } } : o));
    const broken: RunState = { ...run, stage: { ...run.stage, options } };
    expect(checkRunState(broken, CATALOG)).toEqual(["route a: reroll must be a non-negative whole number, got -1", "route a: swaps in tornado, not an animal boss"]);
  });

  it("flags a hallucination naming a card dealt in no camp", () => {
    const run = dealt();
    const camp = attemptOf(run)!.camp;
    const card = { id: "zzzzzzzz", identity: camp.hands[0]!.cards[0]!.identity };
    const broken = withAttempt(run, { ...attemptOf(run)!, camp: { ...camp, voidedTricks: [{ index: 0, leaderSeatId: "a", plays: [{ seatId: "a", card }] }], currentTrick: { ...camp.currentTrick, index: 1 } } });
    expect(checkRunState(broken, CATALOG)).toContain("hallucination at trick 1 names card zzzzzzzz, not in this camp");
  });
});
