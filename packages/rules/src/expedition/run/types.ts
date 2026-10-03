// Phase 10 run-layer type contract (Plan 02). This is the single type
// contract every later Phase 10 plan compiles against — do not rename a
// field without updating those plans.
//
// DERIVE, DON'T CACHE: run phase, run status, a source's remaining uses, a
// pool's balance, the next attempt number and a seat's remaining whisper
// count are all computable
// from RunState and are deliberately NOT stored fields here. This mirrors
// Phase 9's CampState discipline (no stored phase/outcome/tricks-won).
//
// RESET-ON-REPLAY CONTRACT (research A4): everything inside AttemptState
// (bossCancelled, effects, reveals, log, camp) is reset to a fresh attempt
// on every replay (RUN-06). RunState's top-level fields — seatIds,
// campNumber, supplies, seats (character, kit, draft offers, ledgers),
// bossTwists, readySeatIds, history — persist across a replay and across
// camps; only `attempt` is torn down and rebuilt. Per-camp limits need no
// reset: they count ledger entries stamped with the current (camp, attempt).
//
// A1 (labeled deviation from spec §6.5's "carried generator"): RunState
// carries only the run's `seed` string, never a shuffle.ts-style generator
// state tuple. Every draw derives a FRESH stream by a unique name via
// run/rng.ts's STREAMS builder. This removes the "forgot to persist the
// advanced generator state" bug class entirely — there is no mutable
// generator state to forget to save.
//
// A1 STREAM-NAME TABLE (reproduced here so every later plan draws from the
// same names; run/rng.ts's STREAMS is the single builder that realizes it):
//   - draft upgrade slot: "expedition-draft:camp{N}:seat{seatId}:upgrade"
//   - draft item slots:   "expedition-draft:camp{N}:seat{seatId}:items"
//   - boss:                "expedition-boss:camp{N}"
//   - attempt deal seed:   "{seed}:camp{N}:attempt{A}"
//   - trick-count kind:    "expedition-trickcount-kind:camp{N}:attempt{A}"
//   - trick-count N:       "expedition-trickcount-n:camp{N}:attempt{A}"
//   - face-down assign:    "expedition-face-down:camp{N}:attempt{A}"
//   - ability draws:       "expedition-ability:camp{N}:attempt{A}:seat{id}:use{k}:draw{j}"
//     where k = the seat's ledger length before the use and j counts draws
//     inside one `apply`.
// The rule: two draws never share a stream name. Draft and boss draws
// happen AT MOST ONCE per camp number per run (a draft only follows a
// CLEAR, a boss twist is drawn only on first reaching the camp — D-01/D-02),
// so their names deliberately omit the attempt number. Every ability draw
// carries camp, attempt, seat, the seat's use index k and a draw counter j,
// so repeated uses never collide.
//
// PRIVACY NOTES (for Phase 11's toPlayerView, not implemented here):
//   - `seed` must NEVER be projected to any client; it is the root of every
//     RNG stream and its exposure would let a client predict future draws.
//   - `SeatRun.draftOffer` is OWNER-ONLY (RUN-04); Phase 11 redaction is a
//     per-seat field lookup, not a filter over a shared list.
//   - `SeatRun.ledger` is never projected raw; views show only what usage.ts
//     folds from it.
//   - `Reveal.audience` is the ONLY list of seats allowed to see a reveal's
//     card identity (COMM-02); a reveal not addressed to a seat must never
//     appear in that seat's view.
//   - WR-03 RULING (Phase 11, Plan 01): a reveal pins a card's IDENTITY plus
//     the seat that held it AT REVEAL TIME; it never follows the card. If
//     Trained Monkey (or any toolkit move/swap op) later relocates the
//     card, `fromSeatId` stays exactly as recorded and the per-seat view
//     never re-derives the card's current holder — telling the audience
//     where the card went would disclose another seat's hand contents that
//     no reveal addressed to them (COMM-03). Reveals are not invalidated
//     when their card moves; the audience cannot un-learn an identity it
//     was already shown.
//
// ABILITY TARGETS: `use-ability` targets are a flat `readonly string[]` of
// choice ids, order-matched positionally to the ability's target specs
// (run/targets.ts resolves them).

