import { describe, expect, it, vi } from "vitest";
import type { ExpeditionCampView, ExpeditionCardIdentityView, ExpeditionView } from "@games/rules";
import type { RoomSeatInfo, SceneServerInput } from "./build-scene-model";
import { beginGearTargeting } from "./local-ui";
import { createExpeditionSceneStore } from "./expedition-scene-store";

const AS: ExpeditionCardIdentityView = { kind: "standard", suit: "spades", rank: 14 }; // A♠

function roomSeats(): RoomSeatInfo[] {
  return [
    { seatId: "s1", displayLabel: "Alice", connected: true },
    { seatId: "s2", displayLabel: "Bob", connected: true },
    { seatId: "s3", displayLabel: "Cara", connected: true },
  ];
}

function makeCamp(overrides: Partial<ExpeditionCampView> = {}): ExpeditionCampView {
  return {
    playerCount: 3,
    expeditionLeaderSeatId: "s1",
    totalTricks: 17,
    removedCards: [],
    objectiveAssignment: "face-up",
    objectives: [],
    yourHand: [{ id: "c-as", identity: AS }],
    yourLegalCardIds: ["c-as"],
    handSizes: [
      { seatId: "s1", size: 17 },
      { seatId: "s2", size: 17 },
      { seatId: "s3", size: 17 },
    ],
    completedTricks: [],
    currentTrick: { index: 0, leaderSeatId: "s2", plays: [] },
    campPhase: "playing",
    currentActorSeatId: "s2",
    ...overrides,
  };
}

function makeView(overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "s2",
    runPhase: "camp",
    runStatus: "in_progress",
    campNumber: 2,
    supplies: 5,
    bossTwists: { camp3: null, camp6: null },
    activeBossTwistId: null,
    seats: [
      { seatId: "s1", equippedGearIds: [], ready: true, draftPending: false },
      { seatId: "s2", equippedGearIds: ["peek"], ready: true, draftPending: false },
      { seatId: "s3", equippedGearIds: [], ready: true, draftPending: false },
    ],
    yourOwnedGearIds: ["peek"],
    yourDraftOffer: null,
    yourCapacity: null,
    yourGear: [{ gearId: "peek", spent: false, usableNow: true, reason: null }],
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
      camp: makeCamp(),
    },
    ...overrides,
  };
}

function fireside(overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return makeView({ runPhase: "fireside", attempt: null, ...overrides });
}

function server(view: ExpeditionView, seats = roomSeats()): SceneServerInput {
  return { game: view, roomSeats: seats };
}

describe("createExpeditionSceneStore", () => {
  it("starts empty: server null, model null, sceneKey null, cardPackId as given", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    const state = store.getState();
    expect(state.server).toBeNull();
    expect(state.model).toBeNull();
    expect(state.betweenModel).toBeNull();
    expect(state.sceneKey).toBeNull();
    expect(state.cardPackId).toBe("big-index");
    expect(state.reconnecting).toBe(false);
  });

  it("setServer with a camp-phase view sets sceneKey camp, model built, betweenModel null", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    store.getState().setServer(server(makeView()));
    const state = store.getState();
    expect(state.sceneKey).toBe("camp");
    expect(state.model).not.toBeNull();
    expect(state.model!.cardPackId).toBe("big-index");
    expect(state.betweenModel).toBeNull();
  });

  it("setServer with a fireside view sets sceneKey between-camps, betweenModel set, model null", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    store.getState().setServer(server(fireside()));
    const state = store.getState();
    expect(state.sceneKey).toBe("between-camps");
    expect(state.betweenModel).not.toBeNull();
    expect(state.model).toBeNull();
  });

  it("dispatch calls onAction exactly once with the given request", () => {
    const onAction = vi.fn();
    const store = createExpeditionSceneStore({ onAction, cardPackId: "big-index" });
    store.getState().setServer(server(makeView()));
    store.getState().dispatch({ type: "play-card", cardId: "c1" });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ type: "play-card", cardId: "c1" });
  });

  it("dispatch is a no-op while reconnecting", () => {
    const onAction = vi.fn();
    const store = createExpeditionSceneStore({ onAction, cardPackId: "big-index" });
    store.getState().setServer(server(makeView()));
    store.getState().setReconnecting(true);
    store.getState().dispatch({ type: "play-card", cardId: "c1" });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("setReconnecting rebuilds the model so the prompt says so, and restores it after", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    store.getState().setServer(server(makeView()));
    const before = store.getState().model!.prompt.text;
    store.getState().setReconnecting(true);
    expect(store.getState().model!.prompt).toEqual({ text: "Reconnecting…", tone: "alert" });
    store.getState().setReconnecting(false);
    expect(store.getState().model!.prompt.text).toBe(before);
  });

  it("dispatch is a no-op when server is null", () => {
    const onAction = vi.fn();
    const store = createExpeditionSceneStore({ onAction, cardPackId: "big-index" });
    store.getState().dispatch({ type: "play-card", cardId: "c1" });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("gear targeting: confirmTargeting with no target selected sends nothing, then sends exactly one request once a teammate is selected", () => {
    const onAction = vi.fn();
    const store = createExpeditionSceneStore({ onAction, cardPackId: "big-index" });
    const view = makeView();
    store.getState().setServer(server(view));

    store.getState().updateLocalUi((ui, v) => beginGearTargeting(ui, v, "peek"));
    store.getState().confirmTargeting();
    expect(onAction).not.toHaveBeenCalled();

    store.getState().updateLocalUi((ui) => ({
      ...ui,
      targeting: ui.targeting !== null && ui.targeting.mode === "gear" ? { ...ui.targeting, selected: ["s1"] } : ui.targeting,
    }));
    store.getState().confirmTargeting();

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ type: "use-gear", gearId: "peek", targets: ["s1"] });
    expect(store.getState().localUi.targeting).toBeNull();
  });

  it("updateLocalUi is a no-op when server is null", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    const before = store.getState().localUi;
    store.getState().updateLocalUi((ui) => ({ ...ui, hoveredCardId: "x" }));
    expect(store.getState().localUi).toBe(before);
  });

  it("setServer clears a gear targeting whose gear is no longer usableNow (reconcileLocalUi)", () => {
    const onAction = vi.fn();
    const store = createExpeditionSceneStore({ onAction, cardPackId: "big-index" });
    const view = makeView();
    store.getState().setServer(server(view));
    store.getState().updateLocalUi((ui, v) => beginGearTargeting(ui, v, "peek"));
    expect(store.getState().localUi.targeting).not.toBeNull();

    const nextView = makeView({ yourGear: [{ gearId: "peek", spent: true, usableNow: false, reason: "Already used this camp" }] });
    store.getState().setServer(server(nextView));
    expect(store.getState().localUi.targeting).toBeNull();
  });

  it("setCardPack sets state only; model.cardPackId updates; never touches localStorage", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    store.getState().setServer(server(makeView()));
    store.getState().setCardPack("classic");
    expect(store.getState().cardPackId).toBe("classic");
    expect(store.getState().model!.cardPackId).toBe("classic");
  });

  it("notifies subscribers on each state change", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.getState().setServer(server(makeView()));
    expect(listener).toHaveBeenCalledTimes(1);
    store.getState().setReconnecting(true);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
