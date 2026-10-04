import { describe, expect, it } from "vitest";
import { CATALOG } from "../run/catalog";
import { createRun } from "../run/lifecycle";
import type { RunState } from "../run/types";
import { checkRunState } from "./check";
import { DEV_SHORTCUTS } from "./shortcuts";

const SEATS = ["a", "b", "c"];

function dealt(): RunState {
  return DEV_SHORTCUTS["jump-to-camp"].apply(createRun({ seatIds: SEATS, seed: "check" }), { camp: 1 }, CATALOG);
}


describe("checkRunState", () => {
  it("passes a fresh run and a freshly dealt run", () => {
    expect(checkRunState(createRun({ seatIds: SEATS, seed: "check" }), CATALOG)).toEqual([]);
    expect(checkRunState(dealt(), CATALOG)).toEqual([]);
  });

  it("flags a card that appears twice", () => {
    const run = dealt();
    const camp = run.attempt!.camp;
    const first = camp.hands[0]!.cards[0]!;
    const hands = camp.hands.map((h, i) => (i === 1 ? { ...h, cards: [first, ...h.cards.slice(1)] } : h));
    const broken = { ...run, attempt: { ...run.attempt!, camp: { ...camp, hands } } };
    const problems = checkRunState(broken, CATALOG);
    expect(problems).toContain(`card id ${first.id} appears more than once`);
  });

  it("flags an edited card identity as a conservation break", () => {
    const run = dealt();
    const camp = run.attempt!.camp;
    const [a, b] = camp.hands[0]!.cards;
    const hands = camp.hands.map((h, i) => (i === 0 ? { ...h, cards: [{ ...a!, identity: b!.identity }, ...h.cards.slice(1)] } : h));
    const broken = { ...run, attempt: { ...run.attempt!, camp: { ...camp, hands } } };
    expect(checkRunState(broken, CATALOG).some((p) => /^card conservation: .+ appears 2 times, expected 1$/.test(p))).toBe(true);
  });

  it("names a duplicate character and an unknown kit id", () => {
    const run = createRun({ seatIds: SEATS, seed: "check" });
    const seats = run.seats.map((s, i) => ({ ...s, characterId: "scout", kit: i === 0 ? ["nope"] : [] }));
    const problems = checkRunState({ ...run, seats }, CATALOG);
    expect(problems).toContain("character scout is held by more than one seat");
    expect(problems).toContain("a: kit holds unknown source nope");
  });

  it("flags negative supplies and a stray ready seat", () => {
    const run = { ...createRun({ seatIds: SEATS, seed: "check" }), supplies: -1, readySeatIds: ["zed"] };
    expect(checkRunState(run, CATALOG)).toEqual([
      "ready list holds unknown seat zed",
      "supplies must be a non-negative integer, got -1",
    ]);
  });
});
