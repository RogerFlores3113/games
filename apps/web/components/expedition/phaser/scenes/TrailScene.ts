/**
 * The trail before, between and after camps: redraws every zone from the
 * store's trail model whenever it changes. Clicks only dispatch a request
 * literal or a `local-ui.ts` change; the worker decides whether a pick,
 * vote, equip, buy or Ready is legal.
 */
import Phaser from "phaser";
import { ensurePixelFonts } from "../font/pixel-font";
import { preloadArt, placeArt } from "../art/place-art";
import { STAGE, TRAIL_ZONES, gearLayout, pointInRect, type Point } from "../layout";
import { drawBackdrop, drawPrompt, drawTooltip, drawTopBar } from "../draw/draw-table";
import { drawTrailScene, type FlipClock, type TrailHandlers } from "../draw/draw-trail";
import { gearTile } from "../draw/draw-loadout";
import { PALETTE, toPhaserColor } from "../palette";
import type { TrailModel } from "../../../../lib/expedition/trail-model";
import { equipAfter, tapMove, type Gear, type GearMove } from "../../../../lib/expedition/loadout-model";
import { DRAG_THRESHOLD } from "../../../../lib/expedition/card-drag";
import { setTooltipSource } from "../../../../lib/expedition/local-ui";
import type { ObjectIndex } from "../object-index";
import type { SceneDeps } from "./scene-registry";

function trailModel(store: SceneDeps["store"]): TrailModel | null {
  const model = store.getState().model;
  return model?.sceneKey === "trail" ? model : null;
}

function gearOf(store: SceneDeps["store"]): Gear | null {
  const panel = trailModel(store)?.panel;
  return panel?.kind === "loadout" && panel.gear !== null && !panel.gear.locked ? panel.gear : null;
}

/** Sends the equipped set a move leaves, when it changes anything. */
function equip(store: SceneDeps["store"], gear: Gear, move: GearMove | null): void {
  if (move === null) return;
  const itemUids = equipAfter(gear.equipped, gear.slots.length, move);
  if (itemUids !== null) store.getState().dispatch({ type: "equip", itemUids });
}

/** Where a dragged item lands: a slot under the pointer, or the backpack. */
function dropMove(gear: Gear, uid: string, at: Point): GearMove | null {
  const geo = gearLayout(gear.slots.length);
  const slot = geo.slots.findIndex((rect) => pointInRect(rect, at));
  if (slot !== -1) return { uid, to: { kind: "slot", index: slot } };
  if (pointInRect(geo.packArea, at)) return { uid, to: { kind: "backpack" } };
  return null;
}

