/**
 * The trail scene's zones: the muster with its length vote, the trail map,
 * the draft, the route vote, the event and the loadout, the crew, the kit
 * and Ready. Every value drawn comes from `TrailModel`; clicks only call the
 * handlers.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL, SIGN_CELL, WORLD_SIGN_FONT } from "../font/font-keys";
import { BUNDLE_ITEM_TEXT_Y, BUNDLE_TAKE_H, DRAFT_ZONES, MUSTER_LINE, MUSTER_PORTRAIT_W, MUSTER_TEXT_LINES, MUSTER_ZONES, bundleItemH, musterBoxes, musterTextChars, ROUTE_ZONES, TRAIL_ZONES, bundleBoxes, bundleTextChars, rowBoxes, trailStopXs, type Rect } from "../layout";
import { placeArt } from "../art/place-art";
import { ART, crewArtId, modArtId, sourceArtId, type ArtId } from "../art/art-registry";
import type { ObjectIndex } from "../object-index";
import type {
  BundleItem,
  CampPreview,
  CharacterCard,
  CrewRow,
  DraftBundle,
  KitItem,
  LengthOption,
  MusterCrewRow,
  MusterLine,
  RouteCard,
  StopKind,
  TrailModel,
  TrailPanel,
  TrailStop,
  VoteResult,
} from "../../../../lib/expedition/trail-model";
import { musterLines } from "../../../../lib/expedition/trail-model";
import { fitLabel, fitUses, wrapWords } from "./text-fit";
import { PANEL_ALPHA, button, coin, labelWidth, plate, setCoinFace, text, type Layer } from "./ui-kit";
import { drawExplorer, drawGear, drawShop, type LoadoutHandlers } from "./draw-loadout";
import { ICON_SIZE, fogTile, modIcon } from "./draw-weather";

export interface TrailHandlers extends LoadoutHandlers {
  /** A muster character card: picks that character. */
  onDraft(characterId: string): void;
  /** A draft bundle's Take button: takes that bundle. */
  onBundle(bundle: number): void;
  /** A length at muster or a route between camps. */
  onVote(choice: string): void;
  onReady(): void;
  /** A power's button: uses it, or starts or stops aiming it. */
  onPower(sourceKey: string): void;
  /** A crew row picked for the aimed power. */
  onPickSeat(seatId: string): void;
  /** A route card's Reroll. */
  onReroll(choiceId: string): void;
}

/** When the coin flip for each vote began, in scene time, so a redraw in
 * the middle of the flip carries on instead of starting over. */
export type FlipClock = Map<string, number>;

interface Ctx {
  scene: Phaser.Scene;
  layer: Layer;
  model: TrailModel;
  index: ObjectIndex;
  handlers: TrailHandlers;
  flips: FlipClock;
}

const INK = PALETTE.cardEdge;
const RARE = PALETTE.rain;
const PULSE_MS = 600;
const LINE = LABEL_CELL.h + 2;

function centredText(scene: Phaser.Scene, cx: number, y: number, value: string, color: string = PALETTE.text): Phaser.GameObjects.BitmapText {
  return text(scene, cx - Math.floor(labelWidth(value) / 2), y, value, color);
}

function signText(scene: Phaser.Scene, x: number, y: number, value: string, color: string = PALETTE.text): Phaser.GameObjects.BitmapText {
  return scene.add.bitmapText(Math.round(x), Math.round(y), WORLD_SIGN_FONT, value).setTint(toPhaserColor(color));
}

function panel(ctx: Ctx, zone: Rect): void {
  ctx.layer.add(plate(ctx.scene, zone.x, zone.y, zone.w, zone.h).setAlpha(PANEL_ALPHA));
}

/** Lines of `value` wrapped to `chars`, at most `max`. */
function wrapped(value: string, chars: number, max: number): string[] {
  return wrapWords(value, chars).slice(0, max);
}

const STOP_ART: Readonly<Record<StopKind, ArtId>> = { camp: "marker-camp", boss: "marker-boss", temple: "temple" };

// ---------------------------------------------------------------------------
// Trail map
// ---------------------------------------------------------------------------

// Rows inside the parchment, clear of its torn white edges.
const MARKER_ROW = 30;
const LABEL_ROW = 40;
const CAPTION_ROW = 49;

const CAPTION_COLOR: Readonly<Record<TrailStop["state"], string>> = {
  cleared: PALETTE.moss,
  here: PALETTE.turn,
  ahead: PALETTE.destructive,
};

function drawTrail(ctx: Ctx, stops: TrailStop[]): void {
  const { scene, layer } = ctx;
  const zone = TRAIL_ZONES.trail;
  layer.add(placeArt(scene, "trail-map", zone.x + zone.w / 2, zone.y + zone.h / 2));

  const xs = trailStopXs(stops.length);
  const markerY = (i: number): number => zone.y + MARKER_ROW + (i % 2 === 0 ? -2 : 2);

  const path = scene.add.graphics();
  path.fillStyle(toPhaserColor(INK), 1);
  for (let i = 0; i + 1 < xs.length; i++) {
    const [x0, x1] = [xs[i]! + 10, xs[i + 1]! - 10];
    for (let x = x0; x < x1; x += 4) {
      const t = (x - x0) / (x1 - x0);
      path.fillRect(x, Math.round(markerY(i) + (markerY(i + 1) - markerY(i)) * t), 2, 1);
    }
  }
  layer.add(path);

  stops.forEach((stop, i) => {
    const x = xs[i]!;
    const y = markerY(i);
    if (stop.state === "here") {
      const glow = scene.add.rectangle(x, y, 20, 20, 0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn));
      layer.add(glow);
      scene.tweens.add({ targets: glow, alpha: { from: 1, to: 0.3 }, duration: PULSE_MS, yoyo: true, repeat: -1 });
      const token = ART["crew-token"];
      layer.add(placeArt(scene, "crew-token", x, zone.y + 2 + token.h / 2));
      layer.add(text(scene, x + token.w / 2 + 2, zone.y + 6, "Crew", INK));
    }
    const marker = placeArt(scene, stop.state === "cleared" ? "marker-cleared" : STOP_ART[stop.kind], x, y);
    if (stop.state === "ahead") marker.setAlpha(0.7);
    layer.add(marker);
    layer.add(centredText(scene, x, zone.y + LABEL_ROW, `Camp ${stop.index}`, INK));
    if (stop.caption !== "") layer.add(centredText(scene, x, zone.y + CAPTION_ROW, stop.caption, CAPTION_COLOR[stop.state]));
  });
}

