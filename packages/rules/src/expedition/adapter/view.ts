// D-07-style per-seat whitelist projection for Expedition (Phase 11, Plan
// 01, COMM-03) — mirrors hanabi/projection.ts's discipline near-verbatim.
// The spread operator in object literals, `delete`, `Object.assign`, any
// omit helper, and assigning a hidden identity through a shared reference
// are all FORBIDDEN in this file. Every returned object is built
// field-by-field from named values, so a viewer's own hand structurally
// cannot leak another seat's card, `seed`, `objectiveDeck`, another seat's
// draft offer, or a reveal/log entry not addressed to it — not because it
// was stripped, but because the object literal never mentions it. Arrays
// are copied via `Array.from`/`.map`, never `[...x]` spread, to keep this
// file's own forbidden-token scan clean.
//
// This realizes design-spec section 6.4's "a view contains / never
// contains" list, and the WR-03 ruling recorded on run/types.ts's Reveal
// type: a reveal pins a card's identity plus the seat that held it AT
// REVEAL TIME; this file never re-derives a card's current holder from a
// reveal, so a later toolkit move/swap does not retroactively disclose a
// card's new location to an audience that was never addressed there.
//
// Three-part structure (mirrors hanabi/projection.ts):
//   1. Compute the public top-level fields ONCE, before any branch — they
//      are identical for every seat.
//   2. Viewer-scoped fields (own abilities with their step choices, own
//      draft offer) default to the least-privileged value when the seat is
//      not found.
//   3. The stage view: `attempt`/`camp` construction reads `rules`
//      (computed ONCE via `rulesFor`) and gates every reveal/log/objective
//      by audience or ownership before ever building its literal.

import { campGoals, campPhase, currentActorSeatId } from "../camp";
import { identitiesEqual } from "../deck";
import { rulesFor } from "../run/compose";
import { runStatus } from "../run/lifecycle";
import { SUPPLIES_MAX } from "../run/balance";
import { bossAt, campCount, visibleBossId } from "../run/plan";
import { slotKindsFor, type CampSpec, type RouteOption } from "../run/route";
import { surveyDeal, surveyedCamps } from "../run/survey";
import { campStack, modCtx, pairingOf, specOf, type StackLayer } from "../run/stack";
import type { StatusPart } from "../content/mods/mod-def";
import { whispersUsedBy } from "../run/whisper";
import { abilityStatus } from "../run/abilities";
import { abilityKeys, abilityOf, activeOfKey, backpackOf, itemOf, remaining, usedThisAttempt, type Remaining } from "../run/usage";
import { priceFor, upgradeOffers, type StockEntry } from "../run/shop";
import { currentWindow, gatedPendingSeatIds } from "../run/windows";
import type { RunRules } from "../run/run-rules";
import type { ActiveEffect, AttemptState, Catalog, ItemInstance, LogEntry, PerSeat, Reveal, RunState, SeatRun } from "../run/types";
import { rankOf } from "../trick";
import type { CampState, CardIdentity, ExpeditionCard, Objective, ResolvedPlay, StandardIdentity } from "../state";
import type {
  ExpeditionAttemptView,
  ExpeditionBallotView,
  ExpeditionCampPreviewView,
  ExpeditionCampResultView,
  ExpeditionCampView,
  ExpeditionCardIdentityView,
  ExpeditionCardView,
  ExpeditionCompletedPlayView,
  ExpeditionCompletedTrickView,
  ExpeditionCurrentTrickView,
  ExpeditionAbilityView,
  ExpeditionEffectOriginView,
  ExpeditionEffectView,
  ExpeditionHandSizeView,
  ExpeditionItemView,
  ExpeditionLogEntryView,
  ExpeditionModView,
  ExpeditionObjectiveView,
  ExpeditionRankedCardView,
  ExpeditionRemainingView,
  ExpeditionRevealView,
  ExpeditionSeatView,
  ExpeditionShopView,
  ExpeditionStageView,
  ExpeditionStatusPartView,
  ExpeditionStockView,
  ExpeditionSurveyedObjectiveView,
  ExpeditionTrickPlayView,
  ExpeditionView,
} from "./view-types";

