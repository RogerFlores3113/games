/**
 * The fireside between camps: redraws every zone from the store's fireside
 * model whenever it changes. Clicks only dispatch a request literal or a
 * `local-ui.ts` hover change; the worker decides whether a character pick,
 * draft pick or Ready is legal.
 */
import Phaser from "phaser";
import { ensurePixelFonts } from "../font/pixel-font";
import { preloadArt, placeArt } from "../art/place-art";
import { FIRESIDE_ZONES, STAGE } from "../layout";
import { drawPrompt, drawTooltip, drawTopBar } from "../draw/draw-table";
import { drawFireside, type FiresideHandlers } from "../draw/draw-fireside";
import { draftObjectId, kitObjectId } from "../../../../lib/expedition/expedition-ids";
import type { FiresideModel } from "../../../../lib/expedition/fireside-model";
import { setTooltipSource } from "../../../../lib/expedition/local-ui";
import type { ObjectIndex } from "../object-index";
import type { SceneDeps } from "./scene-registry";

function firesideModel(store: SceneDeps["store"]): FiresideModel | null {
  const model = store.getState().model;
  return model?.sceneKey === "fireside" ? model : null;
}

function buildHandlers(store: SceneDeps["store"]): FiresideHandlers {
  return {
    onDraft(sourceId) {
      const model = firesideModel(store);
      if (model === null) return;
      if (model.muster !== null) {
        if (model.muster.some((c) => c.characterId === sourceId && c.pickable)) store.getState().dispatch({ type: "pick-character", characterId: sourceId });
        return;
      }
      if (model.draft.kind === "offer") store.getState().dispatch({ type: "pick-draft", sourceId });
    },
    onReady() {
      store.getState().dispatch({ type: "ready" });
    },
    onSourceHover(sourceId) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => setTooltipSource(ui, sourceId));
    },
  };
}

export class FiresideScene extends Phaser.Scene {
  private readonly sceneStore: SceneDeps["store"];
  private readonly index: ObjectIndex;
  private readonly handlers: FiresideHandlers;
  private unsubscribe: (() => void) | null = null;
  private layer: Phaser.GameObjects.Container | null = null;

  constructor(deps: SceneDeps) {
    super("fireside");
    this.sceneStore = deps.store;
    this.index = deps.index;
    this.handlers = buildHandlers(deps.store);
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    ensurePixelFonts(this);
    placeArt(this, "bg-fireside", STAGE.w / 2, STAGE.h / 2);
    this.layer = this.add.container(0, 0);

    this.unsubscribe = this.sceneStore.subscribe((next, prev) => {
      if (next.model !== prev.model) this.renderModel();
    });
    this.renderModel();

    // Strict Mode's dev-only double mount destroys the game without
    // stopping the scene, which fires DESTROY but never SHUTDOWN.
    const teardown = () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.index.clearScene("fireside");
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);
  }

  private renderModel(): void {
    if (this.layer === null || this.unsubscribe === null) return;
    const model = firesideModel(this.sceneStore);
    if (model === null) return;
    this.tweens.killAll();
    this.layer.removeAll(true);
    this.index.clearScene("fireside");
    drawTopBar(this, this.layer, model.topBar);
    drawPrompt(this, this.layer, model.prompt);
    drawFireside(this, this.layer, model, this.index, this.handlers);
    if (model.muster === null) drawTooltip(this, this.layer, model.tooltip, FIRESIDE_ZONES.tooltip);
  }

  /** A redraw replaces the hovered object and Phaser never sends the stale
   * one its `pointerout`, so the tooltip is checked against the pointer. */
  update(): void {
    const sourceId = this.sceneStore.getState().localUi.tooltipSourceId;
    if (sourceId === null) return;
    const { x, y } = this.input.activePointer;
    if (this.index.contains(draftObjectId(sourceId), x, y) || this.index.contains(kitObjectId(sourceId), x, y)) return;
    this.handlers.onSourceHover(null);
  }
}