// ---------------------------------------------------------------------------
// Muster: characters
// ---------------------------------------------------------------------------


/** Muster silhouettes are drawn at half size beside the card's text. */
const MUSTER_PORTRAIT_SCALE = 0.5;
const MUSTER_TONE: Readonly<Record<MusterLine["tone"], string>> = { rules: PALETTE.text, power: PALETTE.done, badge: PALETTE.textDim };

/** A character at muster: the silhouette in a column on the left with the
 * pick (or who took it) under it; the name, theme, power and its rules on
 * the right. */
function drawCharacterCard(ctx: Ctx, card: CharacterCard, x: number, y: number, w: number, h: number): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(PALETTE.plate)).setOrigin(0, 0);
  const edge = card.yours ? PALETTE.turn : card.pickable ? PALETTE.sun : PALETTE.plateEdge;
  bg.setStrokeStyle(card.yours ? 2 : 1, toPhaserColor(edge));
  container.add(bg);
  container.add(scene.add.rectangle(2, 2, MUSTER_PORTRAIT_W - 2, h - 4, toPhaserColor(PALETTE.night)).setOrigin(0, 0));
  const art = crewArtId(card.characterId);
  if (art !== null) container.add(placeArt(scene, art, MUSTER_PORTRAIT_W / 2 + 1, h - 15 - 20).setScale(MUSTER_PORTRAIT_SCALE));
  const footer = card.yours ? "Yours" : card.takenBy !== null ? card.takenBy : card.pickable ? "Choose" : "Free";
  const footerColor = card.yours ? PALETTE.turn : card.takenBy !== null ? PALETTE.textDim : PALETTE.sun;
  const portraitChars = Math.floor((MUSTER_PORTRAIT_W - 2) / LABEL_CELL.w);
  container.add(centredText(scene, MUSTER_PORTRAIT_W / 2 + 1, h - LABEL_CELL.h - 4, fitLabel(footer, portraitChars), footerColor));

  const tx = MUSTER_PORTRAIT_W + 3;
  const chars = musterTextChars(w);
  let cy = 3;
  container.add(text(scene, tx, cy, fitLabel(card.name, chars), PALETTE.sun));
  cy += MUSTER_LINE;
  container.add(text(scene, tx, cy, fitLabel(card.theme, chars), PALETTE.textDim));
  cy += MUSTER_LINE;
  container.add(text(scene, tx, cy, fitLabel(card.power.name, chars), PALETTE.sun));
  cy += MUSTER_LINE;
  for (const line of musterLines(card, chars, MUSTER_TEXT_LINES)) {
    container.add(text(scene, tx, cy, line.text, MUSTER_TONE[line.tone]));
    cy += MUSTER_LINE;
  }
  if (card.takenBy !== null && !card.yours) container.setAlpha(0.55);

  container.setSize(w, h);
  const hit = scene.add.zone(0, 0, w, h).setOrigin(0, 0);
  hit.setInteractive({ useHandCursor: card.pickable });
  if (card.pickable) hit.on("pointerdown", () => handlers.onDraft(card.characterId));
  container.add(hit);
  if (card.pickable) {
    scene.tweens.add({ targets: bg, alpha: { from: 1, to: 0.8 }, duration: PULSE_MS, yoyo: true, repeat: -1 });
  }
  layer.add(container);
  index.register("trail", card.objectId, container);
}

// ---------------------------------------------------------------------------
// Muster: crew and the length vote
// ---------------------------------------------------------------------------

const MUSTER_STATUS: Readonly<Record<MusterCrewRow["status"], { label: string; color: string }>> = {
  ready: { label: "ready ✓", color: PALETTE.done },
  choosing: { label: "choosing…", color: PALETTE.sun },
  voting: { label: "voting…", color: PALETTE.sun },
};

const CREW_ROW_H = 9;

function drawMusterCrew(ctx: Ctx, crew: MusterCrewRow[], votes: string): void {
  const { scene, layer } = ctx;
  const zone = MUSTER_ZONES.crew;
  panel(ctx, zone);
  layer.add(text(scene, zone.x + 4, zone.y + 3, "Crew", PALETTE.textDim));
  layer.add(text(scene, zone.x + zone.w - 4 - labelWidth(votes), zone.y + 3, votes, PALETTE.textDim));
  crew.forEach((row, i) => {
    const y = zone.y + 13 + i * CREW_ROW_H;
    const status = row.connected ? MUSTER_STATUS[row.status] : { label: "offline", color: PALETTE.statusDisconnected };
    const statusX = zone.x + zone.w - 4 - labelWidth(status.label);
    const chars = Math.floor((statusX - zone.x - 8) / LABEL_CELL.w);
    layer.add(text(scene, zone.x + 4, y, fitLabel(row.isYou ? `${row.name} (you)` : row.name, chars), row.isYou ? PALETTE.turn : PALETTE.text));
    layer.add(text(scene, statusX, y, status.label, status.color));
  });
}

const STOP_STEP = 17;

