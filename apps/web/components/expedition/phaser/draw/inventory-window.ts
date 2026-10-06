/**
 * The inventory window: the backpack's six patches on its leather, your
 * item slots below them, what the hovered item does on the right, and a
 * discard patch. Icons only; hovering one names it. A click moves an item
 * between the backpack and the slots, a drag swaps slots or drops it on the
 * discard patch, and while a power is aimed at an item a click picks it.
 * Every value comes from the `Inventory` model and every change goes
 * through the handlers, so the camp scene can open the same window.
 */
import type Phaser from "phaser";
import { CURSOR } from "../cursors";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL, SIGN_CELL, WORLD_SIGN_FONT } from "../font/font-keys";
import { INVENTORY_CELL, INVENTORY_WINDOW, STAGE, inventoryLayout, pointInRect, type InventoryLayout, type Point, type Rect } from "../layout";
import { placeArt } from "../art/place-art";
import { sourceArtId } from "../art/art-registry";
import type { ObjectIndex } from "../object-index";
import type { SceneKey } from "../../../../lib/expedition/build-scene-model";
import { clickMove, equipAfter, type Inventory, type InventoryCell, type InventoryItem, type ItemMove } from "../../../../lib/expedition/inventory-model";
import { DISCARD_CONFIRM_ID, DISCARD_ID, DISCARD_KEEP_ID, INVENTORY_CANCEL_ID, INVENTORY_CLOSE_ID } from "../../../../lib/expedition/expedition-ids";
import { DRAG_THRESHOLD } from "../../../../lib/expedition/card-drag";
import { fitLabel, wrapWords } from "./text-fit";
import { DIM_ALPHA, button, labelWidth, plate, text, type Layer } from "./ui-kit";

export interface InventoryHandlers {
  /** The equipped set a click or drop leaves. */
  onEquip(itemUids: string[]): void;
  /** An item dropped on the discard patch: ask before it goes. */
  onDiscardAsk(uid: string): void;
  onDiscardConfirm(): void;
  onDiscardKeep(): void;
  /** An item picked for the power being aimed. */
  onPick(uid: string): void;
  onCancelAim(): void;
  onClose(): void;
}

/** One press on an item: a click until the pointer travels, then a drag. */
interface Gesture {
  uid: string;
  origin: Point;
  ghost: Phaser.GameObjects.Container | null;
  /** Outlines where the item would land. */
  target: Phaser.GameObjects.Rectangle | null;
}

type Drop = { kind: "move"; move: ItemMove } | { kind: "discard" };

const LINE = LABEL_CELL.h + 1;
const ICON_SCALE = 2;
const TITLE = "Backpack";
/** Between camps the veil starts under the trail map, which stays in view. */
const TRAIL_VEIL_TOP = 110;
const INFO_HINT = "Point at an item to read it. Click one to move it between your backpack and your slots, or drag it.";
const READ_HINT = "Point at an item to read it.";

