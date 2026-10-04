import { describe, expect, it } from "vitest";
import type { ExpeditionCampView, ExpeditionView } from "../../adapter/view-types";
import { toExpeditionPlayerView } from "../../adapter/view";
import { campGoals, currentActorSeatId } from "../../camp";
import { attemptOf } from "../../run/attempt";
import { CATALOG } from "../../run/catalog";
import { rulesFor } from "../../run/compose";
import { advanceTo, setupRun } from "../../run/run-test-support";
import { campStack } from "../../run/stack";
import { STAGES } from "../../run/stages/registry";
import { choicesFor } from "../../run/targets";
import type { RunAt, RunState } from "../../run/types";
import type { CampState, Objective } from "../../state";

const SEATS = ["p0", "p1", "p2"];

/** Camp 2's loadout at `location` in `weather`. */
function loadoutIn(location: string, weather: string, seatIds: readonly string[] = SEATS, seed = "locations"): RunAt<"loadout"> {
  const run = setupRun({ seatIds: [...seatIds], seed, catalog: CATALOG, camp: 2 }) as RunAt<"loadout">;
  return { ...run, stage: { ...run.stage, camp: { ...run.stage.camp, location, weather } } };
}

function campOf(view: ExpeditionView): ExpeditionCampView {
  if (view.stage.tag !== "camp") throw new Error(`expected a camp view, got ${view.stage.tag}`);
  return view.stage.attempt.camp;
}

/** The current actor plays their first legal card, through the camp
 * stage's own handler so a decided camp is not settled away. */
function playFirst(run: RunState): { run: RunState; seatId: string; cardId: string } {
  const camp = attemptOf(run)!.camp;
  const rules = rulesFor(run, CATALOG);
  const seatId = currentActorSeatId(camp, rules)!;
  const card = rules.legalPlays(camp, seatId)[0]!;
  const result = STAGES.camp.on["play-card"]!(run as RunAt<"camp">, seatId, { type: "play-card", cardId: card.id }, CATALOG);
  if (!result.ok) throw new Error(result.error);
  return { run: result.state, seatId, cardId: card.id };
}

function followsAs(run: RunState, cardId: string): string {
  const card = attemptOf(run)!.camp.hands.flatMap((h) => h.cards).find((c) => c.id === cardId)!;
  return card.identity.kind === "joker" ? "joker" : card.identity.suit;
}

describe("Cave", () => {
  it("plays face down to everyone but their player, showing only the suit, and flips them when the trick completes", () => {
    const start = advanceTo(loadoutIn("cave", "fair"), "between-tricks", CATALOG);
    const first = playFirst(start);
    const suit = followsAs(start, first.cardId);
    const others = SEATS.filter((s) => s !== first.seatId);

    for (const seatId of others) expect(campOf(toExpeditionPlayerView(first.run, seatId, CATALOG)).currentTrick.plays).toEqual([{ seatId: first.seatId, hidden: true, suit }]);
    expect(campOf(toExpeditionPlayerView(first.run, first.seatId, CATALOG)).currentTrick.plays[0]).toMatchObject({ hidden: false, card: { id: first.cardId } });

    const done = playFirst(playFirst(first.run).run).run;
    const trick = campOf(toExpeditionPlayerView(done, others[0]!, CATALOG)).completedTricks[0]!;
    expect(trick.plays[0]!.card.id).toBe(first.cardId);
  });

  it("keeps a face-down play out of a board card target's choices", () => {
    const first = playFirst(advanceTo(loadoutIn("cave", "fair"), "between-tricks", CATALOG));
    const rules = rulesFor(first.run, CATALOG);
    const camp = attemptOf(first.run)!.camp;
    const viewer = SEATS.find((s) => s !== first.seatId)!;
    const scope = (seatId: string) => ({ run: first.run, seatId, camp, rules });
    expect(choicesFor(scope(viewer), { kind: "card", where: "board" })).toEqual([]);
    expect(choicesFor(scope(first.seatId), { kind: "card", where: "board" }).map((c) => c.id)).toEqual([`card:${first.cardId}`]);
  });
});

describe("Desert", () => {
  it("hides one objective's kind and target from everyone until the first trick completes", () => {
    const dealt = advanceTo(loadoutIn("desert", "fair"), "objective-pick", CATALOG);
    const hiddenIn = (run: RunState, seatId: string) => campOf(toExpeditionPlayerView(run, seatId, CATALOG)).objectives.filter((o) => o.kind === "hidden").map((o) => o.id);
    const mirage = hiddenIn(dealt, "p0");
    expect(mirage).toHaveLength(1);
    for (const seatId of SEATS) expect(hiddenIn(dealt, seatId)).toEqual(mirage);

    let run = advanceTo(dealt, "between-tricks", CATALOG);
    expect(hiddenIn(run, "p1")).toEqual(mirage);
    for (let i = 0; i < SEATS.length; i++) run = playFirst(run).run;
    for (const seatId of SEATS) expect(hiddenIn(run, seatId)).toEqual([]);
  });
});

