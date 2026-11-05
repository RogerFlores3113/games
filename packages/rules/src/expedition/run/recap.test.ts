import { describe, expect, it } from "vitest";
import { guard } from "../camp";
import { defineItem } from "../content/source-def";
import { toExpeditionPlayerView } from "../adapter/view";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "../adapter/view-leak-check";
import { attemptOf, withAttempt } from "./attempt";
import { FAILURE_COST } from "./balance";
import { dealCamp, settleCamp } from "./lifecycle";
import { supplyCostParts } from "./recap";
import { applyRunAction } from "./stages/registry";
import { kickSeat } from "./stages/kick";
import { enumerateLegalRunActions, setupRun, testCatalog } from "./run-test-support";
import type { Catalog, RunAt, RunState } from "./types";

const SEAT_IDS = ["p0", "p1", "p2"];

const tonic = defineItem({
  id: "energy-tonic",
  name: "Energy Tonic",
  rarity: "common",
  price: 2,
  text: "Failures cost more.",
  passive: { modifier: () => ({ failureCost: (prev) => (run) => prev(run) + 1 }) },
});

const FORCED_FAILURE = defineItem({
  id: "always-fails",
  name: "Always Fails",
  rarity: "common",
  price: 2,
  text: "The camp fails.",
  passive: { modifier: () => ({ goals: (prev) => (camp, statuses) => [...prev(camp, statuses), guard("forced", true)] }) },
});

const catalog = testCatalog({ items: { "energy-tonic": tonic, "always-fails": FORCED_FAILURE } });

/** The loadout of camp 1, moved to `location` when given. */
function loadoutAt(opts: { seed: string; location?: string; items?: Record<string, readonly string[]> }, cat: Catalog = catalog): RunAt<"loadout"> {
  const run = setupRun({ seatIds: SEAT_IDS, seed: opts.seed, catalog: cat, items: opts.items }) as RunAt<"loadout">;
  return opts.location === undefined ? run : { ...run, stage: { ...run.stage, camp: { ...run.stage.camp, location: opts.location } } };
}

/** Plays the dealt camp through the real transition, always the first
 * objective pick, else the first legal card, else a skip, until it settles.
 * `last` is the camp just before the action that settled it. */
function playOut(run: RunState, cat: Catalog = catalog): { last: RunAt<"camp">; settled: RunState } {
  let state = run;
  for (let step = 0; step < 400; step++) {
    if (state.stage.tag !== "camp") throw new Error(`playOut: not in camp (${state.stage.tag})`);
    const legal = enumerateLegalRunActions(state, cat);
    const choice =
      legal.find((a) => a.action.type === "pick-objective") ?? legal.find((a) => a.action.type === "play-card") ?? legal.find((a) => a.action.type === "skip-window");
    if (choice === undefined) throw new Error("playOut: no camp action");
    const result = applyRunAction(state, choice.seatId, choice.action, cat);
    if (!result.ok) throw new Error(`playOut: ${result.error}`);
    if (result.state.stage.tag !== "camp") return { last: state as RunAt<"camp">, settled: result.state };
    state = result.state;
  }
  throw new Error("playOut: the camp never settled");
}

/** A failed camp played to its end at `location`, found by trying seeds. */
function failedCamp(location?: string, items?: Record<string, readonly string[]>): { last: RunAt<"camp">; settled: RunState } {
  for (let i = 0; i < 40; i++) {
    const dealt = dealCamp(loadoutAt({ seed: `recap-${i}`, location, items }), catalog);
    const out = playOut(dealt);
    if (out.settled.history.at(-1)?.status === "failed" && out.settled.lastAttempt?.lastTrick !== null) return out;
  }
  throw new Error("failedCamp: no seed failed a camp");
}

