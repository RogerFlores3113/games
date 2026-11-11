import { describe, expect, it } from "vitest";
import { toExpeditionPlayerView } from "../../adapter/view";
import { checkCampOutcome } from "../../camp";
import { abilityStatus } from "../../run/abilities";
import { PAYOUT, seatObjectivesAt } from "../../run/balance";
import { CATALOG } from "../../run/catalog";
import { composeRules, rulesFor } from "../../run/compose";
import { campIndex } from "../../run/plan";
import { setupRun, testCatalog } from "../../run/run-test-support";
import { baseRunHooks } from "../../run/run-rules";
import { campStack } from "../../run/stack";
import { applyRunAction } from "../../run/stages/registry";
import type { RunAt, RunLength, RunState } from "../../run/types";
import { gatedPendingSeatIds } from "../../run/windows";
import type { CampState, CardIdentity, CompletedTrick, ExpeditionCard, Objective, Suit } from "../../state";

const SEATS = ["p0", "p1", "p2"];
const catalog = testCatalog({ items: CATALOG.items });
const std = (suit: Suit, rank: number): CardIdentity => ({ kind: "standard", suit, rank }) as CardIdentity;
const card = (id: string, identity: CardIdentity): ExpeditionCard => ({ id, identity });
const SUN: CardIdentity = { kind: "joker", joker: "sun" };

/** A hand-built temple camp at camp 2 of a standard run, plain crew, no helpers. */
function templeCamp(camp: Partial<CampState>): RunAt<"camp"> {
  const run = setupRun({ seatIds: SEATS, seed: "temple", catalog, camp: 2 }) as RunAt<"loadout">;
  const spec = { ...run.stage.camp, location: "jungle", weather: "fair" };
  const state: CampState = {
    seatIds: SEATS,
    playerCount: 3,
    removedCards: [],
    totalTricks: 6,
    hands: SEATS.map((seatId) => ({ seatId, cards: [] })),
    expeditionLeaderSeatId: "p0",
    objectives: [],
    objectiveDeck: [],
    completedTricks: [],
    discards: [], voidedTricks: [],
    currentTrick: { index: 0, leaderSeatId: "p0", plays: [] },
    ...camp,
  };
  return {
    ...run,
    plan: { ...run.plan!, bosses: [{ at: campIndex(2), tier: "temple", modId: "temple" }] },
    stage: { tag: "camp", camp: spec, attempt: { attemptNumber: 1, effects: [], reveals: [], log: [], camp: state } },
  };
}

/** A trick p0 leads with `lead`, won by `winner`. */
function led(index: number, lead: ExpeditionCard, winner = "p0"): CompletedTrick {
  const rest = [card(`x${index}a`, std("clubs", 2)), card(`x${index}b`, std("clubs", 3))];
  return { index, leaderSeatId: "p0", winnerSeatId: winner, plays: [lead, ...rest].map((c, i) => ({ seatId: SEATS[i]!, card: c, countsAs: null, burned: false })) };
}

function pathOf(run: RunState) {
  const view = toExpeditionPlayerView(run, "p1", catalog);
  if (view.stage.tag !== "camp") throw new Error("expected a camp view");
  return view.stage.mods.find((m) => m.id === "temple")!.status;
}

const outcome = (run: RunAt<"camp">) => checkCampOutcome(run.stage.attempt.camp, rulesFor(run, catalog));
const nextTrick = (index: number) => ({ index, leaderSeatId: "p0", plays: [] });
const winSun = (id: string, owner: string): Objective => ({ id, kind: "win-card", target: SUN, ownerSeatId: owner });

