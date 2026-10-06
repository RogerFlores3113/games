/**
 * The trail before, between and after camps: redraws every zone from the
 * store's trail model whenever it changes. Clicks only dispatch a request
 * literal or a `local-ui.ts` change; the worker decides whether a pick,
 * vote, equip, buy or Ready is legal.
 */
import Phaser from "phaser";
import { ensurePixelFonts } from "../font/pixel-font";
import { preloadArt, placeArt } from "../art/place-art";
import { STAGE, TRAIL_ZONES } from "../layout";
import { drawBackdrop, drawPrompt, drawTooltip, drawTopBar } from "../draw/draw-table";
import { drawTrailScene, type FlipClock, type TrailHandlers } from "../draw/draw-trail";
import { InventoryWindow, type InventoryHandlers } from "../draw/inventory-window";
import { previewObjectiveIcons, type TrailModel } from "../../../../lib/expedition/trail-model";
import { beginAbilityTargeting, cancelTargeting, currentStep, inventoryStageKey, selectTarget, setTooltipSource } from "../../../../lib/expedition/local-ui";
import type { ObjectIndex } from "../object-index";
import type { SceneDeps } from "./scene-registry";

function trailModel(store: SceneDeps["store"]): TrailModel | null {
  const model = store.getState().model;
  return model?.sceneKey === "trail" ? model : null;
}

/** Picks `choiceId` for the power being aimed and uses it once every step
 * is picked. False when no aimed step offers it. */
function pickAndUse(store: SceneDeps["store"], choiceId: string): boolean {
  const state = store.getState();
  const view = state.server?.game;
  if (view === undefined || !(currentStep(state.localUi, view)?.choices.includes(choiceId) ?? false)) return false;
  state.updateLocalUi((ui, v) => selectTarget(ui, v, choiceId));
  store.getState().confirmTargeting();
  return true;
}

/** The inventory window's moves: an equip or a discard is a request; the
 * rest is local. Picking an item for a power closes the window, so the
 * next step (a teammate) is in view. */
function inventoryHandlers(store: SceneDeps["store"]): InventoryHandlers {
  const close = () => store.getState().updateLocalUi((ui) => ({ ...ui, inventoryOpen: null, discardUid: null }));
  return {
    onEquip: (itemUids) => store.getState().dispatch({ type: "equip", itemUids }),
    onDiscardAsk: (uid) => store.getState().updateLocalUi((ui) => ({ ...ui, discardUid: uid })),
    onDiscardConfirm: () => {
      const uid = store.getState().localUi.discardUid;
      store.getState().updateLocalUi((ui) => ({ ...ui, discardUid: null }));
      if (uid !== null) store.getState().dispatch({ type: "discard-item", itemUid: uid });
    },
    onDiscardKeep: () => store.getState().updateLocalUi((ui) => ({ ...ui, discardUid: null })),
    onPick: (uid) => {
      if (pickAndUse(store, `item:${uid}`)) close();
    },
    onCancelAim: () => store.getState().updateLocalUi((ui) => cancelTargeting(ui)),
    onClose: () => {
      store.getState().updateLocalUi((ui) => (ui.targeting !== null && currentStep(ui, store.getState().server!.game)?.kind === "item" ? cancelTargeting(ui) : ui));
      close();
    },
  };
}

export class TrailScene extends Phaser.Scene {
  private readonly sceneStore: SceneDeps["store"];
  private readonly index: ObjectIndex;
  private readonly handlers: TrailHandlers;
  private readonly flips: FlipClock = new Map();
  private unsubscribe: (() => void) | null = null;
  private layer: Phaser.GameObjects.Container | null = null;
  private backdropLayer: Phaser.GameObjects.Container | null = null;
  /** The location drawn behind the trail, null for the fireside; undefined until drawn. */
  private backdrop: string | null | undefined = undefined;
  private inventory: InventoryWindow | null = null;
  /** The object whose rules the tooltip shows. */
  private hoverId: string | null = null;

  constructor(deps: SceneDeps) {
    super("trail");
    this.sceneStore = deps.store;
    this.index = deps.index;
    this.handlers = this.buildHandlers();
  }

