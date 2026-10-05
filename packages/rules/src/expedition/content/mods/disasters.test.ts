import { describe, expect, it } from "vitest";
import { toExpeditionPlayerView } from "../../adapter/view";
import { checkCampOutcome, currentActorSeatId } from "../../camp";
import { baseDeckFor } from "../../deck";
import { attemptOf } from "../../run/attempt";
import { CATALOG } from "../../run/catalog";
import { rulesFor } from "../../run/compose";
import { campIndex } from "../../run/plan";
import { advanceTo, setupRun } from "../../run/run-test-support";
import { applyRunAction } from "../../run/stages/registry";
import type { Catalog, RunAt, RunState } from "../../run/types";
import type { CampState, CardIdentity, CompletedTrick, ExpeditionCard, Objective, Suit, TrickPlay } from "../../state";
import type { BossDef } from "./mod-def";
import { MODS } from "./registry";

const SEATS = ["p0", "p1", "p2"];
const std = (suit: Suit, rank: number): CardIdentity => ({ kind: "standard", suit, rank } as CardIdentity);
const card = (id: string, identity: CardIdentity): ExpeditionCard => ({ id, identity });
const SUN: CardIdentity = { kind: "joker", joker: "sun" };
/** Owned and pending until the final trick: nobody holds the two of clubs. */
const WAITING: Objective = { id: "waiting", kind: "win-card", target: std("clubs", 2), ownerSeatId: "p0" };

/** A catalogue where `id` plays its half body. */
function halfCatalog(id: keyof typeof MODS): Catalog {
  const def = MODS[id] as BossDef;
  return { ...CATALOG, mods: { ...CATALOG.mods, [id]: { ...def, full: def.half } } };
}

/** Camp 2's loadout in the Jungle in fair weather, with `boss` planned there. */
function loadoutWith(boss: string, opts: { seed?: string; items?: Readonly<Record<string, readonly string[]>> } = {}): RunAt<"loadout"> {
  const run = setupRun({ seatIds: SEATS, seed: opts.seed ?? "disasters", catalog: CATALOG, camp: 2, items: opts.items }) as RunAt<"loadout">;
  return {
    ...run,
    plan: { ...run.plan!, bosses: [{ at: campIndex(2), tier: "disaster", modId: boss }] },
    stage: { ...run.stage, camp: { ...run.stage.camp, location: "jungle", weather: "fair" } },
  };
}

function filler(i: number): CompletedTrick {
  return { index: i, leaderSeatId: "p0", plays: SEATS.map((seatId, s) => ({ seatId, card: card(`f${i}${s}`, std("clubs", 3 + s)), countsAs: null, burned: false })), winnerSeatId: "p0" };
}

/** A hand-built camp under `boss`: `done` filler tricks behind it, then trick
 * `done` in play with `plays` on the table, led by `leader`. */
function table(
  boss: string,
  parts: { hands: Readonly<Record<string, readonly ExpeditionCard[]>>; done?: number; total?: number; plays?: readonly TrickPlay[]; leader?: string; objectives?: readonly Objective[] },
  opts: { items?: Readonly<Record<string, readonly string[]>> } = {},
): RunAt<"camp"> {
  const loadout = loadoutWith(boss, opts);
  const done = parts.done ?? 0;
  const camp: CampState = {
    seatIds: SEATS,
    playerCount: 3,
    removedCards: [],
    totalTricks: parts.total ?? 6,
    hands: SEATS.map((seatId) => ({ seatId, cards: [...(parts.hands[seatId] ?? [])] })),
    expeditionLeaderSeatId: "p0",
    objectives: [...(parts.objectives ?? [WAITING])],
    objectiveDeck: [],
    completedTricks: Array.from({ length: done }, (_, i) => filler(i)),
    discards: [], voidedTricks: [],
    currentTrick: { index: done, leaderSeatId: parts.leader ?? "p0", plays: [...(parts.plays ?? [])] },
  };
  return { ...loadout, stage: { tag: "camp", camp: loadout.stage.camp, attempt: { attemptNumber: 1, effects: [], reveals: [], log: [], camp } } };
}