/** One marker per camp, boss camps and the temple marked. */
function drawStops(scene: Phaser.Scene, container: Phaser.GameObjects.Container, stops: StopKind[], cx: number, y: number): void {
  const x0 = cx - Math.floor(((stops.length - 1) * STOP_STEP) / 2);
  stops.forEach((kind, i) => container.add(placeArt(scene, STOP_ART[kind], x0 + i * STOP_STEP, y)));
}

function voterLine(voters: string[]): string {
  return voters.length === 0 ? "No votes" : voters.join(", ");
}

function drawLengthOption(ctx: Ctx, option: LengthOption, x: number, y: number, w: number, h: number): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(option.yours ? PALETTE.stump : PALETTE.plate)).setOrigin(0, 0);
  bg.setStrokeStyle(option.yours ? 2 : 1, toPhaserColor(option.yours ? PALETTE.turn : PALETTE.plateEdge));
  container.add(bg);
  const chars = Math.floor((w - 8) / LABEL_CELL.w);
  container.add(signText(scene, 5, 3, option.name, option.yours ? PALETTE.text : PALETTE.sun));
  container.add(text(scene, w - 5 - labelWidth(option.camps), 5, option.camps, PALETTE.textDim));
  drawStops(scene, container, option.stops, Math.floor(w / 2), 24);
  container.add(centredText(scene, Math.floor(w / 2), 35, fitLabel(option.summary, chars), PALETTE.text));
  const voters = option.voters.length === 0 ? "No votes yet" : `Votes: ${voterLine(option.voters)}`;
  container.add(centredText(scene, Math.floor(w / 2), 47, fitLabel(voters, chars), option.voters.length === 0 ? PALETTE.textDim : PALETTE.turn));
  container.setSize(w, h);
  const hit = scene.add.zone(0, 0, w, h).setOrigin(0, 0);
  hit.setInteractive({ useHandCursor: option.votable });
  if (option.votable) hit.on("pointerdown", () => handlers.onVote(option.id));
  container.add(hit);
  layer.add(container);
  index.register("trail", option.objectId, container);
}

function drawMuster(ctx: Ctx, muster: Extract<TrailPanel, { kind: "muster" }>): void {
  musterBoxes(muster.characters.length).forEach((box, i) => drawCharacterCard(ctx, muster.characters[i]!, box.x, box.y, box.w, box.h));
  drawMusterCrew(ctx, muster.crew, muster.votes);
  const zone = MUSTER_ZONES.lengths;
  rowBoxes(zone.x, zone.w, muster.lengths.length, 6, 200).forEach((box, i) => {
    drawLengthOption(ctx, muster.lengths[i]!, box.x, zone.y, box.w, zone.h);
  });
}

// ---------------------------------------------------------------------------
// Camp previews and the vote result
// ---------------------------------------------------------------------------

const PLACE_KEY_W = labelWidth("Location") + 6;

/** Location, weather and any pairing, each with its icon. Returns the y
 * after the last row. */
function placeRows(scene: Phaser.Scene, container: Phaser.GameObjects.Container, preview: CampPreview, x: number, y: number, w: number): number {
  const rows: { key: string; id: string; kind: "location" | "weather" | "pairing"; name: string; color: string }[] = [
    { key: "Location", id: preview.locationId, kind: "location", name: preview.location, color: PALETTE.text },
    { key: "Weather", id: preview.weatherId, kind: "weather", name: preview.weather, color: preview.weatherId === "fair" ? PALETTE.text : PALETTE.rain },
    ...(preview.pairing === null ? [] : [{ key: "Pairing", id: preview.pairing, kind: "pairing" as const, name: preview.pairing, color: PALETTE.coin }]),
  ];
  const chars = Math.floor((w - PLACE_KEY_W - ICON_SIZE - 3) / LABEL_CELL.w);
  let cy = y;
  for (const row of rows) {
    container.add(text(scene, x, cy, row.key, PALETTE.textDim));
    container.add(modIcon(scene, row.id, row.kind, x + PLACE_KEY_W, cy - 1));
    container.add(text(scene, x + PLACE_KEY_W + ICON_SIZE + 3, cy, fitLabel(row.name, chars), row.color));
    cy += LINE;
  }
  return cy;
}

/** Objectives as small chips, wrapped to `w`. Returns the y after them. */
function objectiveChips(scene: Phaser.Scene, container: Phaser.GameObjects.Container, labels: string[], x: number, y: number, w: number): number {
  let cx = x;
  let cy = y;
  for (const label of labels) {
    const chipW = labelWidth(label) + 6;
    if (cx + chipW > x + w && cx > x) {
      cx = x;
      cy += LINE + 2;
    }
    container.add(scene.add.rectangle(cx, cy - 1, chipW, LABEL_CELL.h + 3, toPhaserColor(PALETTE.moss)).setOrigin(0, 0));
    container.add(text(scene, cx + 3, cy, label));
    cx += chipW + 4;
  }
  return cy + LINE + 2;
}

/** A boss portrait on a route card or the loadout is half its table size. */
const PORTRAIT_SCALE = 0.5;

/** The boss line: "No boss", the tier with its marker, or once revealed
 * the boss's portrait beside its name and tier. Returns the height used. */
