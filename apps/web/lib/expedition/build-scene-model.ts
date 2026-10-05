import type { ExpeditionCampView, ExpeditionCardIdentityView, ExpeditionObjectiveView, ExpeditionTargetKind, ExpeditionView } from "@games/rules";
import { attemptOf, campHeadline, focusCampIndex, ledSuit, whisperLog, whispersSent } from "./view-access";
import { SOURCE_DISPLAY } from "@games/rules";
import type { CardPackId } from "./card-pack-ids";
import {
  cardLabel,
  faceDownTrickObjectId,
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
import { buildPrompt, describeOption } from "./build-prompt";
import type { ObjectiveHolder } from "./objective-tooltip";
import { objectiveTooltip } from "./objective-tooltip";
import { buildModChips, buildSky, modTooltip, washedHappenings, washing, type ModChip, type Sky } from "./weather-model";
import { bossBlockReason, bossHappenings, buildBoss, buildHelpers, latestGust, seatMarks, type BossHappening, type BossModel, type Gust, type SeatBossMark, type SeatNamer } from "./boss-model";
import { buildTemplePath, type TemplePath } from "./temple-model";
import { buildPopupShop, POPUP_SHOP, type PopupShopModel } from "./popup-shop-model";
import { buildFanPicker, mistOver, vowMarks, type FanPicker } from "./character-marks";
import { isSpent, liveSourceKeys, sourceIdOfKey, sourceKind, sourceName, sourceRulesText, usesLabel, yourSourceId, type SourceKind, type UsesLabel } from "./source-text";

const TORNADO_ID = "tornado";

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

export type SceneKey = "camp" | "trail" | "run-end";

/** The top bar's readouts, shared by the camp and trail scenes. */
export interface TopBar {
  supplies: number;
  suppliesMax: number;
  /** The crew's shared coins. */
  purse: number;
  camp: string;
  /** The camp label opens the map of the run once the run's length is set. */
  map: boolean;
  /** The supply crates as an ability target (First Aid Kit); null outside
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
  /** What the card counts as right now, when not its printed card: the
   * suit it follows on a Blood Moon trick, the card True Form made it, or
   * the rank the Compass or a Whetstone gave it. */
  countsAs: ExpeditionCardIdentityView | null;
}

/** "sun": the temple's win-card objective on the Sun. */
export type ObjectiveKind = "win-card" | "sun" | "ordered" | "no-tricks" | "exactly-n" | "hidden";

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

/** A character, upgrade or equipped item. `sourceKey` is what the seat
 * acts through (an item's instance uid); `sourceId` names the def, for art
 * and text. `usable`/`reason` are yours only. `charge` is what is left. */
export interface SourceChip {
  sourceKey: string;
  sourceId: string;
  objectId: string;
  name: string;
  kind: SourceKind;
  charge: UsesLabel;
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

/** "washed": spent, and the weather washed your last whisper away. */
export type WhisperState = "ready" | "wait-between-tricks" | "used" | "washed" | "blocked";

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
  /** Heavy fog hides the items this teammate has not used yet. */
  itemsHidden: boolean;
  reveals: MiniCard[];
  targetable: boolean;
  selected: boolean;
  /** The seat's hand as a whole, for a hand pick. */
  handObjectId: string;
  handPick: PickState;
  /** What the boss has marked this seat with: watched, a streak, a bite. */
  bossMark: SeatBossMark | null;
}

/** One option of the pick tray on the table: a whisper, a won trick, or a
 * rank for the held card. */
export interface TrayOption {
  choiceId: string;
  objectId: string;
  label: string;
  cards: string[];
}

/** A gated window the table waits on: before the deal, or a rescue after
 * an objective fails. `uses` are your abilities that answer it. */
/** The rescue window's sign: what failed, and who may still answer it. */
export interface Banner {
  title: string;
  detail: string;
  youPending: boolean;
  uses: SourceChip[];
}

export interface ShownPlayModel {
  seatId: string;
  hidden: false;
  card: CardModel;
  isLed: boolean;
  /** Left its completed trick: it never won and counts for nothing. */
  burned: boolean;
  /** What a completed play counted as, when not its printed card. */
  countsAs: ExpeditionCardIdentityView | null;
}

/** A card on the table played face down (a Cave, the Night): only the suit
 * it follows as shows. */
export interface FaceDownPlayModel {
  seatId: string;
  hidden: true;
  suit: "spades" | "hearts" | "diamonds" | "clubs" | "joker";
  objectId: string;
  isLed: boolean;
}

export type TrickPlayModel = ShownPlayModel | FaceDownPlayModel;

export type BurnStyle = "burn" | "vaporize";

/** The Meteor vaporizes the card it burns; anything else burns it. */
function burnStyle(view: ExpeditionView): BurnStyle {
  return view.stage.tag === "camp" && view.stage.mods.some((m) => m.id === "meteor") ? "vaporize" : "burn";
}

export interface SceneModel {
  sceneKey: "camp";
  cardPackId: CardPackId;
  youSeatId: string | null;
  /** The camp being played. */
  campIndex: number;
  topBar: TopBar;
  /** The camp's modifiers in fold order, on the top bar. */
  mods: ModChip[];
  /** The boss on the table; null for a plain camp and the temple. */
  boss: BossModel | null;
  /** At the temple, the bosses back at half strength: none at a Short
   * temple, the animal at a Standard one, the animal then the disaster at a
   * Long one. */
  helpers: BossModel[];
  /** The temple's plate path; null at any other camp. */
  temple: TemplePath | null;
  /** The location's backdrop and what the weather draws over it. */
  sky: Sky;
  seats: SeatModel[];
  hand: CardModel[];
  trick: { leaderSeatId: string; plays: TrickPlayModel[] } | null;
  /** `key` names the trick per camp and attempt; `burn` is how its burned
   * card went: burned by fire, or vaporized by the Meteor. */
  lastTrick: { key: string; leaderSeatId: string; winnerSeatId: string; plays: ShownPlayModel[]; open: boolean; burn: BurnStyle } | null;
  faceUpObjectives: ObjectiveChip[];
  removedCardLabels: string[];
  prompt: Prompt;
  tooltip: Tooltip | null;
  /** The Whisper button. `shown`: it belongs on screen (camp is being
   * played). `state`: why it can or cannot be pressed, with `reason` a short
   * phrase for the unavailable states. `visible`: it can be started now.
   * `used`: you have spent every Whisper this camp. `left`: Whispers you may
   * still send this camp. */
  /** `washes`: the weather will wash your next whisper away. */
  whisper: { shown: boolean; visible: boolean; used: boolean; active: boolean; state: WhisperState; reason: string | null; left: number; washes: boolean };
  /** Cards teammates named to you, kept face up for the attempt. */
  receivedWhispers: ReceivedWhisper[];
  /** Cards an ability showed you, and who held each. */
  shownCards: ShownCard[];
  /** Cards you named to teammates: your confirmation. */
  sentWhispers: SentWhisper[];
  /** The cards the latest Tornado gust took from your hand. */
  gustSent: SentWhisper[];
  /** The latest gust, for its card flight; null before the first. */
  gust: Gust | null;
  /** What the disasters did this attempt, and each whisper the weather
   * washed away, oldest first, for their toasts. */
  happenings: BossHappening[];
  /** One line per Whisper this attempt, oldest first, a washed one saying
   * so. Public: names only, plus the card for a Whisper you sent. */
  whisperLog: string[];
  banner: Banner | null;
  /** The current trick as a whole, for a board pick. */
  boardPick: PickState | null;
  /** Options that have no other place on the table. */
  tray: { title: string; options: TrayOption[] } | null;
  /** The Businessman's Pop-up Shop while you are buying from it. */
  popupShop: PopupShopModel | null;
  /** Teammates' hands fanned out while the Magician's swap is aimed. */
  fan: FanPicker | null;
  /** The Perfumist's pink mist hangs over this trick: it is a hallucination. */
  mist: boolean;
  trayPage: number;
  /** The card being dragged onto the table; `legal` says whether the table
   * accepts it. Null when no card is held. */
  drag: { cardId: string; legal: boolean } | null;
  targeting: { mode: "ability" | "whisper"; sourceObjectId: string; nextKind: ExpeditionTargetKind | null; canConfirm: boolean } | null;
}

export function sceneKeyFor(game: ExpeditionView): SceneKey {
  if (game.stage.tag === "ended") return "run-end";
  if (game.stage.tag === "camp") return "camp";
  return "trail";
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

function sourceChipFor(sourceKey: string, seatId: string, view: ExpeditionView, ui: LocalUiState): SourceChip {
  const isYou = seatId === view.yourSeatId && view.yourSeatId !== null;
  const seat = view.seats.find((s) => s.seatId === seatId);
  const sourceId = sourceIdOfKey(seat, sourceKey);
  const remaining = seat?.usage.find((u) => u.sourceKey === sourceKey)?.remaining ?? null;
  const ability = isYou ? view.yourAbilities.find((a) => a.sourceKey === sourceKey) : undefined;
  const usable = ability?.usableNow ?? false;
  const reason = ability?.reason ?? null;
  const pulse = isYou && usable && ui.targeting === null;
  return {
    sourceKey,
    sourceId,
    objectId: sourceObjectId(sourceKey),
    name: sourceName(sourceId),
    kind: sourceKind(sourceId),
    charge: usesLabel(sourceId, remaining),
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
    return { label: "No tricks", orderBadge: null };
  }
  if (o.kind === "hidden") {
    return { label: "?", orderBadge: null };
  }
  return { label: `=${o.n} tricks`, orderBadge: null };
}

function chipKind(o: ExpeditionObjectiveView): ObjectiveKind {
  return o.kind === "win-card" && o.target.kind === "joker" && o.target.joker === "sun" ? "sun" : o.kind;
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
    kind: chipKind(o),
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

/** What a card counts as, for its badge: the identity it counts as, else
 * its printed card at the rank it now has, else null. */
function shownAs(identity: ExpeditionCardIdentityView, countsAs: ExpeditionCardIdentityView | null, effectiveRank: number | null): ExpeditionCardIdentityView | null {
  if (countsAs !== null) return countsAs;
  if (effectiveRank === null || identity.kind !== "standard") return null;
  return { ...identity, rank: effectiveRank as typeof identity.rank };
}

function buildTrickPlayModel(
  play: { seatId: string; card: { id: string; identity: ExpeditionCardIdentityView }; burned?: boolean; countsAs?: ExpeditionCardIdentityView | null; effectiveRank?: number | null },
  isLed: boolean,
  pick: PickState = { targetable: false, selected: false },
): ShownPlayModel {
  const countsAs = shownAs(play.card.identity, play.countsAs ?? null, play.effectiveRank ?? null);
  return {
    seatId: play.seatId,
    hidden: false,
    isLed,
    burned: play.burned ?? false,
    countsAs,
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
      countsAs,
    },
  };
}

/** Abilities the camp grants every seat (the temple's skip), keyed by the
 * granting modifier's id. */
function grantedKeys(view: ExpeditionView): string[] {
  const stage = view.stage;
  return stage.tag === "camp" ? stage.mods.flatMap((m) => (SOURCE_DISPLAY[m.id]?.kind === "grant" ? [m.id] : [])) : [];
}

function seatModelFor(seatId: string, ring: number, view: ExpeditionView, roomSeats: RoomSeatInfo[], ui: LocalUiState, marks: Readonly<Record<string, SeatBossMark>>): SeatModel {
  const room = roomSeatFor(roomSeats, seatId);
  const camp = attemptOf(view)?.camp ?? null;
  const handSize = camp?.handSizes.find((h) => h.seatId === seatId)?.size ?? 0;
  const tricksWon = camp === null ? 0 : camp.completedTricks.filter((t) => t.winnerSeatId === seatId).length;
  const isExpeditionLeader = camp !== null && camp.expeditionLeaderSeatId === seatId;

  let mayAct = false;
  const pending = attemptOf(view)?.pendingSeatIds ?? [];
  if (pending.length > 0) {
    mayAct = pending.includes(seatId);
  } else if (camp !== null) {
    mayAct = camp.currentActorSeatId === seatId;
  }

  const seatView = view.seats.find((s) => s.seatId === seatId);
  const sources = [...(seatView === undefined ? [] : liveSourceKeys(seatView)), ...grantedKeys(view)].map((key) => sourceChipFor(key, seatId, view, ui));
  const objectives = objectivesForOwner(camp, seatId, view, ui);

  const reveals: MiniCard[] = (attemptOf(view)?.reveals ?? [])
    .filter((r) => r.fromSeatId === seatId && r.source !== TORNADO_ID)
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
    itemsHidden: !(view.yourSeatId !== null && seatId === view.yourSeatId) && (seatView?.items.concealed ?? false),
    reveals,
    targetable,
    selected,
    handObjectId: seatHandObjectId(seatId),
    handPick: targetInfo(ui, view, "hand", seatId),
    bossMark: marks[seatId] ?? null,
  };
}

/** Why a card the server did not list as legal can't be played; phrases
 * the server's answer and never recomputes it. */
function blockedReasonFor(camp: ExpeditionCampView, view: ExpeditionView, card: ExpeditionCardIdentityView): string {
  if (camp.campPhase !== "playing") return "Wait for the objectives to be picked";
  if (camp.currentActorSeatId !== view.yourSeatId) return "Not your turn yet";
  const led = ledSuit(camp);
  const legal = camp.yourHand.filter((c) => camp.yourLegalCardIds.includes(c.id));
  const following = led !== null && legal.some((c) => c.identity.kind === "standard" && c.identity.suit === led);
  const boss = following ? null : bossBlockReason(view, card, legal.length);
  if (boss !== null) return boss;
  if (led !== null) return `Must follow ${SUIT_GLYPH[led]}`;
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
      blockedReason: playable ? null : blockedReasonFor(camp, view, c.identity),
      dragging: (ui.drag.phase === "dragging" || ui.drag.phase === "playing") && dragged === c.id,
      countsAs: shownAs(c.identity, c.countsAs, c.effectiveRank),
    };
  });
}