import type { CampError, CampState } from "../state";
import type { BossDef } from "../boss/boss-def";
import type { CharacterDef, EffectParams, ItemDef, SourceDef, SourceId } from "../content/source-def";

export type CampNumber = 1 | 2 | 3 | 4 | 5 | 6;
export type BossCampNumber = 3 | 6;

/** When a ledger entry happened. `trick` is completedTricks.length, or null
 * before the deal. */
export type Stamp = { readonly camp: CampNumber; readonly attempt: number; readonly trick: number | null };

export type LedgerEntry =
  | { readonly kind: "used"; readonly sourceId: SourceId; readonly at: Stamp; readonly poolCost: number } // 0 unless a pool limit
  | { readonly kind: "passed"; readonly sourceId: SourceId; readonly at: Stamp; readonly failedObjectiveIds: readonly string[] } // gated-window pass; the failures it declined ([] before the deal)
  | { readonly kind: "regained"; readonly amount: number; readonly at: Stamp }; // pool regain on a clear

export type SeatRun = {
  readonly seatId: string;
  readonly characterId: string | null; // PUBLIC; null only during muster; unique in the crew
  readonly kit: readonly SourceId[]; // PUBLIC; upgrades and items in draft order; single-use items leave on use
  readonly draftOffer: readonly SourceId[] | null; // PRIVATE to seatId (RUN-04); null = no draft due
  readonly ledger: readonly LedgerEntry[]; // never projected raw; append-only; survives replays
};

export type Reveal = {
  readonly cardId: string;
  readonly fromSeatId: string; // hand holding the card when revealed; pinned forever (WR-03 ruling above — never re-derived after the card moves)
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
  readonly attemptNumber: number; // 1-based per campNumber
  readonly bossCancelled: boolean; // Rain Poncho, this attempt only (D-04)
  readonly effects: readonly ActiveEffect[]; // mid-camp modifiers (add-modifier), this attempt only
  readonly reveals: readonly Reveal[]; // COMM-02: cleared with the attempt
  readonly log: readonly LogEntry[];
  readonly camp: CampState | null; // null during the pre-deal window
};

export type CampResult = {
  readonly campNumber: CampNumber;
  readonly attemptNumber: number;
  readonly status: "succeeded" | "failed";
  readonly suppliesSpent: number;
};

export type RunState = {
  readonly seed: string; // A1 root of every RNG stream; a view must NEVER project it
  readonly seatIds: readonly string[];
  readonly campNumber: CampNumber;
  readonly supplies: number;
  readonly seats: readonly SeatRun[]; // same order as seatIds
  readonly bossTwists: { readonly 3: string | null; readonly 6: string | null }; // D-02 fixed per boss camp
  readonly readySeatIds: readonly string[]; // D-07 (pure data; disconnect handling is the room layer's)
  readonly attempt: AttemptState | null; // null = muster, fireside (or run over)
  readonly history: readonly CampResult[];
};

export type RunStatus = "in_progress" | "won" | "lost";
export type RunPhase = "muster" | "fireside" | "pre-deal" | "camp" | "ended";

export type RunAction =
  | { readonly type: "pick-character"; readonly characterId: string }
  | { readonly type: "pick-draft"; readonly sourceId: string }
  | { readonly type: "ready" }
  | { readonly type: "use-ability"; readonly sourceId: string; readonly targets: readonly string[] }
  | { readonly type: "skip-window" }
  | { readonly type: "whisper"; readonly targetSeatId: string; readonly cardId: string }
  | { readonly type: "pick-objective"; readonly objectiveId: string }
  | { readonly type: "play-card"; readonly cardId: string };

export type RunError =
  | CampError
  | "not_a_seat"
  | "run_over"
  | "unknown_character"
  | "character_taken"
  | "character_pending"
  | "draft_pending"
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
  readonly bosses: Readonly<Record<string, BossDef>>;
  /** Every character, every character's upgrades and every item, by id. */
  readonly sources: Readonly<Record<SourceId, SourceDef>>;
};
