import { describe, expect, it } from "vitest";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "../../adapter/view-leak-check";
import { toExpeditionPlayerView } from "../../adapter/view";
import type { ExpeditionView } from "../../adapter/view-types";
import { checkCampOutcome } from "../../camp";
import { SUITS } from "../../deck";
import { attemptOf } from "../../run/attempt";
import { CATALOG } from "../../run/catalog";
import { rulesFor } from "../../run/compose";
import { campIndex, drawPlan } from "../../run/plan";
import { campSpecAt } from "../../run/route";
import { advanceTo, setupRun } from "../../run/run-test-support";
import { STAGES, applyRunAction } from "../../run/stages/registry";
import { backpackOf } from "../../run/usage";
import type { ActiveEffect, RunAt, RunState } from "../../run/types";
import type { CampState, CardIdentity, CompletedTrick, ExpeditionCard, Objective, Suit } from "../../state";

const SEATS = ["p0", "p1", "p2"];
const std = (suit: Suit, rank: number): CardIdentity => ({ kind: "standard", suit, rank } as CardIdentity);
const card = (id: string, identity: CardIdentity): ExpeditionCard => ({ id, identity });
const SUN: CardIdentity = { kind: "joker", joker: "sun" };

/** `run` with `boss` planned for camp 2, the camp setupRun's loadouts below open. */
function withBoss<R extends RunState>(run: R, boss: string | null): R {
  return { ...run, plan: { ...run.plan!, bosses: [{ at: campIndex(2), tier: "animal", modId: boss }] } };
}

/** Camp 2's loadout, in the Jungle in fair weather, under `boss`. */
function loadoutWith(boss: string | null, seed = "bosses"): RunAt<"loadout"> {
  const run = setupRun({ seatIds: SEATS, seed, catalog: CATALOG, camp: 2 }) as RunAt<"loadout">;
  return withBoss({ ...run, stage: { ...run.stage, camp: { ...run.stage.camp, location: "jungle", weather: "fair" } } }, boss);
}

/** A hand-built camp state under `boss`, with `effects` on the attempt. */
function campWith(boss: string | null, camp: CampState, effects: readonly ActiveEffect[] = []): RunAt<"camp"> {
  const loadout = loadoutWith(boss);
  return { ...loadout, stage: { tag: "camp", camp: loadout.stage.camp, attempt: { attemptNumber: 1, effects, reveals: [], log: [], camp } } };
}

function trick(index: number, winnerSeatId: string, cards: readonly ExpeditionCard[]): CompletedTrick {
  return {
    index,
    leaderSeatId: SEATS[0]!,
    plays: cards.map((c, i) => ({ seatId: SEATS[i]!, card: c, countsAs: null, burned: false })),
    winnerSeatId,
  };
}

function camp(parts: Partial<CampState>): CampState {
  return {
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
    ...parts,
  };
}

function statusOf(run: RunState, seatId: string, modId: string) {
  const view = toExpeditionPlayerView(run, seatId, CATALOG);
  if (view.stage.tag !== "camp") throw new Error(`expected a camp view, got ${view.stage.tag}`);
  return view.stage.mods.find((m) => m.id === modId)!.status;
}

const filler = (n: number) => [0, 1, 2].map((i) => card(`f${n}${i}`, std("clubs", 2 + i)));

describe("Tiger", () => {
  const hand = [card("a", std("spades", 9)), card("b", std("hearts", 4)), card("c", std("diamonds", 11)), card("d", SUN)];
  const tigerCamp = (boss: string | null, winners: readonly string[]) =>
    campWith(
      boss,
      camp({
        hands: [{ seatId: "p0", cards: hand }, { seatId: "p1", cards: [] }, { seatId: "p2", cards: [] }],
        completedTricks: winners.map((w, i) => trick(i, w, filler(i))),
        currentTrick: { index: winners.length, leaderSeatId: "p0", plays: [] },
      }),
    );

  it("forces a random lead on a player who won the last two tricks, and only then", () => {
    const pounced = tigerCamp("tiger", ["p0", "p0"]);
    const forced = rulesFor(pounced, CATALOG).legalPlays(pounced.stage.attempt.camp, "p0");
    expect(forced).toHaveLength(1);
    expect(hand).toContainEqual(forced[0]);
    expect(statusOf(pounced, "p1", "tiger")).toEqual([{ kind: "streak", seatId: "p0", count: 2 }]);

    const broken = tigerCamp("tiger", ["p0", "p1", "p0"]);
    expect(rulesFor(broken, CATALOG).legalPlays(broken.stage.attempt.camp, "p0")).toEqual(hand);
    const calm = tigerCamp(null, ["p0", "p0"]);
    expect(rulesFor(calm, CATALOG).legalPlays(calm.stage.attempt.camp, "p0")).toEqual(hand);

    const other = hand.find((c) => c.id !== forced[0]!.id)!;
    const refused = STAGES.camp.on["play-card"]!(pounced, "p0", { type: "play-card", cardId: other.id }, CATALOG);
    expect(refused.ok).toBe(false);
  });
});

