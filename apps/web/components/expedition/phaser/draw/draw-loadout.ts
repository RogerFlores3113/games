/**
 * The loadout's own panels: your slots and backpack in the backpack zone,
 * the shop before a boss camp, and your explorer's power and upgrade. Every
 * value comes from the trail model; a tap, drag or buy only calls a handler.
 */
import type Phaser from "phaser";
import { CURSOR, pointerIf } from "../cursors";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import { PACK_COLS, PACK_ROWS, TRAIL_ZONES, gearLayout, type Rect } from "../layout";
import { placeArt } from "../art/place-art";
import { ART, sourceArtId } from "../art/art-registry";
import type { ObjectIndex } from "../object-index";
import type { Gear, GearItem, ShopEntry, ShopPanel } from "../../../../lib/expedition/loadout-model";
import type { KitItem } from "../../../../lib/expedition/trail-model";
import { PACK_NEXT_ID, PACK_PREV_ID } from "../../../../lib/expedition/expedition-ids";
import { sourceRulesText } from "../../../../lib/expedition/source-text";
import { fitLabel, wrapWords } from "./text-fit";
import { button, coin, labelWidth, text, type Layer } from "./ui-kit";

export interface LoadoutHandlers {
  /** The pointer went down on one of your items: a tap or the start of a drag. */
  onGearPress(uid: string): void;
  onPackPage(delta: number): void;
  onBuy(stockId: string): void;
  onSourceHover(sourceKey: string | null, objectId?: string): void;
}

export interface LoadoutCtx {
  scene: Phaser.Scene;
  layer: Layer;
  index: ObjectIndex;
  handlers: LoadoutHandlers;
}

const LINE = LABEL_CELL.h + 2;
const RARE = PALETTE.rain;
const LOCKED = "Locked: you are ready";

/** The backpack page actually shown, and how many there are. */
export function packPage(gear: Gear): { page: number; pages: number; items: GearItem[] } {
  const size = PACK_COLS * PACK_ROWS;
  const pages = Math.max(1, Math.ceil(gear.backpack.length / size));
  const page = Math.min(Math.max(0, gear.page), pages - 1);
  return { page, pages, items: gear.backpack.slice(page * size, (page + 1) * size) };
}

function hoverable(obj: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform, ctx: LoadoutCtx, key: string, objectId: string): void {
  obj.on("pointerover", () => ctx.handlers.onSourceHover(key, objectId));
  obj.on("pointerout", () => ctx.handlers.onSourceHover(null));
}

/** An item as a tile: icon, name, and what is left of it. A rare item has a
 * blue edge. */
export function gearTile(scene: Phaser.Scene, item: GearItem, w: number, h: number): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(PALETTE.bark)).setOrigin(0, 0);
  if (item.rare) bg.setStrokeStyle(1, toPhaserColor(RARE));
  container.add(bg);
  const art = sourceArtId(item.itemId);
  if (art !== null) container.add(placeArt(scene, art, 10, Math.floor(h / 2)));
  const tagW = item.tag === null ? 0 : labelWidth(item.tag) + 4;
  const chars = Math.floor((w - 20 - tagW) / LABEL_CELL.w);
  const top = Math.max(0, Math.floor((h - 2 * LABEL_CELL.h - 1) / 2));
  container.add(text(scene, 19, top, fitLabel(item.name, chars)));
  container.add(text(scene, 19, top + LABEL_CELL.h + 1, fitLabel(item.uses, chars), item.rare ? RARE : PALETTE.textDim));
  if (item.tag !== null) container.add(text(scene, w - tagW + 2, Math.floor((h - LABEL_CELL.h) / 2), item.tag, PALETTE.coinShine));
  if (item.targetable) container.add(scene.add.rectangle(0, 0, w, h, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
  container.setSize(w, h);
  return container;
}

function placeGearTile(ctx: LoadoutCtx, item: GearItem, rect: Rect, locked: boolean): void {
  const tile = gearTile(ctx.scene, item, rect.w, rect.h).setPosition(rect.x, rect.y);
  const bg = tile.list[0] as Phaser.GameObjects.Rectangle;
  bg.setInteractive(locked ? pointerIf(item.targetable) : { cursor: CURSOR.grab });
  if (!locked || item.targetable) bg.on("pointerdown", () => ctx.handlers.onGearPress(item.uid));
  hoverable(bg, ctx, item.uid, item.objectId);
  ctx.layer.add(tile);
  ctx.index.register("trail", item.objectId, tile);
}

function dashedRect(scene: Phaser.Scene, rect: Rect, color: string): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(toPhaserColor(color), 1);
  for (let x = rect.x; x < rect.x + rect.w; x += 4) {
    const w = Math.min(2, rect.x + rect.w - x);
    g.fillRect(x, rect.y, w, 1);
    g.fillRect(x, rect.y + rect.h - 1, w, 1);
  }
  for (let y = rect.y; y < rect.y + rect.h; y += 4) {
    const h = Math.min(2, rect.y + rect.h - y);
    g.fillRect(rect.x, y, 1, h);
    g.fillRect(rect.x + rect.w - 1, y, 1, h);
  }
  return g;
}