function whisperStatus(view: ExpeditionView, active: boolean): SceneModel["whisper"] {
  const camp = attemptOf(view)?.camp ?? null;
  const shown = view.yourSeatId !== null && camp !== null && camp.campPhase === "playing";
  const mine = attemptOf(view)?.yourWhisper ?? { allowed: true, left: 1 };
  let state: WhisperState = "ready";
  let reason: string | null = null;
  if (!mine.allowed) {
    state = "blocked";
    reason = "Blocked right now";
  } else if (mine.left === 0) {
    const last = whispersSent(view).filter((entry) => entry.actorSeatId === view.yourSeatId).at(-1);
    state = last?.washed === true ? "washed" : "used";
    reason = last === undefined ? "No whispers this camp" : last.washed ? "Washed away" : "Used this camp";
  } else if (attemptOf(view)?.window !== "between-tricks") {
    state = "wait-between-tricks";
    reason = "Between tricks";
  }
  const washes = (washing(view)?.left ?? 0) > 0;
  return { shown, visible: shown && state === "ready", used: state === "used" || state === "washed", active, state, reason, left: mine.left, washes };
}

function buildWhispers(
  view: ExpeditionView,
  roomSeats: RoomSeatInfo[],
): Pick<SceneModel, "receivedWhispers" | "sentWhispers" | "shownCards" | "whisperLog" | "gustSent"> {
  const you = view.yourSeatId;
  const nameOf = (seatId: string): string => roomSeatFor(roomSeats, seatId).displayLabel;
  const whisperReveals = (attemptOf(view)?.reveals ?? []).filter((r) => r.source === "whisper");
  const mineSent = whisperReveals.filter((r) => r.fromSeatId === you);

  const receivedWhispers = whisperReveals
    .filter((r) => r.fromSeatId !== you)
    .map((r) => ({ fromSeatId: r.fromSeatId, fromName: nameOf(r.fromSeatId), card: cardLabel(r.identity), objectId: revealObjectId(r.identity) }));
  const sentWhispers = mineSent.flatMap((r) =>
    r.toSeatId === null ? [] : [{ toSeatId: r.toSeatId, toName: nameOf(r.toSeatId), card: cardLabel(r.identity), objectId: revealObjectId(r.identity) }],
  );

  let sentSoFar = 0;
  const whisperLines = whispersSent(view).map((l) => {
    const to = l.subjectSeatIds[0] ?? "";
    if (l.washed) return `${l.actorSeatId === you ? "Your" : `${nameOf(l.actorSeatId)}'s`} whisper to ${to === you ? "you" : nameOf(to)} washed away`;
    if (l.actorSeatId === you) {
      const card = mineSent[sentSoFar++];
      return card === undefined ? `You whispered to ${nameOf(to)}` : `You whispered ${cardLabel(card.identity)} to ${nameOf(to)}`;
    }
    return `${nameOf(l.actorSeatId)} whispered to ${to === you ? "you" : nameOf(to)}`;
  });

  const shownCards = (attemptOf(view)?.reveals ?? [])
    .filter((r) => r.source !== "whisper" && r.source !== TORNADO_ID)
    .map((r) => ({ fromSeatId: r.fromSeatId, fromName: nameOf(r.fromSeatId), sourceName: sourceName(r.source), card: cardLabel(r.identity), objectId: revealObjectId(r.identity) }));

  const gust = latestGust(view);
  const gustSent = gust === null ? [] : gust.cards.map((c) => ({ toSeatId: gust.toSeatId, toName: nameOf(gust.toSeatId), card: c.label, objectId: `reveal:${c.label}` }));
  return { receivedWhispers, sentWhispers, shownCards, whisperLog: whisperLines, gustSent };
}

