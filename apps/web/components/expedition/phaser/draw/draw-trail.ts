/**
 * The trail scene's zones: the muster with its length vote, the trail map,
 * the draft, the route vote, the event and the loadout, the crew, the kit
 * and Ready. Every value drawn comes from `TrailModel`; clicks only call the
 * handlers.
 */
import type Phaser from "phaser";
import { CURSOR, pointerIf } from "../cursors";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL, SIGN_CELL, WORLD_SIGN_FONT } from "../font/font-keys";
import { BUNDLE_ITEM_TEXT_Y, BUNDLE_TAKE_H, DRAFT_ZONES, LENGTH_CARD_GAP, MINI_H, MINI_W, MUSTER_LINE, MUSTER_PORTRAIT_W, MUSTER_TEXT_LINES, MUSTER_ZONES, bundleItemH, itemBarLayout, lengthStopStep, musterBoxes, musterTextChars, ROUTE_ZONES, TRAIL_ZONES, bundleBoxes, bundleTextChars, rowBoxes, trailStopXs, type Rect } from "../layout";
import { placeArt } from "../art/place-art";
import { ART, crewArtId, modArtId, sourceArtId, type ArtId } from "../art/art-registry";
import type { ObjectIndex } from "../object-index";
import type {
  BundleItem,
  CampPreview,
  CharacterCard,
  CrewRow,
  DraftBundle,
  ItemBar,
  KitItem,
  LengthOption,
  ObjectiveIcon,
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
import { drawShop, type LoadoutHandlers } from "./draw-loadout";
import type { InventoryItem } from "../../../../lib/expedition/inventory-model";
import { BACKPACK_ID } from "../../../../lib/expedition/expedition-ids";
import { ICON_SIZE, fogTile, modIcon } from "./draw-weather";

export interface TrailHandlers extends LoadoutHandlers {
  /** A muster character card: picks that character. */
  onDraft(characterId: string): void;
  /** A draft bundle's Take button: takes that bundle. */
  onBundle(bundle: number): void;
  /** A length at muster or a route between camps. */
  onVote(choice: string): void;
  /** Lock in at muster, else Set out or Continue. */
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

const STOP_ART: Readonly<Record<StopKind, ArtId>> = { camp: "marker-camp", animal: "marker-animal", disaster: "marker-boss", temple: "temple" };

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
  hit.setInteractive(pointerIf(card.pickable));
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
  choosing: { label: "choosing…", color: PALETTE.sun },
  ready: { label: "ready to lock", color: PALETTE.turn },
  locked: { label: "locked in ✓", color: PALETTE.done },
};

const CREW_ROW_H = 9;

/** How many have locked in, then each player and where they are: choosing,
 * ready to lock in, or locked in (which reads so even offline). */
function drawMusterCrew(ctx: Ctx, crew: MusterCrewRow[], locked: string): void {
  const { scene, layer } = ctx;
  const zone = MUSTER_ZONES.crew;
  panel(ctx, zone);
  layer.add(text(scene, zone.x + zone.w - 4 - labelWidth(locked), zone.y + 3, locked, PALETTE.textDim));
  crew.forEach((row, i) => {
    const y = zone.y + 13 + i * CREW_ROW_H;
    const status = row.connected || row.status === "locked" ? MUSTER_STATUS[row.status] : { label: "offline", color: PALETTE.statusDisconnected };
    const statusX = zone.x + zone.w - 4 - labelWidth(status.label);
    const chars = Math.floor((statusX - zone.x - 8) / LABEL_CELL.w);
    layer.add(text(scene, zone.x + 4, y, fitLabel(row.isYou ? "You" : row.name, chars), row.isYou ? PALETTE.turn : PALETTE.text));
    layer.add(text(scene, statusX, y, status.label, status.color));
  });
}

/** One marker per camp, boss camps and the temple marked. */
function drawStops(scene: Phaser.Scene, container: Phaser.GameObjects.Container, stops: StopKind[], cx: number, y: number, w: number): void {
  const step = lengthStopStep(stops.length, w);
  const x0 = cx - Math.floor(((stops.length - 1) * step) / 2);
  stops.forEach((kind, i) => container.add(placeArt(scene, STOP_ART[kind], x0 + i * step, y)));
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
  drawStops(scene, container, option.stops, Math.floor(w / 2), 24, w);
  container.add(centredText(scene, Math.floor(w / 2), 35, fitLabel(option.summary, chars), PALETTE.text));
  const voters = option.voters.length === 0 ? "No votes yet" : `Votes: ${voterLine(option.voters)}`;
  container.add(centredText(scene, Math.floor(w / 2), 47, fitLabel(voters, chars), option.voters.length === 0 ? PALETTE.textDim : PALETTE.turn));
  container.setSize(w, h);
  const hit = scene.add.zone(0, 0, w, h).setOrigin(0, 0);
  hit.setInteractive(pointerIf(option.votable));
  if (option.votable) hit.on("pointerdown", () => handlers.onVote(option.id));
  container.add(hit);
  layer.add(container);
  index.register("trail", option.objectId, container);
}

/** Lock in: two lines of sign text on a tall button, dim until you have
 * an explorer and a length, "Locked in" once done. */
function drawLockIn(ctx: Ctx): void {
  const { scene, layer, model, index, handlers } = ctx;
  const ready = model.ready;
  if (ready === null) return;
  const zone = MUSTER_ZONES.lockIn;
  const open = ready.state === "open";
  const container = scene.add.container(zone.x, zone.y);
  const fill = ready.state === "done" ? PALETTE.moss : open ? PALETTE.stump : PALETTE.plate;
  const bg = scene.add.rectangle(0, 0, zone.w, zone.h, toPhaserColor(fill)).setOrigin(0, 0);
  bg.setStrokeStyle(open ? 2 : 1, toPhaserColor(open ? PALETTE.turn : PALETTE.plateEdge));
  container.add(bg);
  const lines = ready.state === "done" ? ["Locked", "in ✓"] : ["Lock", "in"];
  const top = Math.floor((zone.h - (lines.length * SIGN_CELL.h + 4)) / 2);
  lines.forEach((line, i) => {
    const w = Array.from(line).length * SIGN_CELL.w;
    container.add(signText(scene, Math.floor((zone.w - w) / 2), top + i * (SIGN_CELL.h + 4), line, ready.state === "disabled" ? PALETTE.textDim : PALETTE.text));
  });
  container.setSize(zone.w, zone.h);
  if (open) {
    const hit = scene.add.zone(0, 0, zone.w, zone.h).setOrigin(0, 0).setInteractive({ cursor: CURSOR.pointer });
    hit.on("pointerdown", () => handlers.onReady());
    container.add(hit);
    scene.tweens.add({ targets: bg, alpha: { from: 1, to: 0.8 }, duration: PULSE_MS, yoyo: true, repeat: -1 });
  }
  layer.add(container);
  index.register("trail", ready.objectId, container);
}

function drawMuster(ctx: Ctx, muster: Extract<TrailPanel, { kind: "muster" }>): void {
  musterBoxes(muster.characters.length).forEach((box, i) => drawCharacterCard(ctx, muster.characters[i]!, box.x, box.y, box.w, box.h));
  drawMusterCrew(ctx, muster.crew, muster.locked);
  const zone = MUSTER_ZONES.lengths;
  rowBoxes(zone.x, zone.w, muster.lengths.length, LENGTH_CARD_GAP, 200).forEach((box, i) => {
    drawLengthOption(ctx, muster.lengths[i]!, box.x, zone.y, box.w, zone.h);
  });
  drawLockIn(ctx);
}

// ---------------------------------------------------------------------------
// Camp previews and the vote result
// ---------------------------------------------------------------------------

const PLACE_KEY_W = labelWidth("Objectives") + 6;

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

const ICON_GAP = 3;

/** An objective as a small card with its glyph. It is not interactive, so
 * a click on a route card still votes: the scene finds the icon under the
 * pointer for its plain words (`TrailScene.update`). */
function objectiveIcon(ctx: Ctx, container: Phaser.GameObjects.Container, icon: ObjectiveIcon, x: number, y: number): void {
  const { scene, index } = ctx;
  const card = scene.add.container(x, y);
  card.add(scene.add.rectangle(0, 0, MINI_W, MINI_H, toPhaserColor(PALETTE.cardFace)).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(INK)));
  card.add(text(scene, Math.floor((MINI_W - LABEL_CELL.w) / 2) + 1, Math.floor((MINI_H - LABEL_CELL.h) / 2), icon.glyph, INK));
  card.setSize(MINI_W, MINI_H);
  container.add(card);
  index.register("trail", icon.objectId, card);
}

