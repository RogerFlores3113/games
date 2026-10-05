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
//   - public characters, upgrades, items and usage: `seats[]`
//   - own head draft offer only: the draft stage's `yourOffer` (never any other seat's)
//   - own abilities with server-computed target choices: `yourAbilities`
//   - removed cards: `camp.removedCards`
//   - the run header: `length`, `campCount`, `purse`, `supplies`, `plan`,
//     `history`, `lastVote`, `runStatus`; the stage and its data: `stage`
//
// (c) Deliberately ABSENT keys, at every nesting level in this file: `seed`,
// `objectiveDeck`, `offers`, `itemSerial`, any `ledger`, `audience`.
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
import type { BossTier } from "../run/plan";
import type { SlotTemplate } from "../run/route";
import type { RunLength } from "../run/types";
import type { ModKind, Strength } from "../content/mods/mod-def";

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

/** A play whose card the viewer sees, and what it counts as when that
 * differs from the printed card (a Blood Moon trick). */
export type ExpeditionShownPlayView = { seatId: string; card: ExpeditionCardView; effectiveRank: number | null; countsAs: ExpeditionCardIdentityView | null };

/** A current-trick play: shown, or face down (a Cave, the Night's lead)
 * with only the suit it follows as ("joker" for the Sun or Moon), never
 * its rank or id. */
export type ExpeditionTrickPlayView = (ExpeditionShownPlayView & { hidden: false }) | { seatId: string; hidden: true; suit: Suit | "joker" };

/** A play as its trick was resolved: what it counted as, and whether it
 * burned. Completed plays are always face up. */
export type ExpeditionCompletedPlayView = ExpeditionShownPlayView & { burned: boolean };

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
    }
  /** Face down (a Desert's mirage): its kind and target are kept. */
  | {
      id: string;
      kind: "hidden";
      ownerSeatId: string | null;
      status: ExpeditionObjectiveStatusView;
    };

export type ExpeditionHandSizeView = { seatId: string; size: number };

export type ExpeditionGoalView = { id: string; status: ExpeditionObjectiveStatusView };

/** A card that left a hand without being played. Public. */
export type ExpeditionDiscardView = { card: ExpeditionCardView; afterTrick: number };
/** A hallucination: the cards played, each back in its player's hand. */
export type ExpeditionVoidedTrickView = { index: number; leaderSeatId: string; plays: { seatId: string; card: ExpeditionCardView }[] };

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
  /** null for a camp modifier. */
  actorSeatId: string | null;
  subjectSeatIds: string[];
  sourceId: string | null;
  private: boolean;
};

/** Who switched an effect on: a seat through a source, or a camp modifier. */
export type ExpeditionEffectOriginView = { kind: "seat"; seatId: string; sourceId: string } | { kind: "mod"; modId: string; strength: Strength };

/** `params` is null unless the effect's audience is public or the viewer
 * owns it. */