function act(run: RunState, seatId: string, cardId: string, catalog: Catalog = CATALOG): RunAt<"camp"> {
  const result = applyRunAction(run, seatId, { type: "play-card", cardId }, catalog);
  if (!result.ok) throw new Error(`${seatId} could not play ${cardId}: ${result.error}`);
  if (result.state.stage.tag !== "camp") throw new Error(`the camp settled: ${result.state.stage.tag}`);
  return result.state as RunAt<"camp">;
}

/** Each seat in turn plays its first legal card, once round the table. */
function playTrick(run: RunAt<"camp">, catalog: Catalog = CATALOG): RunAt<"camp"> {
  let next = run;
  for (let i = 0; i < SEATS.length; i++) {
    const rules = rulesFor(next, catalog);
    const camp = next.stage.attempt.camp;
    const seatId = currentActorSeatId(camp, rules)!;
    next = act(next, seatId, rules.legalPlays(camp, seatId)[0]!.id, catalog);
  }
  return next;
}

const campOf = (run: RunState) => attemptOf(run)!.camp;
const handOf = (run: RunState, seatId: string) => campOf(run).hands.find((h) => h.seatId === seatId)!.cards.map((c) => c.id);
const lastTrick = (run: RunState) => campOf(run).completedTricks.at(-1)!;

function statusOf(run: RunState, modId: string, catalog: Catalog = CATALOG) {
  const view = toExpeditionPlayerView(run, "p0", catalog);
  if (view.stage.tag !== "camp") throw new Error(`expected a camp view, got ${view.stage.tag}`);
  return view.stage.mods.find((m) => m.id === modId)!.status;
}

/** One suit per seat (hearts, spades, diamonds), so the leader's hearts win every trick. */
function suitedHands(size: number): Record<string, ExpeditionCard[]> {
  return Object.fromEntries(SEATS.map((seatId, s) => [seatId, Array.from({ length: size }, (_, i) => card(`${seatId}h${i}`, std(["hearts", "spades", "diamonds"][s] as Suit, 4 + i)))]));
}

describe("Tornado", () => {
  it("blows three cards from every hand to the player on the right after every third trick, showing each sender what it sent", () => {
    const hands = suitedHands(5);
    const before = table("tornado", { hands, done: 2 });
    expect(statusOf(before, "tornado")).toEqual([{ kind: "countdown", tricks: 1 }]);
    const after = playTrick(before);

    for (const seatId of SEATS) expect(handOf(after, seatId)).toHaveLength(4);
    const sent = (seatId: string) => attemptOf(after)!.reveals.filter((r) => r.source === "tornado" && r.fromSeatId === seatId);
    for (const [from, to] of [["p0", "p2"], ["p1", "p0"], ["p2", "p1"]] as const) {
      expect(sent(from)).toHaveLength(3);
      for (const reveal of sent(from)) {
        expect(reveal.audience).toEqual([from]);
        expect(handOf(after, to)).toContain(reveal.cardId);
      }
    }
    expect(attemptOf(after)!.log.filter((l) => l.event === "gust")).toHaveLength(1);
    expect(statusOf(after, "tornado")).toEqual([]);
  });

  it("stays calm after the other tricks", () => {
    const after = playTrick(table("tornado", { hands: suitedHands(5), done: 1 }));
    expect(attemptOf(after)!.reveals).toEqual([]);
    expect(statusOf(after, "tornado")).toEqual([{ kind: "countdown", tricks: 1 }]);
  });

  it("at half strength blows every sixth trick", () => {
    const half = halfCatalog("tornado");
    expect(statusOf(table("tornado", { hands: suitedHands(5), done: 2, total: 9 }), "tornado", half)).toEqual([{ kind: "countdown", tricks: 4 }]);
    const calm = playTrick(table("tornado", { hands: suitedHands(5), done: 2, total: 9 }), half);
    expect(attemptOf(calm)!.reveals).toEqual([]);
    const gust = playTrick(table("tornado", { hands: suitedHands(5), done: 5, total: 9 }), half);
    expect(attemptOf(gust)!.reveals).toHaveLength(9);
  });
});