function toIdentityView(identity: CardIdentity): ExpeditionCardIdentityView {
  if (identity.kind === "joker") {
    return { kind: "joker", joker: identity.joker };
  }
  return { kind: "standard", suit: identity.suit, rank: identity.rank };
}

function toStandardIdentityView(identity: StandardIdentity): { kind: "standard"; suit: StandardIdentity["suit"]; rank: StandardIdentity["rank"] } {
  return { kind: "standard", suit: identity.suit, rank: identity.rank };
}

function toCardView(card: ExpeditionCard): ExpeditionCardView {
  return { id: card.id, identity: toIdentityView(card.identity) };
}

function toObjectiveView(state: RunState, viewerSeatId: string, camp: CampState, objective: Objective, rules: RunRules): ExpeditionObjectiveView {
  const status = rules.objectiveStatus(camp, objective);
  if (rules.hides(state, viewerSeatId, { kind: "objective", objectiveId: objective.id })) {
    return { id: objective.id, kind: "hidden", ownerSeatId: objective.ownerSeatId, status };
  }
  if (objective.kind === "win-card") {
    return {
      id: objective.id,
      kind: "win-card",
      target: toIdentityView(objective.target),
      ownerSeatId: objective.ownerSeatId,
      status,
    };
  }
  if (objective.kind === "ordered") {
    return {
      id: objective.id,
      kind: "ordered",
      target: toStandardIdentityView(objective.target),
      order: objective.order,
      ownerSeatId: objective.ownerSeatId,
      status,
    };
  }
  if (objective.kind === "no-tricks") {
    return { id: objective.id, kind: "no-tricks", ownerSeatId: objective.ownerSeatId, status };
  }
  return { id: objective.id, kind: "exactly-n", n: objective.n, ownerSeatId: objective.ownerSeatId, status };
}

/** The composed rank when it differs from the printed one, else null. */
function effectiveRank(card: ExpeditionCard, rules: RunRules): number | null {
  const composed = rules.rankOf(card);
  return composed === rankOf(card) ? null : composed;
}

/** What the composed identityOf reads the card as, when that differs from
 * the printed identity, else null. */
function countsAs(card: ExpeditionCard, rules: RunRules): ExpeditionCardIdentityView | null {
  const identity = rules.identityOf(card);
  return identitiesEqual(identity, card.identity) ? null : toIdentityView(identity);
}

function toRankedCardView(card: ExpeditionCard, rules: RunRules): ExpeditionRankedCardView {
  return { id: card.id, identity: toIdentityView(card.identity), effectiveRank: effectiveRank(card, rules), countsAs: countsAs(card, rules) };
}

/** Whether the viewer may not see the play at `position` of the current trick. */
function playHidden(state: RunState, viewerSeatId: string, trick: CampState["currentTrick"], position: number, rules: RunRules): boolean {
  return rules.hides(state, viewerSeatId, { kind: "play", trickIndex: trick.index, position, seatId: trick.plays[position]!.seatId });
}

/** A face-down play shows only the suit it follows as. */
function toTrickPlayView(play: { seatId: string; card: ExpeditionCard }, hidden: boolean, rules: RunRules): ExpeditionTrickPlayView {
  if (hidden) {
    const identity = rules.identityOf(play.card);
    return { seatId: play.seatId, hidden: true, suit: identity.kind === "joker" ? "joker" : identity.suit };
  }
  return { seatId: play.seatId, hidden: false, card: toCardView(play.card), effectiveRank: effectiveRank(play.card, rules), countsAs: countsAs(play.card, rules) };
}

function toCompletedPlayView(play: ResolvedPlay, rules: RunRules): ExpeditionCompletedPlayView {
  return {
    seatId: play.seatId,
    card: toCardView(play.card),
    effectiveRank: effectiveRank(play.card, rules),
    countsAs: play.countsAs === null ? null : toIdentityView(play.countsAs),
    burned: play.burned,
  };
}

function toCompletedTrickView(trick: CampState["completedTricks"][number], rules: RunRules): ExpeditionCompletedTrickView {
  return {
    index: trick.index,
    leaderSeatId: trick.leaderSeatId,
    plays: trick.plays.map((play) => toCompletedPlayView(play, rules)),
    winnerSeatId: trick.winnerSeatId,
  };
}

