/**
 * The shop before a boss camp: the purse, then a row per entry. Every value
 * comes from the trail model; a buy only calls a handler.
 */
import type Phaser from "phaser";
import { PALETTE } from "../palette";
import { LABEL_CELL } from "../font/font-keys";
import type { Rect } from "../layout";
import { placeArt } from "../art/place-art";
import { sourceArtId } from "../art/art-registry";
import type { ObjectIndex } from "../object-index";
import type { ShopEntry, ShopPanel } from "../../../../lib/expedition/loadout-model";
import { fitLabel } from "./text-fit";
import { button, coin, labelWidth, text, type Layer } from "./ui-kit";

export interface LoadoutHandlers {
  onBuy(stockId: string): void;
  onSourceHover(sourceKey: string | null, objectId?: string): void;
  /** Opens the inventory window. */
  onBackpack(): void;
}

export interface LoadoutCtx {
  scene: Phaser.Scene;
  layer: Layer;
  index: ObjectIndex;
  handlers: LoadoutHandlers;
}

const RARE = PALETTE.rain;
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
    hit.on("pointerover", () => handlers.onSourceHover(entry.sourceId, entry.infoId!));
    hit.on("pointerout", () => handlers.onSourceHover(null));
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
  if (buy.kind === "buy" || buy.kind === "full") {
    const full = buy.kind === "full";
    const b = button(scene, buyX + BUY_W / 2, cy, BUY_W - 2, 15, full ? "Pack full" : "Buy", { onClick: full ? () => handlers.onBackpack() : () => handlers.onBuy(entry.stockId), outline: !full });
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

/** The shop in `rect`: its heading and the purse, then a row per entry. */
export function drawShop(ctx: LoadoutCtx, shop: ShopPanel, rect: Rect, heading: string): void {
  const { scene, layer } = ctx;
  layer.add(text(scene, rect.x, rect.y + 2, heading, PALETTE.sun));
  const purse = `${shop.purse} ${shop.purse === 1 ? "coin" : "coins"} to spend`;
  const purseX = rect.x + rect.w - labelWidth(purse);
  layer.add(coin(scene, purseX - 8, rect.y + 5, 5));
  layer.add(text(scene, purseX, rect.y + 2, purse, PALETTE.coin));
  // Three upgrades and full stock need seven rows: they close up to fit.
  const step = Math.min(SHOP_ROW_STEP, Math.floor((rect.h - 14) / Math.max(1, shop.entries.length)));
  shop.entries.forEach((entry, i) => shopRow(ctx, entry, rect.x, rect.y + 14 + i * step, rect.w));
}
