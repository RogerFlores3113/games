import { describe, expect, it } from "vitest";
import { CATALOG } from "../run/catalog";
import { createRun, runStatus } from "../run/lifecycle";
import { campIndex } from "../run/plan";
import { campSpecAt } from "../run/route";
import { applyRunAction } from "../run/stages/registry";
import type { RunAt, RunState } from "../run/types";
import type { CardIdentity, ExpeditionCard } from "../state";
import { toExpeditionPlayerView } from "../adapter/view";
import { botMove } from "./autoplay";
import { DEV_SHORTCUTS } from "./shortcuts";

function playOut(seatIds: readonly string[]): RunState {
  let run = createRun({ seatIds, seed: "autoplay" });
  for (let step = 0; step < 5000 && runStatus(run) === "in_progress"; step++) {
    const move = botMove(run, seatIds, CATALOG);
    if (move === null) throw new Error(`bot stalled at step ${step}`);
    const result = applyRunAction(run, move.seatId, move.request, CATALOG);
    if (!result.ok) throw new Error(`bot move rejected: ${result.error}`);
    run = result.state;
  }
  return run;
}

const crewed = (): RunState => {
  const muster = createRun({ seatIds: ["a", "b", "c"], seed: "autoplay" });
  return { ...muster, seats: muster.seats.map((seat, i) => ({ ...seat, characterId: ["explorer", "jd", "leader"][i]! })) };
};

describe("botMove", () => {
  it("plays a 3-player run to its end", () => {
    expect(runStatus(playOut(["a", "b", "c"]))).not.toBe("in_progress");
  });

  it("plays a 5-player run to its end", () => {
    expect(runStatus(playOut(["a", "b", "c", "d", "e"]))).not.toBe("in_progress");
  });

  it("at muster, picks a free character first and then abstains from the length vote", () => {
    const muster = createRun({ seatIds: ["a", "b", "c"], seed: "autoplay" });
    expect(botMove(muster, ["a"], CATALOG)).toEqual({ seatId: "a", request: { type: "pick-character", characterId: Object.keys(CATALOG.characters)[0]! } });
    expect(botMove(crewed(), ["b"], CATALOG)).toEqual({ seatId: "b", request: { type: "vote", choice: null } });
    const voted: RunState = { ...crewed(), stage: { tag: "muster", ballots: { a: "long", b: null } } };
    expect(botMove(voted, ["a", "b"], CATALOG)).toBeNull();
  });

  it("on a route, abstains until the seat has a ballot", () => {
    const spec = campSpecAt("autoplay", "standard", campIndex(2), CATALOG);
    const route: RunState = {
      ...DEV_SHORTCUTS["jump-to-camp"].apply(crewed(), { length: "standard", camp: 1, stage: "loadout" }, CATALOG),
      stage: { tag: "route", from: campIndex(1), options: [{ id: "a", next: spec, reroll: 0, swapBoss: null }, { id: "b", next: spec, reroll: 0, swapBoss: null }], ballots: { a: "a" } },
    };
    expect(botMove(route, ["a"], CATALOG)).toBeNull();
    expect(botMove(route, ["a", "c"], CATALOG)).toEqual({ seatId: "c", request: { type: "vote", choice: null } });
  });

  it("returns null at the loadout when only already-ready seats are controlled", () => {
    const loadout = DEV_SHORTCUTS["jump-to-camp"].apply(crewed(), { length: "standard", camp: 1, stage: "loadout" }, CATALOG);
    const run: RunState = { ...loadout, stage: { ...(loadout.stage as Extract<RunState["stage"], { tag: "loadout" }>), ready: { b: true, c: true } } };
    expect(botMove(run, ["b", "c"], CATALOG)).toBeNull();
    expect(botMove(run, ["a"], CATALOG)).toEqual({ seatId: "a", request: { type: "ready" } });
  });

  it("readies in the event between camps", () => {
    const loadout = DEV_SHORTCUTS["jump-to-camp"].apply(crewed(), { length: "standard", camp: 2, stage: "loadout" }, CATALOG);
    const next = (loadout.stage as Extract<RunState["stage"], { tag: "loadout" }>).camp;
    const event: RunState = { ...loadout, stage: { tag: "event", route: { id: "a", next, reroll: 0, swapBoss: null }, ready: { a: true } } };
    expect(botMove(event, ["a"], CATALOG)).toBeNull();
    expect(botMove(event, ["a", "b"], CATALOG)).toEqual({ seatId: "b", request: { type: "ready" } });
  });
});