function toCurrentTrickView(state: RunState, viewerSeatId: string, trick: CampState["currentTrick"], rules: RunRules): ExpeditionCurrentTrickView {
  return {
    index: trick.index,
    leaderSeatId: trick.leaderSeatId,
    plays: trick.plays.map((play, position) => toTrickPlayView(play, playHidden(state, viewerSeatId, trick, position, rules), rules)),
  };
}

/** Looks up a card's identity by id across a camp's hands, completed
 * tricks, the in-progress trick and the discards. Returns null (never throws) when the
 * card cannot be found — a reveal whose card cannot be located is skipped
 * by the caller (fail closed), never thrown. */
function findCardIdentity(camp: CampState, cardId: string): CardIdentity | null {
  for (const hand of camp.hands) {
    const card = hand.cards.find((c) => c.id === cardId);
    if (card !== undefined) return card.identity;
  }
  for (const trick of camp.completedTricks) {
    const play = trick.plays.find((p) => p.card.id === cardId);
    if (play !== undefined) return play.card.identity;
  }
  const currentPlay = camp.currentTrick.plays.find((p) => p.card.id === cardId);
  if (currentPlay !== undefined) return currentPlay.card.identity;
  return camp.discards.find((d) => d.card.id === cardId)?.card.identity ?? null;
}

/** A reveal is for its audience, and a whisper is also for the seat that
 * whispered it: you named the card, so you may see what you sent. */
export function isRevealVisibleTo(reveal: Reveal, seatId: string): boolean {
  return reveal.audience.includes(seatId) || (reveal.source === "whisper" && reveal.fromSeatId === seatId);
}

function toRevealView(camp: CampState, reveal: Reveal): ExpeditionRevealView | null {
  const identity = findCardIdentity(camp, reveal.cardId);
  if (identity === null) return null;
  return {
    cardId: reveal.cardId,
    fromSeatId: reveal.fromSeatId,
    source: reveal.source,
    identity: toIdentityView(identity),
    toSeatId: reveal.targetSeatId ?? null,
  };
}

function toLogEntryView(entry: LogEntry): ExpeditionLogEntryView {
  return {
    event: entry.event,
    actorSeatId: entry.actorSeatId,
    subjectSeatIds: Array.from(entry.subjectSeatIds),
    sourceId: entry.sourceId,
    private: entry.audience !== "public",
  };
}

function logVisibleTo(entry: LogEntry, seatId: string | null): boolean {
  if (entry.audience === "public") return true;
  return seatId !== null && entry.audience.includes(seatId);
}

function toOriginView(origin: ActiveEffect["origin"]): ExpeditionEffectOriginView {
  return origin.kind === "seat" ? { kind: "seat", seatId: origin.seatId, sourceId: origin.sourceId } : { kind: "mod", modId: origin.modId, strength: origin.strength };
}

/** An effect's params are for its audience, and never name a card the
 * viewer sees face down. */
function toEffectView(effect: ActiveEffect, viewerSeatId: string | null, faceDownIds: ReadonlySet<string>): ExpeditionEffectView {
  const shown =
    (effect.audience === "public" || (effect.origin.kind === "seat" && effect.origin.seatId === viewerSeatId)) &&
    !Object.values(effect.params).some((value) => typeof value === "string" && faceDownIds.has(value));
  return {
    origin: toOriginView(effect.origin),
    atTrick: effect.atTrick,
    lasts: effect.lasts,
    params: shown ? Object.fromEntries(Object.entries(effect.params)) : null,
  };
}

function toRemainingView(left: Remaining): ExpeditionRemainingView {
  switch (left.kind) {
    case "uses":
      return { kind: "uses", left: left.left, of: left.of };
    case "supplies":
      return { kind: "supplies", cost: left.cost };
    case "crew":
      return { kind: "crew", left: left.left, earned: left.earned };
    case "coins":
      return { kind: "coins", cost: left.cost };
    case "unlimited":
      return { kind: "unlimited" };
    case "whispers":
      return { kind: "whispers", left: left.left };
  }
}