describe("Magma pool", () => {
  const removed = (players: number) => {
    const run = advanceTo(loadoutIn("magma", "fair", SEATS.concat(["p3", "p4"]).slice(0, players)), "objective-pick", CATALOG);
    const camp = attemptOf(run)!.camp;
    return { camp, labels: camp.removedCards.map((c) => (c.kind === "joker" ? c.joker : `${c.rank}${c.suit[0]}`)) };
  };
  const LOW = ["2s", "3s", "2h", "3h", "2d", "3d", "2c", "3c"];

  it("burns every 2 and 3, then 4s until the deck deals evenly: 45, 44 and 45 cards", () => {
    const three = removed(3);
    expect([...three.labels].sort()).toEqual([...LOW, "4c"].sort());
    expect(three.camp.totalTricks).toBe(15);
    const four = removed(4);
    expect([...four.labels].sort()).toEqual([...LOW, "4c", "4d"].sort());
    expect(four.camp.totalTricks).toBe(11);
    const five = removed(5);
    expect([...five.labels].sort()).toEqual([...LOW, "4c"].sort());
    expect(five.camp.totalTricks).toBe(9);
  });

  it("deals objectives of rank 5 and up", () => {
    for (const seed of ["heat-a", "heat-b", "heat-c", "heat-d"]) {
      const camp = attemptOf(advanceTo(loadoutIn("magma", "fair", SEATS, seed), "objective-pick", CATALOG))!.camp;
      const ranks = [...camp.objectives, ...camp.objectiveDeck.map((target) => ({ kind: "win-card", target }) as const)].flatMap((o) =>
        "target" in o && o.target.kind === "standard" ? [o.target.rank] : [],
      );
      expect(ranks.length).toBeGreaterThan(20);
      expect(Math.min(...ranks)).toBe(5);
    }
  });

  it("rain or a storm over the pool raises steam, which cancels the heat", () => {
    for (const weather of ["rain", "thunderstorm"]) {
      const run = loadoutIn("magma", weather);
      expect(campStack(run, CATALOG).map((layer) => layer.def.id)).toEqual([weather, "steam"]);
      expect(attemptOf(advanceTo(run, "objective-pick", CATALOG))!.camp.removedCards).toEqual([]);
    }
  });
});

describe("Flooding", () => {
  const run = loadoutIn("cave", "rain");
  const rules = rulesFor(run, CATALOG);
  const pending: Objective = { id: "open", kind: "win-card", target: { kind: "standard", suit: "hearts", rank: 9 }, ownerSeatId: "p0" };
  /** An 18-trick camp with `played` tricks behind it. */
  const after = (played: number, objectives: readonly Objective[]): CampState => ({
    seatIds: SEATS,
    playerCount: 3,
    removedCards: [],
    totalTricks: 18,
    hands: SEATS.map((seatId) => ({ seatId, cards: [] })),
    expeditionLeaderSeatId: "p0",
    objectives,
    objectiveDeck: [],
    completedTricks: Array.from({ length: played }, (_, index) => ({ index, leaderSeatId: "p0", plays: [], winnerSeatId: "p0" })),
    currentTrick: { index: played, leaderSeatId: "p0", plays: [] },
    discards: [],
  });

  it("rain in the cave adds the flood beside the dark and the rain", () => {
    expect(campStack(run, CATALOG).map((layer) => layer.def.id)).toEqual(["cave", "rain", "flooding"]);
  });

  it("fails the camp once 14 of 18 tricks are played with an objective still open", () => {
    expect(campGoals(after(13, [pending]), rules)).toEqual([{ id: "flooding", status: "done" }]);
    expect(campGoals(after(14, [pending]), rules)).toEqual([{ id: "flooding", status: "failed" }]);
    expect(campGoals(after(14, []), rules)).toEqual([{ id: "flooding", status: "done" }]);
  });

  it("shows the tricks left before the river floods", () => {
    const dealt = advanceTo(run, "between-tricks", CATALOG);
    const view = toExpeditionPlayerView(dealt, "p0", CATALOG);
    const mods = view.stage.tag === "camp" ? view.stage.mods : [];
    expect(mods.find((mod) => mod.id === "flooding")).toEqual({ id: "flooding", kind: "pairing", strength: "full", status: [{ kind: "meter", left: 14, of: 14 }] });
  });
});