describe("Rats", () => {
  it("leave every seat one item slot, and a seat carrying two items in sets out with one", () => {
    const run = setupRun({ seatIds: SEATS, seed: "rats", catalog: CATALOG, camp: 2, items: { p0: ["bait", "whetstone"] } });
    expect(run.seats[0]!.equipped).toEqual(["it0", "it1"]);
    const next = campSpecAt("rats", "standard", campIndex(3), CATALOG);
    const atRoute: RunState = {
      ...run,
      plan: { ...run.plan!, bosses: [{ at: campIndex(3), tier: "animal", modId: "rats" }] },
      stage: { tag: "route", from: campIndex(2), options: [{ id: "a", next, reroll: 0, swapBoss: null }], ballots: {} },
    };
    const loadout = SEATS.reduce<RunState>((acc, seatId) => {
      const result = applyRunAction(acc, seatId, { type: "vote", choice: "a" }, CATALOG);
      if (!result.ok) throw new Error(result.error);
      return result.state;
    }, atRoute);

    expect(loadout.stage.tag).toBe("loadout");
    for (const seatId of SEATS) expect(rulesFor(loadout, CATALOG).itemSlots(loadout, seatId)).toBe(1);
    expect(loadout.seats[0]!.equipped).toEqual(["it0"]);
    expect(backpackOf(loadout.seats[0]!).map((i) => i.uid)).toEqual(["it1"]);
    const view = toExpeditionPlayerView(loadout, "p0", CATALOG);
    expect(view.stage.tag === "loadout" && view.yourItemSlots).toBe(1);
  });
});

describe("Snake", () => {
  const target = std("hearts", 12);
  const objective: Objective = { id: "obj", kind: "win-card", target, ownerSeatId: "p0" };

  /** The camp at between-tricks after p0 whispers, with p0's objective won
   * by p0 at trick `wonAt`. */
  function bittenThenWonAt(wonAt: number): { whispered: RunState; won: RunState } {
    const start = advanceTo(loadoutWith("snake"), "between-tricks", CATALOG) as RunAt<"camp">;
    const cardId = start.stage.attempt.camp.hands.find((h) => h.seatId === "p0")!.cards[0]!.id;
    const result = applyRunAction(start, "p0", { type: "whisper", targetSeatId: "p1", cardId }, CATALOG);
    if (!result.ok) throw new Error(result.error);
    const whispered = result.state as RunAt<"camp">;
    const tricks = Array.from({ length: wonAt + 1 }, (_, i) => trick(i, "p1", filler(i)));
    tricks[wonAt] = trick(wonAt, "p0", [card("t", target), ...filler(wonAt).slice(1)]);
    const won = { ...whispered, stage: { ...whispered.stage, attempt: { ...whispered.stage.attempt, camp: camp({ objectives: [objective], completedTricks: tricks, currentTrick: { index: wonAt + 1, leaderSeatId: "p0", plays: [] } }) } } };
    return { whispered, won };
  }

  it("bites whoever whispers, failing an objective they win in the next two tricks", () => {
    const { whispered, won } = bittenThenWonAt(1);
    expect(statusOf(whispered, "p2", "snake")).toEqual([{ kind: "bitten", seatId: "p0", tricksLeft: 2 }]);
    expect(rulesFor(won, CATALOG).objectiveStatus(attemptOf(won)!.camp, objective)).toBe("failed");
  });

  it("lets an objective won after the bite count", () => {
    const { won } = bittenThenWonAt(2);
    expect(rulesFor(won, CATALOG).objectiveStatus(attemptOf(won)!.camp, objective)).toBe("done");
    expect(statusOf(won, "p2", "snake")).toEqual([]);
  });
});

describe("Crocodile", () => {
  it("faces one seat each trick, moving one seat along, and loses the camp if that seat wins", () => {
    const fresh = campWith("crocodile", camp({}));
    const [facing] = statusOf(fresh, "p0", "crocodile");
    if (facing?.kind !== "facing") throw new Error("expected a facing status");
    const first = SEATS.indexOf(facing.seatId);
    const nextSeat = SEATS[(first + 1) % 3]!;

    const watched = campWith("crocodile", camp({ completedTricks: [trick(0, facing.seatId, filler(0))], currentTrick: { index: 1, leaderSeatId: facing.seatId, plays: [] } }));
    expect(checkCampOutcome(watched.stage.attempt.camp, rulesFor(watched, CATALOG))).toEqual({ status: "failed", failedObjectiveIds: [], failedGoalIds: ["crocodile"] });

    const spared = campWith("crocodile", camp({ completedTricks: [trick(0, nextSeat, filler(0))], currentTrick: { index: 1, leaderSeatId: nextSeat, plays: [] } }));
    expect(checkCampOutcome(spared.stage.attempt.camp, rulesFor(spared, CATALOG)).status).not.toBe("failed");
    expect(statusOf(spared, "p0", "crocodile")).toEqual([{ kind: "facing", seatId: nextSeat }]);
  });
});