/** "Objectives" and a card per objective. Returns the y after the row. */
function objectiveRow(ctx: Ctx, container: Phaser.GameObjects.Container, icons: ObjectiveIcon[], x: number, y: number): number {
  container.add(text(ctx.scene, x, y + Math.floor((MINI_H - LABEL_CELL.h) / 2), "Objectives", PALETTE.textDim));
  icons.forEach((icon, i) => objectiveIcon(ctx, container, icon, x + PLACE_KEY_W + i * (MINI_W + ICON_GAP), y));
  return y + MINI_H + 3;
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
  layer.add(container);
  container.add(signText(scene, 8, 6, heading, PALETTE.sun));
  const w = zone.w - 16;
  let y = placeRows(scene, container, preview, 8, 26, w);
  y = objectiveRow(ctx, container, preview.objectives, 8, y + 1);
  bossLine(scene, container, preview, 8, y + 3);
}

const FLIP_MS = 1600;
const FLIP_TURN_MS = 120;
const COIN_R = 9;

/** The vote box's height: the title and the winner, and for a tie the
 * coin and what settled it. */
function voteBoxH(vote: VoteResult): number {
  return vote.flip === null ? 38 : 74;
}

/** The vote just resolved: what it chose, and for a tie a coin that spins
 * through the tied choices and lands on the winner. */
