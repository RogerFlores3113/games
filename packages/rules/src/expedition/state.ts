// Expedition Core type vocabulary (Phase 9, Plan 01). This is the single
// type contract every later Phase 9 plan compiles against — do not rename
// without updating those plans.
//
// State types are readonly everywhere; immutability is structural, not just
// convention (mirrors hanabi/state.ts's discipline).
//
// There are deliberately NO view types here: per-seat redaction (the
// Expedition analogue of HanabiView) is Phase 11's job, not this plan's.
//
// State never carries PRNG state: dealing mints every card id up front
// (see deck.ts) and stores no RNG stream, so there is nothing for a
// projection bug to leak (matches hanabi/deck.ts's T-03-01 rationale).
//
// Per-seat trick counts and objective statuses are always DERIVED from
// completedTricks, never stored as their own field. This is deliberate: a
// Phase 10 holder swap (e.g. a "Trail Map" gear/boss twist that reassigns an
// objective's owner mid-camp) recomputes correctly from completedTricks with
// no new field to keep in sync, and CampState carries no stale "tricks won"
// counter that could drift from the trick log.

/** Discretion choice: StandardRank is numeric (2..14, 14 = Ace) rather than
 * a separate rank + "is ace" flag, so rank comparison for trick-taking is
 * plain `>` with no special-casing of the Ace-high rule. */
export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type StandardRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type JokerName = "sun" | "moon";

export type StandardIdentity = { readonly kind: "standard"; readonly suit: Suit; readonly rank: StandardRank };
export type JokerIdentity = { readonly kind: "joker"; readonly joker: JokerName };
export type CardIdentity = StandardIdentity | JokerIdentity;

/** id is an opaque minted id, like HanabiCard.id. */
export type ExpeditionCard = { readonly id: string; readonly identity: CardIdentity };

export type PlayerCount = 3 | 4 | 5;

export type Hand = { readonly seatId: string; readonly cards: readonly ExpeditionCard[] };

export type TrickPlay = { readonly seatId: string; readonly card: ExpeditionCard };
export type CompletedTrick = {
  readonly index: number;
  readonly leaderSeatId: string;
  readonly plays: readonly TrickPlay[];
  readonly winnerSeatId: string;
};
export type CurrentTrick = {
  readonly index: number;
  readonly leaderSeatId: string;
  readonly plays: readonly TrickPlay[];
};

/** Numbers are positive integers (1, 2, 3...) displayed as circled numerals;
 * "last" means "must be won in the final trick of the camp". */
export type OrderMarker = number | "last";

export type WinCardObjective = {
  readonly id: string;
  readonly kind: "win-card";
  readonly target: StandardIdentity;
  readonly ownerSeatId: string | null;
};
export type OrderedObjective = {
  readonly id: string;
  readonly kind: "ordered";
  readonly target: StandardIdentity;
  readonly order: OrderMarker;
  readonly ownerSeatId: string | null;
};
export type NoTricksObjective = {
  readonly id: string;
  readonly kind: "no-tricks";
  readonly ownerSeatId: string | null;
};
export type ExactlyNObjective = {
  readonly id: string;
  readonly kind: "exactly-n";
  readonly n: number;
  readonly ownerSeatId: string | null;
};

export type Objective = WinCardObjective | OrderedObjective | NoTricksObjective | ExactlyNObjective;
export type ObjectiveKind = Objective["kind"];

/** The camp-setup input describing which objectives to flip face-up.
 * Phase 10's balance table produces a list of these per camp. */
export type ObjectiveSlot =
  | { readonly kind: "win-card" }
  | { readonly kind: "ordered"; readonly order: OrderMarker }
  | { readonly kind: "no-tricks" }
  | { readonly kind: "exactly-n"; readonly n: number };

export type ObjectiveStatus = "pending" | "done" | "failed";

/** ASSUMPTION A-HOLDER: an objective's holder is the seat that TOOK it
 * during objective-pick (ownerSeatId), not the seat whose hand holds the
 * target card (RESEARCH A1).
 *
 * ASSUMPTION A-TRICKCOUNT: no-tricks and exactly-n objectives are cardless
 * objectives in the same face-up pool and are taken through the same pick
 * flow; N is supplied by the ObjectiveSlot (i.e. by Phase 10's balance
 * table), not chosen by the core (RESEARCH A2 / Open Question 4).
 *
 * ASSUMPTION A-MULTI: picking wraps clockwise until every objective is
 * taken, so a seat may hold zero, one, or several objectives (RESEARCH Open
 * Question 5). */
export type CampState = {
  readonly seatIds: readonly string[];
  readonly playerCount: PlayerCount;
  readonly removedCards: readonly CardIdentity[];
  readonly totalTricks: number;
  readonly hands: readonly Hand[];
  readonly expeditionLeaderSeatId: string;
  readonly objectives: readonly Objective[];
  /** The undrawn remainder of the objective deck, kept for Phase 10's
   * Compass reroll. */
  readonly objectiveDeck: readonly StandardIdentity[];
  readonly completedTricks: readonly CompletedTrick[];
  readonly currentTrick: CurrentTrick;
};
// Deliberately NO stored phase, outcome, status or tricks-won field on
// CampState: phase/outcome are derived (see CampPhase/CampOutcome below and
// their computing functions in later plans), and per-seat trick counts come
// from completedTricks (see file header). ownerSeatId === null on an
// Objective means "still face-up, not yet taken".

/** There is deliberately no undo action and no queued/auto-play action
 * (XRULE-08). */
export type CampAction =
  | { readonly type: "pick-objective"; readonly objectiveId: string }
  | { readonly type: "play-card"; readonly cardId: string };

export type CampError =
  | "not_your_turn"
  | "wrong_phase"
  | "camp_over"
  | "card_not_in_hand"
  | "must_follow_suit"
  | "objective_not_available"
  | "invalid_action"
  /** Returned when a composed CoreRules hook (e.g. nextLeader) returns a
   * value outside the camp's domain, such as a seat id not in seatIds. This
   * is a rules-composition defect, not a player error (WR-04). */
  | "invalid_rule_hook";

export type CampOutcome =
  | { readonly status: "in_progress" }
  | { readonly status: "succeeded" }
  | {
      readonly status: "failed";
      readonly failedObjectiveIds: readonly string[];
      readonly firedFailureCheckIds: readonly string[];
    };

export type CampPhase = "objective-pick" | "playing" | "ended";
