import type { ExpeditionCampView, ExpeditionCardIdentityView, ExpeditionObjectiveView, ExpeditionTargetKind, ExpeditionView } from "@games/rules";
import { BOSS_DISPLAY, GEAR_DISPLAY } from "@games/rules";
import type { CardPackId } from "./card-pack-ids";
import {
  cardLabel,
  gearObjectId,
  handObjectId,
  objectiveObjectId,
  revealObjectId,
  seatObjectId,
  trickObjectId,
  WHISPER_ID,
} from "./expedition-ids";
import type { LocalUiState } from "./local-ui";
import { candidateIdsForKind, nextTargetKind } from "./local-ui";
import type { Prompt } from "./build-prompt";
import { buildPrompt } from "./build-prompt";

/**
 * D-12 boundary (spec §7.1): `buildSceneModel` renders `view.camp.
 * yourLegalCardIds` and `view.yourGear[].usableNow`/`.reason` DIRECTLY and
 * NEVER recomputes legality, gear availability, or objective status. Every
 * fact this module exposes is either copied verbatim from the already-
 * redacted `ExpeditionView`/`RoomSeatInfo`, or a pure display transform
 * (sorting, id-building, seat rotation) of those fields. Phaser scenes
 * (Plans 12-08/09/10) draw ONLY this model — never `ExpeditionView` fields
 * directly. If you find yourself deriving "can this be played/used/picked"
 * from anything other than a field already on the view, stop — it belongs
 * on the server.
 *
 * Purity: no Phaser/React/zustand import, no wall-clock reads, no
 * randomness sources of any kind. Same (server, ui, cardPackId) in ->
 * deep-equal `SceneModel` out, always.
 */

export interface RoomSeatInfo {
  seatId: string;
  displayLabel: string;
  connected: boolean;
}

export interface SceneServerInput {
  game: ExpeditionView;
  roomSeats: RoomSeatInfo[];
  hostSeatId: string | null;
}

export type SceneKey = "camp" | "fireside" | "run-end";

/** The top bar's three readouts, shared by the camp and fireside scenes. */
export interface TopBar {
  supplies: number;
  camp: string;
  boss: { text: string; dim: boolean } | null;
}

/** Gear rules text for the hovered item, plus why it can't be used or
 * packed right now. */
export interface Tooltip {
  title: string;
  text: string;
  reason: string | null;
}

export const BOSS_CAMP_NUMBERS: readonly number[] = [3, 6];
export const FINAL_CAMP_NUMBER = 6;

export type BossEffect = "rain" | "dark-sky" | "none";

export interface CardModel {
  id: string;
  identity: ExpeditionCardIdentityView;
  label: string;
  objectId: string;
  playable: boolean;
  dimmed: boolean;
  targetable: boolean;
  selected: boolean;
  lifted: boolean;
}

export type ObjectiveKind = "win-card" | "ordered" | "no-tricks" | "exactly-n";

export interface ObjectiveChip {
  objectiveId: string;
  objectId: string;
  kind: ObjectiveKind;
  label: string;
  orderBadge: string | null;
  status: "pending" | "done" | "failed";
  ownerSeatId: string | null;
  pickable: boolean;
  targetable: boolean;
  selected: boolean;
}

export interface GearChip {
  gearId: string;
  objectId: string;
  name: string;
  spent: boolean;
  usable: boolean;
  pulse: boolean;
  reason: string | null;
}

export interface MiniCard {
  objectId: string;
  label: string;
  identity: ExpeditionCardIdentityView;
  sourceTag: "whisper" | "gear";
  sourceName: string;
}

export interface SeatModel {
  seatId: string;
  objectId: string;
  displayLabel: string;
  isYou: boolean;
  ring: number;
  connected: boolean;
  mayAct: boolean;
  isExpeditionLeader: boolean;
  handSize: number;
  tricksWon: number;
  objectives: ObjectiveChip[];
  gear: GearChip[];
  reveals: MiniCard[];
  whisperedTo: string[];
  targetable: boolean;
  selected: boolean;
}