function drawVoteResult(ctx: Ctx, vote: VoteResult, zone: Rect): void {
  const { scene, layer, flips } = ctx;
  layer.add(plate(scene, zone.x, zone.y, zone.w, voteBoxH(vote), PALETTE.letterbox).setAlpha(PANEL_ALPHA));
  const chars = Math.floor((zone.w - 8) / LABEL_CELL.w);
  const signChars = Math.floor((zone.w - 8) / SIGN_CELL.w);
  const cx = zone.x + Math.floor(zone.w / 2);
  layer.add(centredText(scene, cx, zone.y + 5, fitLabel(vote.title, chars), PALETTE.textDim));
  const winnerY = zone.y + 18;
  const subtitleY = winnerY + 18;
  const coinY = subtitleY + 24;

  const winnerText = (value: string, color: string) => {
    const shown = fitLabel(value, signChars);
    return signText(scene, cx - Math.floor((Array.from(shown).length * SIGN_CELL.w) / 2), winnerY, shown, color);
  };
  if (vote.flip === null) {
    layer.add(winnerText(vote.winner, PALETTE.sun));
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

const SINGLE_ICON_SCALE = 2;
const SINGLE_TEXT_Y = 54;

/** A single item as a card: its icon large, its name, its rules in full,
 * then its uses and its Rare and Pack Rat tags. */
function singleItem(ctx: Ctx, card: Phaser.GameObjects.Container, item: BundleItem, w: number, h: number): void {
  const { scene, index, handlers } = ctx;
  const block = scene.add.container(0, 0);
  block.add(scene.add.rectangle(w / 2 - 19, 5, 38, 38, toPhaserColor(PALETTE.stump)).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(item.rare ? RARE : PALETTE.plateEdge)));
  const art = sourceArtId(item.itemId);
  if (art !== null) block.add(placeArt(scene, art, w / 2, 24).setScale(SINGLE_ICON_SCALE));
  block.add(centredText(scene, w / 2, 45, fitLabel(item.name, Math.floor((w - 8) / LABEL_CELL.w)), PALETTE.sun));
  const lines = wrapWords(item.text, bundleTextChars(w));
  lines.forEach((line, i) => block.add(text(scene, 4, SINGLE_TEXT_Y + 4 + i * LINE, line)));
  const badgeY = SINGLE_TEXT_Y + 4 + lines.length * LINE + 4;
  let bx = 4 + chip(scene, block, 4, badgeY, item.uses, PALETTE.plate) + 3;
  if (item.rare) bx += chip(scene, block, bx, badgeY, "Rare", PALETTE.plate, RARE) + 3;
  if (item.exclusive) chip(scene, block, bx, badgeY, "Pack Rat", PALETTE.plate, PALETTE.coinShine);
  const hitH = h - BUNDLE_TAKE_H - 6;
  const hit = scene.add.zone(0, 0, w, hitH).setOrigin(0, 0).setInteractive();
  hit.on("pointerover", () => handlers.onSourceHover(item.itemId, item.objectId));
  hit.on("pointerout", () => handlers.onSourceHover(null));
  block.add(hit);
  block.setSize(w, hitH);
  card.add(block);
  index.register("trail", item.objectId, block);
}

/** A bundle as one card: a single item large, or its items stacked, then
 * one Take button; with no room for it, the button opens the backpack. */
function drawBundleCard(ctx: Ctx, bundle: DraftBundle, fits: boolean, x: number, y: number, w: number, h: number): void {
  const { scene, layer, index, handlers } = ctx;
  const card = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(PALETTE.bark)).setOrigin(0, 0);
  bg.setStrokeStyle(1, toPhaserColor(PALETTE.plateEdge));
  card.add(bg);
  if (bundle.items.length === 1) singleItem(ctx, card, bundle.items[0]!, w, h);
  else {
    let itemY = 0;
    bundle.items.forEach((item, i) => {
      if (i > 0) card.add(scene.add.rectangle(4, itemY, w - 8, 1, toPhaserColor(PALETTE.plateEdge)).setOrigin(0, 0));
      itemY += bundleItem(ctx, card, item, itemY, w, bundle.items.length > 2) + 1;
    });
  }
  layer.add(card);
  const label = !fits ? "Backpack full: make room" : bundle.items.length === 1 ? "Take it" : "Take bundle";
  const onClick = fits ? () => handlers.onBundle(bundle.bundle) : () => handlers.onBackpack();
  const take = button(scene, x + w / 2, y + h - 3 - BUNDLE_TAKE_H / 2, w - 8, BUNDLE_TAKE_H, label, { onClick, outline: fits, color: fits ? undefined : PALETTE.plate });
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
    bundleBoxes(offer.bundles.length).forEach((box, i) => drawBundleCard(ctx, offer.bundles[i]!, offer.fits, box.x, zone.y + 2, box.w, zone.h - 4));
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
    layer.add(text(scene, x, hintY, "New items fill a free slot; the rest wait in", PALETTE.textDim));
    layer.add(text(scene, x, hintY + LINE, "your backpack. Open it below to swap them.", PALETTE.textDim));
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

/** A route as a card: the camp ahead, the boss, then the votes. Draws the
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
  cy = objectiveRow(ctx, body, card.next.objectives, 6, cy + 1);
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
    container.setSize(w, h);
    const hit = scene.add.zone(0, 0, w, h).setOrigin(0, 0);
    hit.setInteractive(pointerIf(card.votable));
    if (card.votable) hit.on("pointerdown", () => handlers.onVote(card.id));
    container.add([bg, body, hit]);
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

const VOTE_W = 150;
const SIDE_W = 246;

/** The panel split: the main card, and a side card on its right. */
function panelSplit(sideW: number): { main: Rect; side: Rect } {
  const zone = TRAIL_ZONES.panel;
  return {
    main: { x: zone.x, y: zone.y, w: zone.w - sideW, h: zone.h },
    side: { x: zone.x + zone.w - sideW + 4, y: zone.y + 4, w: sideW - 8, h: zone.h - 8 },
  };
}

/** The event: its name and what happens, then what comes next. */
function drawEvent(ctx: Ctx, event: Extract<TrailPanel, { kind: "event" }>): void {
  const { scene, layer } = ctx;
  const zone = TRAIL_ZONES.panel;
  panel(ctx, zone);
  const chars = Math.floor((zone.w - 16) / LABEL_CELL.w);
  layer.add(signText(scene, zone.x + 8, zone.y + 6, event.name, PALETTE.sun));
  let y = zone.y + 26;
  for (const line of wrapped(event.text, chars, 6)) {
    layer.add(text(scene, zone.x + 8, y, line));
    y += LINE;
  }
  y += 6;
  layer.add(text(scene, zone.x + 8, y, fitLabel(`Next: the route vote for ${event.nextTitle.toLowerCase()}`, chars), PALETTE.textDim));
}

/** The camp ahead, beside the vote that chose it or the run's length. */
function drawLoadout(ctx: Ctx, loadout: Extract<TrailPanel, { kind: "loadout" }>): void {
  panel(ctx, TRAIL_ZONES.panel);
  const vote = ctx.model.vote;
  const { main, side } = panelSplit(vote !== null ? VOTE_W : 0);
  drawPreview(ctx, loadout.next, main, loadout.next.title);
  if (vote !== null) drawVoteResult(ctx, vote, side);
}

/** The shop takes the panel; on a replay the camp it leads to stands
 * beside it. */
function drawShopPanel(ctx: Ctx, shop: Extract<TrailPanel, { kind: "shop" }>): void {
  panel(ctx, TRAIL_ZONES.panel);
  if (shop.next === null) {
    const zone = TRAIL_ZONES.panel;
    drawShop(ctx, shop.shop, { x: zone.x + 8, y: zone.y + 4, w: zone.w - 16, h: zone.h - 8 }, "Shop");
    return;
  }
  const { main, side } = panelSplit(SIDE_W);
  drawPreview(ctx, shop.next, main, shop.next.title);
  drawShop(ctx, shop.shop, side, "Shop");
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
      pick.setInteractive({ cursor: CURSOR.pointer });
      pick.on("pointerdown", () => ctx.handlers.onPickSeat(row.seatId));
      layer.add(pick);
      ctx.index.register("trail", row.objectId, pick);
    }
  });
}

