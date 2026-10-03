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
import { drawDropTarget, drawHand, drawLastTrick, drawTrick } from "../draw/draw-hand-trick";
import { drawControls } from "../draw/draw-controls";
import { drawWhispers } from "../draw/draw-whispers";
import { INTERACTABLE_REGISTRY } from "../interactables/registry";
import { CARD_H, CARD_W, HAND_CARD_Y, INTERACTABLE_ANCHORS, ZONES, handFanXs, pointInRect, type Point } from "../layout";
import { PALETTE, toPhaserColor } from "../palette";
import { cardTextureKey } from "../card-packs/card-pack-def";
import { reduceDrag, type DragEffect, type DragEvent } from "../../../../lib/expedition/card-drag";
import { gearObjectId, interactableObjectId, LAST_TRICK_ID, mateGearObjectId } from "../../../../lib/expedition/expedition-ids";
import { ObjectIndex } from "../object-index";
import type { ObjectiveChip, SceneModel } from "../../../../lib/expedition/build-scene-model";
import {
  beginGearTargeting,
  beginWhisper,
  cancelTargeting,
  nextTargetKind,
  selectTarget,
  setDrag,
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

function buildHandlers(store: SceneDeps["store"], pointer: () => Point): CampHandlers {
  const handlers: CampHandlers = {
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
    onCardPress(cardId) {
      const state = store.getState();
      if (state.reconnecting) return;
      if (state.localUi.targeting !== null) {
        handlers.onCard(cardId);
        return;
      }
      const card = campModel(store)?.hand.find((c) => c.id === cardId) ?? null;
      if (card === null) return;
      const at = pointer();
      state.updateLocalUi((ui) => setDrag(ui, reduceDrag(ui.drag, { type: "press", cardId, at, legal: card.playable, reason: card.blockedReason }).state));
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
  return handlers;
}

const GHOST_SCALE = 1.2;
const GHOST_SHADOW = 3;
const RETURN_MS = 140;
const REASON_HOLD_MS = 1600;
const PLAY_TIMEOUT_MS = 1500;

export class CampScene extends Phaser.Scene {
  private readonly sceneStore: SceneDeps["store"];
  private readonly index: ObjectIndex;
  private handlers!: CampHandlers;
  private unsubscribe: (() => void) | null = null;
  private dynamicLayer: Phaser.GameObjects.Container | null = null;
  private lastCardPackId: string | null = null;
  private previousModel: SceneModel | null = null;
  private dragLayer: Phaser.GameObjects.Container | null = null;
  private ghost: Phaser.GameObjects.Container | null = null;
  private ghostCardId: string | null = null;
  private tableGlow: Phaser.GameObjects.Rectangle | null = null;
  private lastDown: Point = { x: 0, y: 0 };
  private dropOrigin: Point | null = null;
  private returnTween: Phaser.Tweens.Tween | null = null;
  private settleTimer: Phaser.Time.TimerEvent | null = null;

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
    this.handlers = buildHandlers(this.sceneStore, () => this.pointerAt());

    drawStaticWorld(this);

    for (const [id, def] of Object.entries(INTERACTABLE_REGISTRY)) {
      const anchor = INTERACTABLE_ANCHORS[id as keyof typeof INTERACTABLE_ANCHORS];
      const root = def.place(this, anchor);
      root.on("pointerdown", () => def.onClick(this, root));
      this.index.register("camp", interactableObjectId(id), root as Phaser.GameObjects.Container);
    }

    this.dynamicLayer = this.add.container(0, 0);
    this.dragLayer = this.add.container(0, 0);
    const stump = ZONES.stump;
    this.tableGlow = this.add.rectangle(stump.x, stump.y, stump.w, stump.h, toPhaserColor(PALETTE.turn), 0.22).setOrigin(0, 0).setVisible(false);
    this.dragLayer.add(this.tableGlow);
    this.input.on("pointerdown", () => {
      this.lastDown = this.pointerAt();
    });
    this.input.on("pointermove", () => this.onPointerMove());
    this.input.on("pointerup", () => this.onPointerRelease());
    this.input.on("pointerupoutside", () => this.onPointerRelease());

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
    drawDropTarget(this, layer, model);
    drawTrick(this, layer, model, this.index, this.previousModel, this.dropOrigin);
    if (this.sceneStore.getState().localUi.drag.phase === "idle") this.dropOrigin = null;
    drawLastTrick(this, layer, model, this.index, this.handlers);
    drawWhispers(this, layer, model, this.index);
    drawControls(this, layer, model, this.index, this.handlers);
  }

  private pointerAt(): Point {
    const p = this.input.activePointer;
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  /** Feeds one event to the drag machine and adopts the result. */
  private drive(event: DragEvent): DragEffect {
    const state = this.sceneStore.getState();
    const { state: next, effect } = reduceDrag(state.localUi.drag, event);
    state.updateLocalUi((ui) => setDrag(ui, next));
    return effect;
  }

  private onPointerMove(): void {
    const phase = this.sceneStore.getState().localUi.drag.phase;
    if (phase !== "pressed" && phase !== "dragging") return;
    this.drive({ type: "move", at: this.pointerAt() });
  }

  private onPointerRelease(): void {
    const phase = this.sceneStore.getState().localUi.drag.phase;
    if (phase !== "pressed" && phase !== "dragging") return;
    const at = this.pointerAt();
    const effect = this.drive({ type: "release", overTable: pointInRect(ZONES.stump, at) });
    if (effect.kind === "click") this.handlers.onCard(effect.cardId);
    if (effect.kind === "play") {
      this.dropOrigin = this.ghost === null ? { x: at.x, y: at.y - CARD_H / 2 } : { x: this.ghost.x, y: this.ghost.y - CARD_H / 2 };
      this.handlers.onCard(effect.cardId);
    }
  }

  private clearSettle(): void {
    this.settleTimer?.remove();
    this.settleTimer = null;
  }

  private settleAfter(ms: number): void {
    if (this.settleTimer !== null) return;
    this.settleTimer = this.time.delayedCall(ms, () => {
      this.settleTimer = null;
      this.drive({ type: "settle" });
    });
  }

  private dropGhost(): void {
    this.returnTween?.stop();
    this.returnTween = null;
    this.ghost?.destroy();
    this.ghost = null;
    this.ghostCardId = null;
  }

  private ensureGhost(model: SceneModel, cardId: string): void {
    if (this.ghost !== null && this.ghostCardId === cardId) return;
    this.dropGhost();
    const card = model.hand.find((c) => c.id === cardId);
    if (card === undefined || this.dragLayer === null) return;
    const ghost = this.add.container(0, 0);
    ghost.add(this.add.rectangle(GHOST_SHADOW, GHOST_SHADOW, CARD_W, CARD_H, 0, 0.4));
    ghost.add(this.add.image(0, 0, cardTextureKey(model.cardPackId, card.label, "full")));
    ghost.setScale(GHOST_SCALE);
    this.dragLayer.add(ghost);
    this.ghost = ghost;
    this.ghostCardId = cardId;
  }

  /** The held card follows the pointer; the table glows while a legal card
   * is over it; a rejected card flies home. Runs every frame because none of
   * it is in the model: the pointer is not state. */
  private syncDrag(): void {
    const drag = this.sceneStore.getState().localUi.drag;
    const model = campModel(this.sceneStore);
    if (model === null || drag.phase === "idle") {
      this.dropGhost();
      this.clearSettle();
      this.tableGlow?.setVisible(false);
      return;
    }
    if (drag.phase === "pressed") {
      this.dropGhost();
      this.clearSettle();
      this.tableGlow?.setVisible(false);
      return;
    }
    const at = this.pointerAt();
    if (drag.phase === "dragging") {
      this.clearSettle();
      this.ensureGhost(model, drag.cardId);
      const slot = model.hand.findIndex((c) => c.id === drag.cardId);
      const slotX = handFanXs(model.hand.length)[slot] ?? at.x;
      const grabX = slotX + CARD_W / 2 - this.lastDown.x;
      const grabY = HAND_CARD_Y + CARD_H / 2 - this.lastDown.y;
      this.ghost?.setPosition(Math.round(at.x + grabX), Math.round(at.y + grabY));
      this.tableGlow?.setVisible(drag.legal && pointInRect(ZONES.stump, at));
      return;
    }
    this.tableGlow?.setVisible(false);
    if (drag.phase === "playing") {
      this.settleAfter(PLAY_TIMEOUT_MS);
      return;
    }
    // returning
    if (this.ghost !== null && this.returnTween === null) {
      const slot = model.hand.findIndex((c) => c.id === drag.cardId);
      const slotX = handFanXs(model.hand.length)[slot] ?? this.ghost.x;
      this.returnTween = this.tweens.add({
        targets: this.ghost,
        x: slotX + CARD_W / 2,
        y: HAND_CARD_Y + CARD_H / 2,
        scale: 1,
        duration: RETURN_MS,
        ease: "Quad.easeOut",
      });
    }
    this.settleAfter(drag.reason === null && this.ghost !== null ? RETURN_MS : REASON_HOLD_MS);
  }

  /** Hover state is checked against the pointer every frame because a
   * redraw replaces the hovered object, and Phaser then never sends the
   * stale object its `pointerout`: the glance, lift or tooltip would stick. */
  update(): void {
    this.syncDrag();
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