export type ExpeditionEffectView = {
  origin: ExpeditionEffectOriginView;
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
  voidedTricks: ExpeditionVoidedTrickView[];
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
  | { kind: "supplies"; cost: number }
  /** A crew token (the temple's skip): `left` of `earned` this attempt. */
  | { kind: "crew"; left: number; earned: number }
  /** Coins from the purse: the least a use costs, before its targets. */
  | { kind: "coins"; cost: number }
  | { kind: "unlimited" }
  /** The seat's whispers left this camp, which a use takes from. */
  | { kind: "whispers"; left: number };

/** One owned item instance. `remaining` is null for a passive item. */
export type ExpeditionItemView = { uid: string; itemId: string; remaining: ExpeditionRemainingView | null };

// Deliberately no `offers`/`ledger` keys for any seat: a seat's character,
// upgrade, items and per-source usage are public; the viewer's own
// draft offer is the draft stage's `yourOffer`.
export type ExpeditionSeatView = {
  seatId: string;
  characterId: string | null;
  upgradeId: string | null;
  /** `concealed` under Heavy fog for every other seat: `equipped` lists
   * only the items used this attempt and `backpack` is null. */
  items: { equipped: ExpeditionItemView[]; backpack: ExpeditionItemView[] | null; concealed: boolean };
  /** Every live source key with an active ability, and every ability a
   * camp modifier grants the crew (the temple's skip, under "temple"). */
  usage: { sourceKey: string; remaining: ExpeditionRemainingView }[];
};

export type ExpeditionAbilityStepView = { kind: TargetKind; prompt: string; choices: string[] };

/** The viewer's own abilities, by source key. `steps` is [] unless usableNow. */
export type ExpeditionAbilityView = { sourceKey: string; usableNow: boolean; reason: string | null; steps: ExpeditionAbilityStepView[] };

export type ExpeditionCampResultView = { camp: number; attempt: number; location: string; weather: string; status: "cleared" | "failed" | "restarted"; coins: number };

/** A seat the crew voted out while it was away. `back` while it is
 * connected again, waiting to rejoin at the next loadout. */
export type ExpeditionKickedSeatView = { seatId: string; characterId: string | null; upgradeId: string | null; back: boolean };

export type ExpeditionRunLengthView = RunLength;
export type ExpeditionSlotKindView = SlotTemplate["kind"];

/** A camp as a preview shows it: before the deal, on a route card, or
 * during play. `pairing` is the def a location and weather add together.
 * `bossId` is null for a plain camp, a boss not drawn, or a boss beyond the
 * crew's horizon (not yet previewed). `shop` is true for
 * a boss camp, whose loadout opens the shop. */
export type ExpeditionCampPreviewView = {
  index: number;
  location: string;
  weather: string;
  pairing: string | null;
  event: string | null;
  slotKinds: ExpeditionSlotKindView[];
  bossId: string | null;
  shop: boolean;
  /** The objectives the camp's next deal holds, for a seat that surveys; null otherwise. */
  survey: ExpeditionSurveyedObjectiveView[] | null;
};

/** An objective a coming camp will deal, before anyone owns it. */
export type ExpeditionSurveyedObjectiveView =
  | { kind: "win-card"; target: ExpeditionCardIdentityView }
  | { kind: "ordered"; target: ExpeditionCardIdentityView; order: number | "last" }
  | { kind: "no-tricks" }
  | { kind: "exactly-n"; n: number }
  /** Kept from the viewer at the deal too (a Desert's mirage). */
  | { kind: "hidden" };

export type ExpeditionStockView = {
  stockId: string;
  what: { kind: "supplies" } | { kind: "item"; itemId: string };
  price: number;
  soldTo: string | null;
};

/** The shop before a boss camp: the shared stock, and the viewer's own
 * character's upgrades while the viewer owns none. */
export type ExpeditionShopView = {
  stock: ExpeditionStockView[];
  yourUpgrades: { stockId: string; upgradeId: string; price: number }[];
};

/** A seat's public ballot; `choice` null abstains. Seats yet to vote are absent. */
export type ExpeditionBallotView = { seatId: string; choice: string | null };

export type ExpeditionVoteView = {
  topic: "length" | "route";
  tally: { choice: string; votes: number }[];
  /** The tied choices a seeded flip settled; null for a clear majority. */
  tied: string[] | null;
  winner: string;
};

/** `bossId` is null until a route preview has led the crew to its camp. */
export type ExpeditionPlanBossView = { at: number; tier: BossTier; bossId: string | null };

/** Public table state of a camp modifier. Carries no card. */
export type ExpeditionStatusPartView =
  | { kind: "chance"; percent: number; strikesLeft: number }
  | { kind: "strike" }
  | { kind: "meter"; left: number; of: number }
  | { kind: "washes"; left: number; of: number }
  | { kind: "facing"; seatId: string }
  | { kind: "dam"; suit: Suit }
  | { kind: "streak"; seatId: string; count: number }
  | { kind: "bitten"; seatId: string; tricksLeft: number }
  | { kind: "countdown"; tricks: number }
  | { kind: "alternating"; activeNow: boolean }
  | { kind: "swarm"; seatId: string | null }
  | { kind: "path"; plates: (Suit | "sun")[]; pressed: number };

/** One layer of the camp's modifier stack, in fold order. */
export type ExpeditionModView = { id: string; kind: ModKind; strength: Strength; status: ExpeditionStatusPartView[] };

export type ExpeditionStageView =
  | { tag: "muster"; ballots: ExpeditionBallotView[] }
  | { tag: "loadout"; camp: ExpeditionCampPreviewView; mods: ExpeditionModView[]; yourSlots: number; shop: ExpeditionShopView | null; readySeatIds: string[] }
  | { tag: "camp"; camp: ExpeditionCampPreviewView; mods: ExpeditionModView[]; attempt: ExpeditionAttemptView }
  | { tag: "draft"; cleared: number; payout: number; yourOffer: { kind: "standard" | "special"; bundles: string[][] } | null; pendingSeatIds: string[] }
  /** `swapsBoss`: the option leads to a different boss at the next boss camp. */
  | { tag: "route"; options: { id: string; next: ExpeditionCampPreviewView; swapsBoss: boolean }[]; ballots: ExpeditionBallotView[] }
  | { tag: "event"; event: string; next: ExpeditionCampPreviewView; readySeatIds: string[] }
  | { tag: "ended"; result: "won" | "lost" };

// Deliberately no `seed` key anywhere in this type: the run's RNG root must
// never be projected to any client (T-11-03).
export type ExpeditionView = {
  yourSeatId: string | null;
  runStatus: "in_progress" | "won" | "lost";
  length: ExpeditionRunLengthView | null;
  campCount: number | null;
  purse: number;
  supplies: { count: number; max: number };
  plan: ExpeditionPlanBossView[];
  seats: ExpeditionSeatView[];
  kicked: ExpeditionKickedSeatView[];
  yourAbilities: ExpeditionAbilityView[];
  history: ExpeditionCampResultView[];
  lastVote: ExpeditionVoteView | null;
  stage: ExpeditionStageView;
};