function bossLine(scene: Phaser.Scene, container: Phaser.GameObjects.Container, preview: CampPreview, x: number, y: number, room = Infinity): number {
  if (preview.boss === null) {
    container.add(text(scene, x, y, "No boss", PALETTE.textDim));
    return LINE;
  }
  const art = preview.bossId === null ? null : modArtId({ id: preview.bossId, kind: "animal" });
  const h = art === null ? 0 : Math.round(ART[art].h * PORTRAIT_SCALE);
  if (art === null || preview.bossName === null || h > room) {
    const label = preview.bossName === null ? preview.boss : `${preview.bossName}, ${preview.boss.toLowerCase()}`;
    container.add(placeArt(scene, preview.boss === "The Temple" ? "temple" : "marker-boss", x + 8, y + 3));
    container.add(text(scene, x + 18, y, label, PALETTE.destructive));
    return LINE;
  }
  const w = Math.round(ART[art].w * PORTRAIT_SCALE);
  container.add(placeArt(scene, art, x + Math.floor(w / 2), y + Math.floor(h / 2)).setScale(PORTRAIT_SCALE));
  const textY = y + Math.max(0, Math.floor(h / 2) - LINE);
  container.add(text(scene, x + w + 4, textY, preview.bossName, PALETTE.destructive));
  container.add(text(scene, x + w + 4, textY + LINE, preview.boss, PALETTE.textDim));
  return Math.max(h, 2 * LINE);
}

function drawPreview(ctx: Ctx, preview: CampPreview, zone: Rect, heading: string): void {
  const { scene, layer } = ctx;
  const container = scene.add.container(zone.x, zone.y);
  container.add(signText(scene, 8, 6, heading, PALETTE.sun));
  const w = zone.w - 16;
  let y = placeRows(scene, container, preview, 8, 26, w);
  y += 2;
  container.add(text(scene, 8, y, "Objectives", PALETTE.textDim));
  y = objectiveChips(scene, container, preview.objectives, 8, y + LINE, w);
  bossLine(scene, container, preview, 8, y + 2);
  layer.add(container);
}

const FLIP_MS = 1600;
const FLIP_TURN_MS = 120;
const COIN_R = 9;
const PIP = 5;

/** One row per choice: its name and a pip per vote, the winner lit. */
function tallyRows(scene: Phaser.Scene, layer: Layer, vote: VoteResult, zone: Rect, y: number): void {
  const chars = Math.floor((zone.w - 16) / LABEL_CELL.w) - 6;
  vote.tally.forEach((row, i) => {
    const ry = y + i * LINE;
    layer.add(text(scene, zone.x + 8, ry, fitLabel(row.label, chars), row.winner ? PALETTE.sun : PALETTE.textDim));
    const pips = scene.add.graphics();
    for (let v = 0; v < Math.max(1, row.votes); v++) {
      pips.fillStyle(toPhaserColor(row.votes === 0 ? PALETTE.plateEdge : row.winner ? PALETTE.sun : PALETTE.textDim), 1);
      pips.fillRect(zone.x + zone.w - 8 - (v + 1) * (PIP + 2), ry + 1, PIP, PIP);
    }
    layer.add(pips);
  });
}

/** The vote just resolved: who won and the tally, and for a tie a coin
 * that spins through the tied choices and lands on the winner. */
