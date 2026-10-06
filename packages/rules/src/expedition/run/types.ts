// The run layer's type contract.
//
// DERIVE, DON'T CACHE: run status, a source's remaining uses, the next
// attempt number and a seat's remaining whisper count are
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
// PRIVACY: `seed` is never projected. `SeatRun.offers` is owner-only.
// `SeatRun.ledger` is never projected raw. `Reveal.audience` is the only list
// of seats that may see a reveal's card; a reveal pins the identity and the
// holder at reveal time and never follows the card (WR-03).

import type { CampError, CampState } from "../state";
import type { CharacterDef, EffectParams, ItemDef, SourceDef, SourceId } from "../content/source-def";
import type { ModDef, ModId, Strength } from "../content/mods/mod-def";
import type { PairingRule } from "../content/mods/pairings";
import type { DraftOffer } from "./draft";
import type { RunPlan } from "./plan";
import type { CampSpec, RouteChoice, RouteOption } from "./route";
import type { StockEntry } from "./shop";
import type { VoteRecord } from "./vote";

export type RunLength = "short" | "standard" | "long";
/** 1-based camp position in a run. Minted only by plan.ts's `campIndex`. */
export type CampIndex = number & { readonly __brand: "CampIndex" };
export type SeatId = string;
/** Each seat writes only its own key. */
export type PerSeat<T> = Readonly<Partial<Record<SeatId, T>>>;

/** When a ledger entry happened. `trick` is completedTricks.length; a stage
 * window stamps trick 0 of the camp it belongs to (usage.ts's currentStamp). */
export type Stamp = { readonly camp: CampIndex; readonly attempt: number; readonly trick: number };

/** "it7", minted from RunState.itemSerial, so an id never names its item. */
export type ItemUid = string;
export type ItemInstance = { readonly uid: ItemUid; readonly itemId: SourceId };
/** What an ability is used through: a character id, a power id, an upgrade
 * id or an item instance's uid, so two copies of one item keep separate uses. */
export type SourceKey = string;

export type LedgerEntry =
  /** A `free` use counts against no limit. */
  | { readonly kind: "used"; readonly sourceKey: SourceKey; readonly at: Stamp; readonly free?: true }
  | { readonly kind: "passed"; readonly sourceKey: SourceKey; readonly at: Stamp; readonly failedObjectiveIds: readonly string[] }; // gated-window pass; the failures it declined

export type SeatRun = {
  readonly seatId: SeatId;
  readonly characterId: string | null; // PUBLIC; null only in muster; unique in the crew
  readonly upgradeId: string | null; // PUBLIC; one per seat, bought at the shop
  readonly items: readonly ItemInstance[]; // PUBLIC; owned; a spent instance leaves
  readonly equipped: readonly ItemUid[]; // PUBLIC; a subset of items, within rules.itemSlots
  readonly offers: readonly DraftOffer[]; // PRIVATE to seatId; the head is the one to pick
  readonly ledger: readonly LedgerEntry[]; // never projected raw; append-only; survives replays
};

export type Reveal = {
  readonly cardId: string;
  readonly fromSeatId: string; // the hand holding the card when revealed; pinned forever (WR-03)
  readonly audience: readonly string[]; // the ONLY seats a view may show this card to
  readonly source: string; // "whisper", a source id (e.g. "magician") or a mod id
  readonly targetSeatId?: string; // whispers only: the seat the whisperer named, public in the log anyway
};

// Deliberately NO card id / identity fields: logs never carry card information.
export type LogEntry = {
  readonly event: string; // "whisper" | "use-ability" | source-specific
  readonly actorSeatId: string | null; // null for a camp modifier
  readonly subjectSeatIds: readonly string[];
  readonly sourceId: SourceId | ModId | null;
  readonly audience: "public" | readonly string[];
};

/** Who caused a toolkit op. A seat's origin carries the def id beside the
 * key, since a spent item instance is gone by the time its effect is read. */
export type SeatOrigin = { readonly kind: "seat"; readonly seatId: SeatId; readonly sourceKey: SourceKey; readonly sourceId: SourceId };
export type ModOrigin = { readonly kind: "mod"; readonly modId: ModId; readonly strength: Strength };
export type Origin = SeatOrigin | ModOrigin;

export type ActiveEffect<P extends EffectParams = EffectParams> = {
  readonly origin: Origin;
  readonly atTrick: number; // currentTrick.index at activation
  readonly lasts: "attempt" | "trick"; // "trick": live only while currentTrick.index === atTrick
  /** A trick effect that would lose the camp moves to the next trick (stages/camp.ts). */
  readonly deferIfFatal: boolean;
  readonly params: P;
  readonly audience: "public" | "owner"; // who may see params in a view; a mod effect has no owner
};
/** An effect a seat's ability switched on. */
export type SeatEffect<P extends EffectParams = EffectParams> = ActiveEffect<P> & { readonly origin: SeatOrigin };