describe("the last attempt's recap", () => {
  it("names the objective that failed, the trick that failed it, its holder and the final trick", () => {
    const { last, settled } = failedCamp();
    const recap = settled.lastAttempt!;
    const camp = last.stage.attempt.camp;
    expect(recap).toMatchObject({ camp: 1, attempt: 1, status: "failed", totalTricks: camp.totalTricks, coins: 0 });

    // The final trick is the one that completed last; the play that settled it is in it.
    expect(recap.tricksPlayed).toBeGreaterThanOrEqual(camp.completedTricks.length);
    expect(recap.lastTrick).not.toBeNull();
    const shown = camp.currentTrick.plays.map((p) => p.card.id);
    expect(recap.lastTrick!.plays.map((p) => p.card.id)).toEqual(expect.arrayContaining(shown));
    expect(recap.lastTrick!.plays).toHaveLength(SEAT_IDS.length);

    // Play stops at the first failure, so the trick that failed it is the final one.
    const failed = recap.objectives.filter((o) => o.status === "failed");
    expect(failed.length).toBeGreaterThan(0);
    const tricks = recap.tricksPlayed > camp.completedTricks.length ? [...camp.completedTricks, recap.lastTrick!] : camp.completedTricks;
    for (const entry of failed) {
      expect(entry.objective.ownerSeatId).not.toBeNull();
      expect(entry.failedAtTrick).toBe(recap.lastTrick!.index);
      expect(entry.ownerTricksWon).toBe(tricks.filter((t) => t.winnerSeatId === entry.objective.ownerSeatId).length);
    }
    expect(recap.objectives.map((o) => o.objective.id)).toEqual(camp.objectives.map((o) => o.id));
  });

  it("gives a card objective's fate: won, and by whom", () => {
    const { settled } = failedCamp();
    for (const entry of settled.lastAttempt!.objectives) {
      const kind = entry.objective.kind;
      if (kind === "win-card" || kind === "ordered") expect(entry.fate).not.toBeNull();
      else expect(entry.fate).toBeNull();
      if (entry.fate?.kind === "won") expect(SEAT_IDS).toContain(entry.fate.bySeatId);
    }
  });

  it("splits the supplies lost into the base cost and each source's extra", () => {
    const { settled } = failedCamp(undefined, { p0: ["energy-tonic"], p2: ["energy-tonic"] });
    expect(settled.history.at(-1)!.suppliesSpent).toBe(FAILURE_COST + 2);
    expect(settled.lastAttempt!.supplyCost).toEqual([
      { origin: { kind: "base" }, amount: FAILURE_COST },
      { origin: { kind: "seat", seatId: "p0", sourceId: "energy-tonic" }, amount: 1 },
      { origin: { kind: "seat", seatId: "p2", sourceId: "energy-tonic" }, amount: 1 },
    ]);
  });

  it("sums two of one source on one seat, and its parts always add up to the cost", () => {
    const dealt = dealCamp(loadoutAt({ seed: "parts", items: { p1: ["energy-tonic", "energy-tonic"] } }), catalog);
    const parts = supplyCostParts(dealt, catalog);
    expect(parts).toEqual([
      { origin: { kind: "base" }, amount: FAILURE_COST },
      { origin: { kind: "seat", seatId: "p1", sourceId: "energy-tonic" }, amount: 2 },
    ]);
    const cost = parts.reduce((sum, p) => sum + p.amount, 0);
    const failed = settleCamp(dealt, "failed", catalog);
    expect(failed.history.at(-1)!.suppliesSpent).toBe(cost);
  });

  it("a camp rule that failed is named, with no objective blamed for a trick", () => {
    const dealt = dealCamp(loadoutAt({ seed: "forced", items: { p0: ["always-fails"] } }), catalog);
    const failed = settleCamp(dealt, "failed", catalog);
    expect(failed.lastAttempt).toMatchObject({ status: "failed", tricksPlayed: 0, lastTrick: null, failedGoalIds: ["forced"] });
    expect(failed.lastAttempt!.objectives.every((o) => o.failedAtTrick === null)).toBe(true);
  });

  it("a clear records its coins and tricks, and no supply cost", () => {
    const dealt = dealCamp(loadoutAt({ seed: "clear" }), catalog);
    const allDone = Object.fromEntries(dealt.stage.attempt.camp.objectives.map((o) => [o.id, "done" as const]));
    const loaded = withAttempt(dealt, { ...dealt.stage.attempt, loaded: { rolls: {}, objectives: allDone } }) as RunAt<"camp">;
    const cleared = settleCamp(loaded, "cleared", catalog);
    expect(cleared.lastAttempt).toMatchObject({ status: "cleared", coins: cleared.history.at(-1)!.coins, tricksPlayed: 0, supplyCost: [], failedGoalIds: [] });
    expect(cleared.lastAttempt!.objectives.every((o) => o.status === "done")).toBe(true);
  });

  it("keeps a Desert mirage hidden when it was still hidden at the end", () => {
    const dealt = dealCamp(loadoutAt({ seed: "mirage", location: "desert", items: { p0: ["always-fails"] } }), catalog);
    const failed = settleCamp(dealt, "failed", catalog);
    const hidden = failed.lastAttempt!.objectives.filter((o) => o.hidden);
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.fate).toBeNull();
    const view = toExpeditionPlayerView(failed, "p1", catalog);
    const shown = view.lastCamp!.objectives.find((o) => o.objective.id === hidden[0]!.objective.id)!;
    expect(shown.objective).toEqual({ id: hidden[0]!.objective.id, kind: "hidden", ownerSeatId: hidden[0]!.objective.ownerSeatId, status: hidden[0]!.status });
    expect(shown.fate).toBeNull();
    for (const seatId of [...SEAT_IDS, "spectator"]) {
      const seen = toExpeditionPlayerView(failed, seatId, catalog);
      expect(checkExpeditionViewForLeaks({ view: seen, serialized: JSON.stringify(seen), secrets: secretsForExpeditionSeat(failed, seatId, catalog, failed.seed) })).toEqual([]);
    }
  });

  it("stays stored through the next deal, and a kick that restarts the camp clears it", () => {
    const four = ["p0", "p1", "p2", "p3"];
    const loadout = setupRun({ seatIds: four, seed: "kick-recap", catalog }) as RunAt<"loadout">;
    const failed = settleCamp(dealCamp(loadout, catalog), "failed", catalog);
    expect(failed.lastAttempt).not.toBeNull();
    const replay = readyAll(failed, catalog);
    expect(replay.stage.tag).toBe("camp");
    expect(replay.lastAttempt).toEqual(failed.lastAttempt);
    const kicked = kickSeat(replay, "p3", catalog);
    expect(kicked.history.at(-1)!.status).toBe("restarted");
    expect(kicked.lastAttempt).toBeNull();
  });
});