function drawVoteResult(ctx: Ctx, vote: VoteResult, zone: Rect): void {
  const { scene, layer, flips } = ctx;
  layer.add(plate(scene, zone.x, zone.y, zone.w, zone.h, PALETTE.letterbox).setAlpha(PANEL_ALPHA));
  const chars = Math.floor((zone.w - 8) / LABEL_CELL.w);
  const signChars = Math.floor((zone.w - 8) / SIGN_CELL.w);
  const cx = zone.x + Math.floor(zone.w / 2);
  layer.add(centredText(scene, cx, zone.y + 5, fitLabel(`${vote.title} vote`, chars), PALETTE.textDim));
  const winnerY = zone.y + 18;
  const subtitleY = winnerY + 16;
  const coinY = subtitleY + 22;
  tallyRows(scene, layer, vote, zone, vote.flip === null ? subtitleY + 18 : coinY + 18);

  const winnerText = (value: string, color: string) => {
    const shown = fitLabel(value, signChars);
    return signText(scene, cx - Math.floor((Array.from(shown).length * SIGN_CELL.w) / 2), winnerY, shown, color);
  };
  if (vote.flip === null) {
    layer.add(winnerText(vote.winner, PALETTE.sun));
    layer.add(centredText(scene, cx, subtitleY, "by majority", PALETTE.text));
    return;
  }

  const flip = vote.flip;
  const started = flips.get(vote.key) ?? scene.time.now;
  flips.set(vote.key, started);
  const remaining = FLIP_MS - (scene.time.now - started);
  const settled = fitLabel("Tie, settled by a coin", chars);
  if (remaining <= 0) {
    layer.add(winnerText(flip.winner.label, PALETTE.sun));
    layer.add(centredText(scene, cx, subtitleY, settled, PALETTE.text));
    layer.add(coin(scene, cx, coinY, COIN_R, flip.winner.glyph));
    return;
  }

  const fullTie = `Tie: ${flip.faces.map((f) => f.label).join(" or ")}`;
  const tie = Array.from(fullTie).length <= chars ? fullTie : `A ${flip.faces.length}-way tie`;
  const caption = centredText(scene, cx, subtitleY, tie, PALETTE.text);
  layer.add(caption);
  const flipping = winnerText("Flipping…", PALETTE.text);
  layer.add(flipping);
  const spinning = coin(scene, cx, coinY, COIN_R, flip.faces[0]!.glyph);
  layer.add(spinning);
  let face = 0;
  scene.tweens.add({
    targets: spinning,
    scaleX: { from: 1, to: 0.1 },
    y: { from: coinY, to: coinY - 4 },
    duration: FLIP_TURN_MS / 2,
    yoyo: true,
    repeat: Math.max(0, Math.floor(remaining / FLIP_TURN_MS) - 1),
    onYoyo: () => {
      face = (face + 1) % flip.faces.length;
      setCoinFace(spinning, flip.faces[face]!.glyph);
    },
  });
  scene.time.delayedCall(remaining, () => {
    if (!flipping.active || !spinning.active) return;
    scene.tweens.killTweensOf(spinning);
    flipping.destroy();
    layer.add(winnerText(flip.winner.label, PALETTE.sun));
    spinning.setScale(1, 1);
    setCoinFace(spinning, flip.winner.glyph);
    scene.tweens.add({ targets: spinning, y: { from: coinY - 6, to: coinY }, duration: 220, ease: "Bounce.easeOut" });
    caption.setText(settled).setX(cx - Math.floor(labelWidth(settled) / 2));
  });
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------


function chip(scene: Phaser.Scene, container: Phaser.GameObjects.Container, x: number, y: number, label: string, fill: string, color: string = PALETTE.text): number {
  const w = labelWidth(label) + 4;
  container.add(scene.add.rectangle(x, y - 1, w, LABEL_CELL.h + 2, toPhaserColor(fill)).setOrigin(0, 0));
  container.add(text(scene, x + 2, y, label, color));
  return w;
}

/** One item of a bundle: icon and name, its rules in full (or, in a bundle
 * too full for them, on hover), its uses and its Rare and Pack Rat tags.
 * Returns the height it took. */
function bundleItem(ctx: Ctx, card: Phaser.GameObjects.Container, item: BundleItem, y: number, w: number, compact: boolean): number {
  const { scene, index, handlers } = ctx;
  const block = scene.add.container(0, y);
  const art = sourceArtId(item.itemId);
  if (art !== null) block.add(placeArt(scene, art, 12, 7));
  block.add(text(scene, 22, 3, fitLabel(item.name, Math.floor((w - 24) / LABEL_CELL.w)), PALETTE.sun));
  const lines = compact ? [] : wrapWords(item.text, bundleTextChars(w));
  lines.forEach((line, i) => block.add(text(scene, 4, BUNDLE_ITEM_TEXT_Y + i * LINE, line)));
  const h = compact ? BUNDLE_ITEM_TEXT_Y + LINE + 2 : bundleItemH(lines.length);
  const badgeY = h - LINE - 2;
  let bx = 4 + chip(scene, block, 4, badgeY, item.uses, PALETTE.plate) + 3;
  if (item.rare) bx += chip(scene, block, bx, badgeY, "Rare", PALETTE.plate, RARE) + 3;
  if (item.exclusive) chip(scene, block, bx, badgeY, "Pack Rat", PALETTE.plate, PALETTE.coinShine);
  const hit = scene.add.zone(0, 0, w, h).setOrigin(0, 0).setInteractive();
  hit.on("pointerover", () => handlers.onSourceHover(item.itemId, item.objectId));
  hit.on("pointerout", () => handlers.onSourceHover(null));
  block.add(hit);
  block.setSize(w, h);
  card.add(block);
  index.register("trail", item.objectId, block);
  return h;
}

/** A bundle as one card: its items stacked, then one Take button. */
function drawBundleCard(ctx: Ctx, bundle: DraftBundle, x: number, y: number, w: number, h: number): void {
  const { scene, layer, index, handlers } = ctx;
  const card = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(PALETTE.bark)).setOrigin(0, 0);
  bg.setStrokeStyle(1, toPhaserColor(PALETTE.plateEdge));
  card.add(bg);
  let itemY = 0;
  bundle.items.forEach((item, i) => {
    if (i > 0) card.add(scene.add.rectangle(4, itemY, w - 8, 1, toPhaserColor(PALETTE.plateEdge)).setOrigin(0, 0));
    itemY += bundleItem(ctx, card, item, itemY, w, bundle.items.length > 2) + 1;
  });
  layer.add(card);
  const label = bundle.items.length === 1 ? "Take it" : "Take bundle";
  const take = button(scene, x + w / 2, y + h - 3 - BUNDLE_TAKE_H / 2, w - 8, BUNDLE_TAKE_H, label, { onClick: () => handlers.onBundle(bundle.bundle), outline: true });
  layer.add(take);
  index.register("trail", bundle.objectId, take);
}

/** An open offer takes the panel and crew row (the status beside Ready says
 * who is still choosing); once taken, the panel says what you took. */
function drawDraft(ctx: Ctx, draft: Extract<TrailPanel, { kind: "draft" }>): void {
  const { scene, layer } = ctx;
  const offer = draft.draft;
  if (offer.kind === "offer") {
    const zone = DRAFT_ZONES.offer;
    bundleBoxes(offer.bundles.length).forEach((box, i) => drawBundleCard(ctx, offer.bundles[i]!, box.x, zone.y + 2, box.w, zone.h - 4));
    return;
  }
  const zone = TRAIL_ZONES.panel;
  panel(ctx, zone);
  const cy = zone.y + zone.h / 2;
  if (offer.kind === "taken") {
    const x = zone.x + 16;
    layer.add(text(scene, x, cy - 30, "You took", PALETTE.textDim));
    offer.items.forEach((item, i) => {
      const art = sourceArtId(item.sourceId);
      if (art !== null) layer.add(placeArt(scene, art, x + 8, cy - 10 + i * 20));
      layer.add(text(scene, x + 20, cy - 14 + i * 20, item.name, PALETTE.sun));
    });
    const hintY = cy - 14 + offer.items.length * 20 + 6;
    layer.add(text(scene, x, hintY, "New items fill a free slot; the rest wait", PALETTE.textDim));
    layer.add(text(scene, x, hintY + LINE, "in your backpack. Swap them before you set out.", PALETTE.textDim));
    return;
  }
  if (offer.text !== "") layer.add(centredText(scene, zone.x + zone.w / 2, cy - 4, offer.text, PALETTE.textDim));
}

// ---------------------------------------------------------------------------
// Route vote
// ---------------------------------------------------------------------------

const ROUTE_GAP = 8;
const ROUTE_MAX_W = 220;
const RIBBON_H = 14;

const ROUTE_FOOTER_H = 4 + 4 + LINE;
const REROLL_H = 14;