describe("the temple", () => {
  // This seed's six-trick path: two suit plates, then the Sun.
  const PATH = ["spades", "clubs", "sun"];

  it("lays a path of half the tricks less one in suits, then the Sun", () => {
    expect(pathOf(templeCamp({}))).toEqual([{ kind: "path", plates: PATH, pressed: 0 }]);
    expect(pathOf(templeCamp({ totalTricks: 10 }))).toEqual([{ kind: "path", plates: ["spades", "clubs", "diamonds", "hearts", "sun"], pressed: 0 }]);
  });

  it("presses a plate only when the next plate's suit is led", () => {
    const wrongFirst = templeCamp({ completedTricks: [led(0, card("a", std("clubs", 9)))], currentTrick: nextTrick(1) });
    expect(pathOf(wrongFirst)).toEqual([{ kind: "path", plates: PATH, pressed: 0 }]);

    const tricks = [led(0, card("a", std("clubs", 9))), led(1, card("b", std("spades", 4))), led(2, card("c", std("spades", 5))), led(3, card("d", std("clubs", 6)))];
    const pressed = templeCamp({ completedTricks: tricks, currentTrick: nextTrick(4) });
    expect(pathOf(pressed)).toEqual([{ kind: "path", plates: PATH, pressed: 2 }]);
    expect(outcome(pressed)).toEqual({ status: "in_progress" });
  });

  it("clears the camp once every plate is pressed, the Sun led last, and every objective done", () => {
    const tricks = [led(0, card("a", std("spades", 9))), led(1, card("b", std("clubs", 4))), led(2, card("s", SUN))];
    const run = templeCamp({ objectives: [winSun("o1", "p0")], completedTricks: tricks, currentTrick: nextTrick(3) });
    expect(pathOf(run)).toEqual([{ kind: "path", plates: PATH, pressed: 3 }]);
    expect(outcome(run)).toEqual({ status: "succeeded" });
  });

  it("fails the camp when fewer tricks remain than unpressed plates, though every objective is done", () => {
    const tricks = [led(0, card("a", std("hearts", 9))), led(1, card("b", std("hearts", 4))), led(2, card("c", std("hearts", 5))), led(3, card("d", std("diamonds", 6)))];
    const run = templeCamp({ completedTricks: tricks, currentTrick: nextTrick(4) });
    expect(outcome(run)).toEqual({ status: "failed", failedObjectiveIds: [], failedGoalIds: ["temple"] });
  });

  it("fails the camp once the Sun leaves play without pressing the last plate", () => {
    const early = templeCamp({ completedTricks: [led(0, card("s", SUN))], currentTrick: nextTrick(1) });
    expect(outcome(early)).toEqual({ status: "failed", failedObjectiveIds: [], failedGoalIds: ["temple:sun"] });
  });

  it("adds a Sun objective beside the seat objectives", () => {
    const run = setupRun({ seatIds: SEATS, seed: "temple-deal", catalog, length: "short", camp: 4 });
    const dealt = SEATS.reduce<RunState>((acc, seatId) => {
      const result = applyRunAction(acc, seatId, { type: "ready" }, catalog);
      if (!result.ok) throw new Error(result.error);
      return result.state;
    }, run);
    if (dealt.stage.tag !== "camp") throw new Error("expected a dealt camp");
    const targets = dealt.stage.attempt.camp.objectives.map((o) => (o.kind === "win-card" ? o.target : o.kind));
    const seatObjectives = seatObjectivesAt("short", 4, SEATS.length);
    expect(targets).toHaveLength(seatObjectives + 1);
    expect(targets[seatObjectives]).toEqual(SUN);
  });
});

