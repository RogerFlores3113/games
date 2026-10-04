/**
 * The trail scene's zones: the muster with its length vote, the trail map,
 * the draft, the route vote, the event and the loadout, the crew, the kit
 * and Ready. Every value drawn comes from `TrailModel`; clicks only call the
 * handlers.
 */
import type Phaser from "phaser";
import { PALETTE, toPhaserColor } from "../palette";
import { LABEL_CELL, SIGN_CELL, WORLD_SIGN_FONT } from "../font/font-keys";
import { MUSTER_ZONES, ROUTE_ZONES, TRAIL_ZONES, rowBoxes, trailStopXs, type Rect } from "../layout";
import { placeArt } from "../art/place-art";
import { ART, crewArtId, sourceArtId, type ArtId } from "../art/art-registry";
import type { ObjectIndex } from "../object-index";
import type {
  CampPreview,
  CharacterCard,
  CrewRow,
  DraftItem,
  KitItem,
  LengthOption,
  MusterCrewRow,
  RouteCard,
  StopKind,
  TrailModel,
  TrailPanel,
  TrailStop,
  VoteResult,
} from "../../../../lib/expedition/trail-model";
import { fitLabel, wrapWords } from "./text-fit";
import { PANEL_ALPHA, button, coin, labelWidth, plate, setCoinFace, text, type Layer } from "./ui-kit";

export interface TrailHandlers {
  /** A muster or draft tile: picks a character or takes a source. */
  onDraft(sourceId: string): void;
  /** A length at muster or a route between camps. */
  onVote(choice: string): void;
  onReady(): void;
  onSourceHover(sourceId: string | null): void;
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

const MUSTER_GAP = 4;
const PORTRAIT_H = 84;

function badgeText(scene: Phaser.Scene, cx: number, y: number, value: string): Phaser.GameObjects.GameObject[] {
  const w = labelWidth(value) + 4;
  const x = cx - Math.floor(w / 2);
  return [scene.add.rectangle(x, y - 1, w, LABEL_CELL.h + 2, toPhaserColor(PALETTE.plate)).setOrigin(0, 0), text(scene, x + 2, y, value, PALETTE.text)];
}

function drawCharacterCard(ctx: Ctx, card: CharacterCard, x: number, y: number, w: number, h: number): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(PALETTE.plate)).setOrigin(0, 0);
  const edge = card.yours ? PALETTE.turn : card.pickable ? PALETTE.sun : PALETTE.plateEdge;
  bg.setStrokeStyle(card.yours ? 2 : 1, toPhaserColor(edge));
  container.add(bg);
  container.add(scene.add.rectangle(2, 2, w - 4, PORTRAIT_H, toPhaserColor(PALETTE.night)).setOrigin(0, 0));
  const art = crewArtId(card.characterId);
  if (art !== null) container.add(placeArt(scene, art, w / 2, 2 + PORTRAIT_H - 40));

  const chars = Math.floor((w - 4) / LABEL_CELL.w);
  const cx = Math.floor(w / 2);
  let cy = PORTRAIT_H + 6;
  container.add(centredText(scene, cx, cy, fitLabel(card.name, chars), PALETTE.sun));
  cy += LINE;
  for (const line of wrapped(card.theme, chars, 2)) {
    container.add(centredText(scene, cx, cy, line, PALETTE.textDim));
    cy += LINE;
  }
  cy += 3;
  container.add(scene.add.rectangle(4, cy - 2, w - 8, 1, toPhaserColor(PALETTE.plateEdge)).setOrigin(0, 0));
  const icon = sourceArtId(card.power.sourceId);
  const powerW = (icon === null ? 0 : 18) + labelWidth(card.power.name);
  const px = Math.floor((w - powerW) / 2);
  if (icon !== null) container.add(placeArt(scene, icon, px + 8, cy + 6));
  container.add(text(scene, px + (icon === null ? 0 : 18), cy + 2, card.power.name));
  cy += 16;
  for (const line of wrapped(card.power.text, chars, 4)) {
    container.add(centredText(scene, cx, cy, line));
    cy += LINE;
  }
  cy += 2;
  for (const badge of card.power.badges) {
    for (const line of wrapped(badge, chars - 1, 2)) {
      container.add(badgeText(scene, cx, cy, line));
      cy += LINE + 1;
    }
  }
  if (card.pool !== null) {
    for (const line of wrapped(card.pool, chars, 2)) {
      container.add(centredText(scene, cx, cy, line, PALETTE.done));
      cy += LINE;
    }
  }

  const footer = card.yours ? "Your explorer" : card.takenBy !== null ? `Taken: ${card.takenBy}` : card.pickable ? "Choose" : "Free";
  const footerColor = card.yours ? PALETTE.turn : card.takenBy !== null ? PALETTE.textDim : PALETTE.sun;
  container.add(centredText(scene, cx, h - LABEL_CELL.h - 4, fitLabel(footer, chars), footerColor));
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
    const status = row.connected ? MUSTER_STATUS[row.status] : { label: "away", color: PALETTE.statusDisconnected };
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
  const cards = MUSTER_ZONES.cards;
  rowBoxes(cards.x + 2, cards.w - 4, muster.characters.length, MUSTER_GAP, 120).forEach((box, i) => {
    drawCharacterCard(ctx, muster.characters[i]!, box.x, cards.y, box.w, cards.h);
  });
  drawMusterCrew(ctx, muster.crew, muster.votes);
  const zone = MUSTER_ZONES.lengths;
  rowBoxes(zone.x, zone.w, muster.lengths.length, 6, 200).forEach((box, i) => {
    drawLengthOption(ctx, muster.lengths[i]!, box.x, zone.y, box.w, zone.h);
  });
}

