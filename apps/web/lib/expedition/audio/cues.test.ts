import { describe, expect, it } from "vitest";
import type { ExpeditionView } from "@games/rules";
import { cuesFor } from "./cues";

type Camp = NonNullable<NonNullable<ExpeditionView["attempt"]>["camp"]>;
type Obj = Camp["objectives"][number];

const club3 = { id: "c3", identity: { kind: "standard", suit: "clubs", rank: 3 } } as const;
const club4 = { id: "c4", identity: { kind: "standard", suit: "clubs", rank: 4 } } as const;

function objective(id: string, status: Obj["status"], ownerSeatId: string | null = null): Obj {
  return { id, kind: "no-tricks", ownerSeatId, status };
}

function camp(over: Partial<Camp> = {}): Camp {
  return {
    playerCount: 3,
    expeditionLeaderSeatId: "a",
    totalTricks: 10,
    removedCards: [],
    objectiveAssignment: "face-up",
    objectives: [objective("o1", "pending")],
    yourHand: [],
    yourLegalCardIds: [],
    handSizes: [],
    completedTricks: [],
    currentTrick: { index: 0, leaderSeatId: "a", plays: [] },
    campPhase: "playing",
    currentActorSeatId: "a",
    ...over,
  };
}

function game(over: Partial<ExpeditionView> = {}, campOver: Partial<Camp> = {}, log: ExpeditionView["attempt"] extends infer A ? (A extends { log: infer L } ? L : never) : never = []): ExpeditionView {
  return {
    yourSeatId: "a",
    runPhase: "camp",
    runStatus: "in_progress",
    campNumber: 1,
    supplies: 5,
    bossTwists: { camp3: null, camp6: null },
    activeBossTwistId: null,
    seats: [{ seatId: "a", equippedGearIds: [], ready: true, draftPending: false }],
    yourOwnedGearIds: [],
    yourDraftOffer: null,
    yourCapacity: 3,
    yourBaseCapacity: 3,
    yourGear: [],
    history: [],
    attempt: {
      attemptNumber: 1,
      bossCancelled: false,
      gearWindow: null,
      preDealPendingSeatIds: [],
      gearUses: [],
      effects: [],
      reveals: [],
      log,
      camp: camp(campOver),
    },
    ...over,
  };
}

describe("cuesFor", () => {
  it("is silent on the first snapshot", () => {
    expect(cuesFor(null, game())).toEqual([]);
  });

  it("is silent when nothing changed", () => {
    expect(cuesFor(game(), game())).toEqual([]);
  });

  it("plays card-play when a card joins the current trick", () => {
    const next = game({}, { currentTrick: { index: 0, leaderSeatId: "a", plays: [{ seatId: "a", card: club3 }] } });
    expect(cuesFor(game(), next)).toEqual(["sfx-card-play"]);
  });

  it("plays card-play once when the last card closes the trick", () => {
    const prev = game({}, { currentTrick: { index: 0, leaderSeatId: "a", plays: [{ seatId: "a", card: club3 }] } });
    const next = game({}, {
      completedTricks: [{ index: 0, leaderSeatId: "a", plays: [{ seatId: "a", card: club3 }, { seatId: "b", card: club4 }], winnerSeatId: "b" }],
      currentTrick: { index: 1, leaderSeatId: "b", plays: [] },
    });
    expect(cuesFor(prev, next)).toEqual(["sfx-card-play"]);
  });

  it("plays card-deal when a camp attempt begins, and again on a retry", () => {
    const pre = game({ runPhase: "pre-deal" });
    pre.attempt!.camp = null;
    expect(cuesFor(pre, game())).toEqual(["sfx-card-deal"]);

    const retry = game();
    retry.attempt!.attemptNumber = 2;
    expect(cuesFor(game(), retry)).toEqual(["sfx-card-deal"]);
  });

  it("plays objective-done and objective-failed on status transitions", () => {
    const prev = game({}, { objectives: [objective("o1", "pending"), objective("o2", "pending")] });
    expect(cuesFor(prev, game({}, { objectives: [objective("o1", "done"), objective("o2", "pending")] }))).toEqual(["sfx-objective-done"]);
    expect(cuesFor(prev, game({}, { objectives: [objective("o1", "pending"), objective("o2", "failed")] }))).toEqual(["sfx-objective-failed"]);
  });

  it("dedupes two objectives finishing in the same snapshot", () => {
    const prev = game({}, { objectives: [objective("o1", "pending"), objective("o2", "pending")] });
    const next = game({}, { objectives: [objective("o1", "done"), objective("o2", "done")] });
    expect(cuesFor(prev, next)).toEqual(["sfx-objective-done"]);
  });

  it("plays card-pick when an objective gains an owner", () => {
    const next = game({}, { objectives: [objective("o1", "pending", "a")] });
    expect(cuesFor(game(), next)).toEqual(["sfx-card-pick"]);
  });

  it("plays whisper and power for new log entries of those events", () => {
    const entry = (event: string) => ({ event, actorSeatId: "a", subjectSeatIds: ["b"], gearId: null, private: false });
    expect(cuesFor(game(), game({}, {}, [entry("whisper")]))).toEqual(["sfx-whisper"]);
    expect(cuesFor(game(), game({}, {}, [entry("use-gear")]))).toEqual(["sfx-power"]);
    const had = game({}, {}, [entry("whisper")]);
    expect(cuesFor(had, game({}, {}, [entry("whisper")]))).toEqual([]);
  });

  it("plays supply-lost when supplies drop and the camp is cleared in the same step", () => {
    const next = game({ supplies: 4, runPhase: "fireside", attempt: null, history: [{ campNumber: 1, attemptNumber: 1, status: "succeeded", suppliesSpent: 1 }] });
    expect(cuesFor(game(), next)).toEqual(["sfx-supply-lost", "sfx-camp-cleared"]);
  });

  it("plays run-lost when the run is lost", () => {
    expect(cuesFor(game(), game({ runStatus: "lost", runPhase: "ended" }))).toEqual(["sfx-run-lost"]);
  });

  it("plays equip when a draft pick adds gear or the own loadout changes at the fireside", () => {
    const fireside = (owned: string[], equipped: string[]) =>
      game({ runPhase: "fireside", yourOwnedGearIds: owned, seats: [{ seatId: "a", equippedGearIds: equipped, ready: false, draftPending: false }] });
    expect(cuesFor(fireside([], []), fireside(["peek"], []))).toEqual(["sfx-equip"]);
    expect(cuesFor(fireside(["peek"], []), fireside(["peek"], ["peek"]))).toEqual(["sfx-equip"]);
    expect(cuesFor(fireside(["peek"], []), fireside(["peek"], []))).toEqual([]);
  });
});