/** A route as a card: the camp ahead, what waits on the way (the event,
 * and the shop before a boss camp), the boss, then the votes. Draws the
 * body and returns its height and a `finish` that draws the card at the
 * row's common height, its votes pinned to the foot. */
function drawRouteCard(ctx: Ctx, card: RouteCard, x: number, y: number, w: number): { bodyH: number; finish(h: number): void } {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const body = scene.add.container(0, 0);
  body.add(scene.add.rectangle(0, 0, w, RIBBON_H, toPhaserColor(card.yours ? PALETTE.turn : PALETTE.moss)).setOrigin(0, 0));
  body.add(text(scene, 5, 3, card.label));
  body.add(text(scene, w - 5 - labelWidth(card.next.title), 3, card.next.title, PALETTE.text));

  const inner = w - 12;
  let cy = placeRows(scene, body, card.next, 6, RIBBON_H + 4, inner);
  const stops = [...(card.next.event === null ? [] : [{ label: card.next.event, fill: PALETTE.stump, color: PALETTE.text }]), ...(card.next.shop ? [{ label: "Shop", fill: PALETTE.coinEdge, color: PALETTE.coinShine }] : [])];
  if (stops.length > 0) {
    body.add(text(scene, 6, cy + 1, "On the way", PALETTE.textDim));
    let sx = 6 + labelWidth("On the way") + 6;
    for (const stop of stops) sx += chip(scene, body, sx, cy + 1, stop.label, stop.fill, stop.color) + 3;
    cy += LINE + 3;
  }
  cy = objectiveChips(scene, body, card.next.objectives, 6, cy + 2, inner);
  if (card.next.survey !== null) {
    const chars = Math.floor(inner / LABEL_CELL.w);
    for (const line of wrapped(`Survey: ${card.next.survey.join(", ")}`, chars, 2)) {
      body.add(text(scene, 6, cy, line, PALETTE.done));
      cy += LINE;
    }
  }
  if (card.swapsBoss !== null) {
    chip(scene, body, 6, cy + 1, card.swapsBoss, PALETTE.destructive);
    cy += LINE + 3;
  }
  const footer = ROUTE_FOOTER_H + (card.yours || card.votable ? LINE : 0) + (card.reroll === null ? 0 : REROLL_H + 2) + 3;
  cy += bossLine(scene, body, card.next, 6, cy, ROUTE_ZONES.routes.h - cy - footer) + 4;

  const finish = (h: number): void => {
    const chars = Math.floor(inner / LABEL_CELL.w);
    let fy = h - footer;
    body.add(scene.add.rectangle(4, fy, w - 8, 1, toPhaserColor(PALETTE.plateEdge)).setOrigin(0, 0));
    fy += 4;
    const voters = card.voters.length === 0 ? "No votes yet" : `Votes: ${voterLine(card.voters)}`;
    body.add(text(scene, 6, fy, fitLabel(voters, chars), card.voters.length === 0 ? PALETTE.textDim : PALETTE.turn));
    fy += LINE;
    const vote = card.yours ? "Your vote" : card.votable ? "Vote for this route" : "";
    if (vote !== "") body.add(centredText(scene, Math.floor(w / 2), fy, vote, card.yours ? PALETTE.turn : PALETTE.sun));
    const reroll = card.reroll;

    const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(card.yours ? PALETTE.stump : PALETTE.plate)).setOrigin(0, 0);
    bg.setStrokeStyle(card.yours ? 2 : 1, toPhaserColor(card.yours ? PALETTE.turn : PALETTE.plateEdge));
    container.add([bg, body]);
    container.setSize(w, h);
    const hit = scene.add.zone(0, 0, w, h).setOrigin(0, 0);
    hit.setInteractive({ useHandCursor: card.votable });
    if (card.votable) hit.on("pointerdown", () => handlers.onVote(card.id));
    container.add(hit);
    layer.add(container);
    index.register("trail", card.objectId, container);
    if (reroll !== null) {
      const by = y + h - REROLL_H / 2 - 3;
      const b = button(scene, x + w / 2, by, w - 12, REROLL_H, fitLabel(reroll.label, Math.floor((w - 18) / LABEL_CELL.w)), { onClick: () => handlers.onReroll(reroll.choiceId), outline: true });
      layer.add(b);
      index.register("trail", reroll.objectId, b);
    }
  };
  return { bodyH: cy + footer, finish };
}

/** The route cards side by side, all as tall as the tallest. */
function drawRoutes(ctx: Ctx, routes: Extract<TrailPanel, { kind: "route" }>): void {
  const zone = ROUTE_ZONES.routes;
  const boxes = rowBoxes(0, zone.w, routes.options.length, ROUTE_GAP, ROUTE_MAX_W);
  const span = boxes.length === 0 ? 0 : boxes.at(-1)!.x + boxes.at(-1)!.w;
  const left = zone.x + Math.floor((zone.w - span) / 2);
  const cards = boxes.map((box, i) => drawRouteCard(ctx, routes.options[i]!, left + box.x, zone.y, box.w));
  const h = Math.max(0, ...cards.map((c) => c.bodyH));
  for (const card of cards) card.finish(h);
}

// ---------------------------------------------------------------------------
// Event and loadout
// ---------------------------------------------------------------------------

const VOTE_W = 168;
const SIDE_W = 246;

/** The panel split: the main card, and a side card on its right. */
function panelSplit(sideW: number): { main: Rect; side: Rect } {
  const zone = TRAIL_ZONES.panel;
  return {
    main: { x: zone.x, y: zone.y, w: zone.w - sideW, h: zone.h },
    side: { x: zone.x + zone.w - sideW + 4, y: zone.y + 4, w: sideW - 8, h: zone.h - 8 },
  };
}

