// Phase 11, Plan 01: the canonical ExpeditionView type contract (COMM-03).
// This file contains ONLY `export type` declarations — no runtime code, no
// imports other than `import type`.
//
// (a) This is the canonical per-seat view contract mirrored field-for-field
// by `packages/schema/src/games/expedition.ts` (Plan 11-02); Plan 11-06
// binds the two with compile-time `extends` assertions in
// `apps/worker/src/game-registration.ts`. Do not rename, add, or drop a key
// here without changing both.
//
// (b) Key-by-key, this realizes design-spec section 6.4:
//   - own hand, full identity: `camp.yourHand`
//   - other hands as SIZES only, never identities: `camp.handSizes` (no
//     `cards` key for any other seat, anywhere in this file)
//   - objectives per assignment mode: `camp.objectiveAssignment` +
//     `camp.objectives` (face-down mode already filtered to owned-by-viewer
//     before this type is populated — Plan 11-03's job, not this file's)
//   - audience-filtered reveals and log: `attempt.reveals`, `attempt.log`
//     (never carries an `audience` key — see (c))
//   - public loadouts: `seats[].equippedGearIds`
//   - own draft offer only: `yourDraftOffer` (never any other seat's)
//   - removed cards: `camp.removedCards`
//   - supplies/camp/phase: `supplies`, `campNumber`, `runPhase`, `runStatus`
//
// (c) Deliberately ABSENT keys, at every nesting level in this file: `seed`,
// `objectiveDeck`, any other seat's `draftOffer` or owned gear, `audience`.
// A hidden field is structurally impossible to populate because no type
// here names it — not merely "stripped" at runtime.
//
// (d) `yourGear` carries the viewer's OWN equipped gear availability and
// reason string only (GEAR-06's server-side data). The `reason` field is
// content-authored prose (from `gearAvailability`'s reason strings) and must
// never name a card identity or another seat's private state.
//
// All arrays are PLAIN MUTABLE arrays (T[]), never readonly — matching
// HanabiView's convention (packages/rules/src/hanabi/state.ts) so
// ExpeditionView stays assignable to Plan 11-02's z.infer'd wire type.

import type { StandardRank, Suit } from "../state";

export type ExpeditionCardIdentityView =
  | { kind: "standard"; suit: Suit; rank: StandardRank }
  | { kind: "joker"; joker: "sun" | "moon" };

export type ExpeditionStandardIdentityView = { kind: "standard"; suit: Suit; rank: StandardRank };

export type ExpeditionCardView = { id: string; identity: ExpeditionCardIdentityView };

export type ExpeditionTrickPlayView = { seatId: string; card: ExpeditionCardView };

export type ExpeditionCompletedTrickView = {
  index: number;
  leaderSeatId: string;
  plays: ExpeditionTrickPlayView[];
  winnerSeatId: string;
};

export type ExpeditionCurrentTrickView = {
  index: number;
  leaderSeatId: string;
  plays: ExpeditionTrickPlayView[];
};

export type ExpeditionObjectiveStatusView = "pending" | "done" | "failed";

export type ExpeditionObjectiveView =
  | {
      id: string;
      kind: "win-card";
      target: ExpeditionStandardIdentityView;
      ownerSeatId: string | null;
      status: ExpeditionObjectiveStatusView;
    }
  | {
      id: string;
      kind: "ordered";
      target: ExpeditionStandardIdentityView;
      order: number | "last";
      ownerSeatId: string | null;
      status: ExpeditionObjectiveStatusView;
    }
  | {
      id: string;
      kind: "no-tricks";
      ownerSeatId: string | null;
      status: ExpeditionObjectiveStatusView;
    }
  | {
      id: string;
      kind: "exactly-n";
      n: number;
      ownerSeatId: string | null;
      status: ExpeditionObjectiveStatusView;
    };

export type ExpeditionHandSizeView = { seatId: string; size: number };

// Deliberately no `audience` key: a reveal's audience-gating already
// happened before this literal is ever built (only reveals addressed to the
// viewer are mapped at all).
export type ExpeditionRevealView = {
  cardId: string;
  fromSeatId: string;
  source: string;
  identity: ExpeditionCardIdentityView;
  /** A whisper's named recipient; null for every other source. */
  toSeatId: string | null;
};

// Deliberately no `audience` key: `private` is the only trace of the
// original audience gate, and only entries already addressed to this viewer
// (or public) are ever mapped into this shape.
export type ExpeditionLogEntryView = {
  event: string;
  actorSeatId: string;
  subjectSeatIds: string[];
  gearId: string | null;
  private: boolean;
};

export type ExpeditionGearUseView = { seatId: string; gearId: string; kind: "used" | "skipped" };

export type ExpeditionEffectView = { gearId: string; seatId: string; atTrick: number };

export type ExpeditionCampView = {
  playerCount: 3 | 4 | 5;
  expeditionLeaderSeatId: string;
  totalTricks: number;
  removedCards: ExpeditionCardIdentityView[];
  objectiveAssignment: "face-up" | "face-down";
  // Deliberately no `objectiveDeck` key: the undrawn objective deck order
  // must never be projected.
  objectives: ExpeditionObjectiveView[];
  yourHand: ExpeditionCardView[];
  yourLegalCardIds: string[];
  handSizes: ExpeditionHandSizeView[];
  completedTricks: ExpeditionCompletedTrickView[];
  currentTrick: ExpeditionCurrentTrickView;
  campPhase: "objective-pick" | "playing" | "ended";
  currentActorSeatId: string | null;
};

export type ExpeditionAttemptView = {
  attemptNumber: number;
  bossCancelled: boolean;
  gearWindow: "pre-deal" | "objective-pick" | "between-tricks" | null;
  preDealPendingSeatIds: string[];
  gearUses: ExpeditionGearUseView[];
  effects: ExpeditionEffectView[];
  reveals: ExpeditionRevealView[];
  log: ExpeditionLogEntryView[];
  camp: ExpeditionCampView | null;
  /** The viewer's own Whisper allowance this camp; null when unseated. */
  yourWhisper: { allowed: boolean; left: number } | null;
};

// Deliberately no `draftOffer`/`ownedGearIds` keys for any OTHER seat: only
// the public loadout (`equippedGearIds`) and a boolean draft-pending flag
// are ever visible about a seat that is not the viewer.
export type ExpeditionSeatView = { seatId: string; equippedGearIds: string[]; ready: boolean; draftPending: boolean };

export type ExpeditionGearStatusView = { gearId: string; spent: boolean; usableNow: boolean; reason: string | null };

export type ExpeditionCampResultView = { campNumber: number; attemptNumber: number; status: "succeeded" | "failed"; suppliesSpent: number };

// Deliberately no `seed` key anywhere in this type: the run's RNG root must
// never be projected to any client (T-11-03).
export type ExpeditionView = {
  yourSeatId: string | null;
  runPhase: "fireside" | "pre-deal" | "camp" | "ended";
  runStatus: "in_progress" | "won" | "lost";
  campNumber: number;
  supplies: number;
  bossTwists: { camp3: string | null; camp6: string | null };
  activeBossTwistId: string | null;
  seats: ExpeditionSeatView[];
  yourOwnedGearIds: string[];
  yourDraftOffer: string[] | null;
  yourCapacity: number | null;
  /** Capacity with no passive gear equipped. */
  yourBaseCapacity: number | null;
  yourGear: ExpeditionGearStatusView[];
  history: ExpeditionCampResultView[];
  attempt: ExpeditionAttemptView | null;
};