function buildTrick(camp: ExpeditionCampView | null, view: ExpeditionView, ui: LocalUiState): SceneModel["trick"] {
  if (camp === null) return null;
  return {
    leaderSeatId: camp.currentTrick.leaderSeatId,
    plays: camp.currentTrick.plays.map((p, i): TrickPlayModel =>
      p.hidden
        ? { seatId: p.seatId, hidden: true, suit: p.suit, objectId: faceDownTrickObjectId(p.seatId), isLed: i === 0 }
        : buildTrickPlayModel(p, i === 0, targetInfo(ui, view, "card", p.card.id)),
    ),
  };
}

function buildLastTrick(camp: ExpeditionCampView | null, view: ExpeditionView, ui: LocalUiState): SceneModel["lastTrick"] {
  if (camp === null || camp.completedTricks.length === 0 || view.stage.tag !== "camp") return null;
  const last = camp.completedTricks[camp.completedTricks.length - 1]!;
  return {
    key: `${view.stage.camp.index}:${view.stage.attempt.attemptNumber}:${last.index}`,
    burn: burnStyle(view),
    leaderSeatId: last.leaderSeatId,
    winnerSeatId: last.winnerSeatId,
    plays: last.plays.map((p, i) => buildTrickPlayModel(p, i === 0)),
    open: ui.lastTrickOpen,
  };
}

