import { describe, expect, it } from "vitest";
import { attemptOf } from "../../run/attempt";
import { CATALOG } from "../../run/catalog";
import { rulesFor } from "../../run/compose";
import { react } from "../../run/react";
import { toExpeditionPlayerView } from "../../adapter/view";
import { currentActorSeatId } from "../../camp";
import { advanceTo, enumerateLegalRunActions, setupRun } from "../../run/run-test-support";
import { campStack, modCtx, pairingRuleFor } from "../../run/stack";
import { campIndex } from "../../run/plan";
import { campSpecAt } from "../../run/route";
import { STAGES, applyRunAction } from "../../run/stages/registry";
import type { ActiveEffect, RunAt, RunState } from "../../run/types";
import type { CampState, CardIdentity, ExpeditionCard, Objective } from "../../state";

const SEATS = ["p0", "p1", "p2"];
const SPADE = (rank: 2 | 3 | 14): CardIdentity => ({ kind: "standard", suit: "spades", rank });
const HEART_K: CardIdentity = { kind: "standard", suit: "hearts", rank: 13 };
const card = (id: string, identity: CardIdentity): ExpeditionCard => ({ id, identity });

const STRIKE: ActiveEffect = { origin: { kind: "mod", modId: "thunderstorm", strength: "full" }, atTrick: 0, lasts: "trick", deferIfFatal: true, params: { strike: true }, audience: "public" };

/** The loadout of camp 2 with the given weather, in the Jungle unless named. */
function loadoutIn(weather: string, items: Record<string, readonly string[]> = {}, seed = "weather", location = "jungle", seatIds: readonly string[] = SEATS): RunAt<"loadout"> {
  const run = setupRun({ seatIds, seed, catalog: CATALOG, camp: 2, items }) as RunAt<"loadout">;
  return { ...run, stage: { ...run.stage, camp: { ...run.stage.camp, location, weather } } };
}

/** Trick 0 of `totalTricks`, with p1 and p2 already on the 2 and 3 of
 * spades and p0 to play the ace; `strikes` sit on the attempt. */
function stormCamp(objectives: readonly Objective[], totalTricks: number, strikes: readonly ActiveEffect[]): RunAt<"camp"> {
  const later = totalTricks > 1;
  const camp: CampState = {
    seatIds: SEATS,
    playerCount: 3,
    removedCards: [],
    totalTricks,
    hands: [
      { seatId: "p0", cards: [card("ace", SPADE(14)), ...(later ? [card("p0-late", { kind: "standard", suit: "diamonds", rank: 5 })] : [])] },
      { seatId: "p1", cards: later ? [card("king", HEART_K)] : [] },
      { seatId: "p2", cards: later ? [card("p2-late", { kind: "standard", suit: "clubs", rank: 9 })] : [] },
    ],
    expeditionLeaderSeatId: "p1",
    objectives,
    objectiveDeck: [],
    completedTricks: [],
    discards: [], voidedTricks: [],
    currentTrick: {
      index: 0,
      leaderSeatId: "p1",
      plays: [
        { seatId: "p1", card: card("two", SPADE(2)) },
        { seatId: "p2", card: card("three", SPADE(3)) },
      ],
    },
  };
  const loadout = loadoutIn("thunderstorm");
  return { ...loadout, stage: { tag: "camp", camp: loadout.stage.camp, attempt: { attemptNumber: 1, effects: strikes, reveals: [], log: [], camp } } };
}

/** p0 plays the ace through the camp stage's own handler, so the camp is
 * not settled and its tricks can be read. */
function playAce(run: RunAt<"camp">): RunAt<"camp"> {
  const result = STAGES.camp.on["play-card"]!(run, "p0", { type: "play-card", cardId: "ace" }, CATALOG);
  if (!result.ok) throw new Error(result.error);
  return result.state as RunAt<"camp">;
}

const owned = (id: string, target: CardIdentity, ownerSeatId: string): Objective => ({ id, kind: "win-card", target, ownerSeatId });