function emptySlot(ctx: LoadoutCtx, rect: Rect, objectId: string): void {
  const { scene, layer } = ctx;
  const slot = scene.add.container(rect.x, rect.y);
  slot.add(scene.add.rectangle(0, 0, rect.w, rect.h, toPhaserColor(PALETTE.plate)).setOrigin(0, 0));
  slot.add(dashedRect(scene, { x: 0, y: 0, w: rect.w, h: rect.h }, PALETTE.textDim));
  const label = "Empty slot";
  slot.add(text(scene, Math.floor((rect.w - labelWidth(label)) / 2), Math.floor((rect.h - LABEL_CELL.h) / 2), label, PALETTE.textDim));
  slot.setSize(rect.w, rect.h);
  layer.add(slot);
  ctx.index.register("trail", objectId, slot);
}

/** Your slots on the left and the backpack grid on the right, in the
 * backpack zone. */
export function drawGear(ctx: LoadoutCtx, gear: Gear): void {
  const { scene, layer } = ctx;
  const zone = TRAIL_ZONES.backpack;
  const geo = gearLayout(gear.slots.length);
  const headerY = zone.y + 3;

  const used = gear.slots.filter((s) => s.item !== null).length;
  layer.add(text(scene, geo.slotArea.x, headerY, "Your slots"));
  const count = `${used} of ${gear.slots.length}`;
  layer.add(text(scene, geo.slotArea.x + geo.slotArea.w - labelWidth(count), headerY, count, PALETTE.textDim));
  gear.slots.forEach((slot, i) => {
    const rect = geo.slots[i]!;
    if (slot.item === null) emptySlot(ctx, rect, slot.objectId);
    else placeGearTile(ctx, slot.item, rect, gear.locked);
  });

  const divider = geo.slotArea.x + geo.slotArea.w + 4;
  layer.add(scene.add.rectangle(divider, zone.y + 4, 1, zone.h - 8, toPhaserColor(PALETTE.plateEdge)).setOrigin(0, 0));

  const { page, pages, items } = packPage(gear);
  const pack = geo.packArea;
  if (gear.backpack.length === 0) {
    const art = ART["backpack-open"];
    layer.add(placeArt(scene, "backpack-open", pack.x + art.w / 2, zone.y + zone.h - art.h / 2 - 2));
    const x = pack.x + art.w + 6;
    layer.add(text(scene, x, pack.y + 8, "Your backpack is empty."));
    layer.add(text(scene, x, pack.y + 8 + LINE, "Spare items wait here.", PALETTE.textDim));
    if (gear.locked) layer.add(text(scene, pack.x + pack.w - labelWidth(LOCKED), headerY, LOCKED, PALETTE.turn));
    return;
  }
  const title = `Backpack (${gear.backpack.length})`;
  layer.add(text(scene, pack.x, headerY, title));
  const full = gear.slots.every((slot) => slot.item !== null);
  const hint = gear.locked ? LOCKED : full ? "Slots full: drag to swap" : "Tap or drag to equip";
  if (pages > 1) {
    const pager = `${page + 1}/${pages}`;
    const right = pack.x + pack.w;
    const pagerX = right - 14 - labelWidth(pager) - 2;
    layer.add(text(scene, pagerX, headerY, pager, PALETTE.textDim));
    const prev = button(scene, pagerX - 9, headerY + 3, 12, 10, "<", page > 0 ? { onClick: () => ctx.handlers.onPackPage(-1) } : {});
    const next = button(scene, right - 6, headerY + 3, 12, 10, ">", page < pages - 1 ? { onClick: () => ctx.handlers.onPackPage(1) } : {});
    layer.add([prev, next]);
    if (page > 0) ctx.index.register("trail", PACK_PREV_ID, prev);
    if (page < pages - 1) ctx.index.register("trail", PACK_NEXT_ID, next);
    const room = Math.floor((pagerX - 16 - (pack.x + labelWidth(title) + 8)) / LABEL_CELL.w);
    if (room >= 8) layer.add(text(scene, pack.x + labelWidth(title) + 8, headerY, fitLabel(hint, room), gear.locked ? PALETTE.turn : PALETTE.textDim));
  } else {
    layer.add(text(scene, pack.x + pack.w - labelWidth(hint), headerY, hint, gear.locked ? PALETTE.turn : PALETTE.textDim));
  }
  items.forEach((item, i) => placeGearTile(ctx, item, geo.pack[i]!, gear.locked));
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

const SHOP_ROW_H = 19;
const SHOP_ROW_STEP = 20;
const BUY_W = 70;
const PRICE_W = 22;

function shopRow(ctx: LoadoutCtx, entry: ShopEntry, x: number, y: number, w: number): void {
  const { scene, layer, index, handlers } = ctx;
  const buyX = x + w - BUY_W;
  const infoW = buyX - PRICE_W - x - 2;
  const info = scene.add.container(x, y);
  const art = entry.sourceId === null ? "crate" : sourceArtId(entry.sourceId);
  if (art !== null) info.add(placeArt(scene, art, 10, Math.floor(SHOP_ROW_H / 2)));
  const chars = Math.floor((infoW - 22) / LABEL_CELL.w);
  info.add(text(scene, 20, 1, fitLabel(entry.name, chars)));
  info.add(text(scene, 20, LABEL_CELL.h + 2, fitLabel(entry.detail, chars), entry.rare ? RARE : PALETTE.textDim));
  if (entry.infoId !== null && entry.sourceId !== null) {
    const hit = scene.add.zone(0, 0, infoW, SHOP_ROW_H).setOrigin(0, 0).setInteractive();
    hoverable(hit, ctx, entry.sourceId, entry.infoId);
    info.add(hit);
    info.setSize(infoW, SHOP_ROW_H);
    index.register("trail", entry.infoId, info);
  }
  layer.add(info);

  if (entry.price !== null) {
    layer.add(coin(scene, buyX - PRICE_W + 4, y + Math.floor(SHOP_ROW_H / 2), 4));
    layer.add(text(scene, buyX - PRICE_W + 10, y + Math.floor((SHOP_ROW_H - LABEL_CELL.h) / 2), String(entry.price), PALETTE.coin));
  }
  const buy = entry.buy;
  const cy = y + Math.floor(SHOP_ROW_H / 2);
  if (buy.kind === "buy") {
    const b = button(scene, buyX + BUY_W / 2, cy, BUY_W - 2, 15, "Buy", { onClick: () => handlers.onBuy(entry.stockId), outline: true });
    layer.add(b);
    index.register("trail", entry.objectId, b);
    return;
  }
  if (buy.kind === "disabled") {
    layer.add(button(scene, buyX + BUY_W / 2, cy, BUY_W - 2, 15, buy.reason));
    return;
  }
  if (buy.label === "") return;
  const shown = fitLabel(buy.label, Math.floor((BUY_W + PRICE_W - 4) / LABEL_CELL.w));
  layer.add(text(scene, x + w - 2 - labelWidth(shown), y + Math.floor((SHOP_ROW_H - LABEL_CELL.h) / 2), shown, PALETTE.textDim));
}

/** The shop beside the camp preview: the purse, then a row per entry. */
export function drawShop(ctx: LoadoutCtx, shop: ShopPanel, rect: Rect): void {
  const { scene, layer } = ctx;
  layer.add(text(scene, rect.x, rect.y + 2, "Shop", PALETTE.sun));
  const purse = `${shop.purse} ${shop.purse === 1 ? "coin" : "coins"} to spend`;
  const purseX = rect.x + rect.w - labelWidth(purse);
  layer.add(coin(scene, purseX - 8, rect.y + 5, 5));
  layer.add(text(scene, purseX, rect.y + 2, purse, PALETTE.coin));
  // Three upgrades and full stock need seven rows: they close up to fit.
  const step = Math.min(SHOP_ROW_STEP, Math.floor((rect.h - 14) / Math.max(1, shop.entries.length)));
  shop.entries.forEach((entry, i) => shopRow(ctx, entry, rect.x, rect.y + 14 + i * step, rect.w));
}

// ---------------------------------------------------------------------------
// Your explorer
// ---------------------------------------------------------------------------

/** Your character's power and your upgrade, with what each does. */
export function drawExplorer(ctx: LoadoutCtx, kit: KitItem[], rect: Rect): void {
  const { scene, layer, index } = ctx;
  layer.add(text(scene, rect.x, rect.y + 2, "Your explorer", PALETTE.textDim));
  const chars = Math.floor((rect.w - 22) / LABEL_CELL.w);
  let y = rect.y + 15;
  const own = kit.filter((k) => k.kind !== "item");
  for (const source of own) {
    const about = sourceRulesText(source.sourceId);
    const lines = wrapWords(about?.text ?? "", chars).slice(0, 3);
    const h = 2 * LINE + lines.length * LINE + 2;
    const tile = scene.add.container(rect.x, y);
    const bg = scene.add.rectangle(0, 0, rect.w, h, toPhaserColor(source.kind === "upgrade" ? PALETTE.bark : PALETTE.stump)).setOrigin(0, 0);
    tile.add(bg);
    const art = sourceArtId(source.sourceId);
    if (art !== null) tile.add(placeArt(scene, art, 10, 10));
    const label = source.kind === "upgrade" ? `${source.name} (upgrade)` : source.name;
    tile.add(text(scene, 20, 2, fitLabel(label, chars), PALETTE.sun));
    tile.add(text(scene, 20, 2 + LINE, fitLabel((about?.badges ?? []).join(", "), chars), PALETTE.textDim));
    lines.forEach((line, i) => tile.add(text(scene, 20, 2 + (2 + i) * LINE, line)));
    tile.setSize(rect.w, h);
    bg.setInteractive();
    hoverable(bg, ctx, source.sourceKey, source.objectId);
    layer.add(tile);
    index.register("trail", source.objectId, tile);
    y += h + 4;
  }
  if (!own.some((k) => k.kind === "upgrade") && own.length > 0) {
    // The note gives way to the powers when they fill the card.
    for (const line of wrapWords("No upgrade yet. The shop before a boss camp sells your explorer's upgrades.", Math.floor(rect.w / LABEL_CELL.w)).slice(0, 3)) {
      if (y + LINE > rect.y + rect.h) break;
      layer.add(text(scene, rect.x, y, line, PALETTE.textDim));
      y += LINE;
    }
  }
}