export type AttemptState = {
  readonly attemptNumber: number; // 1-based per camp index
  readonly effects: readonly ActiveEffect[]; // mid-camp modifiers (add-modifier), this attempt only
  readonly reveals: readonly Reveal[]; // COMM-02: cleared with the attempt
  readonly log: readonly LogEntry[];
  readonly camp: CampState;
  /** Only the dev sandbox writes this; play never does. */
  readonly loaded?: LoadedDice;
};

/** The dev sandbox's loaded dice for one attempt: the real rules run, with
 * some outcomes chosen. `rolls` pins a camp modifier's rule roll, keyed
 * `${modId}:${strength}:${label}`; `objectives` decides an objective's
 * status over whatever the tricks say. */
export type LoadedDice = {
  readonly rolls: Readonly<Record<string, number>>;
  readonly objectives: Readonly<Record<string, "done" | "failed">>;
};

/** One per ended attempt, with the location and weather it was played at.
 * `coins` is the payout of a clear, 0 otherwise. A
 * `restarted` attempt was abandoned when the crew kicked a seat: it costs
 * nothing and the camp's loadout reopens. */
export type CampResult = {
  readonly camp: CampIndex;
  readonly attempt: number;
  readonly location: ModId;
  readonly weather: ModId;
  readonly status: "cleared" | "failed" | "restarted";
  readonly suppliesSpent: number;
  readonly coins: number;
};

/** A seat the crew voted out while it was disconnected (run/crew.ts). Its
 * SeatRun is kept whole for its return; `position` is where it sat in
 * seatIds. `back` is true while it is connected again, waiting for the next
 * loadout. */
export type KickedSeat = { readonly seat: SeatRun; readonly position: number; readonly back: boolean };

export type Stage =
  | { readonly tag: "muster"; readonly ballots: PerSeat<RunLength | null>; readonly locked: PerSeat<true> } // null abstains; a locked seat's pick and ballot are final
  | { readonly tag: "loadout"; readonly camp: CampSpec; readonly stock: readonly StockEntry[] | null; readonly ready: PerSeat<true> } // stock: the shop before a boss camp
  | { readonly tag: "camp"; readonly camp: CampSpec; readonly attempt: AttemptState }
  | { readonly tag: "draft"; readonly cleared: CampIndex; readonly payout: number }
  | { readonly tag: "route"; readonly from: CampIndex; readonly options: readonly RouteOption[]; readonly ballots: PerSeat<RouteChoice | null> }
  | { readonly tag: "event"; readonly route: RouteOption; readonly ready: PerSeat<true> }
  | { readonly tag: "ended"; readonly result: "won" | "lost" };
export type StageTag = Stage["tag"];

export type RunState = {
  readonly seed: string; // A1 root of every RNG stream; never projected
  readonly seatIds: readonly SeatId[]; // the crew in play; every per-player rule reads these
  readonly seats: readonly SeatRun[]; // seatIds order
  readonly kicked: readonly KickedSeat[]; // out of the crew, never in seatIds; characters stay theirs
  readonly purse: number; // shared coins, >= 0
  readonly supplies: number; // 0..SUPPLIES_MAX
  readonly plan: RunPlan | null; // null only in muster
  readonly history: readonly CampResult[];
  readonly lastVote: VoteRecord | null; // the latest resolved vote, for the flip the table sees
  readonly itemSerial: number; // the next item instance number; never projected
  readonly stage: Stage;
};

/** The run narrowed to one stage. Stage handlers take this and never re-check the tag. */
export type RunAt<T extends StageTag> = RunState & { readonly stage: Extract<Stage, { tag: T }> };

export type RunStatus = "in_progress" | "won" | "lost";

export type RunAction =
  | { readonly type: "pick-character"; readonly characterId: string } // muster
  | { readonly type: "vote"; readonly choice: string | null } // muster, route; null abstains
  | { readonly type: "lock-in" } // muster; needs a character and a ballot
  | { readonly type: "equip"; readonly itemUids: readonly string[] } // loadout; replaces the equipped set
  | { readonly type: "buy"; readonly stockId: string } // loadout before a boss camp
  | { readonly type: "pick-bundle"; readonly bundle: number } // draft
  | { readonly type: "ready" } // loadout, event
  | { readonly type: "use-ability"; readonly sourceKey: SourceKey; readonly targets: readonly string[] }
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
  | "incomplete_choices"
  | "locked"
  | "not_owned_item"
  | "too_many_items"
  | "sold_out"
  | "supplies_full"
  | "upgrade_owned"
  | "not_your_upgrade"
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
  readonly mods: Readonly<Record<ModId, ModDef>>;
  readonly pairings: readonly PairingRule[];
  /** Every character, every character's powers and upgrades, and every item, by id. */
  readonly sources: Readonly<Record<SourceId, SourceDef>>;
};

export type { CampSpec, RouteChoice, RouteOption } from "./route";
export type { RunPlan } from "./plan";
export type { DraftOffer } from "./draft";
export type { StockEntry } from "./shop";
export type { VoteRecord } from "./vote";
