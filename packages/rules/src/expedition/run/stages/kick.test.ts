import { describe, expect, it } from "vitest";
import { currentActorSeatId } from "../../camp";
import { defineItem, itemAbility } from "../../content/source-def";
import { absentSeatAction } from "../absent";
import { attemptOf, withAttempt } from "../attempt";
import { CATALOG } from "../catalog";
import { rulesFor } from "../compose";
import { createRun, dealCamp, settleCamp } from "../lifecycle";
import { advanceTo, setupRun, testCatalog } from "../run-test-support";
import type { Catalog, RunAction, RunAt, RunState } from "../types";
import { currentWindow } from "../windows";
import { canKick, kickSeat, seatPresence } from "./kick";
import { applyRunAction } from "./registry";

const FOUR = ["p0", "p1", "p2", "p3"];
const catalog = testCatalog();

function act(run: RunState, seatId: string, action: RunAction, cat: Catalog = catalog): RunState {
  const result = applyRunAction(run, seatId, action, cat);
  if (!result.ok) throw new Error(`${seatId} ${action.type}: ${result.error}`);
  return result.state;
}

function readyAll(run: RunState, seatIds: readonly string[] = run.seatIds, cat: Catalog = catalog): RunState {
  return seatIds.reduce((next, seatId) => act(next, seatId, { type: "ready" }, cat), run);
}

function playCard(run: RunState, cat: Catalog = catalog): RunState {
  const camp = attemptOf(run)!.camp;
  const rules = rulesFor(run, cat);
  const actor = currentActorSeatId(camp, rules)!;
  return act(run, actor, { type: "play-card", cardId: rules.legalPlays(camp, actor)[0]!.id }, cat);
}

/** A dealt camp whose objectives are all gone, so it settles as cleared. */
function clearCamp(run: RunState, cat: Catalog): RunState {
  const dealt = dealCamp(run as RunAt<"loadout">, cat);
  const cleared = withAttempt(dealt, { ...dealt.stage.attempt, camp: { ...dealt.stage.attempt.camp, objectives: [] } }) as RunAt<"camp">;
  return settleCamp(cleared, "cleared", cat);
}

describe("canKick", () => {
  it("allows a kick only while the crew is above three and the run goes on", () => {
    const four = setupRun({ seatIds: FOUR, seed: "kick", catalog });
    expect(canKick(four, "p3")).toBe(true);
    expect(canKick(four, "nobody")).toBe(false);
    const three = kickSeat(four, "p3", catalog);
    expect(three.seatIds).toEqual(["p0", "p1", "p2"]);
    expect(canKick(three, "p0")).toBe(false);
    expect(canKick({ ...four, stage: { tag: "ended", result: "lost" } }, "p3")).toBe(false);
  });

  it("throws when asked to kick below the minimum crew", () => {
    const three = setupRun({ seatIds: ["p0", "p1", "p2"], seed: "kick", catalog });
    expect(() => kickSeat(three, "p2", catalog)).toThrow("p2 cannot be kicked now");
  });
});