describe("Thunderstorm", () => {
  it("a fatal strike waits a trick: the ace wins its objective and the strike moves to the next trick", () => {
    const after = playAce(stormCamp([owned("ace-goal", SPADE(14), "p0"), owned("king-goal", HEART_K, "p1")], 2, [STRIKE]));
    const attempt = after.stage.attempt;
    expect(attempt.camp.completedTricks[0]!.winnerSeatId).toBe("p0");
    expect(attempt.effects).toEqual([{ ...STRIKE, atTrick: 1 }]);
  });

  it("a strike that is not the cause lands: the camp fails either way, and the lowest card wins", () => {
    const after = playAce(stormCamp([owned("three-goal", SPADE(3), "p2"), owned("king-goal", HEART_K, "p1")], 2, [STRIKE]));
    const attempt = after.stage.attempt;
    expect(attempt.camp.completedTricks[0]!.winnerSeatId).toBe("p1");
    expect(attempt.effects).toEqual([STRIKE]);
  });

  it("a fatal strike on the last trick is dropped", () => {
    const after = playAce(stormCamp([owned("ace-goal", SPADE(14), "p0")], 1, [STRIKE]));
    expect(after.stage.attempt.camp.completedTricks[0]!.winnerSeatId).toBe("p0");
    expect(after.stage.attempt.effects).toEqual([]);
  });

  /** stormCamp after a hallucination: trick 0 was voided, so the trick in play is index 1 and the first to count. */
  function afterHallucination(objectives: readonly Objective[], totalTricks: number, strikes: readonly ActiveEffect[]): RunAt<"camp"> {
    const run = stormCamp(objectives, totalTricks, strikes);
    const camp = run.stage.attempt.camp;
    const voided = { index: 0, leaderSeatId: "p1", plays: camp.hands.map((h) => ({ seatId: h.seatId, card: h.cards.at(-1)! })) };
    return { ...run, stage: { ...run.stage, attempt: { ...run.stage.attempt, camp: { ...camp, voidedTricks: [voided], currentTrick: { ...camp.currentTrick, index: 1 } } } } };
  }

  it("after a hallucination a fatal strike still waits, since a trick is left to play", () => {
    const after = playAce(afterHallucination([owned("ace-goal", SPADE(14), "p0"), owned("king-goal", HEART_K, "p1")], 2, [{ ...STRIKE, atTrick: 1 }]));
    expect(after.stage.attempt.camp.completedTricks[0]!.winnerSeatId).toBe("p0");
    expect(after.stage.attempt.effects).toEqual([{ ...STRIKE, atTrick: 2 }]);
  });

  it("after a hallucination the chance shows for the next trick while one is left", () => {
    const run = afterHallucination([owned("king-goal", HEART_K, "p1")], 2, []);
    const layer = campStack(run, CATALOG).find((l) => l.def.id === "thunderstorm")!;
    expect(layer.body.status!(modCtx(run, run.stage.camp, layer, CATALOG))).toEqual([{ kind: "chance", percent: 40, strikesLeft: 2 }]);
  });

  it("the trick Smelling Salts replays gets its own roll", () => {
    const loadout = setupRun({ seatIds: SEATS, seed: "weather", catalog: CATALOG, camp: 2, characters: { p0: "perfumist" }, upgrades: { p0: "perfumist.smelling-salts" } }) as RunAt<"loadout">;
    const struck = stormCamp([owned("three-goal", SPADE(3), "p2")], 12, []);
    const filler = (index: number) => ({ index, leaderSeatId: "p1", winnerSeatId: "p1", plays: SEATS.map((seatId, s) => ({ seatId, card: card(`f${index}-${s}`, { kind: "standard", suit: "hearts", rank: 4 + s } as CardIdentity), countsAs: null, burned: false })) });
    const camp = { ...struck.stage.attempt.camp, completedTricks: Array.from({ length: 8 }, (_, i) => filler(i)), currentTrick: { ...struck.stage.attempt.camp.currentTrick, index: 8 } };
    const run: RunAt<"camp"> = { ...loadout, stage: { tag: "camp", camp: { ...loadout.stage.camp, weather: "thunderstorm" }, attempt: { ...struck.stage.attempt, camp } } };
    const failed = playAce(run);
    expect(failed.stage.attempt.effects).toEqual([]);
    const saved = applyRunAction(failed, "p0", { type: "use-ability", sourceKey: "perfumist.smelling-salts", targets: [] }, CATALOG);
    if (!saved.ok) throw new Error(saved.error);
    expect(attemptOf(saved.state)!.camp.currentTrick.index).toBe(9);
    expect(attemptOf(saved.state)!.effects).toEqual([{ ...STRIKE, atTrick: 9 }]);
  });

  it("a harmless strike lands: the lowest card wins the trick", () => {
    const after = playAce(stormCamp([owned("king-goal", HEART_K, "p1")], 2, [STRIKE]));
    expect(after.stage.attempt.camp.completedTricks[0]!.winnerSeatId).toBe("p1");
    expect(after.stage.attempt.effects).toEqual([STRIKE]);
  });

  describe("the roll before a trick", () => {
    /** A dealt thunderstorm camp with every objective picked, at trick 8 (a
     * 100% chance), holding `strikes`. */
    function atTrick8(strikes: readonly ActiveEffect[], location = "jungle"): RunAt<"camp"> {
      const dealt = advanceTo(loadoutIn("thunderstorm", {}, "weather", location), "between-tricks", CATALOG) as RunAt<"camp">;
      const attempt = dealt.stage.attempt;
      return { ...dealt, stage: { ...dealt.stage, attempt: { ...attempt, effects: strikes, camp: { ...attempt.camp, currentTrick: { ...attempt.camp.currentTrick, index: 8 } } } } };
    }
    const start = (run: RunAt<"camp">) => react(run, [{ type: "trick-started", trickIndex: 8, leaderSeatId: run.stage.attempt.camp.currentTrick.leaderSeatId }], CATALOG);

    it("strikes at a 100% chance while fewer than two strikes are stored", () => {
      expect(start(atTrick8([STRIKE])).stage.attempt.effects).toEqual([STRIKE, { ...STRIKE, atTrick: 8 }]);
    });

    it("never strikes a third time", () => {
      const two = [STRIKE, { ...STRIKE, atTrick: 3 }];
      expect(start(atTrick8(two)).stage.attempt.effects).toEqual(two);
    });

    it("strikes a third time on the Clifftop, but never a fourth", () => {
      const two = [STRIKE, { ...STRIKE, atTrick: 3 }];
      expect(start(atTrick8(two, "clifftop")).stage.attempt.effects).toEqual([...two, { ...STRIKE, atTrick: 8 }]);
      const three = [...two, { ...STRIKE, atTrick: 5 }];
      expect(start(atTrick8(three, "clifftop")).stage.attempt.effects).toEqual(three);
    });

    it("never strikes a trick a moved strike already sits on", () => {
      const waiting = [{ ...STRIKE, atTrick: 8 }];
      expect(start(atTrick8(waiting)).stage.attempt.effects).toEqual(waiting);
    });
  });

  it("over many played camps strikes happen, and never more than two", () => {
    const counts: number[] = [];
    for (let n = 0; n < 12; n++) {
      let run: RunState = loadoutIn("thunderstorm", {}, `storm-${n}`);
      let most = 0;
      for (let step = 0; step < 400 && run.history.length === 0; step++) {
        const legal = enumerateLegalRunActions(run, CATALOG).filter((c) => c.action.type !== "whisper");
        const picked = legal[(step * 7 + n) % legal.length]!;
        const result = applyRunAction(run, picked.seatId, picked.action, CATALOG);
        if (!result.ok) throw new Error(result.error);
        run = result.state;
        most = Math.max(most, attemptOf(run)?.effects.filter((e) => e.origin.kind === "mod").length ?? 0);
      }
      counts.push(most);
    }
    expect(Math.max(...counts)).toBeLessThanOrEqual(2);
    expect(counts.some((count) => count > 0)).toBe(true);
  });

  it("shows the next trick's chance and the strikes left, and a strike on the trick in play", () => {
    const loadout = loadoutIn("thunderstorm");
    const status = (run: RunState) => {
      const layer = campStack(run, CATALOG).find((l) => l.def.id === "thunderstorm")!;
      return layer.body.status!(modCtx(run, run.stage.tag === "camp" || run.stage.tag === "loadout" ? run.stage.camp : loadout.stage.camp, layer, CATALOG));
    };
    expect(status(loadout)).toEqual([{ kind: "chance", percent: 20, strikesLeft: 2 }]);
    const struck = stormCamp([owned("king-goal", HEART_K, "p1")], 2, [STRIKE]);
    expect(status(struck)).toEqual([{ kind: "chance", percent: 30, strikesLeft: 1 }, { kind: "strike" }]);
    expect(status(playAce(struck))).toEqual([{ kind: "chance", percent: 0, strikesLeft: 1 }]);
    expect(status(loadoutIn("thunderstorm", {}, "weather", "clifftop"))).toEqual([{ kind: "chance", percent: 20, strikesLeft: 3 }]);
  });
});