export interface TrickPlayModel {
  seatId: string;
  card: CardModel;
  isLed: boolean;
}

export interface SceneModel {
  sceneKey: "camp";
  cardPackId: CardPackId;
  youSeatId: string | null;
  runPhase: ExpeditionView["runPhase"];
  campNumber: number;
  supplies: number;
  bossTwist: { id: string; name: string; effect: BossEffect; cancelled: boolean } | null;
  topBar: TopBar;
  seats: SeatModel[];
  hand: CardModel[];
  trick: { leaderSeatId: string; plays: TrickPlayModel[] } | null;
  lastTrick: { leaderSeatId: string; winnerSeatId: string; plays: TrickPlayModel[]; open: boolean } | null;
  faceUpObjectives: ObjectiveChip[];
  removedCardLabels: string[];
  prompt: Prompt;
  tooltip: Tooltip | null;
  /** `visible`: the Whisper can be started now. `used`: you already whispered
   * this camp. `shown`: the button belongs on screen (camp is being played). */
  whisper: { shown: boolean; visible: boolean; used: boolean; active: boolean };
  preDeal: { youPending: boolean; gear: GearChip[] } | null;
  targeting: { mode: "gear" | "whisper"; sourceObjectId: string; nextKind: ExpeditionTargetKind | null; canConfirm: boolean } | null;
}