function toItemView(state: RunState, seat: SeatRun, item: ItemInstance, catalog: Catalog): ExpeditionItemView {
  const active = activeOfKey(seat, item.uid, catalog);
  return { uid: item.uid, itemId: item.itemId, remaining: active === undefined ? null : toRemainingView(remaining(state, seat.seatId, item.uid, catalog)) };
}

/** Under Heavy fog another seat's items show only once used this attempt;
 * its character and upgrade stay public. */
function toSeatView(state: RunState, seat: SeatRun, viewerSeatId: string, rules: RunRules, catalog: Catalog): ExpeditionSeatView {
  const concealed = rules.hides(state, viewerSeatId, { kind: "loadout", seatId: seat.seatId });
  const shown = (key: string): boolean => !concealed || itemOf(seat, key) === undefined || usedThisAttempt(state, seat, key);
  return {
    seatId: seat.seatId,
    characterId: seat.characterId,
    upgradeId: seat.upgradeId,
    items: {
      equipped: seat.equipped.filter(shown).map((uid) => toItemView(state, seat, itemOf(seat, uid)!, catalog)),
      backpack: concealed ? null : backpackOf(seat).map((item) => toItemView(state, seat, item, catalog)),
      concealed,
    },
    usage: abilityKeys(state, seat, catalog)
      .filter((key) => abilityOf(state, seat, key, catalog) !== undefined && shown(key))
      .map((sourceKey) => ({ sourceKey, remaining: toRemainingView(remaining(state, seat.seatId, sourceKey, catalog)) })),
  };
}

function toAbilityViews(state: RunState, seat: SeatRun, catalog: Catalog): ExpeditionAbilityView[] {
  return abilityKeys(state, seat, catalog).flatMap((sourceKey) => {
    const status = abilityStatus(state, seat.seatId, sourceKey, catalog);
    if (status === null) return [];
    return [
      status.usable
        ? {
            sourceKey,
            usableNow: true,
            reason: null,
            steps: status.steps.map((step) => ({ kind: step.kind, prompt: step.prompt, choices: Array.from(step.choices) })),
          }
        : { sourceKey, usableNow: false, reason: status.reason, steps: [] },
    ];
  });
}

function toStockView(entry: StockEntry, price: number): ExpeditionStockView {
  const what = entry.what;
  return {
    stockId: entry.stockId,
    what: what.kind === "supplies" ? { kind: "supplies" } : { kind: "item", itemId: what.itemId },
    price,
    soldTo: entry.soldTo,
  };
}

/** Prices are what the viewer would pay (the composed shopPrice). */
function toShopView(state: RunState, stock: readonly StockEntry[] | null, ownSeat: SeatRun | undefined, catalog: Catalog): ExpeditionShopView | null {
  if (stock === null) return null;
  const price = (listed: number): number => (ownSeat === undefined ? listed : priceFor(state, ownSeat.seatId, listed, catalog));
  return {
    stock: stock.map((entry) => toStockView(entry, price(entry.price))),
    yourUpgrades: ownSeat === undefined ? [] : upgradeOffers(ownSeat, catalog).map((o) => ({ stockId: o.stockId, upgradeId: o.upgradeId, price: price(o.price) })),
  };
}

function toCampResultView(result: RunState["history"][number]): ExpeditionCampResultView {
  return { camp: result.camp, attempt: result.attempt, status: result.status, coins: result.coins };
}

function toSurveyedObjectiveView(objective: Objective): ExpeditionSurveyedObjectiveView {
  switch (objective.kind) {
    case "win-card":
      return { kind: "win-card", target: toIdentityView(objective.target) };
    case "ordered":
      return { kind: "ordered", target: toIdentityView(objective.target), order: objective.order };
    case "no-tricks":
      return { kind: "no-tricks" };
    case "exactly-n":
      return { kind: "exactly-n", n: objective.n };
  }
}