/** One press on a gear tile: a tap until the pointer travels, then a drag. */
interface GearGesture {
  uid: string;
  origin: Point;
  ghost: Phaser.GameObjects.Container | null;
  /** Outlines the slot or backpack the item would land in. */
  target: Phaser.GameObjects.Rectangle | null;
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
  private dragLayer: Phaser.GameObjects.Container | null = null;
  private gesture: GearGesture | null = null;
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
        const itemIds = model.panel.draft.bundles.find((b) => b.bundle === bundle)?.itemIds ?? [];
        store.getState().updateLocalUi((ui) => ({ ...ui, takenBundle: itemIds }));
        store.getState().dispatch({ type: "pick-bundle", bundle });
      },
      onVote(choice) {
        store.getState().dispatch({ type: "vote", choice });
      },
      onReady() {
        store.getState().dispatch({ type: "ready" });
      },
      onBuy(stockId) {
        store.getState().dispatch({ type: "buy", stockId });
      },
      onPackPage(delta) {
        store.getState().updateLocalUi((ui) => ({ ...ui, packPage: Math.max(0, ui.packPage + delta) }));
      },
      onGearPress: (uid) => {
        if (gearOf(store) === null) return;
        this.dropGesture();
        this.gesture = { uid, origin: this.pointerAt(), ghost: null, target: null };
      },
      onSourceHover: (sourceKey, objectId) => {
        const state = store.getState();
        if (state.reconnecting || (sourceKey !== null && this.gesture?.ghost != null)) return;
        this.hoverId = sourceKey === null ? null : (objectId ?? null);
        state.updateLocalUi((ui) => setTooltipSource(ui, sourceKey));
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
    this.dragLayer = this.add.container(0, 0);
    this.input.on("pointermove", () => this.onPointerMove());
    this.input.on("pointerup", () => this.onPointerRelease());
    this.input.on("pointerupoutside", () => this.onPointerRelease());

    this.unsubscribe = this.sceneStore.subscribe((next, prev) => {
      if (next.model !== prev.model) this.renderModel();
    });
    this.renderModel();

    // Strict Mode's dev-only double mount destroys the game without
    // stopping the scene, which fires DESTROY but never SHUTDOWN.
    const teardown = () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
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
    drawTopBar(this, this.layer, model.topBar);
    drawPrompt(this, this.layer, model.prompt);
    drawTrailScene(this, this.layer, model, this.index, this.handlers, this.flips);
    if (model.panel.kind !== "muster") drawTooltip(this, this.layer, model.tooltip, TRAIL_ZONES.tooltip);
  }

  /** The loadout shows the camp it sets out for; the rest of the trail
   * rests at the fireside. */
  private renderBackdrop(model: TrailModel): void {
    const backdrop = model.panel.kind === "loadout" ? model.panel.next.backdrop : null;
    if (this.backdropLayer === null || backdrop === this.backdrop) return;
    this.backdropLayer.removeAll(true);
    this.backdropLayer.add(backdrop === null ? placeArt(this, "bg-fireside", STAGE.w / 2, STAGE.h / 2) : drawBackdrop(this, backdrop));
    this.backdrop = backdrop;
  }

  private pointerAt(): Point {
    const p = this.input.activePointer;
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  private dropGesture(): void {
    this.gesture?.ghost?.destroy();
    this.gesture?.target?.destroy();
    this.gesture = null;
  }

  /** The dragged item follows the pointer as a lifted copy of its tile. */
  private onPointerMove(): void {
    const gesture = this.gesture;
    const gear = gearOf(this.sceneStore);
    if (gesture === null || gear === null || this.dragLayer === null) return;
    const at = this.pointerAt();
    if (gesture.ghost === null) {
      if (Math.hypot(at.x - gesture.origin.x, at.y - gesture.origin.y) < DRAG_THRESHOLD) return;
      const item = [...gear.slots.flatMap((s) => (s.item === null ? [] : [s.item])), ...gear.backpack].find((i) => i.uid === gesture.uid);
      if (item === undefined) return this.dropGesture();
      const ghost = this.add.container(0, 0);
      const tile = gearTile(this, item, 104, 22).setPosition(-52, -11);
      ghost.add(this.add.rectangle(-50, -9, 104, 22, 0, 0.4).setOrigin(0, 0));
      ghost.add(tile);
      ghost.add(this.add.rectangle(-52, -11, 104, 22, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
      gesture.target = this.add.rectangle(0, 0, 1, 1, toPhaserColor(PALETTE.turn), 0.25).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn));
      this.dragLayer.add([gesture.target, ghost]);
      gesture.ghost = ghost;
      this.handlers.onSourceHover(null);
    }
    gesture.ghost.setPosition(at.x, at.y);
    const move = dropMove(gear, gesture.uid, at);
    const geo = gearLayout(gear.slots.length);
    const rect = move === null ? null : move.to.kind === "slot" ? geo.slots[move.to.index]! : geo.packArea;
    const lands = move !== null && equipAfter(gear.equipped, gear.slots.length, move) !== null;
    gesture.target?.setVisible(rect !== null && lands);
    if (rect !== null) gesture.target?.setPosition(rect.x, rect.y).setSize(rect.w, rect.h);
  }

  private onPointerRelease(): void {
    const gesture = this.gesture;
    if (gesture === null) return;
    const gear = gearOf(this.sceneStore);
    const dragged = gesture.ghost !== null;
    this.dropGesture();
    if (gear === null) return;
    equip(this.sceneStore, gear, dragged ? dropMove(gear, gesture.uid, this.pointerAt()) : tapMove(gear, gesture.uid));
  }

  /** A redraw replaces the hovered object and Phaser never sends the stale
   * one its `pointerout`, so the tooltip is checked against the pointer. */
  update(): void {
    if (this.sceneStore.getState().localUi.tooltipSourceId === null) return;
    const { x, y } = this.input.activePointer;
    if (this.hoverId !== null && this.index.contains(this.hoverId, x, y)) return;
    this.handlers.onSourceHover(null);
  }
}
