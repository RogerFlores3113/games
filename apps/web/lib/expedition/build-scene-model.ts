import type { ExpeditionActiveWindow, ExpeditionCampView, ExpeditionCardIdentityView, ExpeditionObjectiveView, ExpeditionTargetKind, ExpeditionView } from "@games/rules";
import { BOSS_DISPLAY, SOURCE_DISPLAY } from "@games/rules";
import type { CardPackId } from "./card-pack-ids";
import {
  cardLabel,
  rankLabel,
  SUIT_GLYPH,
  handObjectId,
  objectiveObjectId,
  pickObjectId,
  revealObjectId,
  seatHandObjectId,
  seatObjectId,
  sourceObjectId,
  trickObjectId,
  WHISPER_ID,
} from "./expedition-ids";
import { gestureCardId } from "./card-drag";
import type { LocalUiState, PickEntity } from "./local-ui";
import { choiceFor, currentStep, isPicked, valueChoices } from "./local-ui";
import type { Prompt } from "./build-prompt";
import { buildPrompt } from "./build-prompt";
import type { ObjectiveHolder } from "./objective-tooltip";
import { objectiveTooltip } from "./objective-tooltip";
import { chargeText, isSpent, sourceKind, sourceName, sourceRulesText, type SourceKind } from "./source-text";

/**
 * D-12 boundary (spec §7.1): `buildSceneModel` renders `view.camp.
 * yourLegalCardIds`, `view.yourAbilities[]` and the server's step choices
 * DIRECTLY and NEVER recomputes legality, ability availability, or
 * objective status. Every
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
  /** The supply crates as an ability target (Field Kit); null outside
   * targeting. */
  suppliesPick: PickState | null;
}

/** A thing on the table during targeting: offered by the current step, or
 * already picked. */
export interface PickState {
  targetable: boolean;
  selected: boolean;
}

/** Rules text for the hovered source, its when and how-often badges, plus
 * why it can't be used right now. */