/** Each previewed camp's coming objectives, by spec, for a seat that surveys. */
function surveysFor(state: RunState, seatId: string, rules: RunRules, catalog: Catalog): ReadonlyMap<CampSpec, ExpeditionSurveyedObjectiveView[]> {
  const surveyed = new Map<CampSpec, ExpeditionSurveyedObjectiveView[]>();
  if (!state.seatIds.includes(seatId) || !rules.surveys(state, seatId)) return surveyed;
  for (const camp of surveyedCamps(state)) {
    const dealt = surveyDeal(camp, catalog);
    const dealtRules = rulesFor(dealt, catalog);
    const views = dealt.stage.attempt.camp.objectives.map((objective): ExpeditionSurveyedObjectiveView =>
      dealtRules.hides(dealt, seatId, { kind: "objective", objectiveId: objective.id }) ? { kind: "hidden" } : toSurveyedObjectiveView(objective),
    );
    surveyed.set(camp.spec, views);
  }
  return surveyed;
}

/** `swap` is a route option's boss swap, shown when it lands on this camp. */
function toPreviewView(state: RunState, spec: CampSpec, catalog: Catalog, survey: ExpeditionSurveyedObjectiveView[] | null, swap: RouteOption["swapBoss"] = null): ExpeditionCampPreviewView {
  const planned = state.plan === null ? null : bossAt(state.plan, spec.index);
  const boss = planned !== null && swap !== null && swap.at === spec.index ? { ...planned, modId: swap.modId } : planned;
  return {
    index: spec.index,
    location: spec.location,
    weather: spec.weather,
    pairing: pairingOf(spec, catalog),
    event: spec.event,
    slotKinds: Array.from(slotKindsFor(state, spec, catalog)),
    bossId: boss === null ? null : visibleBossId(state, boss),
    shop: boss !== null,
    survey,
  };
}

function toStatusPartView(part: StatusPart): ExpeditionStatusPartView {
  switch (part.kind) {
    case "chance":
      return { kind: "chance", percent: part.percent, strikesLeft: part.strikesLeft };
    case "strike":
      return { kind: "strike" };
    case "meter":
      return { kind: "meter", left: part.left, of: part.of };
    case "washes":
      return { kind: "washes", left: part.left, of: part.of };
    case "facing":
      return { kind: "facing", seatId: part.seatId };
    case "dam":
      return { kind: "dam", suit: part.suit };
    case "streak":
      return { kind: "streak", seatId: part.seatId, count: part.count };
    case "bitten":
      return { kind: "bitten", seatId: part.seatId, tricksLeft: part.tricksLeft };
    case "countdown":
      return { kind: "countdown", tricks: part.tricks };
    case "alternating":
      return { kind: "alternating", activeNow: part.activeNow };
    case "swarm":
      return { kind: "swarm", seatId: part.seatId };
    case "path":
      return { kind: "path", plates: [...part.plates], pressed: part.pressed };
  }
}

function toModView(state: RunState, spec: CampSpec, layer: StackLayer, catalog: Catalog): ExpeditionModView {
  const status = layer.body.status === undefined ? [] : layer.body.status(modCtx(state, spec, layer, catalog));
  return { id: layer.def.id, kind: layer.def.kind, strength: layer.strength, status: status.map(toStatusPartView) };
}

/** Seats whose loadout is kept from this viewer (Heavy fog). */
function foggedSeatIds(state: RunState, seatId: string, rules: RunRules): readonly string[] {
  return state.seatIds.filter((other) => rules.hides(state, seatId, { kind: "loadout", seatId: other }));
}

/** Under fog the swarm's next meal would say who still carries items, so it
 * is left out. */
function toModViews(state: RunState, seatId: string, rules: RunRules, catalog: Catalog): ExpeditionModView[] {
  const spec = specOf(state);
  if (spec === null) return [];
  const fogged = foggedSeatIds(state, seatId, rules).length > 0;
  return campStack(state, catalog).map((layer) => {
    const view = toModView(state, spec, layer, catalog);
    return fogged ? { ...view, status: view.status.filter((part) => part.kind !== "swarm") } : view;
  });
}

function toBallotViews(state: RunState, ballots: PerSeat<string | null>): ExpeditionBallotView[] {
  return state.seatIds.filter((seatId) => Object.hasOwn(ballots, seatId)).map((seatId) => ({ seatId, choice: ballots[seatId] ?? null }));
}

