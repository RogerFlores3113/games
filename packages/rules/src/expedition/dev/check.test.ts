import { describe, expect, it } from "vitest";
import { cardLabel } from "../deck";
import { CATALOG } from "../run/catalog";
import { attemptOf, withAttempt } from "../run/attempt";
import { createRun } from "../run/lifecycle";
import type { RunState } from "../run/types";
import { checkRunState } from "./check";
import { DEV_SHORTCUTS } from "./shortcuts";

const SEATS = ["a", "b", "c"];

function dealt(): RunState {
  return DEV_SHORTCUTS["jump-to-camp"].apply(createRun({ seatIds: SEATS, seed: "check" }), { length: "standard", camp: 1, stage: "camp" }, CATALOG);
}


describe("checkRunState", () => {
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
    const seats = run.seats.map((s) => ({ ...s, characterId: "scout" }));
    expect(checkRunState({ ...run, seats }, CATALOG)).toEqual(["character scout is held by more than one seat"]);
  });

  it("passes items given through the shortcut, and flags each broken instance, equipped set and upgrade", () => {
    const given = DEV_SHORTCUTS["give-item"].apply(DEV_SHORTCUTS["give-item"].apply(dealt(), { seat: "a", item: "bait" }, CATALOG), { seat: "b", item: "parrot" }, CATALOG);
    expect(checkRunState(given, CATALOG)).toEqual([]);
    const seats = given.seats.map((s) =>
      s.seatId === "a"
        ? { ...s, items: [...s.items, { uid: "it7", itemId: "nope" }, { uid: "x1", itemId: "bait" }], equipped: ["it0", "it0", "it9", "x1"], upgradeId: "guide.pathfinder" }
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
      "a: upgrade guide.pathfinder is not one of its character's",
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
