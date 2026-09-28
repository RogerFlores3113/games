/**
 * The camp scene (SCENE-02/03/04/09, D-02/D-03/D-13/D-15): draws the static
 * world once, places the four interactables once, then re-renders the HUD
 * (supplies/camp-number/sign/boss-effect) plus the full table — seats,
 * hand, trick, last-trick glance, and controls — whenever the store's
 * `model` or `cardPackId` changes. Every click handler below only ever
 * calls `store.dispatch`/`store.confirmTargeting`/`store.updateLocalUi`
 * with a fixed request literal or a `local-ui.ts` transition; it never
 * builds the Whisper's server request itself (that is `confirmTargeting`'s
 * job, D-02) and never decides an outcome (spec §7.1).
 */
import Phaser from "phaser";
import { GEAR_DISPLAY } from "@games/rules";
import { ensurePixelFonts } from "../font/pixel-font";
import { ensureCardTextures } from "../card-packs/card-textures";
import { drawStaticWorld, drawHud, setBossEffect } from "../draw/draw-table";
import { drawSeats } from "../draw/draw-seats";
import type { CampHandlers } from "../draw/draw-seats";
import { drawHand, drawLastTrick, drawTrick } from "../draw/draw-hand-trick";
import { drawControls } from "../draw/draw-controls";
import { INTERACTABLE_REGISTRY } from "../interactables/registry";
import { INTERACTABLE_ANCHORS } from "../layout";
import { interactableObjectId, LAST_TRICK_ID } from "../../../../lib/expedition/expedition-ids";
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
} from "../../../../lib/expedition/local-ui";
import type { SceneDeps } from "./scene-registry";

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
      const card = state.model?.hand.find((c) => c.id === cardId) ?? null;
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
      const chip = findObjective(state.model, objectiveId);
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
    // BOTH events (matching BetweenCampsScene's precedent) guarantees
    // `this.unsubscribe` is torn down before the store's next `setServer`
    // can fire `syncFromStore`/`renderModel` on a scene whose `this.add`
    // has already gone null.
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
    if (state.model === null) return;
    if (state.cardPackId !== this.lastCardPackId) {
      const glyphs = ensurePixelFonts(this);
      ensureCardTextures(this, state.cardPackId, glyphs);
      this.lastCardPackId = state.cardPackId;
    }
    this.renderModel(state.model);
  }

  renderModel(model: SceneModel): void {
    if (this.dynamicLayer === null || this.unsubscribe === null) return;
    this.dynamicLayer.removeAll(true);
    drawHud(this, this.dynamicLayer, model);
    const effect = model.bossTwist !== null && !model.bossTwist.cancelled ? model.bossTwist.effect : "none";
    setBossEffect(this, effect);
    this.renderTable(model);
    this.previousModel = model;
  }

  /** Seats, hand, trick, last-trick glance and controls — all drawn from
   * `model` alone (SCENE-02/03/04).
   *
   * `drawHand` runs FIRST (not after seats) so the viewer's own seat (D-13:
   * seat 0 sits just below the stump, at the bottom of the table, right
   * where the hand fans out per `layout.ts`'s `seatAnchors`/`HAND_Y`)
   * renders ON TOP of the hand rather than being covered by it — the
   * viewer's own gear row (`GEAR_ROW_Y`) and objective row
   * (`OBJECTIVE_ROW_Y`) both fall inside the hand's vertical span, so with
   * the hand drawn last (topmost, as it originally was) every hand card
   * silently swallowed clicks meant for the viewer's own gear/objectives —
   * discovered via Plan 12-13's full-camp e2e, which found gear use
   * (D-02/GEAR-05) unusable at the table. `drawControls` (which draws the
   * Confirm/Cancel pair anchored on the gear/objective just clicked) stays
   * last so it remains topmost above both. */
  renderTable(model: SceneModel): void {
    if (this.dynamicLayer === null) return;
    const layer = this.dynamicLayer;
    drawHand(this, layer, model, this.index, this.handlers);
    drawSeats(this, layer, model, this.index, this.handlers);
    drawTrick(this, layer, model, this.index, this.previousModel);
    drawLastTrick(this, layer, model, this.index, this.handlers);
    drawControls(this, layer, model, this.index, this.handlers);
  }

  /** D-06 self-heal: opening the last-trick glance (`onLastTrickHover`)
   * itself triggers a store update, which `renderModel` answers by
   * destroying and recreating the WHOLE dynamic layer — including the very
   * pile container the pointer is currently over. Phaser's own hover
   * bookkeeping (which object the pointer is "currently over", used to
   * decide whether a future move away should fire `pointerout`) still
   * points at that now-destroyed instance; a real pointer leaving the
   * pile's on-screen area afterward never emits a `pointerout` for it, so
   * the glance can get stuck open even though `pointerover` (entering)
   * still fires correctly on the fresh instance every time (found via
   * Plan 12-13's full-camp e2e). Every frame the glance is open, check the
   * pointer's CURRENT position against the pile's CURRENT registered
   * bounds directly (not Phaser's event-transition state) and close it the
   * moment the pointer is no longer over it — self-correcting regardless
   * of how the object was drawn or redrawn. */
  update(): void {
    const state = this.sceneStore.getState();
    if (!state.localUi.lastTrickOpen) return;
    const entry = this.index.entries().find((e) => e.id === LAST_TRICK_ID);
    if (entry === undefined) return;
    const pointer = this.input.activePointer;
    const within =
      pointer.x >= entry.bounds.x &&
      pointer.x <= entry.bounds.x + entry.bounds.width &&
      pointer.y >= entry.bounds.y &&
      pointer.y <= entry.bounds.y + entry.bounds.height;
    if (!within) {
      this.handlers.onLastTrickHover(false);
    }
  }
}