function readyAll(run: RunState, cat: Catalog): RunState {
  return run.seatIds.reduce((next, seatId) => {
    const result = applyRunAction(next, seatId, { type: "ready" }, cat);
    if (!result.ok) throw new Error(`${seatId} ready: ${result.error}`);
    return result.state;
  }, run);
}

describe("the recap in the per-seat view", () => {
  it("shows between camps, never in camp, and never a card still in a hand", () => {
    for (const location of ["jungle", "cave"]) {
      const { last, settled } = failedCamp(location);
      // Every card left in a hand once the camp settled.
      const final = last.stage.attempt.camp;
      const played = new Set((settled.lastAttempt!.lastTrick?.plays ?? []).map((p) => p.card.id));
      const unplayed = final.hands.flatMap((h) => h.cards.map((c) => c.id)).filter((id) => !played.has(id));
      expect(unplayed.length).toBeGreaterThan(0);
      for (const seatId of [...SEAT_IDS, "spectator"]) {
        const view = toExpeditionPlayerView(settled, seatId, catalog);
        expect(view.lastCamp).not.toBeNull();
        const json = JSON.stringify(view.lastCamp);
        for (const id of unplayed) expect(json).not.toContain(id);
        expect(json).not.toContain('"hands"');
        expect(checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets: secretsForExpeditionSeat(settled, seatId, catalog, settled.seed) })).toEqual([]);
      }
      // The next attempt is dealt: no recap on the table.
      const replay = readyAll(settled, catalog);
      expect(replay.stage.tag === "camp" || replay.stage.tag === "shop").toBe(true);
      if (replay.stage.tag === "camp") expect(toExpeditionPlayerView(replay, "p0", catalog).lastCamp).toBeNull();
    }
  });

  it("projects the final trick face up, its objectives with their holders and the supply cost parts", () => {
    const { settled } = failedCamp(undefined, { p1: ["energy-tonic"] });
    const recap = settled.lastAttempt!;
    const view = toExpeditionPlayerView(settled, "p0", catalog).lastCamp!;
    expect(view.status).toBe("failed");
    expect(view.lastTrick!.winnerSeatId).toBe(recap.lastTrick!.winnerSeatId);
    expect(view.lastTrick!.plays.map((p) => ({ seatId: p.seatId, id: p.card.id, effectiveRank: p.effectiveRank }))).toEqual(
      recap.lastTrick!.plays.map((p) => ({ seatId: p.seatId, id: p.card.id, effectiveRank: null })),
    );
    expect(view.objectives.map((o) => [o.objective.ownerSeatId, o.objective.status])).toEqual(recap.objectives.map((o) => [o.objective.ownerSeatId, o.status]));
    expect(view.supplyCost).toEqual([
      { origin: { kind: "base" }, amount: FAILURE_COST },
      { origin: { kind: "seat", seatId: "p1", sourceId: "energy-tonic" }, amount: 1 },
    ]);
    expect(attemptOf(settled)).toBeNull();
  });
});