describe("a kick at each stage", () => {
  it("muster: the vote resolves without the seat, and its character stays reserved", () => {
    let run = act(createRun({ seatIds: FOUR, seed: "muster-kick" }), "p3", { type: "pick-character", characterId: "plain-1" });
    expect(applyRunAction(run, "p0", { type: "pick-character", characterId: "plain-1" }, catalog)).toEqual({ ok: false, error: "character_taken" });
    for (const [seatId, characterId] of [["p0", "plain-2"], ["p1", "plain-3"], ["p2", "plain-4"]] as const) {
      run = act(run, seatId, { type: "pick-character", characterId });
      run = act(run, seatId, { type: "vote", choice: "short" });
    }
    expect(run.stage.tag).toBe("muster");
    const kicked = kickSeat(run, "p3", catalog);
    expect(kicked.stage.tag).toBe("loadout");
    expect(kicked.plan?.length).toBe("short");
    expect(kicked.seatIds).toEqual(["p0", "p1", "p2"]);
    expect(kicked.kicked).toEqual([{ seat: { seatId: "p3", characterId: "plain-1", upgradeId: null, items: [], equipped: [], offers: [], ledger: [] }, position: 3, back: false }]);
  });

  it("muster: a kicked seat with no ballot unblocks the vote at once", () => {
    let run = createRun({ seatIds: FOUR, seed: "muster-kick" });
    for (const [seatId, characterId] of [["p0", "plain-2"], ["p1", "plain-3"], ["p2", "plain-4"]] as const) {
      run = act(run, seatId, { type: "pick-character", characterId });
      run = act(run, seatId, { type: "vote", choice: "standard" });
    }
    expect(run.stage.tag).toBe("muster");
    expect(kickSeat(run, "p3", catalog).stage.tag).toBe("loadout");
  });

  it("loadout: the ready mark goes, and the last ready seat's deal is for the crew left", () => {
    const run = readyAll(setupRun({ seatIds: FOUR, seed: "loadout-kick", catalog }), ["p0", "p1", "p2"]);
    expect(run.stage.tag).toBe("loadout");
    const kicked = kickSeat(run, "p3", catalog);
    expect(kicked.stage.tag).toBe("camp");
    const camp = attemptOf(kicked)!.camp;
    expect(camp.seatIds).toEqual(["p0", "p1", "p2"]);
    expect(camp.playerCount).toBe(3);
    expect(camp.hands.map((hand) => hand.cards.length)).toEqual([camp.totalTricks, camp.totalTricks, camp.totalTricks]);
    expect(kicked.history).toEqual([]);
  });

  it("camp, mid-trick: the attempt is abandoned for nothing and the same camp's loadout reopens", () => {
    const playing = playCard(advanceTo(setupRun({ seatIds: FOUR, seed: "camp-kick", catalog, supplies: 2, purse: 7 }), "between-tricks", catalog));
    expect(attemptOf(playing)!.camp.currentTrick.plays).toHaveLength(1);
    const kicked = kickSeat(playing, "p2", catalog);
    expect(kicked.stage.tag).toBe("loadout");
    expect(kicked.stage.tag === "loadout" ? kicked.stage.camp : null).toEqual(playing.stage.tag === "camp" ? playing.stage.camp : null);
    expect(kicked.supplies).toBe(2);
    expect(kicked.purse).toBe(7);
    expect(kicked.history).toEqual([{ camp: 1, attempt: 1, location: "jungle", weather: "fair", status: "restarted", suppliesSpent: 0, coins: 0 }]);
    const redealt = readyAll(kicked);
    expect(attemptOf(redealt)!.attemptNumber).toBe(2);
    expect(attemptOf(redealt)!.camp.seatIds).toEqual(["p0", "p1", "p3"]);
  });

  it("camp, in rescue: the rescue is dropped with the attempt", () => {
    const rope = defineItem({
      id: "test-rope",
      name: "Test Rope",
      rarity: "common",
      price: 2,
      uses: { kind: "single-use" },
      text: "Drop a failed objective.",
      active: itemAbility({ window: "rescue", targets: [{ kind: "failed-objective" }], apply: (ctx) => [{ op: "remove-objective", objectiveId: ctx.targets[0].objective.id }] }),
    });
    const ropeCatalog = testCatalog({ items: { "test-rope": rope } });
    const between = advanceTo(setupRun({ seatIds: FOUR, seed: "rescue-kick", catalog: ropeCatalog, items: { p0: ["test-rope"] } }), "between-tricks", ropeCatalog);
    const attempt = attemptOf(between)!;
    const ducking = withAttempt(between, { ...attempt, camp: { ...attempt.camp, objectives: attempt.camp.seatIds.map((seatId) => ({ id: `duck-${seatId}`, kind: "no-tricks" as const, ownerSeatId: seatId })) } });
    const paused = ducking.seatIds.reduce((next) => playCard(next, ropeCatalog), ducking);
    expect(currentWindow(paused, rulesFor(paused, ropeCatalog))).toBe("rescue");
    const kicked = kickSeat(paused, "p3", ropeCatalog);
    expect(kicked.stage.tag).toBe("loadout");
    expect(kicked.supplies).toBe(3);
    expect(kicked.history).toEqual([{ camp: 1, attempt: 1, location: "jungle", weather: "fair", status: "restarted", suppliesSpent: 0, coins: 0 }]);
    expect(kicked.seats[0]!.items).toEqual([{ uid: "it0", itemId: "test-rope" }]);
  });

  it("draft: the seat's unpicked offer goes with it, and the draft ends when the rest have picked", () => {
    const drafting = clearCamp(setupRun({ seatIds: FOUR, seed: "draft-kick", catalog: CATALOG }), CATALOG);
    expect(drafting.stage.tag).toBe("draft");
    const picked = ["p0", "p1", "p2"].reduce((next, seatId) => act(next, seatId, { type: "pick-bundle", bundle: 0 }, CATALOG), drafting);
    expect(picked.stage.tag).toBe("draft");
    const kicked = kickSeat(picked, "p3", CATALOG);
    expect(kicked.stage.tag).toBe("route");
    expect(kicked.kicked[0]!.seat.offers).toEqual([]);
  });

  it("route and event: the ballot or ready mark goes and the stage resolves without it", () => {
    const five = [...FOUR, "p4"];
    const drafting = clearCamp(setupRun({ seatIds: five, seed: "route-kick", catalog: CATALOG }), CATALOG);
    const routing = five.reduce((next, seatId) => act(next, seatId, { type: "pick-bundle", bundle: 0 }, CATALOG), drafting);
    expect(routing.stage.tag).toBe("route");
    const voted = ["p0", "p1", "p3", "p4"].reduce((next, seatId) => act(next, seatId, { type: "vote", choice: "a" }, CATALOG), routing);
    const atEvent = kickSeat(voted, "p2", CATALOG);
    expect(atEvent.stage.tag).toBe("event");
    expect(atEvent.lastVote?.result.tally.find((entry) => entry.choice === "a")?.votes).toBe(4);
    const ready = ["p0", "p1", "p3"].reduce((next, seatId) => act(next, seatId, { type: "ready" }, CATALOG), atEvent);
    const loadout = kickSeat(ready, "p4", CATALOG);
    expect(loadout.stage.tag).toBe("loadout");
    expect(loadout.seatIds).toEqual(["p0", "p1", "p3"]);
  });

  it("the ended run takes no kicks", () => {
    const ended: RunState = { ...setupRun({ seatIds: FOUR, seed: "end", catalog }), stage: { tag: "ended", result: "won" } };
    expect(canKick(ended, "p0")).toBe(false);
  });
});