  private buildHandlers(): TrailHandlers {
    const store = this.sceneStore;
    return {
      onDraft(characterId) {
        const model = trailModel(store);
        if (model?.panel.kind === "muster" && model.panel.characters.some((c) => c.characterId === characterId && c.pickable)) {
          store.getState().dispatch({ type: "pick-character", characterId });
        }
      },
      onBundle(bundle) {
        const model = trailModel(store);
        if (model?.panel.kind !== "draft" || model.panel.draft.kind !== "offer") return;
        const draft = model.panel.draft;
        const itemIds = draft.bundles.find((b) => b.bundle === bundle)?.itemIds ?? [];
        // The Pack Rat's pick follows the bundle just taken: say both.
        store.getState().updateLocalUi((ui) => ({ ...ui, takenBundle: draft.ownPick === null ? itemIds : [...(ui.takenBundle ?? []), ...itemIds] }));
        store.getState().dispatch({ type: "pick-bundle", bundle });
      },
      onVote(choice) {
        store.getState().dispatch({ type: "vote", choice });
      },
      onReady() {
        store.getState().dispatch(trailModel(store)?.panel.kind === "muster" ? { type: "lock-in" } : { type: "ready" });
      },
      onBuy(stockId) {
        store.getState().dispatch({ type: "buy", stockId });
      },
      onBackpack() {
        const state = store.getState();
        const view = state.server?.game;
        if (view !== undefined) state.updateLocalUi((ui) => ({ ...ui, inventoryOpen: inventoryStageKey(view), tooltipSourceId: null, tooltipPreviewObjective: null }));
      },
      onPower(sourceKey) {
        const state = store.getState();
        const ability = state.server?.game.yourAbilities.find((a) => a.sourceKey === sourceKey && a.usableNow);
        if (ability === undefined) return;
        const aiming = state.localUi.targeting?.mode === "ability" && state.localUi.targeting.sourceKey === sourceKey;
        if (aiming) return state.updateLocalUi((ui) => cancelTargeting(ui));
        if (ability.steps.length === 0) return state.dispatch({ type: "use-ability", sourceKey, targets: [] });
        state.updateLocalUi((ui, view) => beginAbilityTargeting(ui, view, sourceKey));
      },
      onPickSeat(seatId) {
        pickAndUse(store, `seat:${seatId}`);
      },
      onReroll(choiceId) {
        const ability = store.getState().server?.game.yourAbilities.find((a) => a.usableNow && a.steps.length === 1 && a.steps[0]!.choices.includes(choiceId));
        if (ability !== undefined) store.getState().dispatch({ type: "use-ability", sourceKey: ability.sourceKey, targets: [choiceId] });
      },
      onSourceHover: (sourceKey, objectId) => {
        const state = store.getState();
        if (state.reconnecting) return;
        this.hoverId = sourceKey === null ? null : (objectId ?? null);
        state.updateLocalUi((ui) => ({ ...setTooltipSource(ui, sourceKey), tooltipPreviewObjective: null }));
      },
    };
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    ensurePixelFonts(this);
    this.backdropLayer = this.add.container(0, 0);
    this.backdrop = undefined;
    this.layer = this.add.container(0, 0);
    this.inventory = new InventoryWindow(this, this.index, "trail", inventoryHandlers(this.sceneStore));

    this.unsubscribe = this.sceneStore.subscribe((next, prev) => {
      if (next.model !== prev.model) this.renderModel();
    });
    this.renderModel();

    // Strict Mode's dev-only double mount destroys the game without
    // stopping the scene, which fires DESTROY but never SHUTDOWN.
    const teardown = () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.inventory?.destroy();
      this.inventory = null;
      this.index.clearScene("trail");
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);
  }

  private renderModel(): void {
    if (this.layer === null || this.unsubscribe === null) return;
    const model = trailModel(this.sceneStore);
    if (model === null) return;
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.layer.removeAll(true);
    this.index.clearScene("trail");
    this.renderBackdrop(model);
    drawTopBar(this, this.layer, model.topBar, { index: this.index, sceneKey: "trail", onMap: () => this.sceneStore.getState().openMap() });
    drawPrompt(this, this.layer, model.prompt);
    drawTrailScene(this, this.layer, model, this.index, this.handlers, this.flips);
    this.inventory?.draw(this.layer, model.inventory);
    if (model.panel.kind !== "muster" && !(model.inventory?.open ?? false)) drawTooltip(this, this.layer, model.tooltip, TRAIL_ZONES.tooltip);
  }

  /** The loadout shows the camp it sets out for; the rest of the trail
   * rests at the fireside. */
  private renderBackdrop(model: TrailModel): void {
    const backdrop = model.panel.kind === "loadout" ? (model.panel.next?.backdrop ?? null) : null;
    if (this.backdropLayer === null || backdrop === this.backdrop) return;
    this.backdropLayer.removeAll(true);
    this.backdropLayer.add(backdrop === null ? placeArt(this, "bg-fireside", STAGE.w / 2, STAGE.h / 2) : drawBackdrop(this, backdrop));
    this.backdrop = backdrop;
  }

  /** A redraw replaces the hovered object and Phaser never sends the stale
   * one its `pointerout`, so the tooltip is checked against the pointer. */
  update(): void {
    const { x, y } = this.input.activePointer;
    this.hoverObjective(x, y);
    if (this.sceneStore.getState().localUi.tooltipSourceId === null) return;
    if (this.hoverId !== null && this.index.contains(this.hoverId, x, y)) return;
    this.handlers.onSourceHover(null);
  }

  /** The objective icons take no input, so a route card's click votes
   * through them; the icon under the pointer names its objective here. */
  private hoverObjective(x: number, y: number): void {
    const state = this.sceneStore.getState();
    const model = trailModel(this.sceneStore);
    if (state.reconnecting || model === null) return;
    const icon = model.inventory?.open ? undefined : previewObjectiveIcons(model.panel).find((i) => this.index.contains(i.objectId, x, y));
    const key = icon?.key ?? null;
    if (state.localUi.tooltipPreviewObjective === key) return;
    state.updateLocalUi((ui) => ({ ...(key === null ? ui : setTooltipSource(ui, null)), tooltipPreviewObjective: key }));
  }
}
