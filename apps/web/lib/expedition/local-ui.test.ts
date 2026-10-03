import { describe, expect, it } from "vitest";
import type { ExpeditionView } from "@games/rules";
import {
  beginGearTargeting,
  beginWhisper,
  cancelTargeting,
  candidateIdsForKind,
  confirmTargeting,
  initialLocalUi,
  nextTargetKind,
  reconcileLocalUi,
  selectTarget,
  setHoveredCard,
  setLastTrickOpen,
  setTooltipGear,
  setTooltipMateGear,
  setTooltipObjective,
  type LocalUiState,
} from "./local-ui";

function makeView(overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  const base: ExpeditionView = {
    yourSeatId: "p0",
    runPhase: "camp",
    runStatus: "in_progress",
    campNumber: 1,
    supplies: 3,
    bossTwists: { camp3: null, camp6: null },
    activeBossTwistId: null,
    seats: [
      { seatId: "p0", equippedGearIds: ["peek", "pickpocket"], ready: true, draftPending: false },
      { seatId: "p1", equippedGearIds: [], ready: true, draftPending: false },
      { seatId: "p2", equippedGearIds: [], ready: true, draftPending: false },
    ],
    yourOwnedGearIds: ["peek", "pickpocket", "broadcast"],
    yourDraftOffer: null,
    yourCapacity: 3,
    yourBaseCapacity: 3,
    yourGear: [
      { gearId: "peek", spent: false, usableNow: true, reason: null },
      { gearId: "pickpocket", spent: false, usableNow: true, reason: null },
      { gearId: "broadcast", spent: false, usableNow: true, reason: null },
    ],
    history: [],
    attempt: {
      attemptNumber: 1,
      bossCancelled: false,
      gearWindow: "between-tricks",
      preDealPendingSeatIds: [],
      gearUses: [],
      effects: [],
      reveals: [],
      log: [],
      yourWhisper: { allowed: true, left: 1 },
      camp: {
        playerCount: 3,
        expeditionLeaderSeatId: "p0",
        totalTricks: 5,
        removedCards: [],
        objectiveAssignment: "face-up",
        objectives: [
          { id: "o1", kind: "no-tricks", ownerSeatId: null, status: "pending" },
          { id: "o2", kind: "no-tricks", ownerSeatId: "p0", status: "pending" },
          { id: "o3", kind: "no-tricks", ownerSeatId: "p0", status: "done" },
        ],
        yourHand: [
          { id: "c1", identity: { kind: "standard", suit: "hearts", rank: 12 } },
          { id: "c2", identity: { kind: "standard", suit: "spades", rank: 10 } },
        ],
        yourLegalCardIds: ["c1", "c2"],
        handSizes: [
          { seatId: "p0", size: 2 },
          { seatId: "p1", size: 2 },
          { seatId: "p2", size: 2 },
        ],
        completedTricks: [],
        currentTrick: { index: 0, leaderSeatId: "p0", plays: [] },
        campPhase: "playing",
        currentActorSeatId: "p0",
      },
    },
  };
  return deepFreeze({ ...base, ...overrides });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function freeze(ui: LocalUiState): LocalUiState {
  return deepFreeze(ui);
}

describe("initialLocalUi", () => {
  it("starts with no targeting, hover, open last trick, or tooltip", () => {
    expect(initialLocalUi()).toEqual({
      targeting: null,
      hoveredCardId: null,
      lastTrickOpen: false,
      tooltipGearId: null,
      tooltipObjectiveId: null,
      tooltipMateGear: null,
      drag: { phase: "idle" },
    });
  });
});

describe("beginGearTargeting", () => {
  it("is a no-op when the gear is unusable", () => {
    const view = makeView({
      yourGear: [{ gearId: "peek", spent: false, usableNow: false, reason: "Already used this camp" }],
    });
    const ui = freeze(initialLocalUi());
    expect(beginGearTargeting(ui, view, "peek")).toBe(ui);
  });

  it("is a no-op when the gear is absent from yourGear", () => {
    const view = makeView({ yourGear: [] });
    const ui = freeze(initialLocalUi());
    expect(beginGearTargeting(ui, view, "peek")).toBe(ui);
  });

  it("begins targeting peek with an empty selection; next kind is teammate", () => {
    const view = makeView();
    const ui = freeze(initialLocalUi());
    const next = beginGearTargeting(ui, view, "peek");
    expect(next.targeting).toEqual({ mode: "gear", gearId: "peek", selected: [] });
    expect(nextTargetKind(next)).toBe("teammate");
  });

  it("broadcast (no targets): next kind is null immediately", () => {
    const view = makeView();
    const ui = freeze(initialLocalUi());
    const next = beginGearTargeting(ui, view, "broadcast");
    expect(nextTargetKind(next)).toBeNull();
  });
});

describe("selectTarget", () => {
  it("selecting the viewer's own seat while next kind is teammate is a no-op", () => {
    const view = makeView();
    const started = beginGearTargeting(freeze(initialLocalUi()), view, "peek");
    const frozen = freeze(started);
    const next = selectTarget(frozen, view, "p0");
    expect(next).toBe(frozen);
  });

  it("selecting another seat sets selected and clears the next kind", () => {
    const view = makeView();
    const started = beginGearTargeting(freeze(initialLocalUi()), view, "peek");
    const next = selectTarget(freeze(started), view, "p1");
    expect(next.targeting).toEqual({ mode: "gear", gearId: "peek", selected: ["p1"] });
    expect(nextTargetKind(next)).toBeNull();
  });

  it("pickpocket: first select must be a teammate, second an own-hand card, ordered [seatId, cardId]", () => {
    const view = makeView();
    let ui = freeze(beginGearTargeting(freeze(initialLocalUi()), view, "pickpocket"));
    expect(nextTargetKind(ui)).toBe("teammate");

    // a card id is not a legal teammate target: no-op
    const rejected = selectTarget(ui, view, "c1");
    expect(rejected).toBe(ui);

    ui = freeze(selectTarget(ui, view, "p1"));
    expect(nextTargetKind(ui)).toBe("own-card");

    ui = freeze(selectTarget(ui, view, "c1"));
    expect(ui.targeting).toEqual({ mode: "gear", gearId: "pickpocket", selected: ["p1", "c1"] });
    expect(nextTargetKind(ui)).toBeNull();
  });
});

describe("confirmTargeting", () => {
  it("before all targets selected: request is null, ui is unchanged", () => {
    const view = makeView();
    const started = freeze(beginGearTargeting(freeze(initialLocalUi()), view, "peek"));
    const { ui, request } = confirmTargeting(started);
    expect(request).toBeNull();
    expect(ui).toBe(started);
  });

  it("after all targets selected: emits use-gear with exactly type/gearId/targets, clears targeting", () => {
    const view = makeView();
    let ui = freeze(beginGearTargeting(freeze(initialLocalUi()), view, "peek"));
    ui = freeze(selectTarget(ui, view, "p1"));
    const { ui: nextUi, request } = confirmTargeting(ui);
    expect(request).toEqual({ type: "use-gear", gearId: "peek", targets: ["p1"] });
    expect(Object.keys(request!).sort()).toEqual(["gearId", "targets", "type"]);
    expect(nextUi.targeting).toBeNull();
  });

  it("broadcast (no targets): confirms immediately to use-gear with targets: []", () => {
    const view = makeView();
    const started = freeze(beginGearTargeting(freeze(initialLocalUi()), view, "broadcast"));
    const { ui, request } = confirmTargeting(started);
    expect(request).toEqual({ type: "use-gear", gearId: "broadcast", targets: [] });
    expect(ui.targeting).toBeNull();
  });

  it("whisper: emits {type, targetSeatId, cardId} with exactly those three keys", () => {
    const view = makeView();
    let ui = freeze(beginWhisper(freeze(initialLocalUi()), view));
    ui = freeze(selectTarget(ui, view, "c1"));
    ui = freeze(selectTarget(ui, view, "p1"));
    const { ui: nextUi, request } = confirmTargeting(ui);
    expect(request).toEqual({ type: "whisper", targetSeatId: "p1", cardId: "c1" });
    expect(Object.keys(request!).sort()).toEqual(["cardId", "targetSeatId", "type"]);
    expect(nextUi.targeting).toBeNull();
  });
});

describe("beginWhisper", () => {
  it("next kind is own-card then teammate", () => {
    const view = makeView();
    let ui = freeze(beginWhisper(freeze(initialLocalUi()), view));
    expect(nextTargetKind(ui)).toBe("own-card");
    ui = freeze(selectTarget(ui, view, "c1"));
    expect(nextTargetKind(ui)).toBe("teammate");
  });

  it("is a no-op outside the between-tricks window", () => {
    const view = makeView({
      attempt: {
        ...makeView().attempt!,
        gearWindow: "objective-pick",
      },
    });
    const ui = freeze(initialLocalUi());
    expect(beginWhisper(ui, view)).toBe(ui);
  });

  it("is a no-op with no seat", () => {
    const view = makeView({ yourSeatId: null });
    const ui = freeze(initialLocalUi());
    expect(beginWhisper(ui, view)).toBe(ui);
  });
});

describe("candidateIdsForKind", () => {
  it("face-up-objective returns only objectives with ownerSeatId null", () => {
    const view = makeView();
    expect(candidateIdsForKind("face-up-objective", view)).toEqual(["o1"]);
  });

  it("own-objective returns only owned-by-viewer pending objectives", () => {
    const view = makeView();
    expect(candidateIdsForKind("own-objective", view)).toEqual(["o2"]);
  });

  it("teammate reads view.seats even when attempt.camp is null", () => {
    const view = makeView({ attempt: null });
    expect(candidateIdsForKind("teammate", view)).toEqual(["p1", "p2"]);
  });

  it("own-card/face-up-objective/own-objective return [] when attempt.camp is null", () => {
    const view = makeView({ attempt: null });
    expect(candidateIdsForKind("own-card", view)).toEqual([]);
    expect(candidateIdsForKind("face-up-objective", view)).toEqual([]);
    expect(candidateIdsForKind("own-objective", view)).toEqual([]);
  });
});

describe("cancelTargeting", () => {
  it("clears targeting only, leaving hover/lastTrickOpen untouched", () => {
    const view = makeView();
    let ui = freeze(beginGearTargeting(freeze(initialLocalUi()), view, "peek"));
    ui = freeze(setHoveredCard(ui, "c1"));
    ui = freeze(setLastTrickOpen(ui, true));
    const next = cancelTargeting(ui);
    expect(next.targeting).toBeNull();
    expect(next.hoveredCardId).toBe("c1");
    expect(next.lastTrickOpen).toBe(true);
  });
});

describe("reconcileLocalUi", () => {
  it("clears a gear targeting whose gear is no longer usableNow", () => {
    const view1 = makeView();
    let ui = freeze(beginGearTargeting(freeze(initialLocalUi()), view1, "peek"));
    const view2 = makeView({
      yourGear: [{ gearId: "peek", spent: true, usableNow: false, reason: "Already used this camp" }],
    });
    ui = reconcileLocalUi(ui, view2);
    expect(ui.targeting).toBeNull();
  });

  it("clears a whisper targeting when attempt.gearWindow is no longer between-tricks", () => {
    const view1 = makeView();
    let ui = freeze(beginWhisper(freeze(initialLocalUi()), view1));
    const view2 = makeView({ attempt: { ...view1.attempt!, gearWindow: "objective-pick" } });
    ui = reconcileLocalUi(ui, view2);
    expect(ui.targeting).toBeNull();
  });

  it("drops a selected own-card id no longer in hand (pickpocket second target)", () => {
    const view1 = makeView();
    let ui = freeze(beginGearTargeting(freeze(initialLocalUi()), view1, "pickpocket"));
    ui = freeze(selectTarget(ui, view1, "p1"));
    ui = freeze(selectTarget(ui, view1, "c1"));
    expect(ui.targeting).toEqual({ mode: "gear", gearId: "pickpocket", selected: ["p1", "c1"] });

    const view2 = makeView({
      attempt: {
        ...view1.attempt!,
        camp: { ...view1.attempt!.camp!, yourHand: [{ id: "c2", identity: { kind: "standard", suit: "spades", rank: 10 } }] },
      },
    });
    const next = reconcileLocalUi(ui, view2);
    expect(next.targeting).toEqual({ mode: "gear", gearId: "pickpocket", selected: ["p1"] });
  });

  it("clears hoveredCardId if that card left the hand", () => {
    const view1 = makeView();
    let ui = freeze(setHoveredCard(freeze(initialLocalUi()), "c1"));
    const view2 = makeView({
      attempt: {
        ...view1.attempt!,
        camp: { ...view1.attempt!.camp!, yourHand: [{ id: "c2", identity: { kind: "standard", suit: "spades", rank: 10 } }] },
      },
    });
    ui = reconcileLocalUi(ui, view2);
    expect(ui.hoveredCardId).toBeNull();
  });

  it("cancels a drag whose card left the hand", () => {
    const view1 = makeView();
    const ui = freeze({ ...initialLocalUi(), drag: { phase: "dragging" as const, cardId: "c1", legal: true, reason: null } });
    const view2 = makeView({
      attempt: {
        ...view1.attempt!,
        camp: { ...view1.attempt!.camp!, yourHand: [{ id: "c2", identity: { kind: "standard", suit: "spades", rank: 10 } }] },
      },
    });
    expect(reconcileLocalUi(ui, view2).drag).toEqual({ phase: "idle" });
    expect(reconcileLocalUi(ui, view1).drag).toEqual(ui.drag);
  });

  it("leaves valid targeting/hover untouched", () => {
    const view = makeView();
    let ui = freeze(beginGearTargeting(freeze(initialLocalUi()), view, "peek"));
    ui = freeze(setHoveredCard(ui, "c1"));
    const next = reconcileLocalUi(ui, view);
    expect(next.targeting).toEqual({ mode: "gear", gearId: "peek", selected: [] });
    expect(next.hoveredCardId).toBe("c1");
  });
});

describe("setHoveredCard / setLastTrickOpen / setTooltipGear", () => {
  it("each sets only its own field, immutably", () => {
    const ui = freeze(initialLocalUi());
    expect(setHoveredCard(ui, "c1")).toEqual({ ...initialLocalUi(), hoveredCardId: "c1" });
    expect(setLastTrickOpen(ui, true)).toEqual({ ...initialLocalUi(), lastTrickOpen: true });
    expect(setTooltipGear(ui, "peek")).toEqual({ ...initialLocalUi(), tooltipGearId: "peek" });
    expect(setTooltipObjective(ui, "o1")).toEqual({ ...initialLocalUi(), tooltipObjectiveId: "o1" });
    expect(setTooltipMateGear(ui, { seatId: "s1", gearId: "peek" })).toEqual({
      ...initialLocalUi(),
      tooltipMateGear: { seatId: "s1", gearId: "peek" },
    });
    // original untouched
    expect(ui).toEqual(initialLocalUi());
  });
});
