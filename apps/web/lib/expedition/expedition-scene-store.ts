import { createStore, type StoreApi } from "zustand/vanilla";
import type { RunAction } from "@games/rules";
import type { CardPackId } from "./card-pack-ids";
import type { SceneKey, SceneModel, SceneServerInput } from "./build-scene-model";
import { buildSceneModel, sceneKeyFor } from "./build-scene-model";
import type { BetweenCampsModel } from "./between-camps-model";
import { buildBetweenCampsModel } from "./between-camps-model";
import type { LocalUiState } from "./local-ui";
import { confirmTargeting as confirmTargetingUi, initialLocalUi, reconcileLocalUi } from "./local-ui";

/**
 * The single dispatch chokepoint for the Phaser scenes (spec §7.1): every
 * server view flows in through `setServer`, every click becomes a request
 * only through `dispatch`, which forwards to `onAction` and nothing else.
 * Phaser never decides an outcome — this store never computes legality,
 * never re-derives a rule, and never talks to the worker except by calling
 * the injected `onAction`. The worker's `parseRunAction` + adapter remain
 * the sole authority on whether a forwarded request is actually legal.
 *
 * No phaser or react import — Phaser scenes and React alike only ever read
 * `getState()`/`subscribe()`.
 */

export interface ExpeditionSceneState {
  server: SceneServerInput | null;
  localUi: LocalUiState;
  cardPackId: CardPackId;
  reconnecting: boolean;
  sceneKey: SceneKey | null;
  model: SceneModel | null;
  betweenModel: BetweenCampsModel | null;
}

export interface ExpeditionSceneActions {
  /** Reconciles `localUi` against the fresh view, then rebuilds
   * `sceneKey`/`model`/`betweenModel` from it. */
  setServer(server: SceneServerInput): void;
  setReconnecting(reconnecting: boolean): void;
  /** No-op when `server` is null — there is no view to derive from yet. */
  updateLocalUi(fn: (ui: LocalUiState, view: SceneServerInput["game"]) => LocalUiState): void;
  /** State only — persistence to `localStorage` is the caller's job
   * (`expedition-card-pack-pref.ts`), never this store's. */
  setCardPack(id: CardPackId): void;
  /** Forwards `request` to `onAction` exactly once. A no-op while
   * `reconnecting` or before any server view has arrived. */
  dispatch(request: RunAction): void;
  /** Runs `local-ui.ts`'s `confirmTargeting`; dispatches the resulting
   * request (if any) and clears `localUi.targeting`. A no-op if targeting
   * is not yet complete. */
  confirmTargeting(): void;
}

export type ExpeditionSceneStore = StoreApi<ExpeditionSceneState & ExpeditionSceneActions>;

function rebuild(
  server: SceneServerInput,
  localUi: LocalUiState,
  cardPackId: CardPackId,
): Pick<ExpeditionSceneState, "sceneKey" | "model" | "betweenModel"> {
  const sceneKey = sceneKeyFor(server.game);
  if (sceneKey === "camp") {
    return { sceneKey, model: buildSceneModel(server, localUi, cardPackId), betweenModel: null };
  }
  return { sceneKey, model: null, betweenModel: buildBetweenCampsModel(server) };
}

export function createExpeditionSceneStore(opts: {
  onAction: (request: unknown) => void;
  cardPackId: CardPackId;
}): ExpeditionSceneStore {
  return createStore<ExpeditionSceneState & ExpeditionSceneActions>((set, get) => {
    function applyLocalUi(nextUi: LocalUiState): void {
      const { server, cardPackId } = get();
      if (server === null) {
        set({ localUi: nextUi });
        return;
      }
      set({ localUi: nextUi, ...rebuild(server, nextUi, cardPackId) });
    }

    return {
      server: null,
      localUi: initialLocalUi(),
      cardPackId: opts.cardPackId,
      reconnecting: false,
      sceneKey: null,
      model: null,
      betweenModel: null,

      setServer(server) {
        const reconciled = reconcileLocalUi(get().localUi, server.game);
        set({ server, localUi: reconciled, ...rebuild(server, reconciled, get().cardPackId) });
      },

      setReconnecting(reconnecting) {
        set({ reconnecting });
      },

      updateLocalUi(fn) {
        const { server, localUi } = get();
        if (server === null) return;
        applyLocalUi(fn(localUi, server.game));
      },

      setCardPack(id) {
        const { server, localUi } = get();
        if (server === null) {
          set({ cardPackId: id });
          return;
        }
        set({ cardPackId: id, ...rebuild(server, localUi, id) });
      },

      dispatch(request) {
        const { server, reconnecting } = get();
        if (server === null || reconnecting) return;
        opts.onAction(request);
      },

      confirmTargeting() {
        const { localUi } = get();
        const { ui: nextUi, request } = confirmTargetingUi(localUi);
        if (request === null) return;
        applyLocalUi(nextUi);
        get().dispatch(request);
      },
    };
  });
}