describe("every per-player rule reads the crew in play", () => {
  it("a kick from five deals a four-player deck and Rain washes 4 - 2 whispers", () => {
    const five = ["p0", "p1", "p2", "p3", "p4"];
    const base = setupRun({ seatIds: five, seed: "rain-kick", catalog: CATALOG, camp: 2 }) as RunAt<"loadout">;
    const rainy: RunState = { ...base, stage: { ...base.stage, camp: { ...base.stage.camp, location: "jungle", weather: "rain" } } };
    const dealt = readyAll(rainy, rainy.seatIds, CATALOG);
    expect(rulesFor(dealt, CATALOG).washedWhispers(dealt)).toBe(3);
    const kicked = readyAll(kickSeat(dealt, "p4", CATALOG), ["p0", "p1", "p2", "p3"], CATALOG);
    const camp = attemptOf(kicked)!.camp;
    expect(camp.playerCount).toBe(4);
    expect(camp.hands.map((hand) => hand.seatId)).toEqual(["p0", "p1", "p2", "p3"]);
    expect(rulesFor(kicked, CATALOG).washedWhispers(kicked)).toBe(2);
  });

  it("a kicked seat is not a seat: it cannot act and the room never auto-passes for it", () => {
    const run = kickSeat(setupRun({ seatIds: FOUR, seed: "gone", catalog }), "p1", catalog);
    expect(applyRunAction(run, "p1", { type: "ready" }, catalog)).toEqual({ ok: false, error: "not_a_seat" });
    expect(absentSeatAction(run, "p1", catalog)).toBeNull();
  });

  it("the absent-seat pass never picks a kicked seat's character", () => {
    let run = createRun({ seatIds: [...FOUR, "p4"], seed: "free" });
    run = act(run, "p4", { type: "pick-character", characterId: "plain-1" });
    run = kickSeat(run, "p4", catalog);
    expect(absentSeatAction(run, "p0", catalog)).toEqual({ type: "pick-character", characterId: "plain-2" });
  });
});

