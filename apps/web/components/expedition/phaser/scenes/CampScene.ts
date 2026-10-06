/**
 * The camp scene: draws the world and its interactables once, then
 * redraws every zone (top bar, prompt, seats, hand, trick, last trick,
 * tooltip, actions) from the store's `model` whenever it changes. Click
 * handlers only call `store.dispatch`/`store.confirmTargeting`/
 * `store.updateLocalUi` with a fixed request literal or a `local-ui.ts`
 * transition; they never decide an outcome.
 */
import Phaser from "phaser";
import { ensurePixelFonts } from "../font/pixel-font";
import { ensureCardTextures } from "../card-packs/card-textures";
import { drawBackdrop, drawPrompt, drawTooltip, drawTopBar } from "../draw/draw-table";
import { WeatherOverlay, drawModStrip } from "../draw/draw-weather";
import { drawCrowdAndTable, drawPlates, drawYouPanel } from "../draw/draw-seats";
import { drawKitBar, type KitBarHandlers } from "../draw/draw-kit-bar";
import { InventoryWindow, type InventoryHandlers } from "../draw/inventory-window";
import { drawTrailMap } from "../draw/draw-trail";
import type { CampHandlers } from "../draw/camp-handlers";
import { preloadArt } from "../art/place-art";
import { drawBoardPick, drawDropTarget, drawHand, drawLastTrick, drawTrick } from "../draw/draw-hand-trick";
import { drawControls, drawTableOverlays } from "../draw/draw-controls";
import { drawWhispers } from "../draw/draw-whispers";
import { drawBossCaption, placeBosses, worldKey } from "../draw/draw-boss";
import { drawTemplePath } from "../draw/draw-temple";
import { TEMPLE_PATH_ID } from "../../../../lib/expedition/temple-model";
import { BossFx } from "../draw/draw-boss-fx";
import { bossObjectId } from "../../../../lib/expedition/boss-model";
import { INTERACTABLE_REGISTRY } from "../interactables/registry";
import { CARD_H, CARD_W, HAND_CARD_Y, INTERACTABLE_ANCHORS, INVENTORY_WINDOW, ZONES, handFanXs, pointInRect, type Point } from "../layout";
import { PALETTE, toPhaserColor } from "../palette";
import { CURSOR } from "../cursors";
import { cardTextureKey } from "../card-packs/card-pack-def";
import { reduceDrag, type DragEffect, type DragEvent } from "../../../../lib/expedition/card-drag";
import { interactableObjectId, LAST_TRICK_ID, mateSourceObjectId, modObjectId, sourceObjectId, TRAIL_MAP_ID } from "../../../../lib/expedition/expedition-ids";
import { ObjectIndex } from "../object-index";
import { playCue } from "../../../../lib/expedition/audio/cue-bus";
import type { ObjectiveChip, SceneModel } from "../../../../lib/expedition/build-scene-model";
import {
  beginAbilityTargeting,
  beginWhisper,
  cancelTargeting,
  choiceFor,
  confirmTargeting as confirmLocal,
  currentStep,
  nextTrayPage,
  repickLast,
  selectTarget,
  setDrag,
  setHoveredCard,
  setLastTrickOpen,
  setTooltipMateSource,
  setTooltipMod,
  setTooltipObjective,
  setTooltipSource,
  type PickEntity,
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

/** Picks the clicked thing for the current target step when the server
 * offers it as a choice. True when it was picked. */
function pickForTargeting(store: SceneDeps["store"], entity: PickEntity, rawId: string): boolean {
  const state = store.getState();
  const view = state.server?.game;
  if (view === undefined || state.localUi.targeting === null) return false;
  const choice = choiceFor(state.localUi, view, entity, rawId);
  if (choice === null) return false;
  state.updateLocalUi((ui, v) => selectTarget(ui, v, choice));
  return true;
}

function buildHandlers(store: SceneDeps["store"], pointer: () => Point): CampHandlers {
  const handlers: CampHandlers = {
    onCard(cardId) {
      const state = store.getState();
      if (state.reconnecting) return;
      if (pickForTargeting(store, "card", cardId)) return;
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
      if (pickForTargeting(store, "objective", objectiveId)) return;
      const chip = findObjective(campModel(store), objectiveId);
      if (chip?.pickable) {
        state.dispatch({ type: "pick-objective", objectiveId });
      }
    },
    onPick(entity, rawId) {
      const state = store.getState();
      if (state.reconnecting) return;
      pickForTargeting(store, entity, rawId);
    },
    onTrayPick(choiceId) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui, view) => selectTarget(repickLast(ui, view, choiceId), view, choiceId));
    },
    onTrayMore() {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => nextTrayPage(ui));
    },
    onSource(sourceKey) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui, view) => beginAbilityTargeting(ui, view, sourceKey));
    },
    onSourceHover(sourceKey) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => setTooltipSource(ui, sourceKey));
    },
    onObjectiveHover(objectiveId) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => setTooltipObjective(ui, objectiveId));
    },
    onMateSourceHover(mate) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => setTooltipMateSource(ui, mate));
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
    onGateUse(sourceKey) {
      const state = store.getState();
      if (state.reconnecting) return;
      const steps = state.server?.game.yourAbilities.find((a) => a.sourceKey === sourceKey)?.steps ?? [];
      if (steps.length === 0) {
        state.dispatch({ type: "use-ability", sourceKey, targets: [] });
        return;
      }
      state.updateLocalUi((ui, view) => beginAbilityTargeting(ui, view, sourceKey));
    },
    onGateSkip() {
      const state = store.getState();
      if (state.reconnecting) return;
      state.dispatch({ type: "skip-window" });
    },
    onLastTrickHover(open) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => setLastTrickOpen(ui, open));
    },
    onModHover(modId) {
      const state = store.getState();
      if (state.reconnecting) return;
      state.updateLocalUi((ui) => setTooltipMod(ui, modId));
    },
  };
  return handlers;
}

