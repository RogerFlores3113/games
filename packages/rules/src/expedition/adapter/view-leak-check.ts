// Phase 11, Plan 04: the Expedition analogue of hanabi-leak-check.ts
// (COMM-03/ENG-03). This checker derives each seat's secrets INDEPENDENTLY
// from RunState — it never calls the view-projection function — so it cannot be a
// self-confirming proof of the projection it verifies (T-11-16).
//
// Card identities are minted 8-lowercase-letter ids (shuffle.ts's
// mintCardId), and objective ids are minted the same way, so a raw substring
// scan for a card id would risk colliding with unrelated prose; detection is
// therefore STRUCTURAL (key presence / exact string-leaf equality against a
// hidden-id list, via the `in` operator and Object.keys — never truthiness,
// since JSON.stringify drops undefined-valued keys) PLUS a TYPED MULTISET
// comparison (an excess count of a {suit,rank}/{joker} identity proves a
// leak; duplicate identities do not exist in a 54-card deck, but a card's
// identity legitimately recurs across yourHand/trick plays/removedCards/
// objective targets within one view). Raw-string scanning is retained ONLY
// for the server seed (T-11-03), which cannot legitimately appear in any
// view.
//
// Type-only imports from "../run/types" and "../state" — this module stays
// zero-runtime-dependency, per packages/rules' FDN-02 rule, EXCEPT for
// rulesFor (a real function call, needed to determine objectiveAssignment,
// exactly as the projection function itself does) and evaluateObjective (a
// failed objective is public even under face-down assignment).

import { evaluateObjective } from "../objectives";
import { rulesFor } from "../run/compose";
import { CATALOG } from "../run/catalog";
import type { Catalog, RunState } from "../run/types";
import type { CardIdentity } from "../state";

export interface ExpeditionSeatSecrets {
  /** Card ids (in another seat's still-in-hand cards, not yet revealed to
   * this viewer) and, under Thick Fog, other seats' objective ids — string
   * values that must never appear anywhere in this seat's view. */
  readonly hiddenIds: readonly string[];
  /** The {kind}:{suit}:{rank} / {kind}:{joker} identity keys this seat MAY
   * legitimately see, as a multiset. */
  readonly allowedIdentityCounts: Readonly<Record<string, number>>;
  /** Raw strings that must never appear in the serialized view (the server
   * seed). */
  readonly forbiddenTokens: readonly string[];
  /** This seat's own draft offer (null if unseated or none due). */
  readonly ownDraftOffer: readonly string[] | null;
  /** The number of attempt log entries this seat may legitimately see. */
  readonly visibleLogEntryCount: number;
}

/** Keys a view object literal must never carry, at ANY nesting level. */
export const FORBIDDEN_VIEW_KEYS = [
  "seed",
  "objectiveDeck",
  "draftOffer",
  "hands",
  "audience",
  "ownedGearIds",
  "readySeatIds",
] as const;

function identityKey(identity: CardIdentity): string {
  return identity.kind === "joker" ? `joker:${identity.joker}` : `standard:${identity.suit}:${identity.rank}`;
}

function typedKeyFromObj(obj: Record<string, unknown>): string | null {
  if ("suit" in obj && "rank" in obj) {
    return `standard:${String(obj.suit)}:${String(obj.rank)}`;
  }
  if ("joker" in obj) {
    return `joker:${String(obj.joker)}`;
  }
  return null;
}

/** Looks up a card's identity by id across a camp's hands, completed tricks,
 * and the in-progress trick. Mirrors view.ts's findCardIdentity exactly
 * (this file must not call view.ts, so it is re-derived here, independently,
 * from RunState). Returns null (never throws) when not found. */