describe("Earthquake", () => {
  const open = (id: string, owner: string, rank: number): Objective => ({ id, kind: "win-card", target: std("clubs", rank), ownerSeatId: owner });
  // The clubs are held by nobody, so these stay open until the last trick.
  const objectives = [open("a", "p0", 6), open("b", "p0", 7), open("c", "p1", 8), open("d", "p2", 9), open("e", "p2", 10)];
  const openCounts = (run: RunState) =>
    Object.fromEntries(SEATS.map((seatId) => [seatId, campOf(run).objectives.filter((o) => o.ownerSeatId === seatId && rulesFor(run, CATALOG).objectiveStatus(campOf(run), o) === "pending").length]));

  it("deals the open objectives out again halfway through, each player keeping as many as they had", () => {
    const seeds = ["quake-1", "quake-2", "quake-3", "quake-4"];
    const owners = seeds.map((seed) => {
      const before = { ...table("earthquake", { hands: suitedHands(4), done: 2, objectives }), seed };
      expect(statusOf(before, "earthquake")).toEqual([{ kind: "countdown", tricks: 1 }]);
      const after = playTrick(before);
      expect(openCounts(after)).toEqual({ p0: 2, p1: 1, p2: 2 });
      expect(attemptOf(after)!.log.map((l) => l.event)).toEqual(["quake"]);
      expect(statusOf(after, "earthquake")).toEqual([]);
      return campOf(after).objectives.map((o) => o.ownerSeatId).join();
    });
    expect(new Set(owners).size).toBeGreaterThan(1);
  });

  it("leaves a done objective with its owner", () => {
    const won: Objective = { id: "won", kind: "win-card", target: std("clubs", 3), ownerSeatId: "p0" };
    const after = playTrick(table("earthquake", { hands: suitedHands(4), done: 2, objectives: [...objectives, won] }));
    expect(campOf(after).objectives.find((o) => o.id === "won")!.ownerSeatId).toBe("p0");
  });

  it("at half strength swaps the open objectives of two players", () => {
    const after = playTrick(table("earthquake", { hands: suitedHands(4), done: 2, objectives }), halfCatalog("earthquake"));
    const counts = Object.values(openCounts(after)).sort();
    expect(counts).toEqual([1, 2, 2]);
    expect(campOf(after).objectives.map((o) => o.ownerSeatId)).not.toEqual(objectives.map((o) => o.ownerSeatId));
  });
});

describe("Wildfire", () => {
  it("burns the lowest card of every trick, the earliest of a tie, and a burned card counts for nothing", () => {
    const run = table("wildfire", {
      hands: { p0: [card("x0", std("diamonds", 9))], p1: [card("x1", std("diamonds", 10))], p2: [card("spade4", std("spades", 4)), card("x2", std("diamonds", 11))] },
      plays: [{ seatId: "p0", card: card("heart9", std("hearts", 9)) }, { seatId: "p1", card: card("heart4", std("hearts", 4)) }],
    });
    const after = act(run, "p2", "spade4");
    expect(lastTrick(after).plays.map((p) => p.burned)).toEqual([false, true, false]);
    expect(lastTrick(after).winnerSeatId).toBe("p0");
    const lost: Objective = { id: "lost", kind: "win-card", target: std("hearts", 4), ownerSeatId: "p0" };
    expect(rulesFor(after, CATALOG).objectiveStatus(campOf(after), lost)).toBe("failed");
  });

  it("never burns the Sun or Moon, and at half strength burns only on odd tricks", () => {
    const hands = { p0: [card("x0", std("diamonds", 9))], p1: [card("x1", std("diamonds", 10))], p2: [card("heart5", std("hearts", 5)), card("x2", std("diamonds", 11))] };
    const plays: TrickPlay[] = [{ seatId: "p0", card: card("sun", SUN) }, { seatId: "p1", card: card("heart12", std("hearts", 12)) }];
    const full = act(table("wildfire", { hands, plays }), "p2", "heart5");
    expect(lastTrick(full).plays.map((p) => p.burned)).toEqual([false, false, true]);

    const half = halfCatalog("wildfire");
    expect(statusOf(table("wildfire", { hands, plays }), "wildfire", half)).toEqual([{ kind: "alternating", activeNow: false }]);
    expect(lastTrick(act(table("wildfire", { hands, plays }), "p2", "heart5", half)).plays.map((p) => p.burned)).toEqual([false, false, false]);
    expect(lastTrick(act(table("wildfire", { hands, plays, done: 1 }), "p2", "heart5", half)).plays.map((p) => p.burned)).toEqual([false, false, true]);
  });
});