/** The inventory window in camp opens only while a power is aimed at your
 * items (Pack Animal's swap): a click picks, and the last pick uses it. */
function inventoryHandlers(store: SceneDeps["store"]): InventoryHandlers {
  const none = () => undefined;
  return {
    onEquip: none,
    onDiscardAsk: none,
    onDiscardConfirm: none,
    onDiscardKeep: none,
    onPick(uid) {
      const state = store.getState();
      const view = state.server?.game;
      if (state.reconnecting || view === undefined || !(currentStep(state.localUi, view)?.choices.includes(`item:${uid}`) ?? false)) return;
      state.updateLocalUi((ui, v) => selectTarget(ui, v, `item:${uid}`));
      const after = store.getState();
      if (confirmLocal(after.localUi, after.server!.game).request !== null) after.confirmTargeting();
    },
    onCancelAim: () => store.getState().updateLocalUi((ui) => cancelTargeting(ui)),
    onClose: () => store.getState().updateLocalUi((ui) => cancelTargeting(ui)),
  };
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
  private backdropLayer: Phaser.GameObjects.Container | null = null;
  private backdropLocation: string | null = null;
  private bossLayer: Phaser.GameObjects.Container | null = null;
  private bossKey: string | null = null;
  /** The world's furniture, which steps aside while a boss or the temple's
   * helpers stand there. */
  private furniture: Phaser.GameObjects.Components.Visible[] = [];
  private weather: WeatherOverlay | null = null;
  private fx: BossFx | null = null;
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
  private cursorHeld = false;
  private inventory: InventoryWindow | null = null;
  private kitHandlers!: KitBarHandlers;
  /** The kit bar entry the tooltip names: its source and the object under the pointer. */
  private kitHover: { sourceKey: string; objectId: string } | null = null;

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
    this.kitHandlers = {
      onUse: (sourceKey) => {
        this.sceneStore.getState().updateLocalUi((ui) => ({ ...ui, kitOpen: false }));
        this.handlers.onSource(sourceKey);
      },
      onHover: (sourceKey, objectId) => {
        this.kitHover = sourceKey === null || objectId === undefined ? null : { sourceKey, objectId };
        this.handlers.onSourceHover(sourceKey);
      },
      onToggle: () => this.sceneStore.getState().updateLocalUi((ui) => ({ ...ui, kitOpen: !ui.kitOpen })),
    };

    this.backdropLayer = this.add.container(0, 0);
    this.backdropLocation = null;

    this.furniture = [];
    for (const [id, def] of Object.entries(INTERACTABLE_REGISTRY)) {
      const anchor = INTERACTABLE_ANCHORS[id as keyof typeof INTERACTABLE_ANCHORS];
      const root = def.place(this, anchor);
      if (pointInRect(ZONES.world, anchor)) this.furniture.push(root as Phaser.GameObjects.Container);
      root.on("pointerdown", () => def.onClick(this, root));
      this.index.register("camp", interactableObjectId(id), root as Phaser.GameObjects.Container);
    }

    const skyLayer = this.add.container(0, 0);
    this.bossLayer = this.add.container(0, 0);
    this.bossKey = null;
    this.dynamicLayer = this.add.container(0, 0);
    this.fx = new BossFx(this, this.add.container(0, 0), this.index);
    this.dragLayer = this.add.container(0, 0);
    this.weather = new WeatherOverlay(this, skyLayer, this.add.container(0, 0));
    const table = ZONES.table;
    this.tableGlow = this.add.rectangle(table.x, table.y, table.w, table.h, toPhaserColor(PALETTE.turn), 0.22).setOrigin(0, 0).setVisible(false);
    this.dragLayer.add(this.tableGlow);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.lastDown = this.pointerAt();
      if (pointer.rightButtonDown()) this.handlers.onCancel();
    });
    this.input.mouse?.disableContextMenu();
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.sceneStore.getState().localUi.mapOpen) this.toggleMap();
      else this.handlers.onCancel();
    });
    this.input.on("pointermove", () => this.onPointerMove());
    this.input.on("pointerup", () => this.onPointerRelease());
    this.input.on("pointerupoutside", () => this.onPointerRelease());

    this.inventory = new InventoryWindow(this, this.index, "camp", inventoryHandlers(this.sceneStore), INVENTORY_WINDOW, ZONES.prompt.y + ZONES.prompt.h + 2);

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
      this.inventory?.destroy();
      this.inventory = null;
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

  /** The backdrop follows the camp's location (the temple's own at the
   * temple); the overlay its weather. */
  private renderSky(model: SceneModel): void {
    if (this.backdropLayer !== null && this.backdropLocation !== model.sky.backdrop) {
      this.backdropLayer.removeAll(true);
      this.backdropLayer.add(drawBackdrop(this, model.sky.backdrop));
      this.backdropLocation = model.sky.backdrop;
    }
    this.weather?.setSky(model.sky);
    this.weather?.flash(model.sky.strike);
  }

  /** The boss sprites are rebuilt only when the bosses change, so their
   * idle bob is not restarted by every redraw. */
  private renderBoss(model: SceneModel): void {
    const key = worldKey(model);
    if (this.bossLayer === null || this.bossKey === key) return;
    placeBosses(this, this.bossLayer, model, this.index, this.handlers);
    this.bossKey = key;
    for (const piece of this.furniture) piece.setVisible(key === null);
  }

  renderModel(model: SceneModel): void {
    if (this.dynamicLayer === null || this.unsubscribe === null) return;
    this.renderSky(model);
    this.renderBoss(model);
    this.bossLayer?.setVisible(model.trailMap === null);
    const chipsBefore = this.fx?.chipSpots(this.previousModel) ?? new Map();
    this.dynamicLayer.removeAll(true);
    drawCrowdAndTable(this, this.dynamicLayer, model, this.index, this.handlers);
    const span = drawTopBar(this, this.dynamicLayer, model.topBar, {
      index: this.index,
      sceneKey: "camp",
      onMap: () => this.toggleMap(),
      onSupplies: () => this.handlers.onPick("supplies", ""),
    });
    drawModStrip(this, this.dynamicLayer, model.mods, span, this.index, this.handlers);
    drawPrompt(this, this.dynamicLayer, model.prompt);
    // The backpack open for a swap stands alone over the table, so nothing
    // under its veil takes a click.
    const packOpen = model.inventory?.open ?? false;
    if (!packOpen) {
      this.renderTable(model);
      drawKitBar(this, this.dynamicLayer, model.kitBar, ZONES.kit, 2, this.index, "camp", this.kitHandlers);
      drawTooltip(this, this.dynamicLayer, model.tooltip, ZONES.tooltip);
      if (model.trailMap !== null) this.index.register("camp", TRAIL_MAP_ID, drawTrailMap(this, this.dynamicLayer, model.trailMap));
    }
    this.inventory?.draw(this.dynamicLayer, model.inventory);
    this.fx?.afterDraw();
    this.fx?.play(model, this.previousModel, chipsBefore);
    this.previousModel = model;
  }

  renderTable(model: SceneModel): void {
    if (this.dynamicLayer === null) return;
    const layer = this.dynamicLayer;
    // The trail map hangs over the plates and the whispers while it is shown.
    const mapShown = model.trailMap !== null;
    if (!mapShown) drawPlates(this, layer, model, this.index, this.handlers);
    drawYouPanel(this, layer, model, this.index, this.handlers);
    drawHand(this, layer, model, this.index, this.handlers);
    drawDropTarget(this, layer, model);
    drawTrick(this, layer, model, this.index, this.handlers, this.previousModel, this.dropOrigin);
    if (this.sceneStore.getState().localUi.drag.phase === "idle") this.dropOrigin = null;
    drawLastTrick(this, layer, model, this.index, this.handlers);
    if (!mapShown) drawWhispers(this, layer, model, this.index);
    if (!mapShown) drawBossCaption(this, layer, model);
    const before = this.previousModel?.temple;
    const pressedNow = model.temple !== null && before !== undefined && before !== null && before.key === model.temple.key && model.temple.pressed > before.pressed;
    drawTemplePath(this, layer, model, this.index, this.handlers, pressedNow);
    drawControls(this, layer, model, this.index, this.handlers);
    drawBoardPick(this, layer, model, this.index, this.handlers);
    drawTableOverlays(this, layer, model, this.index, this.handlers);
  }

  private toggleMap(): void {
    const state = this.sceneStore.getState();
    if (state.reconnecting) return;
    playCue("sfx-ui-click");
    state.updateLocalUi((ui) => ({ ...ui, mapOpen: !ui.mapOpen }));
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
    const effect = this.drive({ type: "release", overTable: pointInRect(ZONES.table, at) });
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
    this.holdCursor(drag.phase === "dragging");
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
      this.tableGlow?.setVisible(drag.legal && pointInRect(ZONES.table, at));
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

  /** The closed glove while a card is dragged, over whatever it passes;
   * the plain glove when it lets go, until the pointer finds something. */
  private holdCursor(dragging: boolean): void {
    if (dragging) this.input.manager.canvas.style.cursor = CURSOR.grabbing;
    else if (this.cursorHeld) this.input.manager.canvas.style.cursor = CURSOR.default;
    this.cursorHeld = dragging;
  }

  /** Hover state is checked against the pointer every frame because a
   * redraw replaces the hovered object, and Phaser then never sends the
   * stale object its `pointerout`: the glance, lift or tooltip would stick. */
  update(): void {
    this.syncDrag();
    const ui = this.sceneStore.getState().localUi;
    if (!ui.lastTrickOpen && ui.hoveredCardId === null && ui.tooltipSourceId === null && ui.tooltipObjectiveId === null && ui.tooltipMateSource === null && ui.tooltipModId === null) return;
    const { x, y } = this.input.activePointer;
    const over = (id: string): boolean => this.index.contains(id, x, y);
    if (ui.lastTrickOpen && !over(LAST_TRICK_ID)) this.handlers.onLastTrickHover(false);
    if (ui.hoveredCardId !== null) {
      const card = campModel(this.sceneStore)?.hand.find((c) => c.id === ui.hoveredCardId);
      if (card === undefined || !over(card.objectId)) this.handlers.onCardHover(null);
    }
    if (ui.tooltipSourceId !== null) {
      const hovered = this.kitHover?.sourceKey === ui.tooltipSourceId ? this.kitHover.objectId : sourceObjectId(ui.tooltipSourceId);
      if (!over(hovered)) {
        this.kitHover = null;
        this.handlers.onSourceHover(null);
      }
    }
    if (ui.tooltipObjectiveId !== null) {
      const chip = findObjective(campModel(this.sceneStore), ui.tooltipObjectiveId);
      if (chip === null || !over(chip.objectId)) this.handlers.onObjectiveHover(null);
    }
    if (ui.tooltipMateSource !== null && !over(mateSourceObjectId(ui.tooltipMateSource.seatId, ui.tooltipMateSource.sourceKey))) {
      this.handlers.onMateSourceHover(null);
    }
    if (ui.tooltipModId !== null && !over(modObjectId(ui.tooltipModId)) && !over(bossObjectId(ui.tooltipModId)) && !(ui.tooltipModId === "temple" && over(TEMPLE_PATH_ID))) {
      this.handlers.onModHover(null);
    }
  }
}