function findCardIdentity(
  camp: NonNullable<NonNullable<RunState["attempt"]>["camp"]>,
  cardId: string,
): CardIdentity | null {
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

/** Derives the secrets a given seat's view must never leak, INDEPENDENTLY of
 * the view-projection function (T-11-16). `catalog` defaults to the production
 * CATALOG (rulesFor needs it to compute objectiveAssignment); `seed` is
 * passed only when the caller wants the seed substring scan active (mirrors
 * secretsForHanabiSeat's own optional-seed contract). */
export function secretsForExpeditionSeat(
  state: RunState,
  seatId: string,
  catalog: Catalog = CATALOG,
  seed?: string,
): ExpeditionSeatSecrets {
  const seated = state.seatIds.includes(seatId);
  const ownSeat = state.seats.find((s) => s.seatId === seatId);

  // A card id set, for the hiddenIds exclusion below (whether this seat may
  // see this card AT ALL). Kept separate from the reveals LIST below, which
  // preserves duplicates: a card can legitimately be revealed to the same
  // seat more than once (e.g. Spyglass, then later a Whisper), and the
  // view's `reveals` array carries one entry per such reveal, not one per
  // distinct card — so the allowed COUNT must bump once per matching
  // reveal, not once per distinct card id.
  const revealsToViewer = state.attempt !== null && seated ? state.attempt.reveals.filter((r) => r.audience.includes(seatId) || (r.source === "whisper" && r.fromSeatId === seatId)) : [];
  const revealedToViewer = new Set(revealsToViewer.map((r) => r.cardId));

  const hiddenIds: string[] = [];
  const counts: Record<string, number> = {};
  const bump = (identity: CardIdentity): void => {
    const key = identityKey(identity);
    counts[key] = (counts[key] ?? 0) + 1;
  };

  const camp = state.attempt?.camp ?? null;
  if (camp !== null) {
    for (const hand of camp.hands) {
      if (hand.seatId === seatId) {
        if (seated) {
          for (const card of hand.cards) bump(card.identity);
        }
        continue;
      }
      for (const card of hand.cards) {
        if (!revealedToViewer.has(card.id)) hiddenIds.push(card.id);
      }
    }

    for (const reveal of revealsToViewer) {
      const identity = findCardIdentity(camp, reveal.cardId);
      if (identity !== null) bump(identity);
    }

    for (const trick of camp.completedTricks) {
      for (const play of trick.plays) bump(play.card.identity);
    }
    for (const play of camp.currentTrick.plays) bump(play.card.identity);

    for (const identity of camp.removedCards) bump(identity);

    const assignment = rulesFor(state, catalog).objectiveAssignment(state);
    for (const objective of camp.objectives) {
      const visible =
        assignment === "face-up" || (seated && (objective.ownerSeatId === seatId || evaluateObjective(camp, objective) === "failed"));
      if (visible) {
        if (objective.kind === "win-card" || objective.kind === "ordered") {
          bump({ kind: "standard", suit: objective.target.suit, rank: objective.target.rank });
        }
      } else if (assignment === "face-down") {
        if (!seated || objective.ownerSeatId !== seatId) hiddenIds.push(objective.id);
      }
    }
  }

  const forbiddenTokens = seed !== undefined ? [seed] : [];
  const ownDraftOffer: readonly string[] | null =
    seated && ownSeat !== undefined && ownSeat.draftOffer !== null ? ownSeat.draftOffer : null;

  const visibleLogEntryCount =
    state.attempt === null
      ? 0
      : state.attempt.log.filter(
          (entry) => entry.audience === "public" || (seated && entry.audience.includes(seatId)),
        ).length;

  return { hiddenIds, allowedIdentityCounts: counts, forbiddenTokens, ownDraftOffer, visibleLogEntryCount };
}

/** Recursively walks `subtree`, collecting structural leak reasons: any
 * object key in FORBIDDEN_VIEW_KEYS, and any string LEAF value, or any of
 * its ":"-separated segments (target choice ids such as `card:<id>`),
 * exactly equal to a hiddenIds entry. Uses Object.keys/the `in` operator
 * (key presence), never a truthiness/undefined comparison. */
function walkStructural(subtree: unknown, hiddenIds: ReadonlySet<string>, reasons: Set<string>): void {
  if (Array.isArray(subtree)) {
    for (const item of subtree) walkStructural(item, hiddenIds, reasons);
    return;
  }
  if (typeof subtree === "string") {
    for (const part of [subtree, ...subtree.split(":")]) {
      if (hiddenIds.has(part)) reasons.add(`structural:hidden-id:${part}`);
    }
    return;
  }
  if (subtree === null || typeof subtree !== "object") return;

  const obj = subtree as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if ((FORBIDDEN_VIEW_KEYS as readonly string[]).includes(key)) {
      reasons.add(`structural:forbidden-key:${key}`);
    }
  }

  for (const value of Object.values(obj)) {
    walkStructural(value, hiddenIds, reasons);
  }
}

/** Separate pass: collects every object reachable in `subtree` carrying
 * either both a `suit` and `rank` key, or a `joker` key (both `in`-checked
 * via typedKeyFromObj), into a multiset. Only an observed count that EXCEEDS
 * secrets.allowedIdentityCounts proves a leak. */
function collectIdentityCounts(subtree: unknown, counts: Map<string, number>): void {
  if (Array.isArray(subtree)) {
    for (const item of subtree) collectIdentityCounts(item, counts);
    return;
  }
  if (subtree === null || typeof subtree !== "object") return;

  const obj = subtree as Record<string, unknown>;
  const key = typedKeyFromObj(obj);
  if (key !== null) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const value of Object.values(obj)) {
    collectIdentityCounts(value, counts);
  }
}

/** Checks a projected Expedition view for leaks of `secrets`: structurally
 * (forbidden-key presence, hidden-id leaf equality), by typed multiset (an
 * excess identity count), by draft-offer/log-entry-count mismatch, and via a
 * raw substring scan of `serialized` for forbidden tokens (the seed).
 * Returns an empty array when clean. Reasons are deduplicated, in
 * first-seen order. */
export function checkExpeditionViewForLeaks(input: {
  view: unknown;
  serialized: string;
  secrets: ExpeditionSeatSecrets;
}): string[] {
  const reasons = new Set<string>();
  const hiddenIds = new Set(input.secrets.hiddenIds);
  walkStructural(input.view, hiddenIds, reasons);

  const counts = new Map<string, number>();
  collectIdentityCounts(input.view, counts);
  for (const [key, count] of counts.entries()) {
    const allowed = input.secrets.allowedIdentityCounts[key] ?? 0;
    if (count > allowed) {
      reasons.add(`typed:identity-count-exceeded:${key}`);
    }
  }

  if (input.view !== null && typeof input.view === "object" && "yourDraftOffer" in input.view) {
    const viewDraftOffer = (input.view as Record<string, unknown>).yourDraftOffer;
    if (JSON.stringify(viewDraftOffer) !== JSON.stringify(input.secrets.ownDraftOffer)) {
      reasons.add("structural:draft-offer-mismatch");
    }
  }

  if (input.view !== null && typeof input.view === "object") {
    const attempt = (input.view as Record<string, unknown>).attempt;
    if (attempt !== null && typeof attempt === "object" && Array.isArray((attempt as Record<string, unknown>).log)) {
      const log = (attempt as Record<string, unknown>).log as unknown[];
      if (log.length !== input.secrets.visibleLogEntryCount) {
        reasons.add("structural:log-entry-count");
      }
    }
  }

  for (const token of input.secrets.forbiddenTokens) {
    if (token.length === 0) continue;
    if (input.serialized.includes(token)) {
      reasons.add("string:forbidden-token");
    }
  }

  return [...reasons];
}