describe("a kicked seat coming back", () => {
  const loadout = () => setupRun({ seatIds: FOUR, seed: "back", catalog: CATALOG, items: { p2: ["parrot", "bait", "whetstone"] }, upgrades: {} });

  it("waits out the camp and rejoins at the next loadout with its exact seat", () => {
    const start = loadout();
    const before = start.seats[2]!;
    const playing = playCard(advanceTo(start, "between-tricks", CATALOG), CATALOG);
    const kicked = kickSeat(playing, "p2", CATALOG);
    const dealtWithout = readyAll(kicked, kicked.seatIds, CATALOG);
    const back = seatPresence(dealtWithout, "p2", true, CATALOG);
    expect(back.seatIds).toEqual(["p0", "p1", "p3"]);
    expect(back.kicked).toEqual([{ seat: before, position: 2, back: true }]);
    const failed = settleCamp(back as RunAt<"camp">, "failed", CATALOG);
    expect(failed.stage.tag).toBe("loadout");
    expect(failed.seatIds).toEqual(["p0", "p1", "p2", "p3"]);
    expect(failed.seats[2]).toEqual(before);
    expect(failed.kicked).toEqual([]);
  });

  it("rejoins at once while a loadout is open, and the loadout then waits for it", () => {
    const kicked = kickSeat(loadout(), "p2", CATALOG);
    const back = seatPresence(kicked, "p2", true, CATALOG);
    expect(back.seatIds).toEqual(["p0", "p1", "p2", "p3"]);
    const others = readyAll(back, ["p0", "p1", "p3"], CATALOG);
    expect(others.stage.tag).toBe("loadout");
    expect(readyAll(others, ["p2"], CATALOG).stage.tag).toBe("camp");
  });

  it("stays out if it drops again before the next loadout opens", () => {
    const kicked = kickSeat(advanceTo(loadout(), "objective-pick", CATALOG), "p2", CATALOG);
    const redealt = readyAll(kicked, kicked.seatIds, CATALOG);
    const flaky = seatPresence(seatPresence(redealt, "p2", true, CATALOG), "p2", false, CATALOG);
    expect(flaky.kicked.map((k) => k.back)).toEqual([false]);
    const next = settleCamp(flaky as RunAt<"camp">, "failed", CATALOG);
    expect(next.seatIds).toEqual(["p0", "p1", "p3"]);
  });

  it("a seat kicked before it picked a character takes the first free one when it rejoins after the muster", () => {
    let run = createRun({ seatIds: FOUR, seed: "late" });
    for (const [seatId, characterId] of [["p0", "plain-1"], ["p1", "plain-3"], ["p2", "plain-4"]] as const) {
      run = act(run, seatId, { type: "pick-character", characterId });
      run = act(run, seatId, { type: "vote", choice: "short" });
    }
    const atCamp = readyAll(kickSeat(run, "p3", catalog));
    expect(atCamp.stage.tag).toBe("camp");
    const back = settleCamp(seatPresence(atCamp, "p3", true, catalog) as RunAt<"camp">, "failed", catalog);
    expect(back.seats.map((seat) => [seat.seatId, seat.characterId])).toEqual([
      ["p0", "plain-1"],
      ["p1", "plain-3"],
      ["p2", "plain-4"],
      ["p3", "plain-2"],
    ]);
  });

  it("rejoins the muster at once, with no ballot", () => {
    const run = act(createRun({ seatIds: FOUR, seed: "m" }), "p0", { type: "vote", choice: "short" });
    const back = seatPresence(kickSeat(run, "p3", catalog), "p3", true, catalog);
    expect(back.stage).toEqual({ tag: "muster", ballots: { p0: "short" } });
    expect(back.seatIds).toEqual(FOUR);
  });

  it("presence of a seat in the crew changes nothing", () => {
    const run = loadout();
    expect(seatPresence(run, "p1", true, CATALOG)).toBe(run);
    expect(seatPresence(run, "p1", false, CATALOG)).toBe(run);
  });
});
