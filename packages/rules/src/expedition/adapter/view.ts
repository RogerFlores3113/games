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
//   2. Viewer-scoped top-level fields (own draft offer, owned gear,
//      capacity, gear availability) are computed once, defaulting to the
//      least-privileged value when the seat is not found.
//   3. `attempt`/`camp` construction reads `rules` (computed ONCE at the
//      top via `rulesFor`) and gates every reveal/log/objective by audience
//      or ownership before ever building its literal.

import { campPhase, currentActorSeatId } from "../camp";
import { evaluateObjective } from "../objectives";
import { activeBossId, rulesFor } from "../run/compose";
import { runPhase, runStatus, preDealPendingSeatIds } from "../run/lifecycle";
import { whispersUsedBy } from "../run/whisper";
import { gearAvailability, currentWindow, isGearSpent } from "../run/toolkit";
import { visibleObjectives } from "../run/visibility";
import type { Catalog, LogEntry, Reveal, RunState } from "../run/types";
import type { CampState, CardIdentity, ExpeditionCard, Objective, StandardIdentity } from "../state";
import type {
  ExpeditionAttemptView,
  ExpeditionCampResultView,
  ExpeditionCampView,
  ExpeditionCardIdentityView,
  ExpeditionCardView,
  ExpeditionCompletedTrickView,
  ExpeditionCurrentTrickView,
  ExpeditionEffectView,
  ExpeditionGearStatusView,
  ExpeditionGearUseView,
  ExpeditionHandSizeView,
  ExpeditionLogEntryView,
  ExpeditionObjectiveView,
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

function toObjectiveView(camp: CampState, objective: Objective): ExpeditionObjectiveView {
  const status = evaluateObjective(camp, objective);
  if (objective.kind === "win-card") {
    return {
      id: objective.id,
      kind: "win-card",
      target: toStandardIdentityView(objective.target),
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

function toTrickPlayView(play: { seatId: string; card: ExpeditionCard }): ExpeditionTrickPlayView {
  return { seatId: play.seatId, card: toCardView(play.card) };
}

function toCompletedTrickView(trick: CampState["completedTricks"][number]): ExpeditionCompletedTrickView {
  return {
    index: trick.index,
    leaderSeatId: trick.leaderSeatId,
    plays: trick.plays.map(toTrickPlayView),
    winnerSeatId: trick.winnerSeatId,
  };
}

function toCurrentTrickView(trick: CampState["currentTrick"]): ExpeditionCurrentTrickView {
  return { index: trick.index, leaderSeatId: trick.leaderSeatId, plays: trick.plays.map(toTrickPlayView) };
}

/** Looks up a card's identity by id across a camp's hands, completed
 * tricks, and the in-progress trick. Returns null (never throws) when the
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
  return null;
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
    gearId: entry.gearId,
    private: entry.audience !== "public",
  };
}

function logVisibleTo(entry: LogEntry, seatId: string | null): boolean {
  if (entry.audience === "public") return true;
  return seatId !== null && entry.audience.includes(seatId);
}

function toGearUseView(use: { seatId: string; gearId: string; kind: "used" | "skipped" }): ExpeditionGearUseView {
  return { seatId: use.seatId, gearId: use.gearId, kind: use.kind };
}

function toEffectView(effect: { gearId: string; seatId: string; atTrick: number }): ExpeditionEffectView {
  return { gearId: effect.gearId, seatId: effect.seatId, atTrick: effect.atTrick };
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

  const seats: ExpeditionSeatView[] = state.seats.map((seat) => ({
    seatId: seat.seatId,
    equippedGearIds: Array.from(seat.equippedGearIds),
    ready: state.readySeatIds.includes(seat.seatId),
    draftPending: seat.draftOffer !== null,
  }));

  const history: ExpeditionCampResultView[] = state.history.map(toCampResultView);

  const yourSeatId = seated ? seatId : null;
  const yourOwnedGearIds: string[] = seated ? Array.from(ownSeat.ownedGearIds) : [];
  const yourDraftOffer: string[] | null = seated && ownSeat.draftOffer !== null ? Array.from(ownSeat.draftOffer) : null;
  const yourCapacity: number | null = seated ? rules.capacity(state, seatId) : null;
  // The same hook with this seat's loadout emptied, so no passive (Energy
  // Tonic) contributes: lets the client tell when unpacking would over-fill.
  const yourBaseCapacity: number | null = seated
    ? rulesFor(
        { ...state, seats: state.seats.map((s) => (s.seatId === seatId ? { ...s, equippedGearIds: [] } : s)) },
        catalog,
      ).capacity(state, seatId)
    : null;

  const yourGear: ExpeditionGearStatusView[] = seated
    ? ownSeat.equippedGearIds.map((gearId) => {
        const availability = gearAvailability(state, seatId, gearId, catalog, rules);
        return {
          gearId,
          spent: state.attempt !== null && isGearSpent(state.attempt, seatId, gearId),
          usableNow: availability.ok,
          reason: availability.ok ? null : availability.reason,
        };
      })
    : [];

  let attempt: ExpeditionAttemptView | null = null;
  if (state.attempt !== null) {
    const rawAttempt = state.attempt;
    const rawWindow = currentWindow(state, rules);
    const gearWindow: ExpeditionAttemptView["gearWindow"] = rawWindow === "passive" ? null : rawWindow;

    const reveals: ExpeditionRevealView[] = [];
    if (seated && rawAttempt.camp !== null) {
      const camp = rawAttempt.camp;
      for (const reveal of rawAttempt.reveals) {
        if (!isRevealVisibleTo(reveal, seatId)) continue;
        const revealView = toRevealView(camp, reveal);
        if (revealView !== null) reveals.push(revealView);
      }
    }

    const log: ExpeditionLogEntryView[] = rawAttempt.log
      .filter((entry) => logVisibleTo(entry, seated ? seatId : null))
      .map(toLogEntryView);

    let camp: ExpeditionCampView | null = null;
    if (rawAttempt.camp !== null) {
      const campState = rawAttempt.camp;
      const assignment = rules.objectiveAssignment(state);
      const shownObjectives = visibleObjectives(state, campState, rules, seatId);

      const yourHandRaw = seated ? campState.hands.find((h) => h.seatId === seatId) : undefined;
      const yourHand: ExpeditionCardView[] = yourHandRaw !== undefined ? yourHandRaw.cards.map(toCardView) : [];

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

      camp = {
        playerCount: campState.playerCount,
        expeditionLeaderSeatId: campState.expeditionLeaderSeatId,
        totalTricks: campState.totalTricks,
        removedCards: campState.removedCards.map(toIdentityView),
        objectiveAssignment: assignment,
        objectives: shownObjectives.map((o) => toObjectiveView(campState, o)),
        yourHand,
        yourLegalCardIds,
        handSizes,
        completedTricks: campState.completedTricks.map(toCompletedTrickView),
        currentTrick: toCurrentTrickView(campState.currentTrick),
        campPhase: derivedCampPhase,
        currentActorSeatId: derivedCurrentActorSeatId,
      };
    }

    attempt = {
      attemptNumber: rawAttempt.attemptNumber,
      bossCancelled: rawAttempt.bossCancelled,
      gearWindow,
      preDealPendingSeatIds: preDealPendingSeatIds(state, catalog),
      gearUses: rawAttempt.gearUses.map(toGearUseView),
      effects: rawAttempt.effects.map(toEffectView),
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
    bossTwists: { camp3: state.bossTwists[3], camp6: state.bossTwists[6] },
    activeBossTwistId: activeBossId(state),
    seats,
    yourOwnedGearIds,
    yourDraftOffer,
    yourCapacity,
    yourBaseCapacity,
    yourGear,
    history,
    attempt,
  };
}