function drawEvent(ctx: Ctx, event: Extract<TrailPanel, { kind: "event" }>): void {
  const { scene, layer } = ctx;
  panel(ctx, TRAIL_ZONES.panel);
  const { main, side: vote } = panelSplit(ctx.model.vote === null ? 0 : VOTE_W);
  const chars = Math.floor((main.w - 16) / LABEL_CELL.w);
  layer.add(text(scene, main.x + 8, main.y + 6, "On the trail", PALETTE.textDim));
  layer.add(signText(scene, main.x + 8, main.y + 18, event.name, PALETTE.sun));
  let y = main.y + 36;
  for (const line of wrapped(event.text, chars, 3)) {
    layer.add(text(scene, main.x + 8, y, line));
    y += LINE;
  }
  y += 6;
  layer.add(text(scene, main.x + 8, y, fitLabel(`Next: ${event.next.title}`, chars), PALETTE.textDim));
  const next = scene.add.container(main.x, y + LINE);
  const after = placeRows(scene, next, event.next, 8, 0, main.w - 16);
  layer.add(next);
  bossLine(scene, next, event.next, 8, after + 2);
  if (ctx.model.vote !== null) drawVoteResult(ctx, ctx.model.vote, vote);
}

/** The camp ahead, compact, beside the vote that chose the run, the shop
 * before a boss camp, or your explorer's power and upgrade. */
function drawLoadout(ctx: Ctx, loadout: Extract<TrailPanel, { kind: "loadout" }>): void {
  panel(ctx, TRAIL_ZONES.panel);
  const vote = ctx.model.vote;
  const { main, side } = panelSplit(vote !== null ? VOTE_W : SIDE_W);
  drawPreview(ctx, loadout.next, main, loadout.next.title);
  if (vote !== null) drawVoteResult(ctx, vote, side);
  else if (loadout.shop !== null) drawShop(ctx, loadout.shop, side);
  else if (ctx.model.kit !== null) drawExplorer(ctx, ctx.model.kit, side);
}

// ---------------------------------------------------------------------------
// Crew
// ---------------------------------------------------------------------------

const CREW_TITLE_H = 13;
const CREW_ROW_MAX = 30;

const STATUS: Readonly<Record<CrewRow["status"], { label: string; color: string }>> = {
  ready: { label: "ready ✓", color: PALETTE.done },
  waiting: { label: "not ready", color: PALETTE.textDim },
  drafting: { label: "choosing…", color: PALETTE.sun },
  voted: { label: "voted ✓", color: PALETTE.done },
  voting: { label: "voting…", color: PALETTE.sun },
};

/** Name and status, then the character and kit as icons. */
function drawCrewRow(ctx: Ctx, row: CrewRow, x: number, y: number, w: number): void {
  const { scene, layer } = ctx;
  const status = row.connected ? STATUS[row.status] : { label: "offline", color: PALETTE.statusDisconnected };
  const statusX = x + w - labelWidth(status.label);
  const nameChars = Math.floor((statusX - x - 4) / LABEL_CELL.w);
  layer.add(text(scene, x, y, fitLabel(row.isYou ? `${row.displayLabel} (you)` : row.displayLabel, nameChars), row.isYou ? PALETTE.turn : PALETTE.text));
  layer.add(text(scene, statusX, y, status.label, status.color));

  const iconY = y + LABEL_CELL.h + 10;
  if (row.character === null) {
    layer.add(text(scene, x, iconY - 4, "no explorer yet", PALETTE.textDim));
    return;
  }
  let cursor = x;
  for (const source of row.sources) {
    const art = sourceArtId(source.sourceId);
    if (art === null) continue;
    if (cursor + ART[art].w > x + w - labelWidth(row.character) - 6) break;
    layer.add(placeArt(scene, art, cursor + ART[art].w / 2, iconY));
    cursor += ART[art].w + 1;
  }
  if (row.itemsHidden) layer.add(fogTile(scene, cursor, iconY - 8));
  layer.add(text(scene, x + w - labelWidth(row.character), iconY - 4, row.character, PALETTE.textDim));
}

function drawCrew(ctx: Ctx): void {
  const { scene, layer, model } = ctx;
  const zone = TRAIL_ZONES.crew;
  panel(ctx, zone);
  layer.add(text(scene, zone.x + 4, zone.y + 3, "Crew", PALETTE.textDim));
  const rowH = Math.min(CREW_ROW_MAX, Math.floor((zone.h - CREW_TITLE_H) / Math.max(1, model.crew.length)));
  model.crew.forEach((row, i) => {
    const group = scene.add.container(0, 0);
    const y = zone.y + CREW_TITLE_H + i * rowH;
    drawCrewRow({ ...ctx, layer: group }, row, zone.x + 4, y, zone.w - 8);
    if (!row.connected) group.setAlpha(0.6);
    layer.add(group);
    if (row.targetable) {
      const pick = scene.add.rectangle(zone.x + 2, y - 2, zone.w - 4, rowH - 1, 0, 0).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(PALETTE.turn));
      pick.setInteractive({ useHandCursor: true });
      pick.on("pointerdown", () => ctx.handlers.onPickSeat(row.seatId));
      layer.add(pick);
      ctx.index.register("trail", row.objectId, pick);
    }
  });
}

// ---------------------------------------------------------------------------
// Kit
// ---------------------------------------------------------------------------

const KIT_X = 112;
const KIT_GAP = 3;
const KIT_ROW_H = 20;