// ---------------------------------------------------------------------------
// Camp previews and the vote result
// ---------------------------------------------------------------------------

/** "Location  Jungle" rows. Returns the y after the last row. */
function detailRows(scene: Phaser.Scene, container: Phaser.GameObjects.Container, rows: [string, string][], x: number, y: number, w: number): number {
  const keyW = Math.max(...rows.map(([key]) => labelWidth(key))) + 6;
  const chars = Math.floor((w - keyW) / LABEL_CELL.w);
  let cy = y;
  for (const [key, value] of rows) {
    container.add(text(scene, x, cy, key, PALETTE.textDim));
    container.add(text(scene, x + keyW, cy, fitLabel(value, chars), PALETTE.text));
    cy += LINE;
  }
  return cy;
}

function previewRows(preview: CampPreview, withEvent: boolean): [string, string][] {
  const rows: [string, string][] = [
    ["Location", preview.location],
    ["Weather", preview.weather],
  ];
  if (withEvent && preview.event !== null) rows.push(["Event", preview.event]);
  return rows;
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

function bossLine(scene: Phaser.Scene, container: Phaser.GameObjects.Container, boss: string | null, x: number, y: number): void {
  if (boss === null) {
    container.add(text(scene, x, y, "No boss", PALETTE.textDim));
    return;
  }
  container.add(placeArt(scene, boss === "The Temple" ? "temple" : "marker-boss", x + 8, y + 3));
  container.add(text(scene, x + 18, y, boss, PALETTE.destructive));
}

function drawPreview(ctx: Ctx, preview: CampPreview, zone: Rect, heading: string): void {
  const { scene, layer } = ctx;
  const container = scene.add.container(zone.x, zone.y);
  container.add(signText(scene, 8, 6, heading, PALETTE.sun));
  const w = zone.w - 16;
  let y = detailRows(scene, container, previewRows(preview, true), 8, 26, w);
  y += 2;
  container.add(text(scene, 8, y, "Objectives", PALETTE.textDim));
  y = objectiveChips(scene, container, preview.objectives, 8, y + LINE, w);
  bossLine(scene, container, preview.boss, 8, y + 2);
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

const TILE_GAP = 6;
const TILE_MAX_W = 128;

function drawDraftTile(ctx: Ctx, item: DraftItem, x: number, y: number, w: number, h: number): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const upgrade = item.kind === "upgrade";
  const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(upgrade ? PALETTE.stump : PALETTE.bark)).setOrigin(0, 0);
  bg.setStrokeStyle(1, toPhaserColor(PALETTE.turn));
  container.add(bg);
  const chars = Math.floor((w - 6) / LABEL_CELL.w);
  const cx = Math.floor(w / 2);
  container.add(scene.add.rectangle(0, 0, w, 11, toPhaserColor(upgrade ? PALETTE.turn : PALETTE.moss)).setOrigin(0, 0));
  container.add(centredText(scene, cx, 2, fitLabel(item.ribbon, chars)));
  const art = sourceArtId(item.sourceId);
  if (art !== null) container.add(placeArt(scene, art, cx, 26).setScale(2));
  let cy = 42;
  container.add(centredText(scene, cx, cy, fitLabel(item.name, chars), PALETTE.sun));
  cy += LINE + 2;
  for (const line of wrapped(item.text, chars, 3)) {
    container.add(centredText(scene, cx, cy, line));
    cy += LINE;
  }
  cy += 2;
  for (const badge of item.badges) {
    for (const line of wrapped(badge, chars - 1, 2)) {
      container.add(badgeText(scene, cx, cy, line));
      cy += LINE + 1;
    }
  }
  container.add(centredText(scene, cx, h - LABEL_CELL.h - 4, "Take it", PALETTE.turn));
  container.setSize(w, h);
  const hit = scene.add.zone(0, 0, w, h).setOrigin(0, 0);
  hit.setInteractive({ useHandCursor: true });
  hit.on("pointerdown", () => handlers.onDraft(item.sourceId));
  container.add(hit);
  layer.add(container);
  index.register("trail", item.objectId, container);
}

