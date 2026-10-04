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

import { campPhase, currentActorSeatId } from "../camp";
import { identitiesEqual } from "../deck";
import { rulesFor } from "../run/compose";
import { runStatus } from "../run/lifecycle";
import { SUPPLIES_MAX } from "../run/balance";
import { bossAt, campCount } from "../run/plan";
import { slotKindsFor, type CampSpec } from "../run/route";
import { whispersUsedBy } from "../run/whisper";
import { abilityStatus } from "../run/abilities";
import { liveSourceIds, poolBalance, remaining, type Remaining } from "../run/usage";
import { currentWindow, gatedPendingSeatIds } from "../run/windows";
import type { RunRules } from "../run/run-rules";
import type { ActiveEffect, AttemptState, Catalog, LogEntry, PerSeat, Reveal, RunState, SeatRun } from "../run/types";
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
  ExpeditionEffectView,
  ExpeditionHandSizeView,
  ExpeditionLogEntryView,
  ExpeditionObjectiveView,
  ExpeditionRankedCardView,
  ExpeditionRemainingView,
  ExpeditionRevealView,
  ExpeditionSeatView,
  ExpeditionStageView,
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

function toObjectiveView(camp: CampState, objective: Objective, rules: RunRules): ExpeditionObjectiveView {
  const status = rules.objectiveStatus(camp, objective);
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

function toTrickPlayView(play: { seatId: string; card: ExpeditionCard }, rules: RunRules): ExpeditionTrickPlayView {
  return { seatId: play.seatId, card: toCardView(play.card), effectiveRank: effectiveRank(play.card, rules) };
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

function toCurrentTrickView(trick: CampState["currentTrick"], rules: RunRules): ExpeditionCurrentTrickView {
  return { index: trick.index, leaderSeatId: trick.leaderSeatId, plays: trick.plays.map((play) => toTrickPlayView(play, rules)) };
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

function toEffectView(effect: ActiveEffect, viewerSeatId: string | null): ExpeditionEffectView {
  const shown = effect.audience === "public" || effect.seatId === viewerSeatId;
  return {
    sourceId: effect.sourceId,
    seatId: effect.seatId,
    atTrick: effect.atTrick,
    lasts: effect.lasts,
    params: shown ? Object.fromEntries(Object.entries(effect.params)) : null,
  };
}

function toRemainingView(left: Remaining): ExpeditionRemainingView {
  switch (left.kind) {
    case "uses":
      return { kind: "uses", left: left.left, of: left.of };
    case "single-use":
      return { kind: "single-use" };
    case "pool":
      return { kind: "pool", balance: left.balance, max: left.max, cost: left.cost };
    case "supplies":
      return { kind: "supplies", cost: left.cost };
  }
}

function toSeatView(state: RunState, seat: SeatRun, catalog: Catalog): ExpeditionSeatView {
  const balance = poolBalance(seat, catalog);
  const pool = seat.characterId === null ? undefined : catalog.characters[seat.characterId]?.pool;
  return {
    seatId: seat.seatId,
    characterId: seat.characterId,
    kit: Array.from(seat.kit),
    pool: balance !== null && pool !== undefined ? { balance, max: pool.max } : null,
    usage: liveSourceIds(seat)
      .filter((sourceId) => catalog.sources[sourceId]?.active !== undefined)
      .map((sourceId) => ({ sourceId, remaining: toRemainingView(remaining(state, seat.seatId, sourceId, catalog)) })),
  };
}

function toAbilityViews(state: RunState, seat: SeatRun, catalog: Catalog): ExpeditionAbilityView[] {
  return liveSourceIds(seat).flatMap((sourceId) => {
    const status = abilityStatus(state, seat.seatId, sourceId, catalog);
    if (status === null) return [];
    return [
      status.usable
        ? {
            sourceId,
            usableNow: true,
            reason: null,
            steps: status.steps.map((step) => ({ kind: step.kind, prompt: step.prompt, choices: Array.from(step.choices) })),
          }
        : { sourceId, usableNow: false, reason: status.reason, steps: [] },
    ];
  });
}

function toCampResultView(result: RunState["history"][number]): ExpeditionCampResultView {
  return { camp: result.camp, attempt: result.attempt, status: result.status, coins: result.coins };
}

function toPreviewView(state: RunState, spec: CampSpec): ExpeditionCampPreviewView {
  const boss = state.plan === null ? null : bossAt(state.plan, spec.index);
  return {
    index: spec.index,
    location: spec.location,
    weather: spec.weather,
    event: spec.event,
    slotKinds: Array.from(slotKindsFor(spec)),
    bossId: boss === null ? null : boss.modId,
  };
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
    objectives: campState.objectives.map((o) => toObjectiveView(campState, o, rules)),
    goals: rules.goals(campState).map((g) => ({ id: g.id, status: g.status })),
    discards: campState.discards.map((d) => ({ card: toCardView(d.card), afterTrick: d.afterTrick })),
    yourHand,
    yourLegalCardIds,
    handSizes,
    completedTricks: campState.completedTricks.map((trick) => toCompletedTrickView(trick, rules)),
    currentTrick: toCurrentTrickView(campState.currentTrick, rules),
    campPhase: derivedCampPhase,
    currentActorSeatId: derivedCurrentActorSeatId,
  };

  return {
    attemptNumber: rawAttempt.attemptNumber,
    window,
    pendingSeatIds: Array.from(gatedPendingSeatIds(state, catalog)),
    rescue,
    effects: rawAttempt.effects.map((effect) => toEffectView(effect, yourSeatId)),
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
  switch (stage.tag) {
    case "muster":
      return { tag: "muster", ballots: toBallotViews(state, stage.ballots) };
    case "loadout":
      return { tag: "loadout", camp: toPreviewView(state, stage.camp), readySeatIds: readySeatIds(state, stage.ready) };
    case "camp":
      return { tag: "camp", camp: toPreviewView(state, stage.camp), attempt: toAttemptView(state, stage.attempt, seatId, ownSeat !== undefined, rules, catalog) };
    case "draft":
      return {
        tag: "draft",
        cleared: stage.cleared,
        payout: stage.payout,
        yourOffer: ownSeat !== undefined && ownSeat.draftOffer !== null ? Array.from(ownSeat.draftOffer) : null,
        pendingSeatIds: state.seats.filter((seat) => seat.draftOffer !== null).map((seat) => seat.seatId),
      };
    case "route":
      return {
        tag: "route",
        options: stage.options.map((option) => ({ id: option.id, next: toPreviewView(state, option.next) })),
        ballots: toBallotViews(state, stage.ballots),
      };
    case "event":
      return {
        tag: "event",
        event: stage.route.next.event ?? "",
        next: toPreviewView(state, stage.route.next),
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
    plan: plan === null ? [] : plan.bosses.map((boss) => ({ at: boss.at, tier: boss.tier, bossId: boss.modId })),
    seats: state.seats.map((seat) => toSeatView(state, seat, catalog)),
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