describe("the temple's skip", () => {
  const plated = [led(0, card("a", std("spades", 9))), led(1, card("b", std("clubs", 4)))];
  const open: Objective = { id: "o2", kind: "win-card", target: std("spades", 12), ownerSeatId: "p2" };
  const hands = [{ seatId: "p0", cards: [] }, { seatId: "p1", cards: [card("q", std("spades", 12))] }, { seatId: "p2", cards: [] }];

  it("is locked until the Sun is won, then any seat may drop an open objective between tricks", () => {
    const before = templeCamp({ objectives: [winSun("o1", "p0"), open], hands, completedTricks: plated, currentTrick: nextTrick(2) });
    expect(abilityStatus(before, "p1", "temple", catalog)).toMatchObject({ usable: false, reason: "Win the Sun to earn it" });
    expect(toExpeditionPlayerView(before, "p1", catalog).yourAbilities).toContainEqual({ sourceKey: "temple", usableNow: false, reason: "Win the Sun to earn it", steps: [] });

    const after = templeCamp({ objectives: [winSun("o1", "p0"), open], hands, completedTricks: [...plated, led(2, card("s", SUN))], currentTrick: nextTrick(3) });
    expect(abilityStatus(after, "p1", "temple", catalog)).toMatchObject({ usable: true, steps: [{ kind: "objective", choices: ["objective:o2"] }], remaining: { kind: "crew", left: 1, earned: 1 } });

    const used = applyRunAction(after, "p1", { type: "use-ability", sourceKey: "temple", targets: ["objective:o2"] }, catalog);
    if (!used.ok) throw new Error(used.error);
    // The last open objective dropped and every plate pressed: the camp clears.
    expect(used.state.history).toEqual([{ camp: 2, attempt: 1, location: "jungle", weather: "fair", status: "cleared", suppliesSpent: 0, coins: PAYOUT.base + PAYOUT.perUnplayedTrick * PAYOUT.unplayedCap }]);
  });

  it("shows every seat the crew's token in its usage: not earned, then 1 left, then used", () => {
    const usage = (run: RunState, seatId: string) => toExpeditionPlayerView(run, "p1", catalog).seats.find((s) => s.seatId === seatId)!.usage;
    const before = templeCamp({ objectives: [winSun("o1", "p0"), open], hands, completedTricks: plated, currentTrick: nextTrick(2) });
    expect(usage(before, "p2")).toEqual([{ sourceKey: "temple", remaining: { kind: "crew", left: 0, earned: 0 } }]);
    const won = templeCamp({ objectives: [winSun("o1", "p0"), open, { ...open, id: "o3" }], hands, completedTricks: [...plated, led(2, card("s", SUN))], currentTrick: nextTrick(3) });
    expect(usage(won, "p0")).toEqual([{ sourceKey: "temple", remaining: { kind: "crew", left: 1, earned: 1 } }]);
    const used = applyRunAction(won, "p2", { type: "use-ability", sourceKey: "temple", targets: ["objective:o3"] }, catalog);
    if (!used.ok) throw new Error(used.error);
    expect(usage(used.state, "p1")).toEqual([{ sourceKey: "temple", remaining: { kind: "crew", left: 0, earned: 1 } }]);
  });

  it("is one token for the whole crew", () => {
    const third: Objective = { id: "o3", kind: "win-card", target: std("spades", 13), ownerSeatId: "p1" };
    const run = templeCamp({ objectives: [winSun("o1", "p0"), open, third], hands, completedTricks: [...plated, led(2, card("s", SUN))], currentTrick: nextTrick(3) });
    const used = applyRunAction(run, "p2", { type: "use-ability", sourceKey: "temple", targets: ["objective:o3"] }, catalog);
    if (!used.ok) throw new Error(used.error);
    expect(abilityStatus(used.state, "p0", "temple", catalog)).toMatchObject({ usable: false, reason: "The crew has used it", remaining: { kind: "crew", left: 0, earned: 1 } });
    expect(applyRunAction(used.state, "p1", { type: "use-ability", sourceKey: "temple", targets: ["objective:o2"] }, catalog)).toEqual({ ok: false, error: "ability_spent" });
  });

  it("is refused in the rescue window and still works between tricks", () => {
    const lost = (id: string, rank: number): Objective => ({ id, kind: "win-card", target: std("clubs", rank), ownerSeatId: "p2" });
    // p0 won the clubs 2 that p2 needed: one failed objective, the Sun already won, so the camp waits in rescue.
    const rescue = templeCamp({ objectives: [winSun("o1", "p0"), lost("o2", 2)], completedTricks: [...plated, led(2, card("s", SUN))], currentTrick: nextTrick(3) });
    expect(abilityStatus(rescue, "p1", "temple", catalog)).toMatchObject({ usable: false });
    expect(applyRunAction(rescue, "p1", { type: "use-ability", sourceKey: "temple", targets: ["objective:o2"] }, catalog).ok).toBe(false);
    // The Skip does not hold the rescue wait: nobody is pending on it.
    expect(gatedPendingSeatIds(rescue, catalog)).toEqual([]);

    // Between tricks, with an open objective still undecided, the same token drops it.
    const between = templeCamp({ objectives: [winSun("o1", "p0"), open], hands, completedTricks: [...plated, led(2, card("s", SUN))], currentTrick: nextTrick(3) });
    expect(abilityStatus(between, "p1", "temple", catalog)).toMatchObject({ usable: true });
  });
});