function drawDraft(ctx: Ctx, draft: Extract<TrailPanel, { kind: "draft" }>): void {
  const { scene, layer } = ctx;
  const zone = TRAIL_ZONES.panel;
  panel(ctx, zone);
  layer.add(coin(scene, zone.x + 12, zone.y + 9, 5));
  layer.add(text(scene, zone.x + 21, zone.y + 5, draft.heading, PALETTE.sun));
  const offer = draft.draft;
  if (offer.kind === "offer") {
    rowBoxes(zone.x + 6, zone.w - 12, offer.items.length, TILE_GAP, TILE_MAX_W).forEach((box, i) => {
      drawDraftTile(ctx, offer.items[i]!, box.x, zone.y + 17, box.w, zone.h - 21);
    });
    return;
  }
  const cy = zone.y + zone.h / 2;
  if (offer.kind === "taken") {
    const art = sourceArtId(offer.sourceId);
    if (art !== null) layer.add(placeArt(scene, art, zone.x + 48, cy).setScale(2));
    layer.add(text(scene, zone.x + 80, cy - 10, `Taken: ${offer.name}`));
    layer.add(text(scene, zone.x + 80, cy + 2, "It is in your kit below", PALETTE.textDim));
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

function drawRouteCard(ctx: Ctx, card: RouteCard, x: number, y: number, w: number, h: number): void {
  const { scene, layer, index, handlers } = ctx;
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, toPhaserColor(card.yours ? PALETTE.stump : PALETTE.plate)).setOrigin(0, 0);
  bg.setStrokeStyle(card.yours ? 2 : 1, toPhaserColor(card.yours ? PALETTE.turn : PALETTE.plateEdge));
  container.add(bg);
  container.add(scene.add.rectangle(0, 0, w, RIBBON_H, toPhaserColor(card.yours ? PALETTE.turn : PALETTE.moss)).setOrigin(0, 0));
  container.add(text(scene, 5, 3, card.label));
  container.add(text(scene, w - 5 - labelWidth(card.next.title), 3, card.next.title, PALETTE.text));

  const inner = w - 12;
  let cy = detailRows(scene, container, previewRows(card.next, true), 6, RIBBON_H + 5, inner);
  cy += 1;
  container.add(text(scene, 6, cy, "Objectives", PALETTE.textDim));
  cy = objectiveChips(scene, container, card.next.objectives, 6, cy + LINE, inner);
  bossLine(scene, container, card.next.boss, 6, cy + 1);

  const chars = Math.floor(inner / LABEL_CELL.w);
  const votesY = h - 2 * LINE - 4;
  container.add(scene.add.rectangle(4, votesY - 3, w - 8, 1, toPhaserColor(PALETTE.plateEdge)).setOrigin(0, 0));
  const voters = card.voters.length === 0 ? "No votes yet" : `Votes: ${voterLine(card.voters)}`;
  container.add(text(scene, 6, votesY, fitLabel(voters, chars), card.voters.length === 0 ? PALETTE.textDim : PALETTE.turn));
  const footer = card.yours ? "Your vote" : card.votable ? "Vote for this route" : "";
  if (footer !== "") container.add(centredText(scene, Math.floor(w / 2), h - LABEL_CELL.h - 4, footer, card.yours ? PALETTE.turn : PALETTE.sun));

  container.setSize(w, h);
  const hit = scene.add.zone(0, 0, w, h).setOrigin(0, 0);
  hit.setInteractive({ useHandCursor: card.votable });
  if (card.votable) hit.on("pointerdown", () => handlers.onVote(card.id));
  container.add(hit);
  layer.add(container);
  index.register("trail", card.objectId, container);
}

function drawRoutes(ctx: Ctx, routes: Extract<TrailPanel, { kind: "route" }>): void {
  const zone = ROUTE_ZONES.routes;
  const boxes = rowBoxes(0, zone.w, routes.options.length, ROUTE_GAP, ROUTE_MAX_W);
  const span = boxes.length === 0 ? 0 : boxes.at(-1)!.x + boxes.at(-1)!.w;
  const left = zone.x + Math.floor((zone.w - span) / 2);
  boxes.forEach((box, i) => drawRouteCard(ctx, routes.options[i]!, left + box.x, zone.y, box.w, zone.h));
}

// ---------------------------------------------------------------------------
// Event and loadout
// ---------------------------------------------------------------------------

const VOTE_W = 168;

/** The panel split: the main card, and the vote result on its right. */
function panelSplit(withVote: boolean): { main: Rect; vote: Rect } {
  const zone = TRAIL_ZONES.panel;
  const voteW = withVote ? VOTE_W : 0;
  return {
    main: { x: zone.x, y: zone.y, w: zone.w - voteW, h: zone.h },
    vote: { x: zone.x + zone.w - voteW + 4, y: zone.y + 4, w: voteW - 8, h: zone.h - 8 },
  };
}

function drawEvent(ctx: Ctx, event: Extract<TrailPanel, { kind: "event" }>): void {
  const { scene, layer } = ctx;
  panel(ctx, TRAIL_ZONES.panel);
  const { main, vote } = panelSplit(ctx.model.vote !== null);
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
  detailRows(scene, next, previewRows(event.next, false), 8, 0, main.w - 16);
  layer.add(next);
  bossLine(scene, next, event.next.boss, 8, 2 * LINE + 2);
  if (ctx.model.vote !== null) drawVoteResult(ctx, ctx.model.vote, vote);
}

function drawLoadout(ctx: Ctx, loadout: Extract<TrailPanel, { kind: "loadout" }>): void {
  panel(ctx, TRAIL_ZONES.panel);
  const { main, vote } = panelSplit(ctx.model.vote !== null);
  drawPreview(ctx, loadout.next, main, loadout.next.title);
  if (ctx.model.vote !== null) drawVoteResult(ctx, ctx.model.vote, vote);
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
  const status = row.connected ? STATUS[row.status] : { label: "away", color: PALETTE.statusDisconnected };
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
    drawCrewRow({ ...ctx, layer: group }, row, zone.x + 4, zone.y + CREW_TITLE_H + i * rowH, zone.w - 8);
    if (!row.connected) group.setAlpha(0.6);
    layer.add(group);
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
  container.add(text(scene, 20, KIT_ROW_H - LABEL_CELL.h - 1, fitLabel(item.charge, chars), PALETTE.textDim));
  container.setSize(w, KIT_ROW_H);
  bg.setInteractive();
  bg.on("pointerover", () => handlers.onSourceHover(item.sourceId));
  bg.on("pointerout", () => handlers.onSourceHover(null));
  layer.add(container);
  index.register("trail", item.objectId, container);
}

function drawKit(ctx: Ctx): void {
  const { scene, layer, model } = ctx;
  const zone = TRAIL_ZONES.backpack;
  const kit = model.kit;
  panel(ctx, zone);
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

function drawReady(ctx: Ctx): void {
  const { scene, layer, model, index, handlers } = ctx;
  const zone = TRAIL_ZONES.ready;
  const cx = zone.x + zone.w / 2;
  const cy = zone.y + 4 + READY_H / 2;
  const ready = model.ready;
  if (ready === null) {
    if (model.status === null) return;
    layer.add(plate(scene, zone.x + 4, cy - 8, zone.w - 8, 16).setAlpha(PANEL_ALPHA));
    layer.add(centredText(scene, cx, cy - 4, model.status, PALETTE.textDim));
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
      drawCrew(ctx);
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
