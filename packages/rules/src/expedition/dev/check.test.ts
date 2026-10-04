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

  it("names a duplicate character and an unknown kit id", () => {
    const run = createRun({ seatIds: SEATS, seed: "check" });
    const seats = run.seats.map((s, i) => ({ ...s, characterId: "scout", kit: i === 0 ? ["nope"] : [] }));
    const problems = checkRunState({ ...run, seats }, CATALOG);
    expect(problems).toContain("character scout is held by more than one seat");
    expect(problems).toContain("a: kit holds unknown source nope");
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
});
