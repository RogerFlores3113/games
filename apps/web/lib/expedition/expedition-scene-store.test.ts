import { describe, expect, it, vi } from "vitest";
import type { ExpeditionAbilityView, ExpeditionCampView, ExpeditionStageView, ExpeditionCardIdentityView, ExpeditionView } from "@games/rules";
import type { RoomSeatInfo, SceneModel, SceneServerInput } from "./build-scene-model";
import { beginAbilityTargeting, selectTarget, setTooltipSource } from "./local-ui";
import { createExpeditionSceneStore, type ExpeditionSceneStore } from "./expedition-scene-store";

const SCOUT: ExpeditionAbilityView = {
  sourceKey: "explorer",
  usableNow: true,
  reason: null,
  steps: [{ kind: "hand", prompt: "Pick a teammate's hand", choices: ["hand:s1", "hand:s3"] }],
};

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
    goals: [],
    discards: [], voidedTricks: [],
    objectives: [],
    yourHand: [{ id: "c-as", identity: AS, effectiveRank: null, countsAs: null }],
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
    runStatus: "in_progress",
    length: "standard",
    campCount: 6,
    purse: 0,
    supplies: { count: 5, max: 5 },
    plan: [],
    seats: [
      { seatId: "s1", characterId: "leader", upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, usage: [] },
      { seatId: "s2", characterId: "explorer", upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, usage: [] },
      { seatId: "s3", characterId: "jd", upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, usage: [] },
    ],
    yourAbilities: [SCOUT],
    history: [],
    lastVote: null,
    stage: {
      tag: "camp",
      camp: { index: 2, location: "jungle", weather: "fair", pairing: null, event: null, slotKinds: [], bossId: null, shop: false, survey: null },
      mods: [],
      attempt: {
        attemptNumber: 1,
        window: "between-tricks",
        pendingSeatIds: [],
        rescue: null,
        effects: [],
        reveals: [],
        log: [],
        yourWhisper: { allowed: true, left: 1 },
        camp: makeCamp(),
      },
    },
    ...overrides,
  };
}

function onTrail(stage: ExpeditionStageView, overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return makeView({ stage, ...overrides });
}

const draftOffer: ExpeditionStageView = { tag: "draft", cleared: 1, payout: 8, yourOffer: { kind: "standard", bundles: [["trained-monkey"]] }, pendingSeatIds: ["s2"] };
const ended: ExpeditionStageView = { tag: "ended", result: "lost" };

function server(view: ExpeditionView, seats = roomSeats()): SceneServerInput {
  return { game: view, roomSeats: seats, hostSeatId: "s1" };
}

function campModel(store: ExpeditionSceneStore): SceneModel {
  const model = store.getState().model;
  if (model?.sceneKey !== "camp") throw new Error(`expected the camp model, got ${model?.sceneKey ?? "null"}`);
  return model;
}

