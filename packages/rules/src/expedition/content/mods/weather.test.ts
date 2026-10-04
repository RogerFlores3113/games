import { describe, expect, it } from "vitest";
import { attemptOf } from "../../run/attempt";
import { CATALOG } from "../../run/catalog";
import { rulesFor } from "../../run/compose";
import { react } from "../../run/react";
import { toExpeditionPlayerView } from "../../adapter/view";
import { currentActorSeatId } from "../../camp";
import { advanceTo, enumerateLegalRunActions, setupRun } from "../../run/run-test-support";
import { campStack, modCtx } from "../../run/stack";
import { STAGES, applyRunAction } from "../../run/stages/registry";
import type { ActiveEffect, RunAt, RunState } from "../../run/types";
import type { CampState, CardIdentity, ExpeditionCard, Objective } from "../../state";

const SEATS = ["p0", "p1", "p2"];
const SPADE = (rank: 2 | 3 | 14): CardIdentity => ({ kind: "standard", suit: "spades", rank });
const HEART_K: CardIdentity = { kind: "standard", suit: "hearts", rank: 13 };
const card = (id: string, identity: CardIdentity): ExpeditionCard => ({ id, identity });

const STRIKE: ActiveEffect = { origin: { kind: "mod", modId: "thunderstorm", strength: "full" }, atTrick: 0, lasts: "trick", deferIfFatal: true, params: { strike: true }, audience: "public" };

/** The loadout of camp 2 in the Jungle with the given weather. */
function loadoutIn(weather: string, items: Record<string, readonly string[]> = {}, seed = "weather"): RunAt<"loadout"> {
  const run = setupRun({ seatIds: SEATS, seed, catalog: CATALOG, camp: 2, items }) as RunAt<"loadout">;
  return { ...run, stage: { ...run.stage, camp: { ...run.stage.camp, location: "jungle", weather } } };
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

  it("a harmless strike lands: the lowest card wins the trick", () => {
    const after = playAce(stormCamp([owned("king-goal", HEART_K, "p1")], 2, [STRIKE]));
    expect(after.stage.attempt.camp.completedTricks[0]!.winnerSeatId).toBe("p1");
    expect(after.stage.attempt.effects).toEqual([STRIKE]);
  });

  describe("the roll before a trick", () => {
    /** A dealt thunderstorm camp with every objective picked, at trick 8 (a
     * 100% chance), holding `strikes`. */
    function atTrick8(strikes: readonly ActiveEffect[]): RunAt<"camp"> {
      const dealt = advanceTo(loadoutIn("thunderstorm"), "between-tricks", CATALOG) as RunAt<"camp">;
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
  });
});

describe("Rain", () => {
  it("stops every whisper, except its owner's under a Mosquito Net", () => {
    const run = advanceTo(loadoutIn("rain", { p0: ["mosquito-net"] }), "between-tricks", CATALOG);
    const cardOf = (seatId: string) => attemptOf(run)!.camp.hands.find((h) => h.seatId === seatId)!.cards[0]!.id;
    expect(applyRunAction(run, "p1", { type: "whisper", targetSeatId: "p2", cardId: cardOf("p1") }, CATALOG)).toEqual({ ok: false, error: "whisper_blocked" });
    expect(applyRunAction(run, "p0", { type: "whisper", targetSeatId: "p1", cardId: cardOf("p0") }, CATALOG).ok).toBe(true);
    expect(rulesFor(run, CATALOG).whisperAllowed(run, "p2")).toBe(false);
  });

  it("leaves whispers alone in fair weather", () => {
    const run = advanceTo(loadoutIn("fair"), "between-tricks", CATALOG);
    expect(rulesFor(run, CATALOG).whisperAllowed(run, "p1")).toBe(true);
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
  it("keeps only the leader's card face down to the others; the next play shows", () => {
    const lead = playFirst(advanceTo(loadoutIn("night"), "between-tricks", CATALOG));
    const second = playFirst(lead.run);
    const third = SEATS.find((s) => s !== lead.seatId && s !== second.seatId)!;
    const plays = campView(second.run, third).currentTrick.plays;
    expect(plays.map((p) => [p.seatId, p.hidden])).toEqual([
      [lead.seatId, true],
      [second.seatId, false],
    ]);
    expect(campView(second.run, lead.seatId).currentTrick.plays.map((p) => p.hidden)).toEqual([false, false]);
  });
});

describe("Heavy fog", () => {
  const items = { p0: ["smoke-signal", "bait"], p1: ["parrot"] };

  it("hides another seat's items in the loadout, but never your own", () => {
    const run = loadoutIn("fog", items);
    const seatOf = (viewer: string, seatId: string) => toExpeditionPlayerView(run, viewer, CATALOG).seats.find((s) => s.seatId === seatId)!;
    expect(seatOf("p1", "p0").items).toEqual({ equipped: [], backpack: null, concealed: true });
    expect(seatOf("p1", "p0").usage.map((u) => u.sourceKey)).toEqual(["scout"]);
    expect(seatOf("p0", "p0").items).toMatchObject({ equipped: [{ itemId: "smoke-signal" }, { itemId: "bait" }], backpack: [], concealed: false });
  });

  it("using an item reveals it, even under fog", () => {
    const between = advanceTo(loadoutIn("fog", items), "between-tricks", CATALOG);
    const uid = between.seats[0]!.equipped[0]!;
    const used = applyRunAction(between, "p0", { type: "use-ability", sourceKey: uid, targets: [] }, CATALOG);
    if (!used.ok) throw new Error(used.error);
    const seen = toExpeditionPlayerView(used.state, "p2", CATALOG).seats[0]!;
    expect(seen.items).toEqual({ equipped: [{ uid, itemId: "smoke-signal", remaining: { kind: "uses", left: 1, of: 2 } }], backpack: null, concealed: true });
    expect(seen.usage.map((u) => u.sourceKey)).toEqual(["scout", uid]);
  });
});
