import { describe, expect, it } from "vitest";
import { CATALOG } from "../run/catalog";
import { createRun, runPhase, runStatus } from "../run/lifecycle";
import type { RunState } from "../run/types";
import { checkRunState } from "./check";
import { DEV_SHORTCUTS } from "./shortcuts";

const SEATS = ["a", "b", "c"];
const fresh = (): RunState => createRun({ seatIds: SEATS, seed: "shortcuts" });
const run = (id: keyof typeof DEV_SHORTCUTS, state: RunState, params: Record<string, string | number> = {}): RunState =>
  DEV_SHORTCUTS[id].apply(state, params, CATALOG);

describe("dev shortcuts", () => {
  it("jump-to-camp 6 deals a fresh attempt", () => {
    const jumped = run("jump-to-camp", fresh(), { camp: 6 });
    expect(jumped.campNumber).toBe(6);
    expect(jumped.attempt?.attemptNumber).toBe(1);
    expect(jumped.attempt?.camp.objectives).toHaveLength(5);
    expect(jumped.history).toEqual([]);
    expect(checkRunState(jumped, CATALOG)).toEqual([]);
  });

  it("jump-to-final-camp matches jump-to-camp 6", () => {
    expect(run("jump-to-final-camp", fresh())).toEqual(run("jump-to-camp", fresh(), { camp: 6 }));
  });

  it("end-run ends the run won or lost", () => {
    const won = run("end-run", fresh(), { outcome: "won" });
    expect(runStatus(won)).toBe("won");
    expect(runPhase(won)).toBe("ended");
    expect(runStatus(run("end-run", fresh(), { outcome: "lost" }))).toBe("lost");
  });

  it("force-camp failed spends a supply and records the failure", () => {
    const failed = run("force-camp", fresh(), { outcome: "failed" });
    expect(failed.supplies).toBe(2);
    expect(failed.history.at(-1)).toMatchObject({ campNumber: 1, status: "failed" });
  });

  it("force-camp succeeded moves to camp 2 with a draft offer for every seat", () => {
    const cleared = run("force-camp", fresh(), { outcome: "succeeded" });
    expect(cleared.campNumber).toBe(2);
    expect(cleared.seats.every((s) => s.draftOffer !== null)).toBe(true);
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
    expect(run("set-supplies", fresh(), { supplies: 7 }).supplies).toBe(7);
    expect(() => run("set-supplies", fresh(), { supplies: 100 })).toThrow("supplies must be a whole number from 0 to 99");
  });

  it("move-card moves a card and keeps the state legal", () => {
    const dealt = run("jump-to-camp", fresh(), { camp: 1 });
    const hands = dealt.attempt!.camp.hands;
    const card = hands[0]!.cards[0]!;
    const moved = run("move-card", dealt, { card: card.id, to: "b" });
    const after = moved.attempt!.camp.hands;
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
    const dealt = run("jump-to-camp", fresh(), { camp: 1 });
    const id = dealt.attempt!.camp.objectives[0]!.id;
    const owned = run("set-objective-owner", dealt, { objective: id, seat: "c" });
    expect(owned.attempt!.camp.objectives[0]!.ownerSeatId).toBe("c");
    expect(run("set-objective-owner", owned, { objective: id, seat: "none" }).attempt!.camp.objectives[0]!.ownerSeatId).toBeNull();
  });
});
