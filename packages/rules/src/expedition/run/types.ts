// The run layer's type contract.
//
// DERIVE, DON'T CACHE: run status, a source's remaining uses, a pool's
// balance, the next attempt number and a seat's remaining whisper count are
// computed from RunState, never stored. Purse, supplies and history are
// stored plainly: every reader wants the number, and four writers is few.
//
// THE STAGE IS THE PHASE: each stage carries the data that exists only
// there (ballots, route options, the dealt attempt), so stale data from an
// earlier stage is unrepresentable. A replay builds a fresh AttemptState;
// ledgers live on the seats and need no reset, since per-camp limits count
// by (camp, attempt) stamp.
//
// A1: RunState carries only the run's `seed` string, never generator state.
// Every draw derives a fresh stream by a unique name (run/rng.ts's STREAMS).
//
// PRIVACY: `seed` is never projected. `SeatRun.draftOffer` is owner-only.
// `SeatRun.ledger` is never projected raw. `Reveal.audience` is the only list
// of seats that may see a reveal's card; a reveal pins the identity and the
// holder at reveal time and never follows the card (WR-03).

import type { CampError, CampState } from "../state";
import type { CharacterDef, EffectParams, ItemDef, SourceDef, SourceId } from "../content/source-def";
import type { RunPlan } from "./plan";
import type { CampSpec, RouteChoice, RouteOption } from "./route";
import type { VoteRecord } from "./vote";

export type RunLength = "short" | "standard" | "long";
/** 1-based camp position in a run. Minted only by plan.ts's `campIndex`. */
export type CampIndex = number & { readonly __brand: "CampIndex" };
export type SeatId = string;
/** Each seat writes only its own key. */
export type PerSeat<T> = Readonly<Partial<Record<SeatId, T>>>;

/** When a ledger entry happened. `trick` is completedTricks.length. */
export type Stamp = { readonly camp: CampIndex; readonly attempt: number; readonly trick: number };

export type LedgerEntry =
  | { readonly kind: "used"; readonly sourceId: SourceId; readonly at: Stamp; readonly poolCost: number } // 0 unless a pool limit
  | { readonly kind: "passed"; readonly sourceId: SourceId; readonly at: Stamp; readonly failedObjectiveIds: readonly string[] } // gated-window pass; the failures it declined
  | { readonly kind: "regained"; readonly amount: number; readonly at: Stamp }; // pool regain on a clear

export type SeatRun = {
  readonly seatId: SeatId;
  readonly characterId: string | null; // PUBLIC; null only in muster; unique in the crew
  readonly kit: readonly SourceId[]; // PUBLIC; upgrades and items in draft order; single-use items leave on use
  readonly draftOffer: readonly SourceId[] | null; // PRIVATE to seatId; null = no pick due
  readonly ledger: readonly LedgerEntry[]; // never projected raw; append-only; survives replays
};

export type Reveal = {
  readonly cardId: string;
  readonly fromSeatId: string; // the hand holding the card when revealed; pinned forever (WR-03)
  readonly audience: readonly string[]; // the ONLY seats a view may show this card to
  readonly source: string; // "whisper" or the source id (e.g. "scout")
  readonly targetSeatId?: string; // whispers only: the seat the whisperer named, public in the log anyway
};

// Deliberately NO card id / identity fields: logs never carry card information.
export type LogEntry = {
  readonly event: string; // "whisper" | "use-ability" | source-specific
  readonly actorSeatId: string;
  readonly subjectSeatIds: readonly string[];
  readonly sourceId: SourceId | null;
  readonly audience: "public" | readonly string[];
};

export type ActiveEffect<P extends EffectParams = EffectParams> = {
  readonly sourceId: SourceId;
  readonly seatId: string;
  readonly atTrick: number; // currentTrick.index at activation
  readonly lasts: "attempt" | "trick"; // "trick": live only while currentTrick.index === atTrick
  readonly params: P;
  readonly audience: "public" | "owner"; // who may see params in a view
};