// ---------------------------------------------------------------------------
// Item bar
// ---------------------------------------------------------------------------

/** One of your powers or upgrade: icon, name, what is left of it. */
function drawKitTile(ctx: Ctx, item: KitItem, rect: Rect): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(rect.x, rect.y);
  const bg = scene.add.rectangle(0, 0, rect.w, rect.h, toPhaserColor(item.kind === "upgrade" ? PALETTE.bark : PALETTE.stump)).setOrigin(0, 0);
  container.add(bg);
  const art = sourceArtId(item.sourceId);
  if (art !== null) container.add(placeArt(scene, art, 10, rect.h / 2));
  const chars = Math.floor((rect.w - 22) / LABEL_CELL.w);
  container.add(text(scene, 20, 1, fitLabel(item.name, chars)));
  container.add(text(scene, 20, rect.h - LABEL_CELL.h - 1, fitUses(item.charge, chars), PALETTE.textDim));
  container.setSize(rect.w, rect.h);
  bg.setInteractive();
  bg.on("pointerover", () => handlers.onSourceHover(item.sourceKey, item.objectId));
  bg.on("pointerout", () => handlers.onSourceHover(null));
  layer.add(container);
  index.register("trail", item.objectId, container);
}

/** An item slot on the bar: the item's icon, name and uses, or an empty
 * slot. A click opens the backpack. */