describe("Meteor", () => {
  it("vaporizes the card that would win, the Sun included, so the next best wins", () => {
    const run = table("meteor", {
      hands: { p0: [card("x0", std("diamonds", 9))], p1: [card("x1", std("diamonds", 10))], p2: [card("heart5", std("hearts", 5)), card("x2", std("diamonds", 11))] },
      plays: [{ seatId: "p0", card: card("heart13", std("hearts", 13)) }, { seatId: "p1", card: card("sun", SUN) }],
    });
    const after = act(run, "p2", "heart5");
    expect(lastTrick(after).plays.map((p) => p.burned)).toEqual([false, true, false]);
    expect(lastTrick(after).winnerSeatId).toBe("p0");
  });

  it("never deals an ace objective", () => {
    const deck = rulesFor(table("meteor", { hands: {} }), CATALOG).objectiveDeckFor(baseDeckFor(3));
    expect(deck.some((i) => i.rank === 14)).toBe(false);
    expect(deck.some((i) => i.rank === 13)).toBe(true);
    for (const seed of ["m1", "m2", "m3", "m4", "m5", "m6"]) {
      const camp = campOf(advanceTo(loadoutWith("meteor", { seed }), "objective-pick", CATALOG));
      const targets = camp.objectives.flatMap((o) => ("target" in o ? [o.target] : []));
      expect(targets.some((t) => t.kind === "standard" && t.rank === 14)).toBe(false);
    }
    expect(rulesFor(table("meteor", { hands: {} }), halfCatalog("meteor")).objectiveDeckFor(baseDeckFor(3)).some((i) => i.rank === 14)).toBe(false);
  });
});

describe("Blood Moon", () => {
  const hands = { p0: [card("x0", std("hearts", 2))], p1: [card("spade9", std("spades", 9)), card("club3", std("clubs", 3))], p2: [card("diamond9", std("diamonds", 9)), card("x2", std("hearts", 6))] };
  const lead: TrickPlay[] = [{ seatId: "p0", card: card("diamond7", std("diamonds", 7)) }];

  it("rises on every other trick: spades follow as diamonds, clubs as hearts, and a tie goes to the first played", () => {
    const risen = table("blood-moon", { hands, plays: lead, done: 1 });
    expect(statusOf(risen, "blood-moon")).toEqual([{ kind: "alternating", activeNow: true }]);
    expect(rulesFor(risen, CATALOG).legalPlays(campOf(risen), "p1").map((c) => c.id)).toEqual(["spade9"]);
    const view = toExpeditionPlayerView(risen, "p1", CATALOG);
    const yourHand = view.stage.tag === "camp" ? view.stage.attempt.camp.yourHand : [];
    expect(yourHand.map((c) => c.countsAs)).toEqual([std("diamonds", 9), std("hearts", 3)]);

    const after = act(act(risen, "p1", "spade9"), "p2", "diamond9");
    expect(lastTrick(after).plays.map((p) => p.countsAs)).toEqual([null, std("diamonds", 9), null]);
    expect(lastTrick(after).winnerSeatId).toBe("p1");
  });

  it("sets on the tricks between", () => {
    const set = table("blood-moon", { hands, plays: lead });
    expect(statusOf(set, "blood-moon")).toEqual([{ kind: "alternating", activeNow: false }]);
    expect(rulesFor(set, CATALOG).legalPlays(campOf(set), "p1").map((c) => c.id)).toEqual(["spade9", "club3"]);
  });

  it("at half strength rises on tricks 3, 7, 11", () => {
    const half = halfCatalog("blood-moon");
    expect([1, 2, 3, 4].map((done) => statusOf(table("blood-moon", { hands, plays: lead, done }), "blood-moon", half))).toEqual([
      [{ kind: "alternating", activeNow: false }],
      [{ kind: "alternating", activeNow: false }],
      [{ kind: "alternating", activeNow: true }],
      [{ kind: "alternating", activeNow: false }],
    ]);
  });
});