export type AttemptState = {
  readonly attemptNumber: number; // 1-based per camp index
  readonly effects: readonly ActiveEffect[]; // mid-camp modifiers (add-modifier), this attempt only
  readonly reveals: readonly Reveal[]; // COMM-02: cleared with the attempt
  readonly log: readonly LogEntry[];
  readonly camp: CampState;
};

/** One per decided attempt. `coins` is the payout of a clear, 0 on a failure. */
export type CampResult = {
  readonly camp: CampIndex;
  readonly attempt: number;
  readonly status: "cleared" | "failed";
  readonly suppliesSpent: number;
  readonly coins: number;
};

export type Stage =
  | { readonly tag: "muster"; readonly ballots: PerSeat<RunLength | null> } // null abstains
  | { readonly tag: "loadout"; readonly camp: CampSpec; readonly ready: PerSeat<true> }
  | { readonly tag: "camp"; readonly camp: CampSpec; readonly attempt: AttemptState }
  | { readonly tag: "draft"; readonly cleared: CampIndex; readonly payout: number }
  | { readonly tag: "route"; readonly from: CampIndex; readonly options: readonly RouteOption[]; readonly ballots: PerSeat<RouteChoice | null> }
  | { readonly tag: "event"; readonly route: RouteOption; readonly ready: PerSeat<true> }
  | { readonly tag: "ended"; readonly result: "won" | "lost" };
export type StageTag = Stage["tag"];

export type RunState = {
  readonly seed: string; // A1 root of every RNG stream; never projected
  readonly seatIds: readonly SeatId[];
  readonly seats: readonly SeatRun[]; // seatIds order
  readonly purse: number; // shared coins, >= 0
  readonly supplies: number; // 0..SUPPLIES_MAX
  readonly plan: RunPlan | null; // null only in muster
  readonly history: readonly CampResult[];
  readonly lastVote: VoteRecord | null; // the latest resolved vote, for the flip the table sees
  readonly stage: Stage;
};

/** The run narrowed to one stage. Stage handlers take this and never re-check the tag. */
export type RunAt<T extends StageTag> = RunState & { readonly stage: Extract<Stage, { tag: T }> };

export type RunStatus = "in_progress" | "won" | "lost";

export type RunAction =
  | { readonly type: "pick-character"; readonly characterId: string } // muster
  | { readonly type: "vote"; readonly choice: string | null } // muster, route; null abstains
  | { readonly type: "pick-draft"; readonly sourceId: string } // draft
  | { readonly type: "ready" } // loadout, event
  | { readonly type: "use-ability"; readonly sourceId: string; readonly targets: readonly string[] }
  | { readonly type: "skip-window" }
  | { readonly type: "whisper"; readonly targetSeatId: string; readonly cardId: string }
  | { readonly type: "pick-objective"; readonly objectiveId: string }
  | { readonly type: "play-card"; readonly cardId: string };

export type RunError =
  | CampError
  | "not_a_seat"
  | "run_over"
  | "wrong_stage"
  | "not_a_choice"
  | "unknown_character"
  | "character_taken"
  | "no_draft_pending"
  | "not_offered"
  | "already_ready"
  | "not_owned"
  | "wrong_window"
  | "ability_spent"
  | "cannot_afford"
  | "ability_unavailable"
  | "invalid_target"
  | "whisper_blocked"
  | "no_whispers_left"
  | "nothing_to_skip";

export type Catalog = {
  readonly characters: Readonly<Record<string, CharacterDef>>;
  readonly items: Readonly<Record<string, ItemDef>>;
  /** Every character, every character's upgrades and every item, by id. */
  readonly sources: Readonly<Record<SourceId, SourceDef>>;
};

export type { CampSpec, RouteChoice, RouteOption } from "./route";
export type { RunPlan } from "./plan";
export type { VoteRecord } from "./vote";
