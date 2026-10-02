/**
 * The camp scene: draws the world and the four interactables once, then
 * redraws every zone (top bar, prompt, seats, hand, trick, last trick,
 * tooltip, actions) from the store's `model` whenever it changes. Click
 * handlers only call `store.dispatch`/`store.confirmTargeting`/
 * `store.updateLocalUi` with a fixed request literal or a `local-ui.ts`
 * transition; they never decide an outcome.
 */
import Phaser from "phaser";
import { GEAR_DISPLAY } from "@games/rules";
import { ensurePixelFonts } from "../font/pixel-font";
import { ensureCardTextures } from "../card-packs/card-textures";
import { drawPrompt, drawStaticWorld, drawTooltip, drawTopBar, setBossEffect } from "../draw/draw-table";
import { drawSeats } from "../draw/draw-seats";
import type { CampHandlers } from "../draw/camp-handlers";
import { preloadArt } from "../art/place-art";
import { drawHand, drawLastTrick, drawTrick } from "../draw/draw-hand-trick";
import { drawControls } from "../draw/draw-controls";
import { INTERACTABLE_REGISTRY } from "../interactables/registry";
import { INTERACTABLE_ANCHORS, ZONES } from "../layout";
import { gearObjectId, interactableObjectId, LAST_TRICK_ID, mateGearObjectId } from "../../../../lib/expedition/expedition-ids";
import { ObjectIndex } from "../object-index";
import type { ObjectiveChip, SceneModel } from "../../../../lib/expedition/build-scene-model";
import {
  beginGearTargeting,
  beginWhisper,
  cancelTargeting,
  nextTargetKind,
  selectTarget,
  setHoveredCard,
  setLastTrickOpen,
  setTooltipGear,
  setTooltipMateGear,
  setTooltipObjective,
} from "../../../../lib/expedition/local-ui";
import type { SceneDeps } from "./scene-registry";

function campModel(store: SceneDeps["store"]): SceneModel | null {
  const model = store.getState().model;
  return model?.sceneKey === "camp" ? model : null;
}

function findObjective(model: SceneModel | null, objectiveId: string): ObjectiveChip | null {
  if (model === null) return null;
  for (const seat of model.seats) {
    const found = seat.objectives.find((o) => o.objectiveId === objectiveId);
    if (found) return found;
  }
  return model.faceUpObjectives.find((o) => o.objectiveId === objectiveId) ?? null;
}

function buildHandlers(store: SceneDeps["store"]): CampHandlers {
  return {
    onCard(cardId) {
      const state = store.getState();
      if (state.reconnecting) return;
      if (state.localUi.targeting !== null && nextTargetKind(state.localUi) === "own-card") {
        state.updateLocalUi((ui, view) => selectTarget(ui, view, cardId));
        return;
      }
      const card = campModel(store)?.hand.find((c) => c.id === cardId) ?? null;
      if (card?.playable) {
        state.dispatch({ type: "play-card", cardId });
      }
    },
    onCardHover(cardId) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => setHoveredCard(ui, cardId));
    },
    onObjective(objectiveId) {
      const state = store.getState();
      if (state.reconnecting) return;
      const kind = nextTargetKind(state.localUi);
      if (kind === "face-up-objective" || kind === "own-objective") {
        state.updateLocalUi((ui, view) => selectTarget(ui, view, objectiveId));
        return;
      }
      const chip = findObjective(campModel(store), objectiveId);
      if (chip?.pickable) {
        state.dispatch({ type: "pick-objective", objectiveId });
      }
    },
    onSeat(seatId) {
      const state = store.getState();
      if (state.reconnecting) return;
      if (nextTargetKind(state.localUi) === "teammate") {
        state.updateLocalUi((ui, view) => selectTarget(ui, view, seatId));
      }
    },
    onGear(gearId) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui, view) => beginGearTargeting(ui, view, gearId));
    },
    onGearHover(gearId) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => setTooltipGear(ui, gearId));
    },
    onObjectiveHover(objectiveId) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => setTooltipObjective(ui, objectiveId));
    },
    onMateGearHover(mate) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => setTooltipMateGear(ui, mate));
    },
    onWhisper() {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui, view) => beginWhisper(ui, view));
    },
    onConfirm() {
      const state = store.getState();
      if (state.reconnecting) return;
      state.confirmTargeting();
    },
    onCancel() {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => cancelTargeting(ui));
    },
    onPreDealUse(gearId) {
      const state = store.getState();
      if (state.reconnecting) return;
      const targets = GEAR_DISPLAY[gearId]?.targets ?? [];
      if (targets.length === 0) {
        state.dispatch({ type: "use-gear", gearId, targets: [] });
        return;
      }
      state.updateLocalUi((ui, view) => beginGearTargeting(ui, view, gearId));
    },
    onPreDealSkip() {
      const state = store.getState();
      if (state.reconnecting) return;
      state.dispatch({ type: "skip-window" });
    },
    onLastTrickHover(open) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => setLastTrickOpen(ui, open));
    },
  };
}