describe("botMove at the temple", () => {
  type Camp = RunAt<"camp">;
  const club: ExpeditionCard = { id: "c4", identity: { kind: "standard", suit: "clubs", rank: 4 } as CardIdentity };
  const spade: ExpeditionCard = { id: "s9", identity: { kind: "standard", suit: "spades", rank: 9 } as CardIdentity };
  const sun: ExpeditionCard = { id: "sun", identity: { kind: "joker", joker: "sun" } };

  /** The Short temple with every objective taken, `cards` in the leader's
   * hand and the path's next plate read back. */
  function temple(cards: readonly ExpeditionCard[]): { run: Camp; leader: string; next: string } {
    const run = DEV_SHORTCUTS["jump-to-camp"].apply(crewed(), { length: "short", camp: 4, stage: "camp" }, CATALOG) as Camp;
    const camp = run.stage.attempt.camp;
    const leader = camp.currentTrick.leaderSeatId;
    const objectives = camp.objectives.map((o) => ({ ...o, ownerSeatId: leader }));
    const hands = camp.hands.map((h) => (h.seatId === leader ? { ...h, cards } : h));
    const next: Camp = { ...run, stage: { ...run.stage, attempt: { ...run.stage.attempt, camp: { ...camp, objectives, hands } } } };
    const path = toExpeditionPlayerView(next, leader, CATALOG).stage;
    const plates = path.tag === "camp" ? path.mods.find((m) => m.id === "temple")!.status[0] : undefined;
    return { run: next, leader, next: plates?.kind === "path" ? String(plates.plates[plates.pressed]) : "" };
  }

  it("leads the next plate's suit before any other card, and holds the Sun back", () => {
    const { run, leader, next } = temple([sun, spade, club]);
    expect(next).toBe("clubs");
    expect(botMove(run, [leader], CATALOG)).toEqual({ seatId: leader, request: { type: "play-card", cardId: "c4" } });
    const noClubs = temple([sun, spade]);
    expect(botMove(noClubs.run, [noClubs.leader], CATALOG)).toEqual({ seatId: noClubs.leader, request: { type: "play-card", cardId: "s9" } });
  });
});

describe("the earthquake e2e's fixed seed", () => {
  /** Long camp 6 under the Earthquake, played by autoplay for every seat
   * until the quake or a settle. Returns the step the quake struck at. */
  const quakeStep = (seed: string, seatIds: readonly string[]): number | null => {
    let run: RunState = createRun({ seatIds, seed });
    run = DEV_SHORTCUTS["jump-to-camp"].apply(run, { length: "long", camp: 6, stage: "camp" }, CATALOG);
    run = DEV_SHORTCUTS["set-plan-boss"].apply(run, { camp: "6", boss: "earthquake" }, CATALOG);
    for (let step = 0; step < 200 && run.stage.tag === "camp"; step++) {
      if (run.stage.attempt.log.some((entry) => entry.event === "quake")) return step;
      const move = botMove(run, seatIds, CATALOG);
      if (move === null) return null;
      const result = applyRunAction(run, move.seatId, move.request, CATALOG);
      if (!result.ok) return null;
      run = result.state;
    }
    return null;
  };

  it("reaches the quake under autoplay whatever the seat ids are", () => {
    expect(quakeStep("quake-8", ["h", "b1", "b2"])).toBe(31);
    expect(quakeStep("quake-8", ["V3kq", "aa0", "Zt7"])).toBe(31);
  });
});
