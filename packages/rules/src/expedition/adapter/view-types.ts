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
//   - every objective, public: `camp.objectives`
//   - audience-filtered reveals and log: `attempt.reveals`, `attempt.log`
//     (never carries an `audience` key — see (c))
//   - public characters, kits, pools and usage: `seats[]`
//   - own draft offer only: `yourDraftOffer` (never any other seat's)
//   - own abilities with server-computed target choices: `yourAbilities`
//   - removed cards: `camp.removedCards`
//   - supplies/camp/phase: `supplies`, `campNumber`, `runPhase`, `runStatus`
//
// (c) Deliberately ABSENT keys, at every nesting level in this file: `seed`,
// `objectiveDeck`, any other seat's `draftOffer`, any `ledger`, `audience`.
// A hidden field is structurally impossible to populate because no type
// here names it — not merely "stripped" at runtime.
//
// (d) `yourAbilities` carries the viewer's OWN ability status, reason and
// per-step choice ids. Choice ids come from the target-kind registry, which
// reads only what the seat may see; `reason` is content-authored prose and
// must never name a card identity or another seat's private state.
//
// All arrays are PLAIN MUTABLE arrays (T[]), never readonly — matching
// HanabiView's convention (packages/rules/src/hanabi/state.ts) so
// ExpeditionView stays assignable to Plan 11-02's z.infer'd wire type.

import type { StandardRank, Suit } from "../state";
import type { TargetKind } from "../run/targets";
import type { ActiveWindow } from "../run/windows";

export type ExpeditionCardIdentityView =
  | { kind: "standard"; suit: Suit; rank: StandardRank }
  | { kind: "joker"; joker: "sun" | "moon" };

export type ExpeditionStandardIdentityView = { kind: "standard"; suit: Suit; rank: StandardRank };

export type ExpeditionCardView = { id: string; identity: ExpeditionCardIdentityView };

/** `effectiveRank` is set only when the composed rankOf differs from the
 * printed rank, and `countsAs` only when the composed identityOf differs
 * from the printed identity. */
export type ExpeditionRankedCardView = {
  id: string;
  identity: ExpeditionCardIdentityView;
  effectiveRank: number | null;
  countsAs: ExpeditionCardIdentityView | null;
};

export type ExpeditionTrickPlayView = { seatId: string; card: ExpeditionCardView; effectiveRank: number | null };

/** A play as its trick was resolved: what it counted as, and whether it
 * burned. */
export type ExpeditionCompletedPlayView = ExpeditionTrickPlayView & { countsAs: ExpeditionCardIdentityView | null; burned: boolean };

export type ExpeditionCompletedTrickView = {
  index: number;
  leaderSeatId: string;
  plays: ExpeditionCompletedPlayView[];
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
      target: ExpeditionCardIdentityView;
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

export type ExpeditionGoalView = { id: string; status: ExpeditionObjectiveStatusView };

/** A card that left a hand without being played. Public. */
export type ExpeditionDiscardView = { card: ExpeditionCardView; afterTrick: number };

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
  sourceId: string | null;
  private: boolean;
};

/** `params` is null unless the effect's audience is public or the viewer
 * owns it. */
export type ExpeditionEffectView = {
  sourceId: string;
  seatId: string;
  atTrick: number;
  lasts: "attempt" | "trick";
  params: Record<string, string | number | boolean> | null;
};

export type ExpeditionCampView = {
  playerCount: 3 | 4 | 5;
  expeditionLeaderSeatId: string;
  totalTricks: number;
  removedCards: ExpeditionCardIdentityView[];
  // Deliberately no `objectiveDeck` key: the undrawn objective deck order
  // must never be projected.
  objectives: ExpeditionObjectiveView[];
  /** Camp-wide conditions beside the objectives; every one must be done. */
  goals: ExpeditionGoalView[];
  discards: ExpeditionDiscardView[];
  yourHand: ExpeditionRankedCardView[];
  yourLegalCardIds: string[];
  handSizes: ExpeditionHandSizeView[];
  completedTricks: ExpeditionCompletedTrickView[];
  currentTrick: ExpeditionCurrentTrickView;
  campPhase: "objective-pick" | "playing" | "ended";
  currentActorSeatId: string | null;
};

export type ExpeditionAttemptView = {
  attemptNumber: number;
  window: ActiveWindow | null;
  /** Seats the open gated window (rescue) waits on. */
  pendingSeatIds: string[];
  /** Set while the rescue window holds a failed camp open. */
  rescue: { failedObjectiveIds: string[] } | null;
  effects: ExpeditionEffectView[];
  reveals: ExpeditionRevealView[];
  log: ExpeditionLogEntryView[];
  camp: ExpeditionCampView;
  /** The viewer's own Whisper allowance this camp; null when unseated. */
  yourWhisper: { allowed: boolean; left: number } | null;
};

export type ExpeditionRemainingView =
  | { kind: "uses"; left: number; of: number }
  | { kind: "single-use" }
  | { kind: "pool"; balance: number; max: number; cost: number }
  | { kind: "supplies"; cost: number };

// Deliberately no `draftOffer`/`ledger` keys for any seat: a seat's
// character, kit, pool and per-source usage are public; its draft offer is
// a boolean here and the viewer's own offer is `yourDraftOffer`.
export type ExpeditionSeatView = {
  seatId: string;
  characterId: string | null;
  kit: string[];
  ready: boolean;
  draftPending: boolean;
  pool: { balance: number; max: number } | null;
  /** Every live source with an active ability. */
  usage: { sourceId: string; remaining: ExpeditionRemainingView }[];
};

export type ExpeditionAbilityStepView = { kind: TargetKind; prompt: string; choices: string[] };

/** The viewer's own abilities. `steps` is [] unless usableNow. */
export type ExpeditionAbilityView = { sourceId: string; usableNow: boolean; reason: string | null; steps: ExpeditionAbilityStepView[] };

export type ExpeditionCampResultView = { campNumber: number; attemptNumber: number; status: "succeeded" | "failed"; suppliesSpent: number };

// Deliberately no `seed` key anywhere in this type: the run's RNG root must
// never be projected to any client (T-11-03).
export type ExpeditionView = {
  yourSeatId: string | null;
  runPhase: "muster" | "fireside" | "camp" | "ended";
  runStatus: "in_progress" | "won" | "lost";
  campNumber: number;
  supplies: number;
  seats: ExpeditionSeatView[];
  yourDraftOffer: string[] | null;
  yourAbilities: ExpeditionAbilityView[];
  history: ExpeditionCampResultView[];
  attempt: ExpeditionAttemptView | null;
};