export interface Tooltip {
  title: string;
  text: string;
  badges: string[];
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
  /** Why this hand card can't be played right now; null when it can, or
   * for a card that is not in your hand. */
  blockedReason: string | null;
  /** Being dragged: the fan keeps an empty slot for it. */
  dragging: boolean;
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

/** A character or kit source. `usable`/`reason` are yours only. `charge`
 * is what is left: "1 left", "used", "2/3 herbs", "always on". */
export interface SourceChip {
  sourceId: string;
  objectId: string;
  name: string;
  kind: SourceKind;
  charge: string;
  spent: boolean;
  usable: boolean;
  pulse: boolean;
  reason: string | null;
}

export interface MiniCard {
  objectId: string;
  label: string;
  identity: ExpeditionCardIdentityView;
  sourceTag: "whisper" | "ability";
  sourceName: string;
}

export type WhisperState = "ready" | "wait-between-tricks" | "used" | "blocked";

export interface ReceivedWhisper {
  fromSeatId: string;
  fromName: string;
  card: string;
  objectId: string;
}

export interface ShownCard {
  fromSeatId: string;
  fromName: string;
  sourceName: string;
  card: string;
  objectId: string;
}

export interface SentWhisper {
  toSeatId: string;
  toName: string;
  card: string;
  objectId: string;
}

export interface SeatModel {
  seatId: string;
  objectId: string;
  displayLabel: string;
  characterId: string | null;
  isYou: boolean;
  ring: number;
  connected: boolean;
  mayAct: boolean;
  isExpeditionLeader: boolean;
  handSize: number;
  tricksWon: number;
  objectives: ObjectiveChip[];
  sources: SourceChip[];
  reveals: MiniCard[];
  targetable: boolean;
  selected: boolean;
  /** The seat's hand as a whole, for a hand pick. */
  handObjectId: string;
  handPick: PickState;
}

/** One option of the pick tray on the stump: a whisper, a won trick, or a
 * rank for the held card. */
export interface TrayOption {
  choiceId: string;
  objectId: string;
  label: string;
  cards: string[];
}

/** A gated window the table waits on: before the deal, or a rescue after
 * an objective fails. `uses` are your abilities that answer it. */
export interface Banner {
  window: ExpeditionActiveWindow;
  title: string;
  detail: string;
  youPending: boolean;
  uses: SourceChip[];
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
  /** The Whisper button. `shown`: it belongs on screen (camp is being
   * played). `state`: why it can or cannot be pressed, with `reason` a short
   * phrase for the unavailable states. `visible`: it can be started now.
   * `used`: you have spent every Whisper this camp. `left`: Whispers you may
   * still send this camp. */
  whisper: { shown: boolean; visible: boolean; used: boolean; active: boolean; state: WhisperState; reason: string | null; left: number };
  /** Cards teammates named to you, kept face up for the attempt. */
  receivedWhispers: ReceivedWhisper[];
  /** Cards an ability showed you: "Spyglass: Bob holds 7♥". */
  shownCards: ShownCard[];
  /** Cards you named to teammates: your confirmation. */
  sentWhispers: SentWhisper[];
  /** One line per Whisper this attempt, oldest first. Public: names only,
   * plus the card for a Whisper you sent. */
  whisperLog: string[];
  banner: Banner | null;
  /** The current trick as a whole, for a board pick. */
  boardPick: PickState | null;
  /** Options that have no other place on the table. */
  tray: { title: string; options: TrayOption[] } | null;
  trayPage: number;
  /** The card being dragged onto the table; `legal` says whether the stump
   * accepts it. Null when no card is held. */
  drag: { cardId: string; legal: boolean } | null;
  targeting: { mode: "ability" | "whisper"; sourceObjectId: string; nextKind: ExpeditionTargetKind | null; canConfirm: boolean } | null;
}

export function sceneKeyFor(game: ExpeditionView): SceneKey {
  if (game.runPhase === "ended") return "run-end";
  if (game.runPhase === "fireside" || game.runPhase === "muster") return "fireside";
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

function targetInfo(ui: LocalUiState, view: ExpeditionView, entity: PickEntity, id: string): PickState {
  if (ui.targeting === null) return { targetable: false, selected: false };
  const targetable = choiceFor(ui, view, entity, id) !== null;
  return { targetable, selected: isPicked(ui, entity, id) };
}

function pickOrNull(ui: LocalUiState, view: ExpeditionView, entity: PickEntity): PickState | null {
  if (ui.targeting === null) return null;
  const pick = targetInfo(ui, view, entity, "");
  return pick.targetable || pick.selected ? pick : null;
}

function sourceChipFor(sourceId: string, seatId: string, view: ExpeditionView, ui: LocalUiState): SourceChip {
  const isYou = seatId === view.yourSeatId && view.yourSeatId !== null;
  const remaining = view.seats.find((s) => s.seatId === seatId)?.usage.find((u) => u.sourceId === sourceId)?.remaining ?? null;
  const ability = isYou ? view.yourAbilities.find((a) => a.sourceId === sourceId) : undefined;
  const usable = ability?.usableNow ?? false;
  const reason = ability?.reason ?? null;
  const pulse = isYou && usable && ui.targeting === null;
  return {
    sourceId,
    objectId: sourceObjectId(sourceId),
    name: sourceName(sourceId),
    kind: sourceKind(sourceId),
    charge: chargeText(sourceId, remaining),
    spent: isSpent(remaining),
    usable,
    pulse,
    reason,
  };
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
  const { targetable, selected } = targetInfo(ui, view, "objective", o.id);
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

function buildTrickPlayModel(
  play: { seatId: string; card: { id: string; identity: ExpeditionCardIdentityView } },
  isLed: boolean,
  pick: PickState = { targetable: false, selected: false },
): TrickPlayModel {
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
      targetable: pick.targetable,
      selected: pick.selected,
      lifted: false,
      blockedReason: null,
      dragging: false,
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
  const pending = view.attempt?.pendingSeatIds ?? [];
  if (pending.length > 0) {
    mayAct = pending.includes(seatId);
  } else if (camp !== null) {
    mayAct = camp.currentActorSeatId === seatId;
  }

  const seatView = view.seats.find((s) => s.seatId === seatId);
  const liveIds = seatView === undefined || seatView.characterId === null ? (seatView?.kit ?? []) : [seatView.characterId, ...seatView.kit];
  const sources = liveIds.map((id) => sourceChipFor(id, seatId, view, ui));
  const objectives = objectivesForOwner(camp, seatId, view, ui);

  const reveals: MiniCard[] = (view.attempt?.reveals ?? [])
    .filter((r) => r.fromSeatId === seatId)
    .map((r) => ({
      objectId: revealObjectId(r.identity),
      label: cardLabel(r.identity),
      identity: r.identity,
      sourceTag: r.source === "whisper" ? "whisper" : "ability",
      sourceName: r.source === "whisper" ? "Whisper" : sourceName(r.source),
    }));

  const { targetable, selected } = targetInfo(ui, view, "seat", seatId);

  return {
    seatId,
    objectId: seatObjectId(seatId),
    displayLabel: room.displayLabel,
    characterId: seatView?.characterId ?? null,
    isYou: view.yourSeatId !== null && seatId === view.yourSeatId,
    ring,
    connected: room.connected,
    mayAct,
    isExpeditionLeader,
    handSize,
    tricksWon,
    objectives,
    sources,
    reveals,
    targetable,
    selected,
    handObjectId: seatHandObjectId(seatId),
    handPick: targetInfo(ui, view, "hand", seatId),
  };
}

/** Why a card the server did not list as legal can't be played; phrases
 * the server's answer and never recomputes it. */
function blockedReasonFor(camp: ExpeditionCampView, view: ExpeditionView): string {
  if (camp.campPhase !== "playing") return "Wait for the objectives to be picked";
  if (camp.currentActorSeatId !== view.yourSeatId) return "Not your turn yet";
  const led = camp.currentTrick.plays[0]?.card.identity;
  if (led !== undefined && led.kind === "standard") return `Must follow ${SUIT_GLYPH[led.suit]}`;
  return "You can't play that card now";
}

function buildHand(camp: ExpeditionCampView | null, view: ExpeditionView, ui: LocalUiState): CardModel[] {
  if (camp === null) return [];
  const yourTurnToPlay = camp.campPhase === "playing" && camp.currentActorSeatId === view.yourSeatId;
  const step = currentStep(ui, view);
  const cardStep = step !== null && step.kind === "card" ? step : null;

  const cards = [...camp.yourHand].sort((a, b) => sortKey(a.identity) - sortKey(b.identity));
  const dragged = gestureCardId(ui.drag);
  return cards.map((c) => {
    const playable = camp.yourLegalCardIds.includes(c.id);
    const { targetable, selected } = targetInfo(ui, view, "card", c.id);
    const targetingOwnCardDim = cardStep !== null && !targetable;
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
      lifted: ui.hoveredCardId === c.id && dragged === null,
      blockedReason: playable ? null : blockedReasonFor(camp, view),
      dragging: (ui.drag.phase === "dragging" || ui.drag.phase === "playing") && dragged === c.id,
    };
  });
}

function whisperStatus(
  view: ExpeditionView,
  bossTwist: SceneModel["bossTwist"],
  active: boolean,
): SceneModel["whisper"] {
  const camp = view.attempt?.camp ?? null;
  const shown = view.yourSeatId !== null && camp !== null && camp.campPhase === "playing";
  const mine = view.attempt?.yourWhisper ?? { allowed: true, left: 1 };
  let state: WhisperState = "ready";
  let reason: string | null = null;
  if (!mine.allowed) {
    state = "blocked";
    reason = bossTwist !== null && !bossTwist.cancelled ? `Blocked: ${bossTwist.name}` : "Blocked right now";
  } else if (mine.left === 0) {
    state = "used";
    reason = "Used this camp";
  } else if (view.attempt?.window !== "between-tricks") {
    state = "wait-between-tricks";
    reason = "Between tricks";
  }
  return { shown, visible: shown && state === "ready", used: state === "used", active, state, reason, left: mine.left };
}

function buildWhispers(
  view: ExpeditionView,
  roomSeats: RoomSeatInfo[],
): Pick<SceneModel, "receivedWhispers" | "sentWhispers" | "shownCards" | "whisperLog"> {
  const you = view.yourSeatId;
  const nameOf = (seatId: string): string => roomSeatFor(roomSeats, seatId).displayLabel;
  const whisperReveals = (view.attempt?.reveals ?? []).filter((r) => r.source === "whisper");
  const mineSent = whisperReveals.filter((r) => r.fromSeatId === you);

  const receivedWhispers = whisperReveals
    .filter((r) => r.fromSeatId !== you)
    .map((r) => ({ fromSeatId: r.fromSeatId, fromName: nameOf(r.fromSeatId), card: cardLabel(r.identity), objectId: revealObjectId(r.identity) }));
  const sentWhispers = mineSent.flatMap((r) =>
    r.toSeatId === null ? [] : [{ toSeatId: r.toSeatId, toName: nameOf(r.toSeatId), card: cardLabel(r.identity), objectId: revealObjectId(r.identity) }],
  );

  let sentSoFar = 0;
  const whisperLog = (view.attempt?.log ?? [])
    .filter((l) => l.event === "whisper")
    .map((l) => {
      const to = l.subjectSeatIds[0] ?? "";
      if (l.actorSeatId === you) {
        const card = mineSent[sentSoFar++];
        return card === undefined ? `You whispered to ${nameOf(to)}` : `You whispered ${cardLabel(card.identity)} to ${nameOf(to)}`;
      }
      return `${nameOf(l.actorSeatId)} whispered to ${to === you ? "you" : nameOf(to)}`;
    });

  const shownCards = (view.attempt?.reveals ?? [])
    .filter((r) => r.source !== "whisper")
    .map((r) => ({ fromSeatId: r.fromSeatId, fromName: nameOf(r.fromSeatId), sourceName: sourceName(r.source), card: cardLabel(r.identity), objectId: revealObjectId(r.identity) }));

  return { receivedWhispers, sentWhispers, shownCards, whisperLog };
}

function buildTrick(camp: ExpeditionCampView | null, view: ExpeditionView, ui: LocalUiState): SceneModel["trick"] {
  if (camp === null) return null;
  return {
    leaderSeatId: camp.currentTrick.leaderSeatId,
    plays: camp.currentTrick.plays.map((p, i) => buildTrickPlayModel(p, i === 0, targetInfo(ui, view, "card", p.card.id))),
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

function buildTopBar(view: ExpeditionView, bossTwist: SceneModel["bossTwist"], ui: LocalUiState): TopBar {
  const camp = BOSS_CAMP_NUMBERS.includes(view.campNumber)
    ? `Camp ${view.campNumber} of ${FINAL_CAMP_NUMBER} - Boss camp`
    : `Camp ${view.campNumber} of ${FINAL_CAMP_NUMBER}`;
  const boss =
    bossTwist === null
      ? null
      : { text: bossTwist.cancelled ? `Boss: ${bossTwist.name} (off)` : `Boss: ${bossTwist.name}`, dim: bossTwist.cancelled };
  return { supplies: view.supplies, camp, boss, suppliesPick: pickOrNull(ui, view, "supplies") };
}

function buildTooltip(server: SceneServerInput, ui: LocalUiState): Tooltip | null {
  const { game: view, roomSeats } = server;
  const drag = ui.drag;
  if (drag.phase === "returning" && drag.reason !== null) {
    const held = view.attempt?.camp?.yourHand.find((c) => c.id === drag.cardId);
    const name = held === undefined ? "that card" : cardLabel(held.identity);
    return { title: `Can't play ${name}`, text: "", badges: [], reason: drag.reason };
  }
  if (ui.tooltipObjectiveId !== null) {
    const o = view.attempt?.camp?.objectives.find((x) => x.id === ui.tooltipObjectiveId);
    if (o === undefined) return null;
    const holder: ObjectiveHolder =
      o.ownerSeatId === null
        ? { kind: "nobody" }
        : o.ownerSeatId === view.yourSeatId
          ? { kind: "you" }
          : { kind: "seat", name: roomSeatFor(roomSeats, o.ownerSeatId).displayLabel };
    return objectiveTooltip(o, holder);
  }
  if (ui.tooltipMateSource !== null) {
    const rules = sourceRulesText(ui.tooltipMateSource.sourceId);
    return rules === null ? null : { ...rules, reason: null };
  }
  if (ui.tooltipSourceId === null) return null;
  const rules = sourceRulesText(ui.tooltipSourceId);
  if (rules === null) return null;
  const ability = view.yourAbilities.find((a) => a.sourceId === ui.tooltipSourceId);
  const reason = ability !== undefined && !ability.usableNow ? ability.reason : null;
  return { ...rules, reason };
}

function objectiveName(o: ExpeditionObjectiveView, view: ExpeditionView, roomSeats: RoomSeatInfo[]): string {
  const { label, orderBadge } = objectiveLabel(o);
  const named = orderBadge === null ? label : orderBadge === "L" ? `${label} last` : `${label} #${orderBadge}`;
  if (o.ownerSeatId === null) return named;
  const owner = o.ownerSeatId === view.yourSeatId ? "yours" : `${roomSeatFor(roomSeats, o.ownerSeatId).displayLabel}'s`;
  return `${named} (${owner})`;
}

function buildBanner(view: ExpeditionView, roomSeats: RoomSeatInfo[], ui: LocalUiState): Banner | null {
  const window = view.attempt?.window ?? null;
  if (window !== "pre-deal" && window !== "rescue") return null;
  const pending = view.attempt?.pendingSeatIds ?? [];
  const you = view.yourSeatId;
  const youPending = you !== null && pending.includes(you);
  const uses = youPending
    ? view.yourAbilities
        .filter((a) => a.usableNow && SOURCE_DISPLAY[a.sourceId]?.active?.window === window)
        .map((a) => sourceChipFor(a.sourceId, you, view, ui))
    : [];
  const others = pending.filter((id) => id !== you).map((id) => roomSeatFor(roomSeats, id).displayLabel);
  const waiting = others.length === 0 ? "" : `Waiting on ${others.join(" and ")}`;
  const useNames = uses.map((u) => u.name).join(" or ");

  if (window === "pre-deal") {
    const detail = youPending ? `You can use ${useNames} now, or skip` : waiting || "Dealing the cards";
    return { window, title: "Before the deal", detail, youPending, uses };
  }
  const objectives = view.attempt?.camp?.objectives ?? [];
  const failed = (view.attempt?.rescue?.failedObjectiveIds ?? []).flatMap((id) => {
    const o = objectives.find((x) => x.id === id);
    return o === undefined ? [] : [objectiveName(o, view, roomSeats)];
  });
  const title = failed.length === 1 ? `Objective failed: ${failed[0]}` : failed.length > 1 ? `Objectives failed: ${failed.join(", ")}` : "An objective failed";
  const detail = youPending
    ? `You can rescue it with ${useNames}${others.length === 0 ? "" : `. ${others.join(" and ")} can too`}`
    : `${others.join(" or ")} can rescue it. Waiting on them`;
  return { window, title, detail: youPending || others.length !== 1 ? detail : `Waiting on ${others[0]} to rescue it or pass`, youPending, uses };
}

function trickLabel(index: number): string {
  return `Trick ${index + 1}`;
}

/** The pick tray: whisper and won-trick choices, which have no single
 * place on the table, and the ranks for a held card. */
function buildTray(view: ExpeditionView, roomSeats: RoomSeatInfo[], ui: LocalUiState): SceneModel["tray"] {
  const step = currentStep(ui, view);
  if (step === null) return null;
  const nameOf = (id: string): string => (id === view.yourSeatId ? "You" : roomSeatFor(roomSeats, id).displayLabel);
  const option = (choiceId: string, label: string, cards: string[] = []): TrayOption => ({ choiceId, objectId: pickObjectId(choiceId), label, cards });

  if (step.kind === "whisper") {
    const whispers = (view.attempt?.log ?? []).filter((l) => l.event === "whisper");
    const known = (view.attempt?.reveals ?? []).filter((r) => r.source === "whisper");
    return {
      title: step.prompt,
      options: step.choices.map((id) => {
        const ordinal = Number(id.slice("whisper:".length));
        const entry = whispers[ordinal];
        if (entry === undefined) return option(id, `Whisper ${ordinal + 1}`);
        const to = entry.subjectSeatIds[0] ?? "";
        const card = known.find((r) => r.fromSeatId === entry.actorSeatId && r.toSeatId === to);
        const toName = to === view.yourSeatId ? "you" : nameOf(to);
        return option(id, `${nameOf(entry.actorSeatId)} to ${toName}`, card === undefined ? [] : [cardLabel(card.identity)]);
      }),
    };
  }
  if (step.kind === "won-trick") {
    const tricks = view.attempt?.camp?.completedTricks ?? [];
    return {
      title: step.prompt,
      options: step.choices.map((id) => {
        const index = Number(id.slice("trick:".length));
        const trick = tricks.find((t) => t.index === index);
        return option(id, trickLabel(index), trick?.plays.map((p) => cardLabel(p.card.identity)) ?? []);
      }),
    };
  }
  if (step.kind === "card-value") {
    const choices = valueChoices(ui, view);
    if (choices.length === 0) return null;
    const cardId = ui.targeting?.mode === "ability" ? ui.targeting.valueCardId : null;
    const held = view.attempt?.camp?.yourHand.find((c) => c.id === cardId);
    const title = held === undefined ? "Count it as" : `Count ${cardLabel(held.identity)} as`;
    return { title, options: choices.map((id) => option(id, rankLabel(Number(id.split(":")[2])))) };
  }
  return null;
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
  const trick = buildTrick(camp, view, ui);
  const lastTrick = buildLastTrick(camp, ui);
  const bossTwist = buildBossTwist(view);
  const faceUpObjectives = objectivesForOwner(camp, null, view, ui);
  const removedCardLabels = (camp?.removedCards ?? []).map((identity) => cardLabel(identity));

  const whisper = whisperStatus(view, bossTwist, ui.targeting?.mode === "whisper");
  const prompt = buildPrompt(view, roomSeats, ui, { reconnecting, whisperAvailable: whisper.visible });

  const drag =
    ui.drag.phase === "dragging" && ui.targeting === null ? { cardId: ui.drag.cardId, legal: ui.drag.legal } : null;

  let targeting: SceneModel["targeting"] = null;
  if (ui.targeting !== null) {
    const step = currentStep(ui, view);
    const objectId = ui.targeting.mode === "ability" ? sourceObjectId(ui.targeting.sourceId) : WHISPER_ID;
    targeting = { mode: ui.targeting.mode, sourceObjectId: objectId, nextKind: step?.kind ?? null, canConfirm: step === null };
  }

  return {
    sceneKey: "camp",
    cardPackId,
    youSeatId: view.yourSeatId,
    runPhase: view.runPhase,
    campNumber: view.campNumber,
    supplies: view.supplies,
    bossTwist,
    topBar: buildTopBar(view, bossTwist, ui),
    seats,
    hand,
    trick,
    lastTrick,
    faceUpObjectives,
    removedCardLabels,
    prompt,
    tooltip: buildTooltip(server, ui),
    whisper,
    ...buildWhispers(view, roomSeats),
    banner: ui.targeting === null ? buildBanner(view, roomSeats, ui) : null,
    boardPick: pickOrNull(ui, view, "board"),
    tray: buildTray(view, roomSeats, ui),
    trayPage: ui.trayPage,
    drag,
    targeting,
  };
}
