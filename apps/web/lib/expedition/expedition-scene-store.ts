import { createStore, type StoreApi } from "zustand/vanilla";
import type { RunAction } from "@games/rules";
import type { CardPackId } from "./card-pack-ids";
import type { SceneKey, SceneModel, SceneServerInput } from "./build-scene-model";
import { buildSceneModel, sceneKeyFor } from "./build-scene-model";
import type { TrailModel } from "./trail-model";
import { buildTrailModel } from "./trail-model";
import type { RunEndModel } from "./run-end-model";
import { buildRunEndModel } from "./run-end-model";
import type { LocalUiState } from "./local-ui";
import { confirmTargeting as confirmTargetingUi, initialLocalUi, reconcileLocalUi } from "./local-ui";
import { TRANSITION_TIMING, swapAt, transitionFor, type SceneTransition, type TransitionSpeed, type TransitionTiming } from "./scene-transitions";

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

/** What the active scene draws, tagged by its scene key. */
export type ActiveModel = SceneModel | TrailModel | RunEndModel;

/** The signboard between two views (`scene-transitions.ts`). While
 * `phase` is "sign" the view before it stays on screen and input is held;
 * at black the newest view swaps in and `phase` becomes "fade-in". */
export type ActiveTransition = SceneTransition & {
  serial: number;
  timing: TransitionTiming;
  /** On the `transitions.now` clock. */
  startedAt: number;
  phase: "sign" | "fade-in";
};

export interface ExpeditionSceneState {
  /** The view on screen, which trails the newest one while a sign hangs. */
  server: SceneServerInput | null;
  localUi: LocalUiState;
  cardPackId: CardPackId;
  reconnecting: boolean;
  sceneKey: SceneKey | null;
  model: ActiveModel | null;
  transition: ActiveTransition | null;
}

export interface ExpeditionSceneActions {
  /** Reconciles `localUi` against the fresh view, then rebuilds
   * `sceneKey`/`model` from it. */
  setServer(server: SceneServerInput): void;
  setReconnecting(reconnecting: boolean): void;
  /** No-op when `server` is null — there is no view to derive from yet. */
  updateLocalUi(fn: (ui: LocalUiState, view: SceneServerInput["game"]) => LocalUiState): void;
  /** State only — persistence to `localStorage` is the caller's job
   * (`expedition-card-pack-pref.ts`), never this store's. */
  setCardPack(id: CardPackId): void;
  /** Forwards `request` to `onAction` exactly once. A no-op while
   * `reconnecting`, while a sign hangs, or before any server view has arrived. */
  dispatch(request: RunAction): void;
  /** Host only (the worker refuses anyone else): back to the lobby with
   * seats kept. A no-op while `reconnecting`. */
  restartLobby(): void;
  /** Opens the map of the run (the top bar's camp label); the board draws it. */
  openMap(): void;
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
  reconnecting: boolean,
): Pick<ExpeditionSceneState, "sceneKey" | "model"> {
  const sceneKey = sceneKeyFor(server.game);
  const builders: Record<SceneKey, () => ActiveModel> = {
    camp: () => buildSceneModel(server, localUi, cardPackId, reconnecting),
    trail: () => buildTrailModel(server, localUi, reconnecting),
    "run-end": () => buildRunEndModel(server),
  };
  return { sceneKey, model: builders[sceneKey]() };
}

export function createExpeditionSceneStore(opts: {
  onAction: (request: unknown) => void;
  onRestartLobby?: () => void;
  onOpenMap?: () => void;
  cardPackId: CardPackId;
  /** Without it every view shows at once. `speed` is asked as each sign
   * starts; `now` is the clock the scene animates `startedAt` against. */
  transitions?: { speed: () => TransitionSpeed; now: () => number };
}): ExpeditionSceneStore {
  return createStore<ExpeditionSceneState & ExpeditionSceneActions>((set, get) => {
    let serial = 0;
    /** The newest view, held back while a sign hangs. */
    let held: SceneServerInput | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function show(server: SceneServerInput): void {
      const reconciled = reconcileLocalUi(get().localUi, server.game);
      set({ server, localUi: reconciled, ...rebuild(server, reconciled, get().cardPackId, get().reconnecting) });
    }

    function startTransition(found: SceneTransition, server: SceneServerInput, timing: TransitionTiming, now: () => number): void {
      if (timer !== null) clearTimeout(timer);
      const own = ++serial;
      held = server;
      set({ transition: { ...found, serial: own, timing, startedAt: now(), phase: "sign" } });
      timer = setTimeout(() => {
        const next = held;
        held = null;
        if (next !== null) show(next);
        const current = get().transition;
        if (current?.serial === own) set({ transition: { ...current, phase: "fade-in" } });
        timer = setTimeout(() => {
          timer = null;
          if (get().transition?.serial === own) set({ transition: null });
        }, timing.fadeIn);
      }, swapAt(timing, found));
    }

    function applyLocalUi(nextUi: LocalUiState): void {
      const { server, cardPackId, reconnecting, localUi } = get();
      // An unchanged UI must not rebuild the model: the scenes redraw on
      // every new model, and a redraw re-fires the hovered tile's pointerover.
      if (nextUi === localUi) return;
      if (server === null) {
        set({ localUi: nextUi });
        return;
      }
      set({ localUi: nextUi, ...rebuild(server, nextUi, cardPackId, reconnecting) });
    }

    return {
      server: null,
      localUi: initialLocalUi(),
      cardPackId: opts.cardPackId,
      reconnecting: false,
      sceneKey: null,
      model: null,
      transition: null,

      setServer(server) {
        if (get().transition?.phase === "sign") {
          held = server;
          return;
        }
        const shown = get().server;
        const transitions = opts.transitions;
        const found = shown === null || transitions === undefined ? null : transitionFor(shown.game, server.game);
        const speed = found === null ? "skip" : transitions!.speed();
        if (found === null || speed === "skip") show(server);
        else startTransition(found, server, TRANSITION_TIMING[speed], transitions!.now);
      },

      setReconnecting(reconnecting) {
        const { server, localUi, cardPackId } = get();
        if (server === null) {
          set({ reconnecting });
          return;
        }
        set({ reconnecting, ...rebuild(server, localUi, cardPackId, reconnecting) });
      },

      updateLocalUi(fn) {
        const { server, localUi } = get();
        if (server === null) return;
        applyLocalUi(fn(localUi, server.game));
      },

      setCardPack(id) {
        const { server, localUi, reconnecting } = get();
        if (server === null) {
          set({ cardPackId: id });
          return;
        }
        set({ cardPackId: id, ...rebuild(server, localUi, id, reconnecting) });
      },

      dispatch(request) {
        const { server, reconnecting, transition } = get();
        if (server === null || reconnecting || transition?.phase === "sign") return;
        opts.onAction(request);
      },

      openMap() {
        opts.onOpenMap?.();
      },

      restartLobby() {
        if (get().reconnecting) return;
        opts.onRestartLobby?.();
      },

      confirmTargeting() {
        const { localUi, server } = get();
        if (server === null) return;
        const { ui: nextUi, request } = confirmTargetingUi(localUi, server.game);
        if (request === null) return;
        applyLocalUi(nextUi);
        get().dispatch(request);
      },
    };
  });
}