describe("temple helpers", () => {
  const helpers = (length: RunLength, camp: number) => {
    const run = setupRun({ seatIds: SEATS, seed: "helpers", catalog: CATALOG, length, camp });
    return campStack(run, CATALOG).filter((layer) => layer.strength === "half").map((layer) => layer.def.id);
  };

  it("returns no boss at a Short temple, the animal at a Standard one, and the animal then the disaster at a Long one", () => {
    expect(helpers("short", 4)).toEqual([]);
    expect(helpers("standard", 6)).toEqual(["tiger"]);
    expect(helpers("long", 8)).toEqual(["tiger", "tornado"]);
    expect(helpers("long", 7)).toEqual([]);
  });
});

describe("the temple's play warning", () => {
  const PATH_SPADES_CLUBS = "Playing the Sun now fails the Temple: lead spades, then clubs first.";
  const hands = (p0: ExpeditionCard[], p1: ExpeditionCard[] = [card("p1c", std("hearts", 5))]) => [
    { seatId: "p0", cards: p0 },
    { seatId: "p1", cards: p1 },
    { seatId: "p2", cards: [card("p2c", std("hearts", 6))] },
  ];
  const warn = (run: RunAt<"camp">, seatId: string, cardId: string) => rulesFor(run, catalog).playWarning(run.stage.attempt.camp, seatId, cardId);
  const plated = [led(0, card("a", std("spades", 4))), led(1, card("b", std("clubs", 4)))];

  it("warns on the Sun while its plate is not the next one, naming the plates left", () => {
    const run = templeCamp({ hands: hands([card("sun", SUN), card("h9", std("hearts", 9))]) });
    expect(warn(run, "p0", "sun")).toBe(PATH_SPADES_CLUBS);
    const one = templeCamp({ hands: hands([card("sun", SUN)]), completedTricks: [plated[0]!], currentTrick: nextTrick(1) });
    expect(warn(one, "p0", "sun")).toBe("Playing the Sun now fails the Temple: lead clubs first.");
    expect(PATH_SPADES_CLUBS.length).toBeLessThan(80);
  });

  it("warns on a follow too, and says nothing for the Sun led on its own plate or any other card", () => {
    const ready = templeCamp({ hands: hands([card("sun", SUN), card("h9", std("hearts", 9))]), completedTricks: plated, currentTrick: nextTrick(2) });
    expect(warn(ready, "p0", "sun")).toBeNull();
    expect(warn(ready, "p0", "h9")).toBeNull();
    const follow = templeCamp({
      hands: hands([card("sun", SUN)]),
      completedTricks: plated,
      currentTrick: { index: 2, leaderSeatId: "p1", plays: [{ seatId: "p1", card: card("l", std("hearts", 2)) }] },
    });
    expect(warn(follow, "p0", "sun")).toBe("Playing the Sun now fails the Temple: it must lead.");
    expect(warn(templeCamp({ hands: hands([card("h9", std("hearts", 9))]) }), "p0", "h9")).toBeNull();
  });

  it("is a view field of the viewer's own hand only: another seat's Sun never carries one to the viewer", () => {
    const run = templeCamp({ hands: hands([card("hidden-sun", SUN)], [card("p1c", std("hearts", 5))]) });
    const own = toExpeditionPlayerView(run, "p0", catalog);
    const other = toExpeditionPlayerView(run, "p1", catalog);
    if (own.stage.tag !== "camp" || other.stage.tag !== "camp") throw new Error("expected a camp view");
    expect(own.stage.attempt.camp.yourHand.map((c) => [c.id, c.warning])).toEqual([["hidden-sun", PATH_SPADES_CLUBS]]);
    expect(other.stage.attempt.camp.yourHand.map((c) => [c.id, c.warning])).toEqual([["p1c", null]]);
    expect(JSON.stringify(other)).not.toContain("Playing the Sun");
    expect(JSON.stringify(other)).not.toContain("hidden-sun");
  });

  it("a mod's warning wins by layer order: the first non-null answer stays", () => {
    const run = templeCamp({ hands: hands([card("sun", SUN)]) });
    const composed = composeRules([{ playWarning: (prev) => (camp, seatId, cardId) => prev(camp, seatId, cardId) ?? "first" }, { playWarning: (prev) => (camp, seatId, cardId) => prev(camp, seatId, cardId) ?? "second" }]);
    expect(composed.playWarning(run.stage.attempt.camp, "p0", "sun")).toBe("first");
    expect(baseRunHooks.playWarning(run.stage.attempt.camp, "p0", "sun")).toBeNull();
  });
});