function readySeatIds(state: RunState, ready: PerSeat<true>): string[] {
  return state.seatIds.filter((seatId) => Object.hasOwn(ready, seatId));
}

function toAttemptView(state: RunState, rawAttempt: AttemptState, seatId: string, seated: boolean, rules: RunRules, catalog: Catalog): ExpeditionAttemptView {
  const yourSeatId = seated ? seatId : null;
  const window = currentWindow(state, rules);
  const campState = rawAttempt.camp;
  const reveals: ExpeditionRevealView[] = [];
  if (seated) {
    for (const reveal of rawAttempt.reveals) {
      if (!isRevealVisibleTo(reveal, seatId)) continue;
      const revealView = toRevealView(campState, reveal);
      if (revealView !== null) reveals.push(revealView);
    }
  }

  const log: ExpeditionLogEntryView[] = rawAttempt.log.filter((entry) => logVisibleTo(entry, yourSeatId)).map(toLogEntryView);
  const trick = campState.currentTrick;
  const faceDownIds = new Set(trick.plays.filter((_, position) => playHidden(state, seatId, trick, position, rules)).map((play) => play.card.id));

  const rescue: ExpeditionAttemptView["rescue"] =
    window === "rescue"
      ? { failedObjectiveIds: campState.objectives.filter((o) => rules.objectiveStatus(campState, o) === "failed").map((o) => o.id) }
      : null;

  const yourHandRaw = seated ? campState.hands.find((h) => h.seatId === seatId) : undefined;
  const yourHand: ExpeditionRankedCardView[] = yourHandRaw !== undefined ? yourHandRaw.cards.map((card) => toRankedCardView(card, rules)) : [];

  const handSizes: ExpeditionHandSizeView[] = campState.hands.map((hand) => ({ seatId: hand.seatId, size: hand.cards.length }));

  const derivedCampPhase = campPhase(campState, rules);
  const derivedCurrentActorSeatId = currentActorSeatId(campState, rules);

  const yourLegalCardIds: string[] =
    seated && derivedCampPhase === "playing" && derivedCurrentActorSeatId === seatId
      ? rules
          .legalPlays(campState, seatId)
          .map((c) => c.id)
          .filter((id) => yourHand.some((c) => c.id === id))
      : [];

  const camp: ExpeditionCampView = {
    playerCount: campState.playerCount,
    expeditionLeaderSeatId: campState.expeditionLeaderSeatId,
    totalTricks: campState.totalTricks,
    removedCards: campState.removedCards.map(toIdentityView),
    objectives: campState.objectives.map((o) => toObjectiveView(state, seatId, campState, o, rules)),
    goals: campGoals(campState, rules).map((g) => ({ id: g.id, status: g.status })),
    discards: campState.discards.map((d) => ({ card: toCardView(d.card), afterTrick: d.afterTrick })),
    voidedTricks: campState.voidedTricks.map((t) => ({ index: t.index, leaderSeatId: t.leaderSeatId, plays: t.plays.map((p) => ({ seatId: p.seatId, card: toCardView(p.card) })) })),
    yourHand,
    yourLegalCardIds,
    handSizes,
    completedTricks: campState.completedTricks.map((trick) => toCompletedTrickView(trick, rules)),
    currentTrick: toCurrentTrickView(state, seatId, trick, rules),
    campPhase: derivedCampPhase,
    currentActorSeatId: derivedCurrentActorSeatId,
  };

  return {
    attemptNumber: rawAttempt.attemptNumber,
    window,
    // Under fog, a teammate waited on in rescue would be one holding a rescue item.
    pendingSeatIds: gatedPendingSeatIds(state, catalog).filter((pending) => !foggedSeatIds(state, seatId, rules).includes(pending)),
    rescue,
    effects: rawAttempt.effects.map((effect) => toEffectView(effect, yourSeatId, faceDownIds)),
    reveals,
    log,
    camp,
    yourWhisper: seated
      ? {
          allowed: rules.whisperAllowed(state, seatId),
          left: Math.max(0, rules.whispersPerCamp(state, seatId) - whispersUsedBy(state, seatId)),
        }
      : null,
  };
}