describe("Capybara", () => {
  it("brings two more objectives than the camp would deal", () => {
    const dealtWith = (boss: string | null) => advanceTo(loadoutWith(boss), "objective-pick", CATALOG);
    const plain = attemptOf(dealtWith(null))!.camp.objectives.length;
    expect(attemptOf(dealtWith("capybara"))!.camp.objectives.length).toBe(plain + 2);
  });
});

describe("Beaver", () => {
  it("dams one suit each trick, moving on a suit per trick, unless it is the only suit in a player's hand", () => {
    const fresh = campWith("beaver", camp({}));
    const [dam] = statusOf(fresh, "p0", "beaver");
    if (dam?.kind !== "dam") throw new Error("expected a dam status");
    const other = SUITS.find((s) => s !== dam.suit)!;
    const dammedCard = card("dammed", std(dam.suit, 9));
    const otherCard = card("other", std(other, 9));
    const sun = card("sun", SUN);

    const legalFor = (hand: readonly ExpeditionCard[], plays: CampState["currentTrick"]["plays"] = []) => {
      const run = campWith("beaver", camp({ hands: [{ seatId: "p0", cards: [] }, { seatId: "p1", cards: [...hand] }, { seatId: "p2", cards: [] }], currentTrick: { index: 0, leaderSeatId: plays.length === 0 ? "p1" : "p0", plays } }));
      return rulesFor(run, CATALOG).legalPlays(run.stage.attempt.camp, "p1").map((c) => c.id);
    };
    expect(legalFor([dammedCard, otherCard, sun])).toEqual(["other", "sun"]);
    expect(legalFor([dammedCard, sun])).toEqual(["dammed", "sun"]);
    const damLed = [{ seatId: "p0", card: card("lead", std(dam.suit, 3)) }];
    expect(legalFor([dammedCard, otherCard], damLed)).toEqual(["other"]);
    expect(legalFor([dammedCard, otherCard, sun], damLed)).toEqual(["other", "sun"]);
    expect(legalFor([dammedCard, sun], damLed)).toEqual(["dammed"]);

    const later = campWith("beaver", camp({ completedTricks: [trick(0, "p0", filler(0))], currentTrick: { index: 1, leaderSeatId: "p0", plays: [] } }));
    expect(statusOf(later, "p0", "beaver")).toEqual([{ kind: "dam", suit: SUITS[(SUITS.indexOf(dam.suit) + 1) % 4] }]);
  });
});

describe("planned bosses", () => {
  it("draws the animal boss from the animal pool at the length vote, the same for a seed", () => {
    const plan = drawPlan("plan-seed", "long", CATALOG);
    expect(plan.bosses.map((b) => [b.at, b.tier])).toEqual([[3, "animal"], [6, "disaster"], [8, "temple"]]);
    expect(["beaver", "capybara", "crocodile", "rats", "snake", "tiger"]).toContain(plan.bosses[0]!.modId);
    expect(drawPlan("plan-seed", "long", CATALOG)).toEqual(plan);
  });

  it("hides a boss id until the route preview leads to its camp", () => {
    const run = setupRun({ seatIds: SEATS, seed: "horizon", catalog: CATALOG, camp: 2 });
    const boss = run.plan!.bosses[0]!.modId!;
    const seen = (view: ExpeditionView) => JSON.stringify(view).includes(`"${boss}"`);

    const atLoadout = toExpeditionPlayerView(run, "p0", CATALOG);
    expect(atLoadout.plan[0]).toEqual({ at: 3, tier: "animal", bossId: null });
    expect(seen(atLoadout)).toBe(false);

    const atRoute: RunState = { ...run, stage: { tag: "route", from: campIndex(2), options: [{ id: "a", next: campSpecAt("horizon", "standard", campIndex(3), CATALOG), reroll: 0, swapBoss: null }], ballots: {} } };
    const routeView = toExpeditionPlayerView(atRoute, "p0", CATALOG);
    expect(routeView.plan[0]!.bossId).toBe(boss);
    expect(routeView.stage.tag === "route" && routeView.stage.options[0]!.next.bossId).toBe(boss);
  });

  it("flags a view that shows a boss beyond the horizon", () => {
    const run = setupRun({ seatIds: SEATS, seed: "horizon", catalog: CATALOG, camp: 2 });
    const view = toExpeditionPlayerView(run, "p0", CATALOG);
    const leaked = { ...view, plan: view.plan.map((b, i) => (i === 0 ? { ...b, bossId: run.plan!.bosses[0]!.modId } : b)) };
    const secrets = secretsForExpeditionSeat(run, "p0", CATALOG, run.seed);
    expect(checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets })).toEqual([]);
    expect(checkExpeditionViewForLeaks({ view: leaked, serialized: JSON.stringify(leaked), secrets }).length).toBeGreaterThan(0);
  });
});