describe("createExpeditionSceneStore", () => {
  it("starts empty: server null, model null, sceneKey null, cardPackId as given", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    const state = store.getState();
    expect(state.server).toBeNull();
    expect(state.model).toBeNull();
    expect(state.sceneKey).toBeNull();
    expect(state.cardPackId).toBe("big-index");
    expect(state.reconnecting).toBe(false);
  });

  it("setServer with a camp-phase view builds the camp model", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    store.getState().setServer(server(makeView()));
    expect(store.getState().sceneKey).toBe("camp");
    expect(campModel(store).cardPackId).toBe("big-index");
  });

  it("setServer with a draft view builds the trail model", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    store.getState().setServer(server(onTrail(draftOffer)));
    const state = store.getState();
    expect(state.sceneKey).toBe("trail");
    expect(state.model).toMatchObject({ sceneKey: "trail", prompt: { text: "Camp 1 cleared! +8 coins. Take a bundle", tone: "your-move" } });
  });

  it("setServer with an ended run builds the run-end model", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    store.getState().setServer(server(makeView({ runStatus: "lost", stage: ended })));
    expect(store.getState().sceneKey).toBe("run-end");
    expect(store.getState().model).toMatchObject({ sceneKey: "run-end", outcome: "lost", isHost: false });
  });

  it("restartLobby calls onRestartLobby, except while reconnecting", () => {
    const restarts: string[] = [];
    const store = createExpeditionSceneStore({ onAction: vi.fn(), onRestartLobby: () => restarts.push("restart"), cardPackId: "big-index" });
    store.getState().setServer(server(makeView({ runStatus: "lost", stage: ended })));
    store.getState().setReconnecting(true);
    store.getState().restartLobby();
    expect(restarts).toEqual([]);
    store.getState().setReconnecting(false);
    store.getState().restartLobby();
    expect(restarts).toEqual(["restart"]);
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
    const before = campModel(store).prompt.text;
    store.getState().setReconnecting(true);
    expect(campModel(store).prompt).toEqual({ text: "Reconnecting…", tone: "alert" });
    store.getState().setReconnecting(false);
    expect(campModel(store).prompt.text).toBe(before);
  });

  it("dispatch is a no-op when server is null", () => {
    const onAction = vi.fn();
    const store = createExpeditionSceneStore({ onAction, cardPackId: "big-index" });
    store.getState().dispatch({ type: "play-card", cardId: "c1" });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("ability targeting: confirmTargeting with no target selected sends nothing, then sends exactly one request once a teammate's hand is picked", () => {
    const onAction = vi.fn();
    const store = createExpeditionSceneStore({ onAction, cardPackId: "big-index" });
    store.getState().setServer(server(makeView()));

    store.getState().updateLocalUi((ui, v) => beginAbilityTargeting(ui, v, "explorer"));
    store.getState().confirmTargeting();
    expect(onAction).not.toHaveBeenCalled();

    store.getState().updateLocalUi((ui, v) => selectTarget(ui, v, "hand:s1"));
    store.getState().confirmTargeting();

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({ type: "use-ability", sourceKey: "explorer", targets: ["hand:s1"] });
    expect(store.getState().localUi.targeting).toBeNull();
  });

  it("updateLocalUi keeps the same model when the UI is unchanged, and rebuilds it when it changes", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    store.getState().setServer(server(onTrail(draftOffer)));
    store.getState().updateLocalUi((ui) => setTooltipSource(ui, "trained-monkey"));
    const hovered = store.getState().model;
    store.getState().updateLocalUi((ui) => setTooltipSource(ui, "trained-monkey"));
    expect(store.getState().model).toBe(hovered);
    store.getState().updateLocalUi((ui) => setTooltipSource(ui, null));
    expect(store.getState().model).toMatchObject({ sceneKey: "trail", tooltip: null });
  });

  it("updateLocalUi is a no-op when server is null", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    const before = store.getState().localUi;
    store.getState().updateLocalUi((ui) => ({ ...ui, hoveredCardId: "x" }));
    expect(store.getState().localUi).toBe(before);
  });

  it("setServer clears an ability targeting that is no longer usable (reconcileLocalUi)", () => {
    const onAction = vi.fn();
    const store = createExpeditionSceneStore({ onAction, cardPackId: "big-index" });
    const view = makeView();
    store.getState().setServer(server(view));
    store.getState().updateLocalUi((ui, v) => beginAbilityTargeting(ui, v, "explorer"));
    expect(store.getState().localUi.targeting).not.toBeNull();

    const nextView = makeView({ yourAbilities: [{ sourceKey: "explorer", usableNow: false, reason: "Already used this camp", steps: [] }] });
    store.getState().setServer(server(nextView));
    expect(store.getState().localUi.targeting).toBeNull();
  });

  it("setCardPack sets state only; model.cardPackId updates; never touches localStorage", () => {
    const store = createExpeditionSceneStore({ onAction: vi.fn(), cardPackId: "big-index" });
    store.getState().setServer(server(makeView()));
    store.getState().setCardPack("classic");
    expect(store.getState().cardPackId).toBe("classic");
    expect(campModel(store).cardPackId).toBe("classic");
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