describe("Locusts", () => {
  const items = { p0: ["bait"], p2: ["whetstone"] };

  it("eat one equipped item after each trick, round the table from the expedition leader", () => {
    const start = table("locusts", { hands: suitedHands(4) }, { items });
    expect(statusOf(start, "locusts")).toEqual([{ kind: "swarm", seatId: "p0" }]);
    const first = playTrick(start);
    expect(first.seats.find((s) => s.seatId === "p0")!.items).toEqual([]);
    expect(attemptOf(first)!.log.map((l) => [l.event, l.subjectSeatIds])).toEqual([["ate-item:bait", ["p0"]]]);
    expect(statusOf(first, "locusts")).toEqual([{ kind: "swarm", seatId: "p2" }]);
    const second = playTrick(first);
    expect(second.seats.flatMap((s) => s.items)).toEqual([]);
    expect(statusOf(second, "locusts")).toEqual([{ kind: "swarm", seatId: null }]);
  });

  it("under Heavy fog name no seat as the next meal, since that would say who still carries items", () => {
    const start = table("locusts", { hands: suitedHands(4) }, { items });
    const fogged = { ...start, stage: { ...start.stage, camp: { ...start.stage.camp, weather: "fog" } } };
    expect(statusOf(fogged, "locusts")).toEqual([]);
    expect(statusOf(fogged, "locusts", halfCatalog("locusts"))).toEqual([{ kind: "alternating", activeNow: false }]);
  });

  it("with no items left eat a random card from every hand, shortening the camp by one trick", () => {
    const before = table("locusts", { hands: suitedHands(4) });
    const after = playTrick(before);
    const camp = campOf(after);
    expect(camp.totalTricks).toBe(5);
    expect(camp.discards).toHaveLength(3);
    expect(camp.discards.map((d) => d.afterTrick)).toEqual([1, 1, 1]);
    for (const seatId of SEATS) expect(handOf(after, seatId)).toHaveLength(2);
    expect(attemptOf(after)!.log.map((l) => l.event)).toEqual(["ate-cards"]);
  });

  it("at half strength eat only items, and only after odd tricks", () => {
    const half = halfCatalog("locusts");
    const first = playTrick(table("locusts", { hands: suitedHands(4) }, { items }), half);
    expect(first.seats.flatMap((s) => s.items.map((i) => i.itemId))).toEqual(["bait", "whetstone"]);
    expect(statusOf(first, "locusts", half)).toEqual([{ kind: "alternating", activeNow: true }, { kind: "swarm", seatId: "p0" }]);
    const second = playTrick(first, half);
    expect(second.seats.flatMap((s) => s.items.map((i) => i.itemId))).toEqual(["whetstone"]);

    const bare = playTrick(table("locusts", { hands: suitedHands(4), done: 1 }), half);
    expect(campOf(bare).discards).toEqual([]);
    expect(campOf(bare).totalTricks).toBe(6);
  });
});

describe("Monsoon", () => {
  it("floods the camp when the river rises with an objective still open", () => {
    const rising = table("monsoon", { hands: suitedHands(2), done: 4 });
    expect(statusOf(rising, "monsoon")).toEqual([{ kind: "meter", left: 1, of: 5 }]);
    expect(checkCampOutcome(campOf(rising), rulesFor(rising, CATALOG)).status).toBe("in_progress");

    const flooded = { ...rising, stage: { ...rising.stage, attempt: { ...rising.stage.attempt, camp: { ...campOf(rising), completedTricks: [0, 1, 2, 3, 4].map(filler), currentTrick: { index: 5, leaderSeatId: "p0", plays: [] } } } } };
    expect(checkCampOutcome(campOf(flooded), rulesFor(flooded, CATALOG))).toEqual({ status: "failed", failedObjectiveIds: ["waiting"], failedGoalIds: [] });
    expect(checkCampOutcome(campOf(flooded), rulesFor(flooded, halfCatalog("monsoon"))).status).toBe("in_progress");
  });

  it("ends the camp at the river, so a trick-count objective met by then clears it", () => {
    const objectives: Objective[] = [
      { id: "none", kind: "no-tricks", ownerSeatId: "p1" },
      { id: "five", kind: "exactly-n", n: 5, ownerSeatId: "p0" },
    ];
    const rising = table("monsoon", { hands: suitedHands(2), done: 4, objectives });
    let run: RunState = rising;
    for (const seatId of SEATS) {
      const result = applyRunAction(run, seatId, { type: "play-card", cardId: handOf(run, seatId)[0]! }, CATALOG);
      if (!result.ok) throw new Error(result.error);
      run = result.state;
    }
    expect(run.stage.tag).toBe("draft");
    expect(run.history.at(-1)).toEqual({ camp: 2, attempt: 1, location: "jungle", weather: "fair", status: "cleared", suppliesSpent: 0, coins: 6 });
  });
});