function toStageView(state: RunState, seatId: string, ownSeat: SeatRun | undefined, rules: RunRules, catalog: Catalog): ExpeditionStageView {
  const stage = state.stage;
  const surveys = surveysFor(state, seatId, rules, catalog);
  const surveyOf = (spec: CampSpec): ExpeditionSurveyedObjectiveView[] | null => surveys.get(spec) ?? null;
  switch (stage.tag) {
    case "muster":
      return { tag: "muster", ballots: toBallotViews(state, stage.ballots) };
    case "loadout":
      return {
        tag: "loadout",
        camp: toPreviewView(state, stage.camp, catalog, surveyOf(stage.camp)),
        mods: toModViews(state, seatId, rules, catalog),
        yourSlots: ownSeat === undefined ? 0 : rules.itemSlots(state, seatId),
        shop: toShopView(state, stage.stock, ownSeat, catalog),
        readySeatIds: readySeatIds(state, stage.ready),
      };
    case "camp":
      return {
        tag: "camp",
        camp: toPreviewView(state, stage.camp, catalog, null),
        mods: toModViews(state, seatId, rules, catalog),
        attempt: toAttemptView(state, stage.attempt, seatId, ownSeat !== undefined, rules, catalog),
      };
    case "draft":
      return {
        tag: "draft",
        cleared: stage.cleared,
        payout: stage.payout,
        yourOffer: ownSeat?.offers[0] === undefined ? null : { kind: ownSeat.offers[0].kind, bundles: ownSeat.offers[0].bundles.map((bundle) => Array.from(bundle)) },
        pendingSeatIds: state.seats.filter((seat) => seat.offers.length > 0).map((seat) => seat.seatId),
      };
    case "route":
      return {
        tag: "route",
        options: stage.options.map((option) => ({ id: option.id, next: toPreviewView(state, option.next, catalog, surveyOf(option.next), option.swapBoss), swapsBoss: option.swapBoss !== null })),
        ballots: toBallotViews(state, stage.ballots),
      };
    case "event":
      return {
        tag: "event",
        event: stage.route.next.event ?? "",
        next: toPreviewView(state, stage.route.next, catalog, surveyOf(stage.route.next)),
        readySeatIds: readySeatIds(state, stage.ready),
      };
    case "ended":
      return { tag: "ended", result: stage.result };
  }
}

/** Projects `state` for exactly one seat (or an unseated/unknown viewer,
 * fail-closed). Pure: calling this twice for the same (state, seatId,
 * catalog) returns deep-equal views and never returns `state` itself or any
 * of its nested arrays by reference. */
export function toExpeditionPlayerView(state: RunState, seatId: string, catalog: Catalog): ExpeditionView {
  const rules = rulesFor(state, catalog);
  const ownSeat = state.seats.find((s) => s.seatId === seatId);
  const plan = state.plan;
  const lastVote = state.lastVote;

  return {
    yourSeatId: ownSeat !== undefined ? seatId : null,
    runStatus: runStatus(state),
    length: plan === null ? null : plan.length,
    campCount: plan === null ? null : campCount(plan),
    purse: state.purse,
    supplies: { count: state.supplies, max: SUPPLIES_MAX },
    plan: plan === null ? [] : plan.bosses.map((boss) => ({ at: boss.at, tier: boss.tier, bossId: visibleBossId(state, boss) })),
    seats: state.seats.map((seat) => toSeatView(state, seat, seatId, rules, catalog)),
    yourAbilities: ownSeat !== undefined ? toAbilityViews(state, ownSeat, catalog) : [],
    history: state.history.map(toCampResultView),
    lastVote:
      lastVote === null
        ? null
        : {
            topic: lastVote.topic,
            tally: lastVote.result.tally.map((entry) => ({ choice: entry.choice, votes: entry.votes })),
            tied: lastVote.result.tied === null ? null : Array.from(lastVote.result.tied),
            winner: lastVote.result.winner,
          },
    stage: toStageView(state, seatId, ownSeat, rules, catalog),
  };
}