export class InventoryWindow {
  private model: Inventory | null = null;
  private geo: InventoryLayout | null = null;
  private gesture: Gesture | null = null;
  private hoverUid: string | null = null;
  private notice: string | null = null;
  /** The model's items when the notice was given: it clears once they change. */
  private noticeFor = "";
  private info: Phaser.GameObjects.Container | null = null;
  private footer: Phaser.GameObjects.Container | null = null;
  private readonly dragLayer: Phaser.GameObjects.Container;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly index: ObjectIndex,
    private readonly sceneKey: SceneKey,
    private readonly handlers: InventoryHandlers,
    private readonly rect: Rect = INVENTORY_WINDOW,
    private readonly veilTop: number = TRAIL_VEIL_TOP,
  ) {
    this.dragLayer = scene.add.container(0, 0).setDepth(1000);
    scene.input.on("pointermove", this.onPointerMove, this);
    scene.input.on("pointerup", this.onPointerRelease, this);
    scene.input.on("pointerupoutside", this.onPointerRelease, this);
    scene.input.on("pointerdown", this.onPointerDown, this);
    scene.input.keyboard?.on("keydown-ESC", this.onEscape, this);
  }

  /** Whether the window is showing. */
  get isOpen(): boolean {
    return this.model?.open ?? false;
  }

  destroy(): void {
    this.dropGesture();
    this.scene.input.off("pointermove", this.onPointerMove, this);
    this.scene.input.off("pointerup", this.onPointerRelease, this);
    this.scene.input.off("pointerupoutside", this.onPointerRelease, this);
    this.scene.input.off("pointerdown", this.onPointerDown, this);
    this.scene.input.keyboard?.off("keydown-ESC", this.onEscape, this);
    this.dragLayer.destroy();
  }

  /** Draws the window into `layer` while the model says it is open. The
   * caller clears `layer` and the scene's index before every draw. */
  draw(layer: Layer, model: Inventory | null): void {
    const signature = model === null ? "" : `${model.equipped.join(",")}|${model.backpack.map((c) => c.item?.uid ?? "").join(",")}`;
    if (signature !== this.noticeFor) this.notice = null;
    this.model = model;
    this.info = null;
    this.footer = null;
    if (model === null || !model.open) {
      this.geo = null;
      this.hoverUid = null;
      this.dropGesture();
      return;
    }
    const geo = inventoryLayout(this.rect, model.slots.length, model.backpack.length);
    this.geo = geo;
    if (this.hoverUid !== null && this.itemOf(this.hoverUid) === null) this.hoverUid = null;

    layer.add(this.scene.add.rectangle(0, this.veilTop, STAGE.w, STAGE.h - this.veilTop, toPhaserColor(PALETTE.letterbox), 0.6).setOrigin(0, 0));
    layer.add(placeArt(this.scene, "leather-panel", this.rect.x + this.rect.w / 2, this.rect.y + this.rect.h / 2));

    this.drawHeader(layer, model, geo);
    model.backpack.forEach((cell, i) => this.drawCell(layer, cell, geo.pack[i]!, "pack", model));
    model.slots.forEach((cell, i) => this.drawCell(layer, cell, geo.slots[i]!, "slot", model));
    if (model.discardable) this.drawDiscard(layer, model, geo);

    this.info = this.scene.add.container(0, 0);
    layer.add(this.info);
    this.renderInfo();
    this.footer = this.scene.add.container(0, 0);
    layer.add(this.footer);
    this.renderFooter();
  }

  private drawHeader(layer: Layer, model: Inventory, geo: InventoryLayout): void {
    const { scene } = this;
    layer.add(scene.add.bitmapText(geo.title.x, geo.title.y, WORLD_SIGN_FONT, TITLE).setTint(toPhaserColor(PALETTE.coinShine)));
    const full = model.stored >= model.capacity;
    const count = `${model.stored} of ${model.capacity}${full ? ", full" : ""}`;
    const countX = geo.title.x + Array.from(TITLE).length * SIGN_CELL.w + 8;
    layer.add(plate(scene, countX - 2, geo.title.y + 1, labelWidth(count) + 4, LABEL_CELL.h + 2, PALETTE.leatherSlot).setAlpha(0.8));
    layer.add(text(scene, countX, geo.title.y + 2, count, full ? PALETTE.sun : PALETTE.text));
    const close = button(scene, geo.close.x + geo.close.w / 2, geo.close.y + geo.close.h / 2, geo.close.w, geo.close.h, "x", { onClick: () => this.handlers.onClose(), color: PALETTE.leatherSlot });
    layer.add(close);
    this.index.register(this.sceneKey, INVENTORY_CLOSE_ID, close);

    const used = model.equipped.length;
    const label = "Item slots";
    const slotCount = `${used} of ${model.slots.length}`;
    layer.add(plate(scene, geo.slotsLabel.x - 2, geo.slotsLabel.y - 1, labelWidth(label) + labelWidth(slotCount) + 10, LABEL_CELL.h + 2, PALETTE.leatherSlot).setAlpha(0.8));
    layer.add(text(scene, geo.slotsLabel.x, geo.slotsLabel.y, label, PALETTE.coinShine));
    layer.add(text(scene, geo.slotsLabel.x + labelWidth(label) + 6, geo.slotsLabel.y, slotCount, PALETTE.text));
  }

  /** A backpack patch or an item slot, with the item's icon in it. */
  private drawCell(layer: Layer, cell: InventoryCell, rect: Rect, kind: "pack" | "slot", model: Inventory): void {
    const { scene } = this;
    const box = scene.add.container(rect.x, rect.y);
    const fill = scene.add.rectangle(0, 0, rect.w, rect.h, toPhaserColor(kind === "slot" ? PALETTE.leatherSlot : PALETTE.leatherPatch), kind === "slot" ? 0.92 : 0.78).setOrigin(0, 0);
    box.add(fill);
    if (kind === "slot") box.add(scene.add.rectangle(0, 0, rect.w, rect.h, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.coin)));
    else box.add(stitches(scene, rect.w, rect.h));
    const item = cell.item;
    if (item !== null) {
      const art = sourceArtId(item.itemId);
      if (art !== null) box.add(placeArt(scene, art, rect.w / 2, rect.h / 2).setScale(ICON_SCALE));
      if (item.rare) box.add(scene.add.rectangle(2, 2, rect.w - 4, rect.h - 4, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.rain)));
      if (item.targetable) box.add(scene.add.rectangle(1, 1, rect.w - 2, rect.h - 2, 0, 0).setOrigin(0, 0).setStrokeStyle(2, toPhaserColor(PALETTE.turn)));
      if (item.selected) {
        box.add(scene.add.rectangle(1, 1, rect.w - 2, rect.h - 2, 0, 0).setOrigin(0, 0).setStrokeStyle(2, toPhaserColor(PALETTE.sun)));
        box.add(plate(scene, 1, 1, LABEL_CELL.w + 3, LABEL_CELL.h + 2, PALETTE.sun));
        box.add(text(scene, 3, 2, "✓", PALETTE.letterbox));
      }
      if (item.tag !== null) {
        const w = labelWidth(item.tag) + 2;
        box.add(plate(scene, rect.w - w - 1, rect.h - LABEL_CELL.h - 2, w, LABEL_CELL.h + 1));
        box.add(text(scene, rect.w - w, rect.h - LABEL_CELL.h - 1, item.tag, PALETTE.coinShine));
      }
      if (model.aiming !== null && !item.targetable && !item.selected) box.setAlpha(DIM_ALPHA);
      const movable = model.aiming === null && !model.locked;
      const hit = scene.add.zone(0, 0, rect.w, rect.h).setOrigin(0, 0);
      hit.setInteractive(item.targetable ? { cursor: CURSOR.pointer } : movable ? { cursor: CURSOR.grab } : undefined);
      hit.on("pointerover", () => this.hover(item.uid));
      hit.on("pointerout", () => this.hover(null));
      hit.on("pointerdown", () => this.press(item));
      box.add(hit);
    }
    box.setSize(rect.w, rect.h);
    layer.add(box);
    this.index.register(this.sceneKey, cell.objectId, box);
  }

  private drawDiscard(layer: Layer, model: Inventory, geo: InventoryLayout): void {
    const { scene } = this;
    const rect = geo.discard;
    const box = scene.add.container(rect.x, rect.y);
    box.add(scene.add.rectangle(0, 0, rect.w, rect.h, toPhaserColor(PALETTE.leatherSlot), 0.9).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.destructive)));
    const g = scene.add.graphics();
    g.fillStyle(toPhaserColor(PALETTE.destructive), 1);
    // A pixel bin: lid, handle, body with ribs.
    const cx = rect.w / 2;
    g.fillRect(cx - 8, 9, 16, 2);
    g.fillRect(cx - 3, 7, 6, 2);
    g.fillRect(cx - 6, 12, 12, 14);
    g.fillStyle(toPhaserColor(PALETTE.leatherSlot), 1);
    for (const dx of [-3, 0, 3]) g.fillRect(cx + dx - 0.5, 14, 1, 10);
    box.add(g);
    box.setSize(rect.w, rect.h);
    if (model.locked || model.aiming !== null) box.setAlpha(DIM_ALPHA);
    layer.add(box);
    this.index.register(this.sceneKey, DISCARD_ID, box);
    const label = "Discard";
    layer.add(plate(scene, rect.x - 2, rect.y - 11, labelWidth(label) + 4, LABEL_CELL.h + 2, PALETTE.leatherSlot).setAlpha(0.8));
    layer.add(text(scene, rect.x, rect.y - 10, label, PALETTE.coinShine));
    const lines = ["Drag an", "item here", "to drop it"];
    const w = Math.max(...lines.map(labelWidth)) + 4;
    layer.add(plate(scene, geo.discardText.x - 2, geo.discardText.y - 2, w, lines.length * LINE + 3, PALETTE.leatherSlot).setAlpha(0.8));
    lines.forEach((line, i) => layer.add(text(scene, geo.discardText.x, geo.discardText.y + i * LINE, line, PALETTE.textDim)));
  }

  /** The hovered item's name, uses and rules, or how the window works. */
  private renderInfo(): void {
    const box = this.info;
    const geo = this.geo;
    if (box === null || geo === null) return;
    box.removeAll(true);
    const rect = geo.info;
    box.add(plate(this.scene, rect.x, rect.y, rect.w, rect.h, PALETTE.leatherSlot).setAlpha(0.85));
    const chars = Math.floor((rect.w - 4) / LABEL_CELL.w);
    const rows = Math.floor((rect.h - 4) / LINE);
    const item = this.hoverUid === null ? null : this.itemOf(this.hoverUid);
    const lines: { text: string; color: string }[] =
      item === null
        ? wrapWords(this.model?.locked || this.model?.aiming != null ? READ_HINT : INFO_HINT, chars).map((line) => ({ text: line, color: PALETTE.textDim }))
        : [
            ...wrapWords(item.name, chars).map((line) => ({ text: line, color: PALETTE.sun })),
            { text: fitLabel(item.uses, chars), color: item.rare ? PALETTE.rain : PALETTE.textDim },
            ...(item.rare ? [{ text: "Rare", color: PALETTE.rain }] : []),
            { text: "", color: PALETTE.text },
            ...wrapWords(item.text, chars).map((line) => ({ text: line, color: PALETTE.text })),
          ];
    lines.slice(0, rows).forEach((line, i) => box.add(text(this.scene, rect.x + 3, rect.y + 3 + i * LINE, line.text, line.color)));
  }

  /** The confirm for a discard, the power being aimed, a refusal, or a hint. */
  private renderFooter(): void {
    const box = this.footer;
    const geo = this.geo;
    const model = this.model;
    if (box === null || geo === null || model === null) return;
    box.removeAll(true);
    const rect = geo.footer;
    box.add(plate(this.scene, rect.x, rect.y, rect.w, rect.h, PALETTE.leatherSlot).setAlpha(0.85));
    const cy = rect.y + rect.h / 2;
    const say = (value: string, color: string, room = rect.w - 6): void => {
      const lines = wrapWords(value, Math.floor(room / LABEL_CELL.w)).slice(0, 2);
      const top = rect.y + Math.floor((rect.h - lines.length * LINE) / 2) + 1;
      lines.forEach((line, i) => box.add(text(this.scene, rect.x + 3, top + i * LINE, line, color)));
    };
    const buttonAt = (right: number, w: number, label: string, id: string, onClick: () => void, outline = false): void => {
      const b = button(this.scene, right - w / 2, cy, w, rect.h - 4, label, { onClick, outline, color: PALETTE.stump });
      box.add(b);
      this.index.register(this.sceneKey, id, b);
    };
    if (model.discard !== null) {
      say(`Discard ${model.discard.name} for good?`, PALETTE.text, rect.w - 100);
      buttonAt(rect.x + rect.w - 2, 44, "Keep", DISCARD_KEEP_ID, () => this.handlers.onDiscardKeep());
      buttonAt(rect.x + rect.w - 50, 50, "Discard", DISCARD_CONFIRM_ID, () => this.handlers.onDiscardConfirm(), true);
      return;
    }
    if (model.aiming !== null) {
      say(model.aiming, PALETTE.turn, rect.w - 56);
      buttonAt(rect.x + rect.w - 2, 48, "Cancel", INVENTORY_CANCEL_ID, () => this.handlers.onCancelAim());
      return;
    }
    if (this.notice !== null) return say(this.notice, PALETTE.sun);
    if (model.locked) return say("Locked: you are ready.", PALETTE.turn);
    if (model.stored >= model.capacity) return say("Your backpack is full. Drag an item onto Discard to make room.", PALETTE.sun);
    say("Only the items in your slots go into camp.", PALETTE.textDim);
  }

  private itemOf(uid: string): InventoryItem | null {
    const model = this.model;
    if (model === null) return null;
    return [...model.slots, ...model.backpack].find((cell) => cell.item?.uid === uid)?.item ?? null;
  }

  private hover(uid: string | null): void {
    if (this.gesture?.ghost != null || this.hoverUid === uid) return;
    this.hoverUid = uid;
    this.renderInfo();
  }

  private press(item: InventoryItem): void {
    const model = this.model;
    if (model === null) return;
    if (model.aiming !== null) {
      if (item.targetable) this.handlers.onPick(item.uid);
      return;
    }
    if (model.locked) return;
    this.dropGesture();
    this.gesture = { uid: item.uid, origin: this.pointerAt(), ghost: null, target: null };
  }

  private pointerAt(): Point {
    const p = this.scene.input.activePointer;
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  private dropGesture(): void {
    this.gesture?.ghost?.destroy();
    this.gesture?.target?.destroy();
    this.gesture = null;
  }

  /** Where a dragged item lands: a slot, the backpack, or the discard patch. */
  private dropAt(uid: string, at: Point): { drop: Drop; rect: Rect } | null {
    const geo = this.geo;
    if (geo === null) return null;
    const slot = geo.slots.findIndex((rect) => pointInRect(rect, at));
    if (slot !== -1) return { drop: { kind: "move", move: { uid, to: { kind: "slot", index: slot } } }, rect: geo.slots[slot]! };
    if (pointInRect(geo.packArea, at)) return { drop: { kind: "move", move: { uid, to: { kind: "backpack" } } }, rect: geo.packArea };
    if (this.model?.discardable && pointInRect(geo.discard, at)) return { drop: { kind: "discard" }, rect: geo.discard };
    return null;
  }

  private lands(drop: Drop): boolean {
    return drop.kind === "discard" || (this.model !== null && equipAfter(this.model, drop.move) !== null);
  }

  /** The dragged item follows the pointer as a lifted icon. */
  private onPointerMove(): void {
    const gesture = this.gesture;
    const model = this.model;
    if (gesture === null || model === null) return;
    const at = this.pointerAt();
    if (gesture.ghost === null) {
      if (Math.hypot(at.x - gesture.origin.x, at.y - gesture.origin.y) < DRAG_THRESHOLD) return;
      const item = this.itemOf(gesture.uid);
      const art = item === null ? null : sourceArtId(item.itemId);
      if (item === null) return this.dropGesture();
      const ghost = this.scene.add.container(0, 0);
      const half = INVENTORY_CELL / 2;
      ghost.add(this.scene.add.rectangle(-half + 2, -half + 2, INVENTORY_CELL, INVENTORY_CELL, 0, 0.4).setOrigin(0, 0));
      ghost.add(this.scene.add.rectangle(-half, -half, INVENTORY_CELL, INVENTORY_CELL, toPhaserColor(PALETTE.leatherPatch)).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
      if (art !== null) ghost.add(placeArt(this.scene, art, 0, 0).setScale(ICON_SCALE));
      gesture.target = this.scene.add.rectangle(0, 0, 1, 1, toPhaserColor(PALETTE.turn), 0.25).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn));
      this.dragLayer.add([gesture.target, ghost]);
      gesture.ghost = ghost;
    }
    gesture.ghost.setPosition(at.x, at.y);
    this.scene.input.manager.canvas.style.cursor = CURSOR.grabbing;
    const found = this.dropAt(gesture.uid, at);
    gesture.target?.setVisible(found !== null && this.lands(found.drop));
    if (found !== null) gesture.target?.setPosition(found.rect.x, found.rect.y).setSize(found.rect.w, found.rect.h);
  }

  private onPointerRelease(): void {
    const gesture = this.gesture;
    const model = this.model;
    if (gesture === null) return;
    const dragged = gesture.ghost !== null;
    const at = this.pointerAt();
    this.dropGesture();
    if (dragged) this.scene.input.manager.canvas.style.cursor = CURSOR.default;
    if (model === null || !model.open || model.locked) return;
    if (!dragged) {
      const result = clickMove(model, gesture.uid);
      if ("itemUids" in result) return this.handlers.onEquip(result.itemUids);
      return this.say(result.notice);
    }
    const found = this.dropAt(gesture.uid, at);
    if (found === null) return;
    if (found.drop.kind === "discard") return this.handlers.onDiscardAsk(gesture.uid);
    const itemUids = equipAfter(model, found.drop.move);
    if (itemUids !== null) return this.handlers.onEquip(itemUids);
    if (found.drop.move.to.kind === "backpack" && model.equipped.includes(gesture.uid)) this.say("Your backpack is full. Discard an item to make room.");
  }

  private say(notice: string): void {
    const model = this.model;
    this.notice = notice;
    this.noticeFor = model === null ? "" : `${model.equipped.join(",")}|${model.backpack.map((c) => c.item?.uid ?? "").join(",")}`;
    this.renderFooter();
  }

  /** A press on the veil, outside the window and anything that takes it,
   * closes the window. The veil itself takes no input, so the layout audit
   * sees every label over its own control only. */
  private onPointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (!this.isOpen || over.length > 0 || this.gesture !== null) return;
    const at = { x: Math.round(pointer.x), y: Math.round(pointer.y) };
    if (at.y >= this.veilTop && !pointInRect(this.rect, at)) this.handlers.onClose();
  }

  private onEscape(): void {
    if (this.isOpen) this.handlers.onClose();
  }
}

/** A patch's stitched seam: a dashed line just inside its edge. */
function stitches(scene: Phaser.Scene, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(toPhaserColor(PALETTE.leatherStitch), 0.9);
  for (let x = 3; x < w - 3; x += 4) {
    g.fillRect(x, 2, 2, 1);
    g.fillRect(x, h - 3, 2, 1);
  }
  for (let y = 3; y < h - 3; y += 4) {
    g.fillRect(2, y, 1, 2);
    g.fillRect(w - 3, y, 1, 2);
  }
  return g;
}
