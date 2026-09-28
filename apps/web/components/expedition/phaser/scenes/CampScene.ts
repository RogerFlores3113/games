/**
 * The camp scene (SCENE-02/03/04/09, D-03/D-13/D-15): draws the static
 * world once, places the four interactables once, then re-renders the HUD
 * (supplies/camp-number/sign/boss-effect) whenever the store's `model` or
 * `cardPackId` changes. `renderTable(model)` is a deliberate no-op extension
 * point — Plan 12-09 fills it with seats/hand/trick drawing; this plan only
 * proves the static layer + HUD + interactables + subscribe/redraw wiring.
 */
import Phaser from "phaser";
import { ensurePixelFonts } from "../font/pixel-font";
import { ensureCardTextures } from "../card-packs/card-textures";
import { drawStaticWorld, drawHud, setBossEffect } from "../draw/draw-table";
import { INTERACTABLE_REGISTRY } from "../interactables/registry";
import { INTERACTABLE_ANCHORS } from "../layout";
import { interactableObjectId } from "../../../../lib/expedition/expedition-ids";
import { ObjectIndex } from "../object-index";
import type { SceneModel } from "../../../../lib/expedition/build-scene-model";
import type { SceneDeps } from "./scene-registry";

export class CampScene extends Phaser.Scene {
  private readonly sceneStore: SceneDeps["store"];
  private readonly index: ObjectIndex;
  private unsubscribe: (() => void) | null = null;
  private dynamicLayer: Phaser.GameObjects.Container | null = null;
  private lastCardPackId: string | null = null;

  constructor(deps: SceneDeps) {
    super("camp");
    this.sceneStore = deps.store;
    this.index = deps.index;
  }

  create(): void {
    const state = this.sceneStore.getState();
    const glyphs = ensurePixelFonts(this);
    ensureCardTextures(this, state.cardPackId, glyphs);
    this.lastCardPackId = state.cardPackId;

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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.index.clearScene("camp");
    });
  }

  private syncFromStore(): void {
    const state = this.sceneStore.getState();
    if (state.model === null) return;
    if (state.cardPackId !== this.lastCardPackId) {
      const glyphs = ensurePixelFonts(this);
      ensureCardTextures(this, state.cardPackId, glyphs);
      this.lastCardPackId = state.cardPackId;
    }
    this.renderModel(state.model);
  }

  renderModel(model: SceneModel): void {
    if (this.dynamicLayer === null) return;
    this.dynamicLayer.removeAll(true);
    drawHud(this, this.dynamicLayer, model);
    const effect = model.bossTwist !== null && !model.bossTwist.cancelled ? model.bossTwist.effect : "none";
    setBossEffect(this, effect);
    this.renderTable(model);
  }

  /** Extension point: Plan 12-09 fills this with seats/hand/trick drawing,
   * registering each dynamic object's id in the shared `ObjectIndex`. */
  renderTable(_model: SceneModel): void {
    // Filled by Plan 12-09.
  }
}