const cardOf = (run: RunState, seatId: string): string => attemptOf(run)!.camp.hands.find((h) => h.seatId === seatId)!.cards[0]!.id;

function whisper(run: RunState, from: string, to: string): RunState {
  const result = applyRunAction(run, from, { type: "whisper", targetSeatId: to, cardId: cardOf(run, from) }, CATALOG);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The weather's status in the loadout's view, with `players` seats. */
function weatherStatus(weather: string, location: string, players: number) {
  const run = loadoutIn(weather, {}, "weather", location, ["p0", "p1", "p2", "p3", "p4"].slice(0, players));
  const view = toExpeditionPlayerView(run, "p0", CATALOG);
  return view.stage.tag === "loadout" ? view.stage.mods.find((mod) => mod.id === weather)?.status : undefined;
}

describe("Rain", () => {
  it("washes away the crew's first whisper at three players: spent, unseen, and told to everyone", () => {
    const run = advanceTo(loadoutIn("rain"), "between-tricks", CATALOG);
    const washed = whisper(run, "p1", "p2");
    expect(attemptOf(washed)!.reveals).toEqual([]);
    expect(attemptOf(washed)!.log.at(-1)).toEqual({ event: "whisper-washed", actorSeatId: "p1", subjectSeatIds: ["p2"], sourceId: null, audience: "public" });
    expect(applyRunAction(washed, "p1", { type: "whisper", targetSeatId: "p0", cardId: cardOf(washed, "p1") }, CATALOG)).toEqual({ ok: false, error: "no_whispers_left" });
    const heard = whisper(washed, "p0", "p2");
    expect(attemptOf(heard)!.reveals).toEqual([{ cardId: cardOf(washed, "p0"), fromSeatId: "p0", audience: ["p2"], source: "whisper", targetSeatId: "p2" }]);
  });

  it("washes away the player count less two, and two more on the Clifftop", () => {
    expect([3, 4, 5].map((players) => weatherStatus("rain", "jungle", players))).toEqual([
      [{ kind: "washes", left: 1, of: 1 }],
      [{ kind: "washes", left: 2, of: 2 }],
      [{ kind: "washes", left: 3, of: 3 }],
    ]);
    expect(weatherStatus("rain", "clifftop", 3)).toEqual([{ kind: "washes", left: 3, of: 3 }]);
  });

  it("counts down as whispers wash away, and stops washing once they are spent", () => {
    const run = advanceTo(loadoutIn("rain", {}, "weather", "jungle", ["p0", "p1", "p2", "p3"]), "between-tricks", CATALOG);
    const once = whisper(run, "p0", "p1");
    const view = toExpeditionPlayerView(once, "p3", CATALOG);
    expect(view.stage.tag === "camp" ? view.stage.mods.find((mod) => mod.id === "rain")?.status : null).toEqual([{ kind: "washes", left: 1, of: 2 }]);
    const third = whisper(whisper(once, "p1", "p2"), "p2", "p3");
    expect(attemptOf(third)!.log.map((entry) => entry.event)).toEqual(["whisper-washed", "whisper-washed", "whisper"]);
    expect(attemptOf(third)!.reveals.map((reveal) => reveal.fromSeatId)).toEqual(["p2"]);
  });

  it("leaves whispers alone in fair weather", () => {
    const run = advanceTo(loadoutIn("fair"), "between-tricks", CATALOG);
    expect(attemptOf(whisper(run, "p1", "p2"))!.reveals.map((reveal) => reveal.targetSeatId)).toEqual(["p2"]);
  });
});

describe("Downpour", () => {
  it("washes away the player count less one, and three more on the Clifftop", () => {
    expect([3, 4, 5].map((players) => weatherStatus("downpour", "jungle", players))).toEqual([
      [{ kind: "washes", left: 2, of: 2 }],
      [{ kind: "washes", left: 3, of: 3 }],
      [{ kind: "washes", left: 4, of: 4 }],
    ]);
    expect(weatherStatus("downpour", "clifftop", 3)).toEqual([{ kind: "washes", left: 5, of: 5 }]);
  });

  it("washes away two whispers at three players before one is heard", () => {
    const run = advanceTo(loadoutIn("downpour"), "between-tricks", CATALOG);
    const three = whisper(whisper(whisper(run, "p0", "p1"), "p1", "p2"), "p2", "p0");
    expect(attemptOf(three)!.log.map((entry) => entry.event)).toEqual(["whisper-washed", "whisper-washed", "whisper"]);
  });

  it("pairs like Rain at every location", () => {
    for (const location of Object.values(CATALOG.mods).filter((def) => def.kind === "location").map((def) => def.id)) {
      expect([location, pairingRuleFor(location, "downpour", CATALOG)?.result ?? null]).toEqual([location, pairingRuleFor(location, "rain", CATALOG)?.result ?? null]);
    }
  });

  it("comes about a third as often as Rain", () => {
    const weathers = Array.from({ length: 3000 }, (_, i) => campSpecAt(`odds-${i}`, "standard", campIndex(2), CATALOG).weather);
    const count = (id: string) => weathers.filter((w) => w === id).length;
    expect(count("downpour") / count("rain")).toBeGreaterThan(0.25);
    expect(count("downpour") / count("rain")).toBeLessThan(0.42);
  });
});

/** The current actor plays their first legal card through the camp stage's
 * own handler, so a decided camp is not settled away. */
function playFirst(run: RunState): { run: RunState; seatId: string } {
  const camp = attemptOf(run)!.camp;
  const rules = rulesFor(run, CATALOG);
  const seatId = currentActorSeatId(camp, rules)!;
  const result = STAGES.camp.on["play-card"]!(run as RunAt<"camp">, seatId, { type: "play-card", cardId: rules.legalPlays(camp, seatId)[0]!.id }, CATALOG);
  if (!result.ok) throw new Error(result.error);
  return { run: result.state, seatId };
}

function campView(run: RunState, seatId: string) {
  const view = toExpeditionPlayerView(run, seatId, CATALOG);
  if (view.stage.tag !== "camp") throw new Error(`expected a camp view, got ${view.stage.tag}`);
  return view.stage.attempt.camp;
}

describe("Night", () => {
  it("keeps every card face down to the others until the trick ends", () => {
    const lead = playFirst(advanceTo(loadoutIn("night"), "between-tricks", CATALOG));
    const second = playFirst(lead.run);
    const third = SEATS.find((s) => s !== lead.seatId && s !== second.seatId)!;
    expect(campView(second.run, third).currentTrick.plays.map((p) => [p.seatId, p.hidden])).toEqual([
      [lead.seatId, true],
      [second.seatId, true],
    ]);
    expect(campView(second.run, lead.seatId).currentTrick.plays.map((p) => p.hidden)).toEqual([false, true]);
    const done = playFirst(second.run);
    expect(campView(done.run, third).completedTricks[0]!.plays.map((p) => p.seatId)).toEqual([lead.seatId, second.seatId, third]);
    expect(campView(done.run, third).currentTrick.plays).toEqual([]);
  });
});

describe("Heavy fog", () => {
  const items = { p0: ["smoke-signal", "bait"], p1: ["parrot"] };

  it("hides another seat's items in the loadout, but never your own", () => {
    const run = loadoutIn("fog", items);
    const seatOf = (viewer: string, seatId: string) => toExpeditionPlayerView(run, viewer, CATALOG).seats.find((s) => s.seatId === seatId)!;
    expect(seatOf("p1", "p0").items).toEqual({ equipped: [], backpack: null, concealed: true });
    expect(seatOf("p1", "p0").usage.map((u) => u.sourceKey)).toEqual(["explorer"]);
    expect(seatOf("p0", "p0").items).toMatchObject({ equipped: [{ itemId: "smoke-signal" }, { itemId: "bait" }], backpack: [], concealed: false });
  });

  it("using an item reveals it, even under fog", () => {
    const between = advanceTo(loadoutIn("fog", items), "between-tricks", CATALOG);
    const uid = between.seats[0]!.equipped[0]!;
    const used = applyRunAction(between, "p0", { type: "use-ability", sourceKey: uid, targets: [] }, CATALOG);
    if (!used.ok) throw new Error(used.error);
    const seen = toExpeditionPlayerView(used.state, "p2", CATALOG).seats[0]!;
    expect(seen.items).toEqual({ equipped: [{ uid, itemId: "smoke-signal", remaining: { kind: "uses", left: 1, of: 2 } }], backpack: null, concealed: true });
    expect(seen.usage.map((u) => u.sourceKey)).toEqual(["explorer", uid]);
  });
});
