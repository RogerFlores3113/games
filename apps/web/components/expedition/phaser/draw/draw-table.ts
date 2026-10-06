/**
 * The camp's world backdrop, and the top bar, prompt line
 * and tooltip shared with the trail. Every value drawn comes from a
 * scene model.
 */
import type Phaser from "phaser";
import { STAGE, ZONES, pointInRect, type Rect } from "../layout";
import type { ObjectIndex } from "../object-index";
import { MAP_ID, SUPPLIES_ID } from "../../../../lib/expedition/expedition-ids";
import { CURSOR } from "../cursors";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL, SIGN_CELL, WORLD_SIGN_FONT } from "../font/font-keys";
import { placeArt } from "../art/place-art";
import { ART, backdropArtId, type ArtId } from "../art/art-registry";
import type { Tooltip, TopBar } from "../../../../lib/expedition/build-scene-model";
import type { Prompt, PromptTone } from "../../../../lib/expedition/build-prompt";
import { PANEL_ALPHA, labelWidth, plate, platedText, text, type Layer } from "./ui-kit";
import { wrapWords } from "./text-fit";

const MAX_CRATES = 8;
const EMPTY_CRATE_ALPHA = 0.3;

/** How much a location's backdrop is shaded so the table and its text stay
 * readable over it: a flat dim and an edge vignette, as alphas. A bright or
 * busy backdrop gets more. */
const BACKDROP_SHADE: Readonly<Partial<Record<ArtId, { dim: number; vignette: number }>>> = {
  "bg-jungle-night": { dim: 0, vignette: 0 },
  "bg-clearing": { dim: 0.25, vignette: 0.55 },
  "bg-clifftop": { dim: 0.25, vignette: 0.55 },
  "bg-desert": { dim: 0.45, vignette: 0.6 },
  "bg-cave": { dim: 0, vignette: 0.4 },
  "bg-magma": { dim: 0.2, vignette: 0.55 },
  "bg-temple": { dim: 0.4, vignette: 0.6 },
};
const DEFAULT_SHADE = { dim: 0.3, vignette: 0.5 };
const VIGNETTE_KEY = "backdrop-vignette";