function drawBarSlot(ctx: Ctx, slot: ItemBar["slots"][number], rect: Rect): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(rect.x, rect.y);
  const item: InventoryItem | null = slot.item;
  const bg = scene.add.rectangle(0, 0, rect.w, rect.h, toPhaserColor(item === null ? PALETTE.plate : PALETTE.bark)).setOrigin(0, 0);
  if (item?.rare) bg.setStrokeStyle(1, toPhaserColor(RARE));
  container.add(bg);
  if (item === null) {
    container.add(dashedBox(scene, rect.w, rect.h));
    container.add(centredText(scene, rect.w / 2, Math.floor((rect.h - LABEL_CELL.h) / 2), "Empty slot", PALETTE.textDim));
  } else {
    const art = sourceArtId(item.itemId);
    if (art !== null) container.add(placeArt(scene, art, 10, Math.floor(rect.h / 2)));
    const chars = Math.floor((rect.w - 22) / LABEL_CELL.w);
    const top = Math.max(0, Math.floor((rect.h - 2 * LABEL_CELL.h - 1) / 2));
    container.add(text(scene, 19, top, fitLabel(item.name, chars)));
    container.add(text(scene, 19, top + LABEL_CELL.h + 1, fitLabel(item.uses, chars), item.rare ? RARE : PALETTE.textDim));
  }
  container.setSize(rect.w, rect.h);
  bg.setInteractive({ cursor: CURSOR.pointer });
  bg.on("pointerdown", () => handlers.onBackpack());
  if (item !== null) {
    bg.on("pointerover", () => handlers.onSourceHover(item.uid, slot.objectId));
    bg.on("pointerout", () => handlers.onSourceHover(null));
  }
  layer.add(container);
  index.register("trail", slot.objectId, container);
}