function drawKitTile(ctx: Ctx, item: KitItem, x: number, y: number, w: number): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, KIT_ROW_H, toPhaserColor(item.kind === "item" ? PALETTE.bark : PALETTE.stump)).setOrigin(0, 0);
  container.add(bg);
  const art = sourceArtId(item.sourceId);
  if (art !== null) container.add(placeArt(scene, art, 10, KIT_ROW_H / 2));
  const chars = Math.floor((w - 22) / LABEL_CELL.w);
  container.add(text(scene, 20, 1, fitLabel(item.name, chars)));
  container.add(text(scene, 20, KIT_ROW_H - LABEL_CELL.h - 1, fitUses(item.charge, chars), PALETTE.textDim));
  container.setSize(w, KIT_ROW_H);
  bg.setInteractive();
  bg.on("pointerover", () => handlers.onSourceHover(item.sourceKey, item.objectId));
  bg.on("pointerout", () => handlers.onSourceHover(null));
  layer.add(container);
  index.register("trail", item.objectId, container);
}

function drawKit(ctx: Ctx): void {
  const { scene, layer, model } = ctx;
  const zone = TRAIL_ZONES.backpack;
  const kit = model.kit;
  panel(ctx, zone);
  if (model.panel.kind === "loadout" && model.panel.gear !== null) {
    drawGear(ctx, model.panel.gear);
    return;
  }
  if (kit === null) {
    layer.add(centredText(scene, zone.x + zone.w / 2, zone.y + zone.h / 2 - 4, "Watching the crew", PALETTE.textDim));
    return;
  }
  layer.add(text(scene, zone.x + KIT_X, zone.y + 3, "Your kit"));
  const art = ART["backpack-open"];
  layer.add(placeArt(scene, "backpack-open", zone.x + 4 + art.w / 2, zone.y + zone.h - art.h / 2 - 2));
  const x0 = zone.x + KIT_X;
  const cols = 3;
  const w = Math.floor((zone.x + zone.w - 4 - x0 - KIT_GAP * (cols - 1)) / cols);
  kit.forEach((item, i) => {
    drawKitTile(ctx, item, x0 + (i % cols) * (w + KIT_GAP), zone.y + 14 + Math.floor(i / cols) * (KIT_ROW_H + KIT_GAP), w);
  });
}

// ---------------------------------------------------------------------------
// Ready
// ---------------------------------------------------------------------------

const READY_W = 136;
const READY_H = 30;

const POWER_H = 15;
const POWER_GAP = 2;

/** The powers you can use now, in rows from `y`, two to a row when there
 * is no room to stack them. */
function drawPowers(ctx: Ctx, y: number, rows: number): void {
  const { scene, layer, model, index, handlers } = ctx;
  const zone = TRAIL_ZONES.ready;
  const powers = model.powers;
  if (powers.length === 0) return;
  const perRow = powers.length > rows ? 2 : 1;
  const w = Math.floor((zone.w - 8 - (perRow - 1) * POWER_GAP) / perRow);
  powers.forEach((power, i) => {
    const x = zone.x + 4 + (i % perRow) * (w + POWER_GAP);
    const py = y + Math.floor(i / perRow) * (POWER_H + POWER_GAP);
    const label = fitLabel(power.active ? `Cancel ${power.label}` : power.label, Math.floor((w - 6) / LABEL_CELL.w));
    const b = button(scene, x + w / 2, py + POWER_H / 2, w, POWER_H, label, { onClick: () => handlers.onPower(power.sourceKey), outline: power.active, color: power.active ? PALETTE.stump : undefined });
    layer.add(b);
    index.register("trail", power.objectId, b);
  });
}

function drawReady(ctx: Ctx): void {
  const { scene, layer, model, index, handlers } = ctx;
  const zone = TRAIL_ZONES.ready;
  const cx = zone.x + zone.w / 2;
  const cy = zone.y + 4 + READY_H / 2;
  const ready = model.ready;
  if (ready === null) {
    const top = model.status === null ? zone.y + 4 : zone.y + 22;
    if (model.status !== null) {
      layer.add(plate(scene, zone.x + 4, zone.y + 4, zone.w - 8, 16).setAlpha(PANEL_ALPHA));
      layer.add(centredText(scene, cx, zone.y + 8, model.status, PALETTE.textDim));
    }
    drawPowers(ctx, top, Math.floor((zone.y + zone.h - top) / (POWER_H + POWER_GAP)));
    return;
  }
  if (ready.state === "open") {
    const b = button(scene, cx, cy, READY_W, READY_H, ready.label, { onClick: () => handlers.onReady(), outline: true, big: true });
    layer.add(b);
    index.register("trail", ready.objectId, b);
  } else {
    layer.add(button(scene, cx, cy, READY_W, READY_H, `${ready.label} ✓`, { big: true, dim: false, color: PALETTE.moss }));
  }
  const caption = ready.state === "open" ? "When your kit is ready" : "Waiting for the crew";
  layer.add(plate(scene, zone.x + 4, zone.y + READY_H + 6, zone.w - 8, 12).setAlpha(PANEL_ALPHA));
  layer.add(centredText(scene, cx, zone.y + READY_H + 8, caption, ready.state === "open" ? PALETTE.text : PALETTE.textDim));
  drawPowers(ctx, zone.y + READY_H + 20, 1);
}

export function drawTrailScene(scene: Phaser.Scene, layer: Layer, model: TrailModel, index: ObjectIndex, handlers: TrailHandlers, flips: FlipClock): void {
  const ctx: Ctx = { scene, layer, model, index, handlers, flips };
  const shown = model.panel;
  if (shown.kind === "muster") {
    drawMuster(ctx, shown);
    return;
  }
  if (model.trail !== null) drawTrail(ctx, model.trail);
  switch (shown.kind) {
    case "draft":
      drawDraft(ctx, shown);
      if (shown.draft.kind !== "offer") drawCrew(ctx);
      break;
    case "route":
      drawRoutes(ctx, shown);
      break;
    case "event":
      drawEvent(ctx, shown);
      drawCrew(ctx);
      break;
    case "loadout":
      drawLoadout(ctx, shown);
      drawCrew(ctx);
      break;
  }
  drawKit(ctx);
  drawReady(ctx);
}