export class CampScene extends Phaser.Scene {
  private readonly sceneStore: SceneDeps["store"];
  private readonly index: ObjectIndex;
  private handlers!: CampHandlers;
  private unsubscribe: (() => void) | null = null;
  private dynamicLayer: Phaser.GameObjects.Container | null = null;
  private lastCardPackId: string | null = null;
  private previousModel: SceneModel | null = null;

  constructor(deps: SceneDeps) {
    super("camp");
    this.sceneStore = deps.store;
    this.index = deps.index;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    const state = this.sceneStore.getState();
    const glyphs = ensurePixelFonts(this);
    ensureCardTextures(this, state.cardPackId, glyphs);
    this.lastCardPackId = state.cardPackId;
    this.handlers = buildHandlers(this.sceneStore);

    drawStaticWorld(this);

    for (const [id, def] of Object.entries(INTERACTABLE_REGISTRY)) {
      const anchor = INTERACTABLE_ANCHORS[id as keyof typeof INTERACTABLE_ANCHORS];
      const root = def.place(this, anchor);
      root.on("pointerdown", () => def.onClick(this, root));
      this.index.register("camp", interactableObjectId(id), root as Phaser.GameObjects.Container);
    }

    this.dynamicLayer = this.add.container(0, 0);

    this.unsubscribe = this.sceneStore.subscribe((next, prev) => {
      if (next.model !== prev.model || next.cardPackId !== prev.cardPackId) {
        this.syncFromStore();
      }
    });
    this.syncFromStore();

    // Strict Mode's dev-only double mount calls `game.destroy(true)` on the
    // first `Phaser.Game` directly, without first calling `scene.stop()` —
    // that only fires DESTROY, never SHUTDOWN, on the scene. Listening to
    // BOTH events guarantees `this.unsubscribe` is torn down before the
    // store's next `setServer` can fire `syncFromStore`/`renderModel` on a
    // scene whose `this.add` has already gone null.
    const teardown = () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.previousModel = null;
      this.index.clearScene("camp");
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);
  }

  private syncFromStore(): void {
    if (this.unsubscribe === null) return;
    const state = this.sceneStore.getState();
    const model = campModel(this.sceneStore);
    if (model === null) return;
    if (state.cardPackId !== this.lastCardPackId) {
      const glyphs = ensurePixelFonts(this);
      ensureCardTextures(this, state.cardPackId, glyphs);
      this.lastCardPackId = state.cardPackId;
    }
    this.renderModel(model);
  }

  renderModel(model: SceneModel): void {
    if (this.dynamicLayer === null || this.unsubscribe === null) return;
    this.dynamicLayer.removeAll(true);
    drawTopBar(this, this.dynamicLayer, model.topBar);
    drawPrompt(this, this.dynamicLayer, model.prompt);
    drawTooltip(this, this.dynamicLayer, model.tooltip, ZONES.tooltip);
    const effect = model.bossTwist !== null && !model.bossTwist.cancelled ? model.bossTwist.effect : "none";
    setBossEffect(this, effect);
    this.renderTable(model);
    this.previousModel = model;
  }

  renderTable(model: SceneModel): void {
    if (this.dynamicLayer === null) return;
    const layer = this.dynamicLayer;
    drawSeats(this, layer, model, this.index, this.handlers);
    drawHand(this, layer, model, this.index, this.handlers);
    drawTrick(this, layer, model, this.index, this.previousModel);
    drawLastTrick(this, layer, model, this.index, this.handlers);
    drawControls(this, layer, model, this.index, this.handlers);
  }

  /** Hover state is checked against the pointer every frame because a
   * redraw replaces the hovered object, and Phaser then never sends the
   * stale object its `pointerout`: the glance, lift or tooltip would stick. */
  update(): void {
    const ui = this.sceneStore.getState().localUi;
    if (!ui.lastTrickOpen && ui.hoveredCardId === null && ui.tooltipGearId === null && ui.tooltipObjectiveId === null && ui.tooltipMateGear === null) return;
    const { x, y } = this.input.activePointer;
    const over = (id: string): boolean => this.index.contains(id, x, y);
    if (ui.lastTrickOpen && !over(LAST_TRICK_ID)) this.handlers.onLastTrickHover(false);
    if (ui.hoveredCardId !== null) {
      const card = campModel(this.sceneStore)?.hand.find((c) => c.id === ui.hoveredCardId);
      if (card === undefined || !over(card.objectId)) this.handlers.onCardHover(null);
    }
    if (ui.tooltipGearId !== null && !over(gearObjectId(ui.tooltipGearId))) this.handlers.onGearHover(null);
    if (ui.tooltipObjectiveId !== null) {
      const chip = findObjective(campModel(this.sceneStore), ui.tooltipObjectiveId);
      if (chip === null || !over(chip.objectId)) this.handlers.onObjectiveHover(null);
    }
    if (ui.tooltipMateGear !== null && !over(mateGearObjectId(ui.tooltipMateGear.seatId, ui.tooltipMateGear.gearId))) {
      this.handlers.onMateGearHover(null);
    }
  }
}