function dashedBox(scene: Phaser.Scene, w: number, h: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(toPhaserColor(PALETTE.textDim), 1);
  for (let x = 0; x < w; x += 4) {
    g.fillRect(x, 0, Math.min(2, w - x), 1);
    g.fillRect(x, h - 1, Math.min(2, w - x), 1);
  }
  for (let y = 0; y < h; y += 4) {
    g.fillRect(0, y, 1, Math.min(2, h - y));
    g.fillRect(w - 1, y, 1, Math.min(2, h - y));
  }
  return g;
}

/** The backpack: its icon and how full it is. A click opens the inventory. */
function drawBackpackButton(ctx: Ctx, backpack: ItemBar["backpack"], rect: Rect): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(rect.x, rect.y);
  const full = backpack.stored >= backpack.capacity;
  const bg = scene.add.rectangle(0, 0, rect.w, rect.h, toPhaserColor(PALETTE.stump)).setOrigin(0, 0).setStrokeStyle(1, toPhaserColor(full ? PALETTE.sun : PALETTE.plateEdge));
  container.add(bg);
  container.add(placeArt(scene, "backpack-icon", rect.w / 2, 19));
  container.add(centredText(scene, rect.w / 2, 37, "Backpack"));
  container.add(centredText(scene, rect.w / 2, 47, `${backpack.stored} of ${backpack.capacity}`, full ? PALETTE.sun : PALETTE.textDim));
  container.setSize(rect.w, rect.h);
  bg.setInteractive({ cursor: CURSOR.pointer });
  bg.on("pointerdown", () => handlers.onBackpack());
  bg.on("pointerover", () => bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn)));
  bg.on("pointerout", () => bg.setStrokeStyle(1, toPhaserColor(full ? PALETTE.sun : PALETTE.plateEdge)));
  layer.add(container);
  index.register("trail", BACKPACK_ID, container);
}

/** Your item slots, the backpack, and your explorer's powers and upgrade. */
function drawItemBar(ctx: Ctx): void {
  const { scene, layer, model } = ctx;
  const zone = TRAIL_ZONES.backpack;
  panel(ctx, zone);
  const bar = model.itemBar;
  if (bar === null) {
    layer.add(centredText(scene, zone.x + zone.w / 2, zone.y + zone.h / 2 - 4, "Watching the crew", PALETTE.textDim));
    return;
  }
  const geo = itemBarLayout(bar.slots.length);
  const slotsRight = geo.slots[0]!.x + geo.slots[0]!.w;
  layer.add(text(scene, zone.x + 4, zone.y + 3, "Item slots"));
  layer.add(text(scene, slotsRight - labelWidth(bar.count), zone.y + 3, bar.count, PALETTE.textDim));
  bar.slots.forEach((slot, i) => drawBarSlot(ctx, slot, geo.slots[i]!));
  drawBackpackButton(ctx, bar.backpack, geo.backpack);
  layer.add(text(scene, geo.explorer.x, zone.y + 3, "Explorer"));
  const tiles = bar.explorer.slice(0, geo.explorerTiles.length);
  tiles.forEach((item, i) => drawKitTile(ctx, item, geo.explorerTiles[i]!));
  const next = geo.explorerTiles[tiles.length];
  if (!bar.explorer.some((k) => k.kind === "upgrade") && next !== undefined) {
    layer.add(text(scene, next.x + 2, next.y + Math.floor((next.h - LABEL_CELL.h) / 2), fitLabel("No upgrade yet", Math.floor(next.w / LABEL_CELL.w)), PALETTE.textDim));
  }
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
  const caption = ready.state === "open" ? "When you are ready" : "Waiting for the crew";
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
  if (model.inventory?.open) return;
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
    case "shop":
      drawShopPanel(ctx, shown);
      drawCrew(ctx);
      break;
    case "loadout":
      drawLoadout(ctx, shown);
      drawCrew(ctx);
      break;
  }
  drawItemBar(ctx);
  drawReady(ctx);
}