export function sceneKeyFor(game: ExpeditionView): SceneKey {
  if (game.runPhase === "ended") return "run-end";
  if (game.runPhase === "fireside") return "fireside";
  return "camp";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SUIT_ORDER: Readonly<Record<"spades" | "hearts" | "clubs" | "diamonds", number>> = {
  spades: 0,
  hearts: 1,
  clubs: 2,
  diamonds: 3,
};

function sortKey(identity: ExpeditionCardIdentityView): number {
  if (identity.kind === "joker") {
    return identity.joker === "moon" ? 1000 : 2000;
  }
  return SUIT_ORDER[identity.suit] * 100 + identity.rank;
}

function roomSeatFor(roomSeats: RoomSeatInfo[], seatId: string): RoomSeatInfo {
  return roomSeats.find((r) => r.seatId === seatId) ?? { seatId, displayLabel: "?", connected: false };
}

function orderedSeatIds(view: ExpeditionView): string[] {
  const ids = view.seats.map((s) => s.seatId);
  if (view.yourSeatId === null) return ids;
  const idx = ids.indexOf(view.yourSeatId);
  if (idx === -1) return ids;
  return [...ids.slice(idx), ...ids.slice(0, idx)];
}

function targetInfo(
  ui: LocalUiState,
  view: ExpeditionView,
  kind: ExpeditionTargetKind,
  id: string,
): { targetable: boolean; selected: boolean } {
  const targeting = ui.targeting;
  if (targeting === null) return { targetable: false, selected: false };
  const nk = nextTargetKind(ui);
  const targetable = nk === kind && candidateIdsForKind(kind, view).includes(id);
  let selected: boolean;
  if (targeting.mode === "gear") {
    selected = targeting.selected.includes(id);
  } else {
    selected = (kind === "own-card" && targeting.cardId === id) || (kind === "teammate" && targeting.targetSeatId === id);
  }
  return { targetable, selected };
}

function gearChipFor(gearId: string, seatId: string, view: ExpeditionView, ui: LocalUiState): GearChip {
  const display = GEAR_DISPLAY[gearId];
  const name = display?.name ?? gearId;
  const isYou = seatId === view.yourSeatId && view.yourSeatId !== null;
  let spent: boolean;
  let usable = false;
  let reason: string | null = null;
  if (isYou) {
    const status = view.yourGear.find((g) => g.gearId === gearId);
    spent = status?.spent ?? false;
    usable = status?.usableNow ?? false;
    reason = status?.reason ?? null;
  } else {
    spent = (view.attempt?.gearUses ?? []).some((u) => u.seatId === seatId && u.gearId === gearId && u.kind === "used");
  }
  const pulse = isYou && usable && ui.targeting === null;
  return { gearId, objectId: gearObjectId(gearId), name, spent, usable, pulse, reason };
}

function objectiveLabel(o: ExpeditionObjectiveView): { label: string; orderBadge: string | null } {
  if (o.kind === "win-card") {
    return { label: cardLabel(o.target), orderBadge: null };
  }
  if (o.kind === "ordered") {
    return { label: cardLabel(o.target), orderBadge: o.order === "last" ? "L" : String(o.order) };
  }
  if (o.kind === "no-tricks") {
    return { label: "0 tricks", orderBadge: null };
  }
  return { label: `=${o.n} tricks`, orderBadge: null };
}

function buildObjectiveChip(o: ExpeditionObjectiveView, camp: ExpeditionCampView, view: ExpeditionView, ui: LocalUiState): ObjectiveChip {
  const { label, orderBadge } = objectiveLabel(o);
  const isFaceUp = o.ownerSeatId === null;
  const kind: ExpeditionTargetKind = isFaceUp ? "face-up-objective" : "own-objective";
  const { targetable, selected } = targetInfo(ui, view, kind, o.id);
  const pickable = isFaceUp
    ? camp.campPhase === "objective-pick" && camp.currentActorSeatId === view.yourSeatId && ui.targeting === null
    : false;
  return {
    objectiveId: o.id,
    objectId: objectiveObjectId(o),
    kind: o.kind,
    label,
    orderBadge,
    status: o.status,
    ownerSeatId: o.ownerSeatId,
    pickable,
    targetable,
    selected,
  };
}

function objectivesForOwner(camp: ExpeditionCampView | null, ownerSeatId: string | null, view: ExpeditionView, ui: LocalUiState): ObjectiveChip[] {
  if (camp === null) return [];
  return camp.objectives.filter((o) => o.ownerSeatId === ownerSeatId).map((o) => buildObjectiveChip(o, camp, view, ui));
}

function buildTrickPlayModel(play: { seatId: string; card: { id: string; identity: ExpeditionCardIdentityView } }, isLed: boolean): TrickPlayModel {
  return {
    seatId: play.seatId,
    isLed,
    card: {
      id: play.card.id,
      identity: play.card.identity,
      label: cardLabel(play.card.identity),
      objectId: trickObjectId(play.card.identity),
      playable: false,
      dimmed: false,
      targetable: false,
      selected: false,
      lifted: false,
    },
  };
}

function seatModelFor(seatId: string, ring: number, view: ExpeditionView, roomSeats: RoomSeatInfo[], ui: LocalUiState): SeatModel {
  const room = roomSeatFor(roomSeats, seatId);
  const camp = view.attempt?.camp ?? null;
  const handSize = camp?.handSizes.find((h) => h.seatId === seatId)?.size ?? 0;
  const tricksWon = camp === null ? 0 : camp.completedTricks.filter((t) => t.winnerSeatId === seatId).length;
  const isExpeditionLeader = camp !== null && camp.expeditionLeaderSeatId === seatId;

  let mayAct = false;
  if (view.runPhase === "pre-deal") {
    mayAct = (view.attempt?.preDealPendingSeatIds ?? []).includes(seatId);
  } else if (camp !== null) {
    mayAct = camp.currentActorSeatId === seatId;
  }

  const seatView = view.seats.find((s) => s.seatId === seatId);
  const equippedGearIds = seatView?.equippedGearIds ?? [];
  const gear = equippedGearIds.map((gid) => gearChipFor(gid, seatId, view, ui));
  const objectives = objectivesForOwner(camp, seatId, view, ui);

  const reveals: MiniCard[] = (view.attempt?.reveals ?? [])
    .filter((r) => r.fromSeatId === seatId)
    .map((r) => ({
      objectId: revealObjectId(r.identity),
      label: cardLabel(r.identity),
      identity: r.identity,
      sourceTag: r.source === "whisper" ? "whisper" : "gear",
      sourceName: r.source === "whisper" ? "Whisper" : (GEAR_DISPLAY[r.source]?.name ?? r.source),
    }));

  const whisperedTo = (view.attempt?.log ?? [])
    .filter((l) => l.event === "whisper" && l.actorSeatId === seatId)
    .flatMap((l) => l.subjectSeatIds);

  const { targetable, selected } = targetInfo(ui, view, "teammate", seatId);

  return {
    seatId,
    objectId: seatObjectId(seatId),
    displayLabel: room.displayLabel,
    isYou: view.yourSeatId !== null && seatId === view.yourSeatId,
    ring,
    connected: room.connected,
    mayAct,
    isExpeditionLeader,
    handSize,
    tricksWon,
    objectives,
    gear,
    reveals,
    whisperedTo,
    targetable,
    selected,
  };
}

function buildHand(camp: ExpeditionCampView | null, view: ExpeditionView, ui: LocalUiState): CardModel[] {
  if (camp === null) return [];
  const yourTurnToPlay = camp.campPhase === "playing" && camp.currentActorSeatId === view.yourSeatId;
  const nk = nextTargetKind(ui);
  const ownCardCandidates = ui.targeting !== null && nk === "own-card" ? candidateIdsForKind("own-card", view) : null;

  const cards = [...camp.yourHand].sort((a, b) => sortKey(a.identity) - sortKey(b.identity));
  return cards.map((c) => {
    const playable = camp.yourLegalCardIds.includes(c.id);
    const { targetable, selected } = targetInfo(ui, view, "own-card", c.id);
    const targetingOwnCardDim = ownCardCandidates !== null && !ownCardCandidates.includes(c.id);
    const dimmed = (yourTurnToPlay && !playable) || targetingOwnCardDim;
    return {
      id: c.id,
      identity: c.identity,
      label: cardLabel(c.identity),
      objectId: handObjectId(c.identity),
      playable,
      dimmed,
      targetable,
      selected,
      lifted: ui.hoveredCardId === c.id,
    };
  });
}

function buildTrick(camp: ExpeditionCampView | null): SceneModel["trick"] {
  if (camp === null) return null;
  return {
    leaderSeatId: camp.currentTrick.leaderSeatId,
    plays: camp.currentTrick.plays.map((p, i) => buildTrickPlayModel(p, i === 0)),
  };
}

function buildLastTrick(camp: ExpeditionCampView | null, ui: LocalUiState): SceneModel["lastTrick"] {
  if (camp === null || camp.completedTricks.length === 0) return null;
  const last = camp.completedTricks[camp.completedTricks.length - 1]!;
  return {
    leaderSeatId: last.leaderSeatId,
    winnerSeatId: last.winnerSeatId,
    plays: last.plays.map((p, i) => buildTrickPlayModel(p, i === 0)),
    open: ui.lastTrickOpen,
  };
}

function buildBossTwist(view: ExpeditionView): SceneModel["bossTwist"] {
  if (view.activeBossTwistId === null) return null;
  const id = view.activeBossTwistId;
  const display = BOSS_DISPLAY[id];
  let effect: BossEffect = "none";
  if (id === "radio-silence") effect = "rain";
  else if (id === "eclipse") effect = "dark-sky";
  return {
    id,
    name: display?.name ?? id,
    effect,
    cancelled: view.attempt?.bossCancelled ?? false,
  };
}

function buildTopBar(view: ExpeditionView, bossTwist: SceneModel["bossTwist"]): TopBar {
  const camp = BOSS_CAMP_NUMBERS.includes(view.campNumber)
    ? `Camp ${view.campNumber} of ${FINAL_CAMP_NUMBER} - Boss camp`
    : `Camp ${view.campNumber} of ${FINAL_CAMP_NUMBER}`;
  const boss =
    bossTwist === null
      ? null
      : { text: bossTwist.cancelled ? `Boss: ${bossTwist.name} (off)` : `Boss: ${bossTwist.name}`, dim: bossTwist.cancelled };
  return { supplies: view.supplies, camp, boss };
}

/** Rules text plus downside, the way every tooltip phrases a gear. */
export function gearRulesText(gearId: string): { title: string; text: string } | null {
  const display = GEAR_DISPLAY[gearId];
  if (display === undefined) return null;
  return { title: display.name, text: display.downside === null ? display.text : `${display.text} ${display.downside}` };
}

function buildTooltip(view: ExpeditionView, ui: LocalUiState): Tooltip | null {
  if (ui.tooltipGearId === null) return null;
  const rules = gearRulesText(ui.tooltipGearId);
  if (rules === null) return null;
  const status = view.yourGear.find((g) => g.gearId === ui.tooltipGearId);
  const reason = status !== undefined && !status.usableNow ? (status.reason ?? null) : null;
  return { ...rules, reason };
}

export function buildSceneModel(
  server: SceneServerInput,
  ui: LocalUiState,
  cardPackId: CardPackId,
  reconnecting = false,
): SceneModel {
  const { game: view, roomSeats } = server;
  const camp = view.attempt?.camp ?? null;

  const seats = orderedSeatIds(view).map((seatId, ring) => seatModelFor(seatId, ring, view, roomSeats, ui));
  const hand = buildHand(camp, view, ui);
  const trick = buildTrick(camp);
  const lastTrick = buildLastTrick(camp, ui);
  const bossTwist = buildBossTwist(view);
  const faceUpObjectives = objectivesForOwner(camp, null, view, ui);
  const removedCardLabels = (camp?.removedCards ?? []).map((identity) => cardLabel(identity));

  const whisperUsed = (view.attempt?.log ?? []).some((l) => l.event === "whisper" && l.actorSeatId === view.yourSeatId);
  const whisperShown = view.yourSeatId !== null && camp !== null && camp.campPhase === "playing";
  const whisperVisible = whisperShown && view.attempt?.gearWindow === "between-tricks" && !whisperUsed;
  const whisper = { shown: whisperShown, visible: whisperVisible, used: whisperUsed, active: ui.targeting?.mode === "whisper" };
  const prompt = buildPrompt(view, roomSeats, ui, { reconnecting, whisperAvailable: whisperVisible });

  let preDeal: SceneModel["preDeal"] = null;
  if (view.runPhase === "pre-deal") {
    const pending = view.attempt?.preDealPendingSeatIds ?? [];
    const youPending = view.yourSeatId !== null && pending.includes(view.yourSeatId);
    const preDealGear = view.yourGear
      .filter((g) => GEAR_DISPLAY[g.gearId]?.window === "pre-deal")
      .map((g) => gearChipFor(g.gearId, view.yourSeatId ?? "", view, ui));
    preDeal = { youPending, gear: preDealGear };
  }

  let targeting: SceneModel["targeting"] = null;
  if (ui.targeting !== null) {
    const nk = nextTargetKind(ui);
    const sourceObjectId = ui.targeting.mode === "gear" ? gearObjectId(ui.targeting.gearId) : WHISPER_ID;
    targeting = { mode: ui.targeting.mode, sourceObjectId, nextKind: nk, canConfirm: nk === null };
  }

  return {
    sceneKey: "camp",
    cardPackId,
    youSeatId: view.yourSeatId,
    runPhase: view.runPhase,
    campNumber: view.campNumber,
    supplies: view.supplies,
    bossTwist,
    topBar: buildTopBar(view, bossTwist),
    seats,
    hand,
    trick,
    lastTrick,
    faceUpObjectives,
    removedCardLabels,
    prompt,
    tooltip: buildTooltip(view, ui),
    whisper,
    preDeal,
    targeting,
  };
}