/** Transparent around the table, the letterbox colour at the edges. */
function ensureVignette(scene: Phaser.Scene): void {
  if (scene.textures.exists(VIGNETTE_KEY)) return;
  const texture = scene.textures.createCanvas(VIGNETTE_KEY, STAGE.w, STAGE.h);
  if (!texture) return;
  const ctx = texture.context;
  const cx = STAGE.w / 2;
  const cy = STAGE.h * 0.55;
  const gradient = ctx.createRadialGradient(cx, cy, STAGE.h * 0.35, cx, cy, STAGE.w * 0.62);
  gradient.addColorStop(0, "rgba(6, 13, 8, 0)");
  gradient.addColorStop(1, "rgba(6, 13, 8, 1)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, STAGE.w, STAGE.h);
  texture.refresh();
}

/** The location's backdrop with its shade. The table is drawn with the
 * seats, over their silhouettes. */
export function drawBackdrop(scene: Phaser.Scene, location: string): Phaser.GameObjects.GameObject[] {
  const id = backdropArtId(location);
  const shade = BACKDROP_SHADE[id] ?? DEFAULT_SHADE;
  const objects: Phaser.GameObjects.GameObject[] = [placeArt(scene, id, STAGE.w / 2, STAGE.h / 2)];
  if (shade.dim > 0) objects.push(scene.add.rectangle(0, 0, STAGE.w, STAGE.h, toPhaserColor(PALETTE.letterbox), shade.dim).setOrigin(0, 0));
  if (shade.vignette > 0) {
    ensureVignette(scene);
    objects.push(scene.add.image(0, 0, VIGNETTE_KEY).setOrigin(0, 0).setAlpha(shade.vignette));
  }
  return objects;
}

/** What the top bar's controls do in a scene: the crates as an ability's
 * target, and the camp label showing and hiding the trail map in camp. */
export interface TopBarHandlers {
  index: ObjectIndex;
  sceneKey: "camp" | "trail";
  onMap?: () => void;
  onSupplies?: () => void;
}

const HOVER_Y = ZONES.topBar.y + ZONES.topBar.h + 2;
/** Hover labels hang under the bar, left of the prompt plate. */
const HOVER_RIGHT = ZONES.prompt.x - 2;

/** Hangs `label` under the bar, from `x`, while the pointer is over
 * `rect`. It follows the pointer itself rather than the hover events of an
 * object, so a redraw under a still pointer keeps it up; it lives as long
 * as `owner`, the bar's plate. */
function hoverLabel(scene: Phaser.Scene, layer: Layer, owner: Phaser.GameObjects.GameObject, rect: Rect, label: string, x: number): void {
  let shown: Phaser.GameObjects.GameObject[] = [];
  const sync = () => {
    const pointer = scene.input.activePointer;
    const over = pointInRect(rect, { x: pointer.x, y: pointer.y });
    if (over && shown.length === 0) {
      shown = platedText(scene, Math.min(x, HOVER_RIGHT - labelWidth(label)), HOVER_Y, label);
      layer.add(shown);
    } else if (!over && shown.length > 0) {
      for (const piece of shown) piece.destroy();
      shown = [];
    }
  };
  scene.input.on("pointermove", sync);
  owner.once("destroy", () => scene.input.off("pointermove", sync));
  sync();
}

/** Supplies as crates of their cap ("Supplies 3 of 4" on hover), the purse
 * as a coin and its count ("12 coins"), and the camp on the right, which in
 * camp shows and hides the trail map. The crates are a target while an ability picks
 * the supplies. No crates or purse at the muster. Returns the span left
 * free between them. */
export function drawTopBar(scene: Phaser.Scene, layer: Layer, bar: TopBar, handlers?: TopBarHandlers): { left: number; right: number } {
  const zone = ZONES.topBar;
  const bg = plate(scene, zone.x, zone.y, zone.w, zone.h).setAlpha(PANEL_ALPHA);
  layer.add(bg);
  const textY = zone.y + Math.floor((zone.h - LABEL_CELL.h) / 2);
  const left = bar.stores ? drawStores(scene, layer, bg, bar, handlers) : zone.x + 6;

  const campW = labelWidth(bar.camp) + 8;
  const campX = zone.x + zone.w - 3 - campW;
  if (bar.map && handlers?.onMap !== undefined) {
    const chip = scene.add.container(campX, zone.y + 2);
    const edge = bar.mapOpen ? PALETTE.sun : PALETTE.plateEdge;
    const bg = plate(scene, 0, 0, campW, zone.h - 4, bar.mapOpen ? PALETTE.stump : PALETTE.plate).setStrokeStyle(1, toPhaserColor(edge));
    chip.add([bg, text(scene, 4, textY - zone.y - 2, bar.camp)]);
    const hit = scene.add.zone(0, 0, campW, zone.h - 4).setOrigin(0, 0).setInteractive({ cursor: CURSOR.pointer });
    hit.on("pointerover", () => bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
    hit.on("pointerout", () => bg.setStrokeStyle(1, toPhaserColor(edge)));
    hit.on("pointerdown", handlers.onMap);
    chip.add(hit);
    chip.setSize(campW, zone.h - 4);
    layer.add(chip);
    handlers.index.register(handlers.sceneKey, MAP_ID, chip);
  } else {
    layer.add(text(scene, campX + 4, textY, bar.camp));
  }
  return { left, right: campX - 8 };
}

/** The supply crates and the purse at the bar's left; returns where they end. */
function drawStores(scene: Phaser.Scene, layer: Layer, bg: Phaser.GameObjects.Rectangle, bar: TopBar, handlers?: TopBarHandlers): number {
  const zone = ZONES.topBar;
  const textY = zone.y + Math.floor((zone.h - LABEL_CELL.h) / 2);
  const icon = ART.crate;
  const cy = zone.y + zone.h / 2;
  let x = zone.x + 6;
  for (let i = 0; i < Math.min(bar.suppliesMax, MAX_CRATES); i++) {
    const art = placeArt(scene, "crate", x + icon.w / 2, cy);
    if (i >= bar.supplies) art.setAlpha(EMPTY_CRATE_ALPHA);
    layer.add(art);
    x += icon.w + 2;
  }
  const crates = { x: zone.x + 2, y: zone.y + 1, w: x - zone.x, h: zone.h - 2 };
  hoverLabel(scene, layer, bg, crates, `Supplies ${bar.supplies} of ${bar.suppliesMax}`, crates.x);
  const pick = bar.suppliesPick;
  if (pick !== null && handlers !== undefined) {
    const target = scene.add.container(crates.x, crates.y);
    target.add(scene.add.rectangle(0, 0, crates.w, crates.h, 0, 0).setOrigin(0, 0).setStrokeStyle(2, toPhaserColor(PALETTE.turn)));
    target.setSize(crates.w, crates.h);
    if (pick.targetable && handlers.onSupplies !== undefined) {
      const hit = scene.add.zone(0, 0, crates.w, crates.h).setOrigin(0, 0).setInteractive({ cursor: CURSOR.pointer });
      hit.on("pointerdown", handlers.onSupplies);
      target.add(hit);
    }
    layer.add(target);
    handlers.index.register(handlers.sceneKey, SUPPLIES_ID, target);
  }

  const coinX = x + 8;
  layer.add(placeArt(scene, "coin", coinX + ART.coin.w / 2, cy));
  const purse = String(bar.purse);
  layer.add(text(scene, coinX + ART.coin.w + 3, textY, purse));
  const coinsW = ART.coin.w + 3 + labelWidth(purse) + 2;
  hoverLabel(scene, layer, bg, { x: coinX - 1, y: zone.y + 1, w: coinsW + 1, h: zone.h - 2 }, bar.purse === 1 ? "1 coin" : `${bar.purse} coins`, coinX);
  return coinX + coinsW + 8;
}

const TONE_COLOR: Readonly<Record<PromptTone, string>> = {
  "your-move": PALETTE.text,
  waiting: PALETTE.textDim,
  info: PALETTE.text,
  alert: PALETTE.destructive,
};

export function drawPrompt(scene: Phaser.Scene, layer: Layer, prompt: Prompt): void {
  const zone = ZONES.prompt;
  const bg = plate(scene, zone.x, zone.y, zone.w, zone.h);
  if (prompt.tone === "your-move") bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  layer.add(bg);
  const w = Array.from(prompt.text).length * SIGN_CELL.w;
  const line = scene.add
    .bitmapText(zone.x + Math.floor((zone.w - w) / 2), zone.y + Math.floor((zone.h - SIGN_CELL.h) / 2), WORLD_SIGN_FONT, prompt.text)
    .setTint(toPhaserColor(TONE_COLOR[prompt.tone]));
  layer.add(line);
}

/** Title and badges on the first line, the one-sentence text under it,
 * and why it can't be used now last, in red. */
export function drawTooltip(scene: Phaser.Scene, layer: Layer, tip: Tooltip | null, zone: Rect): void {
  if (tip === null) return;
  const maxChars = Math.floor((zone.w - 4) / LABEL_CELL.w);
  const maxLines = Math.floor(zone.h / LABEL_CELL.h);
  const badges = tip.badges.length > 0 ? `  ${tip.badges.join(" | ")}` : "";
  const head = tip.text === "" ? null : fitLabelTo(tip.title, maxChars);
  const body = tip.text === "" ? [] : wrapWords(tip.text, maxChars);
  const reasonText = tip.text === "" ? `${tip.title}: ${tip.reason}` : `Not now: ${tip.reason}`;
  const reason = tip.reason === null ? [] : wrapWords(reasonText, maxChars).slice(0, 1);
  const room = maxLines - (head === null ? 0 : 1) - reason.length;
  layer.add(plate(scene, zone.x, zone.y, zone.w, zone.h));
  let y = zone.y;
  if (head !== null) {
    layer.add(text(scene, zone.x + 2, y, head, PALETTE.sun));
    const shownBadges = badges.slice(0, Math.max(0, maxChars - head.length));
    if (shownBadges.trim() !== "") layer.add(text(scene, zone.x + 2 + labelWidth(head), y, shownBadges, PALETTE.textDim));
    y += LABEL_CELL.h;
  }
  for (const line of body.slice(0, room)) {
    layer.add(text(scene, zone.x + 2, y, line));
    y += LABEL_CELL.h;
  }
  for (const line of reason) {
    layer.add(text(scene, zone.x + 2, y, line, PALETTE.destructive));
    y += LABEL_CELL.h;
  }
}

function fitLabelTo(value: string, maxChars: number): string {
  return Array.from(value).length <= maxChars ? value : `${Array.from(value).slice(0, maxChars - 1).join("")}…`;
}
