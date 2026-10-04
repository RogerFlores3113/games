import { describe, expect, it } from "vitest";
import { CATALOG } from "../run/catalog";
import { attemptOf } from "../run/attempt";
import { createRun, runStatus } from "../run/lifecycle";
import type { RunState } from "../run/types";
import { checkRunState } from "./check";
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
    expect(attemptOf(jumped)?.camp.objectives).toHaveLength(4);
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
    expect(attemptOf(short)?.camp.objectives).toHaveLength(3);
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
    expect(failed.history).toEqual([{ camp: 1, attempt: 1, status: "failed", suppliesSpent: 1, coins: 0 }]);
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
    expect(cleared.seats.every((s) => s.draftOffer !== null)).toBe(true);
    expect(cleared.purse).toBe(cleared.history[0]!.coins);
    expect(cleared.history[0]).toMatchObject({ camp: 1, attempt: 1, status: "cleared", suppliesSpent: 0 });
  });

  it("force-camp refuses once the run is over", () => {
    expect(() => run("force-camp", run("end-run", fresh(), { outcome: "lost" }), { outcome: "failed" })).toThrow("the run is already lost");
  });

  it("set-character refuses a character another seat holds", () => {
    const crewed = run("set-character", fresh(), { seat: "a", character: "scout" });
    expect(() => run("set-character", crewed, { seat: "b", character: "scout" })).toThrow("scout already belongs to a");
  });

  it("set-kit and give-source edit the kit and reject a character id", () => {
    const kitted = run("set-kit", fresh(), { seat: "a", kit: "bait, parrot" });
    expect(kitted.seats[0]!.kit).toEqual(["bait", "parrot"]);
    expect(run("give-source", kitted, { seat: "a", source: "puffball" }).seats[0]!.kit).toEqual(["bait", "parrot", "puffball"]);
    expect(() => run("set-kit", fresh(), { seat: "a", kit: "scout" })).toThrow("scout is not an upgrade or item in the catalogue");
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
});