/** Supplies of their cap, the purse, and which camp of how many. */
export function buildTopBar(view: ExpeditionView, suppliesPick: PickState | null = null): TopBar {
  return { supplies: view.supplies.count, suppliesMax: view.supplies.max, purse: view.purse, camp: campLabel(view), map: view.campCount !== null, suppliesPick };
}

/** In a boss camp or the temple the strip's chip names it, so the label
 * says only which camp of how many. */
function campLabel(view: ExpeditionView): string {
  const stage = view.stage;
  const index = focusCampIndex(view);
  const bossChip = stage.tag === "camp" && stage.mods.some((m) => m.kind === "animal" || m.kind === "disaster" || m.kind === "temple");
  return bossChip && index !== null && view.campCount !== null ? `Camp ${index} of ${view.campCount}` : campHeadline(view);
}

function buildTooltip(server: SceneServerInput, ui: LocalUiState): Tooltip | null {
  const { game: view, roomSeats } = server;
  const drag = ui.drag;
  if (drag.phase === "returning" && drag.reason !== null) {
    const held = attemptOf(view)?.camp.yourHand.find((c) => c.id === drag.cardId);
    const name = held === undefined ? "that card" : cardLabel(held.identity);
    return { title: `Can't play ${name}`, text: "", badges: [], reason: drag.reason };
  }
  if (ui.tooltipModId !== null) return modTooltip(view, ui.tooltipModId);
  if (ui.tooltipObjectiveId !== null) {
    const o = attemptOf(view)?.camp.objectives.find((x) => x.id === ui.tooltipObjectiveId);
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
    const mate = ui.tooltipMateSource;
    const rules = sourceRulesText(sourceIdOfKey(view.seats.find((s) => s.seatId === mate.seatId), mate.sourceKey));
    return rules === null ? null : { ...rules, reason: null };
  }
  if (ui.tooltipSourceId === null) return null;
  const rules = sourceRulesText(sourceIdOfKey(view.seats.find((s) => s.seatId === view.yourSeatId), ui.tooltipSourceId));
  if (rules === null) return null;
  const ability = view.yourAbilities.find((a) => a.sourceKey === ui.tooltipSourceId);
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
  if (attemptOf(view)?.window !== "rescue") return null;
  const pending = attemptOf(view)?.pendingSeatIds ?? [];
  const you = view.yourSeatId;
  const youPending = you !== null && pending.includes(you);
  const uses = youPending
    ? view.yourAbilities
        .map((a) => sourceChipFor(a.sourceKey, you, view, ui))
        .filter((chip) => chip.usable && SOURCE_DISPLAY[chip.sourceId]?.active?.windows.includes("rescue"))
    : [];
  const others = pending.filter((id) => id !== you).map((id) => roomSeatFor(roomSeats, id).displayLabel);
  const useNames = uses.map((u) => u.name).join(" or ");
  const objectives = attemptOf(view)?.camp.objectives ?? [];
  const failed = (attemptOf(view)?.rescue?.failedObjectiveIds ?? []).flatMap((id) => {
    const o = objectives.find((x) => x.id === id);
    return o === undefined ? [] : [objectiveName(o, view, roomSeats)];
  });
  const title = failed.length === 1 ? `Objective failed: ${failed[0]}` : failed.length > 1 ? `Objectives failed: ${failed.join(", ")}` : "An objective failed";
  const detail = youPending
    ? `You can rescue it with ${useNames}${others.length === 0 ? "" : `. ${listed(others)} can too`}`
    : others.length === 0
      ? "Waiting on the crew to rescue it or pass"
      : others.length === 1
        ? `Waiting on ${others[0]} to rescue it or pass`
        : `${others.join(" or ")} can rescue it. Waiting on them`;
  return { title, detail, youPending, uses };
}

