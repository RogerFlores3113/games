// D-07-style per-seat whitelist projection for Expedition (Phase 11, Plan
// 01, COMM-03) — mirrors hanabi/projection.ts's discipline near-verbatim.
// The spread operator in object literals, `delete`, `Object.assign`, any
// omit helper, and assigning a hidden identity through a shared reference
// are all FORBIDDEN in this file. Every returned object is built
// field-by-field from named values, so a viewer's own hand structurally
// cannot leak another seat's card, `seed`, `objectiveDeck`, another seat's
// `draftOffer`, or a reveal/log entry not addressed to it — not because it
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
//   2. Viewer-scoped top-level fields (own draft offer, own abilities with
//      their step choices) are computed once, defaulting to the
//      least-privileged value when the seat is not found.
//   3. `attempt`/`camp` construction reads `rules` (computed ONCE at the
//      top via `rulesFor`) and gates every reveal/log/objective by audience
//      or ownership before ever building its literal.

import { campPhase, currentActorSeatId } from "../camp";
import { identitiesEqual } from "../deck";
import { rulesFor } from "../run/compose";
import { runPhase, runStatus } from "../run/lifecycle";
import { whispersUsedBy } from "../run/whisper";
import { abilityStatus } from "../run/abilities";
import { liveSourceIds, poolBalance, remaining, type Remaining } from "../run/usage";
import { currentWindow, gatedPendingSeatIds } from "../run/windows";
import type { RunRules } from "../run/run-rules";
import type { ActiveEffect, Catalog, LogEntry, Reveal, RunState, SeatRun } from "../run/types";
import { rankOf } from "../trick";
import type { CampState, CardIdentity, ExpeditionCard, Objective, ResolvedPlay, StandardIdentity } from "../state";
import type {
  ExpeditionAttemptView,
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
    ready: state.readySeatIds.includes(seat.seatId),
    draftPending: seat.draftOffer !== null,
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

function toCampResultView(result: {
  campNumber: number;
  attemptNumber: number;
  status: "succeeded" | "failed";
  suppliesSpent: number;
}): ExpeditionCampResultView {
  return {
    campNumber: result.campNumber,
    attemptNumber: result.attemptNumber,
    status: result.status,
    suppliesSpent: result.suppliesSpent,
  };
}

/** Projects `state` for exactly one seat (or an unseated/unknown viewer,
 * fail-closed). Pure: calling this twice for the same (state, seatId,
 * catalog) returns deep-equal views and never returns `state` itself or any
 * of its nested arrays by reference. */
export function toExpeditionPlayerView(state: RunState, seatId: string, catalog: Catalog): ExpeditionView {
  const rules = rulesFor(state, catalog);
  const ownSeat = state.seats.find((s) => s.seatId === seatId);
  const seated = ownSeat !== undefined;

  const seats: ExpeditionSeatView[] = state.seats.map((seat) => toSeatView(state, seat, catalog));

  const history: ExpeditionCampResultView[] = state.history.map(toCampResultView);

  const yourSeatId = seated ? seatId : null;
  const yourDraftOffer: string[] | null = seated && ownSeat.draftOffer !== null ? Array.from(ownSeat.draftOffer) : null;
  const yourAbilities: ExpeditionAbilityView[] = seated ? toAbilityViews(state, ownSeat, catalog) : [];

  let attempt: ExpeditionAttemptView | null = null;
  if (state.attempt !== null) {
    const rawAttempt = state.attempt;
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

    const log: ExpeditionLogEntryView[] = rawAttempt.log
      .filter((entry) => logVisibleTo(entry, seated ? seatId : null))
      .map(toLogEntryView);

    const rescue: ExpeditionAttemptView["rescue"] =
      window === "rescue"
        ? { failedObjectiveIds: campState.objectives.filter((o) => rules.objectiveStatus(campState, o) === "failed").map((o) => o.id) }
        : null;

    const yourHandRaw = seated ? campState.hands.find((h) => h.seatId === seatId) : undefined;
    const yourHand: ExpeditionRankedCardView[] = yourHandRaw !== undefined ? yourHandRaw.cards.map((card) => toRankedCardView(card, rules)) : [];

    const handSizes: ExpeditionHandSizeView[] = campState.hands.map((hand) => ({
      seatId: hand.seatId,
      size: hand.cards.length,
    }));

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

    attempt = {
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

  return {
    yourSeatId,
    runPhase: runPhase(state),
    runStatus: runStatus(state),
    campNumber: state.campNumber,
    supplies: state.supplies,
    seats,
    yourDraftOffer,
    yourAbilities,
    history,
    attempt,
  };
}