/** "Bob", "Bob and Cara", "Bob, Cara and Dan". */
function listed(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
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
    const whispers = whisperLog(view);
    const known = (attemptOf(view)?.reveals ?? []).filter((r) => r.source === "whisper");
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
    const tricks = attemptOf(view)?.camp.completedTricks ?? [];
    return {
      title: step.prompt,
      options: step.choices.map((id) => {
        const index = Number(id.slice("trick:".length));
        const trick = tricks.find((t) => t.index === index);
        return option(id, trickLabel(index), trick?.plays.map((p) => cardLabel(p.card.identity)) ?? []);
      }),
    };
  }
  if (step.kind === "option") {
    if (ui.targeting?.mode === "ability" && yourSourceId(view, ui.targeting.sourceKey) === POPUP_SHOP) return null;
    return { title: step.prompt, options: step.choices.map((id) => option(id, describeOption(id.slice("option:".length), (seatId) => (seatId === null ? "nobody" : nameOf(seatId))))) };
  }
  if (step.kind === "item") {
    const seat = view.seats.find((s) => s.seatId === view.yourSeatId);
    const items = [...(seat?.items.equipped ?? []), ...(seat?.items.backpack ?? [])];
    return {
      title: step.prompt,
      options: step.choices.map((id) => {
        const item = items.find((i) => `item:${i.uid}` === id);
        return option(id, item === undefined ? "An item" : sourceName(item.itemId));
      }),
    };
  }
  if (step.kind === "card-value" || step.kind === "objective-value") {
    const choices = valueChoices(ui, view);
    if (choices.length === 0) return null;
    const heldId = ui.targeting?.mode === "ability" ? ui.targeting.heldId : null;
    const options = choices.map((id) => option(id, rankLabel(Number(id.split(":")[2]))));
    if (step.kind === "objective-value") {
      const objective = attemptOf(view)?.camp.objectives.find((o) => o.id === heldId);
      const target = objective !== undefined && "target" in objective ? objective.target : null;
      return { title: target === null ? "Shift it to" : `Shift ${cardLabel(target)} to`, options };
    }
    const held = attemptOf(view)?.camp.yourHand.find((c) => c.id === heldId);
    return { title: held === undefined ? "Count it as" : `Count ${cardLabel(held.identity)} as`, options };
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
  const camp = attemptOf(view)?.camp ?? null;

  const namer: SeatNamer = { name: (seatId) => roomSeatFor(roomSeats, seatId).displayLabel, isYou: (seatId) => seatId === view.yourSeatId };
  const boss = buildBoss(view, namer);
  const helpers = buildHelpers(view, namer);
  const marks = { ...vowMarks(view), ...seatMarks(boss, helpers) };
  const seats = orderedSeatIds(view).map((seatId, ring) => seatModelFor(seatId, ring, view, roomSeats, ui, marks));
  const hand = buildHand(camp, view, ui);
  const trick = buildTrick(camp, view, ui);
  const lastTrick = buildLastTrick(camp, view, ui);
  const faceUpObjectives = objectivesForOwner(camp, null, view, ui);
  const removedCardLabels = (camp?.removedCards ?? []).map((identity) => cardLabel(identity));

  const whisper = whisperStatus(view, ui.targeting?.mode === "whisper");
  const prompt = buildPrompt(view, roomSeats, ui, { reconnecting, whisperAvailable: whisper.visible });

  const drag =
    ui.drag.phase === "dragging" && ui.targeting === null ? { cardId: ui.drag.cardId, legal: ui.drag.legal } : null;

  let targeting: SceneModel["targeting"] = null;
  if (ui.targeting !== null) {
    const step = currentStep(ui, view);
    const objectId = ui.targeting.mode === "ability" ? sourceObjectId(ui.targeting.sourceKey) : WHISPER_ID;
    targeting = { mode: ui.targeting.mode, sourceObjectId: objectId, nextKind: step?.kind ?? null, canConfirm: step === null };
  }

  return {
    sceneKey: "camp",
    cardPackId,
    youSeatId: view.yourSeatId,
    campIndex: focusCampIndex(view) ?? 0,
    topBar: buildTopBar(view, pickOrNull(ui, view, "supplies")),
    mods: buildModChips(view),
    boss,
    helpers,
    temple: buildTemplePath(view),
    sky: buildSky(view) ?? { location: "jungle", backdrop: "jungle", precipitation: "none", haze: "none", flood: null, strike: null, notice: null, bloodMoon: false },
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
    gust: latestGust(view),
    happenings: [...bossHappenings(view, namer), ...washedHappenings(view, namer)],
    banner: ui.targeting === null ? buildBanner(view, roomSeats, ui) : null,
    boardPick: pickOrNull(ui, view, "board"),
    tray: buildTray(view, roomSeats, ui),
    popupShop: buildPopupShop(view, ui, (seatId) => roomSeatFor(roomSeats, seatId).displayLabel),
    fan: buildFanPicker(view, ui, (seatId) => roomSeatFor(roomSeats, seatId).displayLabel),
    mist: mistOver(view),
    trayPage: ui.trayPage,
    drag,
    targeting,
  };
}
