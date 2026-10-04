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
// Type-only imports from "../run/types" and "../state", except rulesFor: the
// viewer's own hand may count as other identities, which only the composed
// rules can say.

import { identitiesEqual } from "../deck";
import { CATALOG } from "../run/catalog";
import { attemptOf } from "../run/attempt";
import { rulesFor } from "../run/compose";
import { horizon } from "../run/plan";
import { surveyObjectives, surveyedCamps } from "../run/survey";
import type { AttemptState, Catalog, RunState } from "../run/types";
import type { CardIdentity } from "../state";

export interface ExpeditionSeatSecrets {
  /** Card ids (in another seat's still-in-hand cards, not yet revealed to
   * this viewer): string values that must never appear anywhere in this
   * seat's view. */
  readonly hiddenIds: readonly string[];
  /** The {kind}:{suit}:{rank} / {kind}:{joker} identity keys this seat MAY
   * legitimately see, as a multiset. */
  readonly allowedIdentityCounts: Readonly<Record<string, number>>;
  /** Raw strings that must never appear in the serialized view (the server
   * seed). */
  readonly forbiddenTokens: readonly string[];
  /** This seat's own head draft offer (null if unseated or none due). */
  readonly ownDraft: { readonly kind: "standard" | "special"; readonly bundles: readonly (readonly string[])[] } | null;
  /** Other seats' offers' bundle lists, as JSON, that this view must never
   * carry (an equal copy of the viewer's own is not counted). */
  readonly foreignOffers: readonly string[];
  /** The number of attempt log entries this seat may legitimately see. */
  readonly visibleLogEntryCount: number;
  /** Seats whose loadout is kept from this viewer (Heavy fog): their
   * `items.backpack` must be null. */
  readonly concealedSeatIds: readonly string[];
  /** Whether this seat may see a coming camp's objectives; otherwise every
   * preview's `survey` must be null. */
  readonly surveys: boolean;
}

/** Keys a view object literal must never carry, at ANY nesting level. */
export const FORBIDDEN_VIEW_KEYS = ["seed", "objectiveDeck", "offers", "itemSerial", "bosses", "hands", "audience", "ledger"] as const;

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
 * the in-progress trick and the discards. Mirrors view.ts's findCardIdentity exactly
 * (this file must not call view.ts, so it is re-derived here, independently,
 * from RunState). Returns null (never throws) when not found. */
function findCardIdentity(camp: AttemptState["camp"], cardId: string): CardIdentity | null {
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

/** Derives the secrets a given seat's view must never leak, INDEPENDENTLY of
 * the view-projection function (T-11-16). `seed` is passed only when the
 * caller wants the seed substring scan active (mirrors secretsForHanabiSeat's
 * own optional-seed contract). */
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
  // seat more than once (e.g. a Tornado gust, then later a Whisper), and the
  // view's `reveals` array carries one entry per such reveal, not one per
  // distinct card — so the allowed COUNT must bump once per matching
  // reveal, not once per distinct card id.
  const attempt = attemptOf(state);
  const revealsToViewer = attempt !== null && seated ? attempt.reveals.filter((r) => r.audience.includes(seatId) || (r.source === "whisper" && r.fromSeatId === seatId)) : [];
  const revealedToViewer = new Set(revealsToViewer.map((r) => r.cardId));
  // An effect the viewer may read names only ids its owner picked from their
  // own hand or the table; the owner keeps knowing that id after the card
  // moves (a Compass-changed card swapped away), as with a reveal.
  const namedByVisibleEffects = new Set(
    (attempt?.effects ?? [])
      .filter((effect) => effect.audience === "public" || (seated && effect.origin.kind === "seat" && effect.origin.seatId === seatId))
      .flatMap((effect) => Object.values(effect.params).filter((value): value is string => typeof value === "string")),
  );

  const hiddenIds: string[] = [];
  const counts: Record<string, number> = {};
  const bump = (identity: CardIdentity): void => {
    const key = identityKey(identity);
    counts[key] = (counts[key] ?? 0) + 1;
  };

  const rules = rulesFor(state, catalog);
  const camp = attempt?.camp;
  if (camp !== undefined) {
    // A hallucination's cards were played face up, so their ids are public.
    const shownInVoided = new Set(camp.voidedTricks.flatMap((voided) => voided.plays.map((play) => play.card.id)));
    for (const hand of camp.hands) {
      if (hand.seatId === seatId) {
        if (seated) {
          for (const card of hand.cards) {
            bump(card.identity);
            const identity = rules.identityOf(card);
            if (!identitiesEqual(identity, card.identity)) bump(identity);
          }
        }
        continue;
      }
      for (const card of hand.cards) {
        if (!revealedToViewer.has(card.id) && !namedByVisibleEffects.has(card.id) && !shownInVoided.has(card.id)) hiddenIds.push(card.id);
      }
    }

    for (const reveal of revealsToViewer) {
      const identity = findCardIdentity(camp, reveal.cardId);
      if (identity !== null) bump(identity);
    }

    for (const trick of camp.completedTricks) {
      for (const play of trick.plays) {
        bump(play.card.identity);
        if (play.countsAs !== null) bump(play.countsAs);
      }
    }
    // A face-down play's identity is not the viewer's, and its id is hidden
    // unless the viewer was shown the card; a public effect naming it does
    // not count, since the table can't see what it names.
    const trick = camp.currentTrick;
    trick.plays.forEach((play, position) => {
      if (!rules.hides(state, seatId, { kind: "play", trickIndex: trick.index, position, seatId: play.seatId })) {
        bump(play.card.identity);
        const identity = rules.identityOf(play.card);
        if (!identitiesEqual(identity, play.card.identity)) bump(identity);
      } else if (!revealedToViewer.has(play.card.id)) hiddenIds.push(play.card.id);
    });
    for (const discard of camp.discards) bump(discard.card.identity);
    // A hallucination was played face up; its cards are back in their hands.
    for (const voided of camp.voidedTricks) for (const play of voided.plays) bump(play.card.identity);

    for (const identity of camp.removedCards) bump(identity);

    for (const objective of camp.objectives) {
      if (rules.hides(state, seatId, { kind: "objective", objectiveId: objective.id })) continue;
      if (objective.kind === "win-card" || objective.kind === "ordered") bump(objective.target);
    }
  }

  // Under fog another seat's items stay hidden until used this attempt.
  const stamp = state.stage.tag === "camp" ? { camp: state.stage.camp.index, attempt: state.stage.attempt.attemptNumber } : null;
  const concealedSeatIds: string[] = [];
  for (const seat of state.seats) {
    if (!rules.hides(state, seatId, { kind: "loadout", seatId: seat.seatId })) continue;
    concealedSeatIds.push(seat.seatId);
    const used = new Set(
      seat.ledger.flatMap((entry) => (entry.kind === "used" && stamp !== null && entry.at.camp === stamp.camp && entry.at.attempt === stamp.attempt ? [entry.sourceKey] : [])),
    );
    for (const item of seat.items) {
      if (!seat.equipped.includes(item.uid) || !used.has(item.uid)) hiddenIds.push(item.uid);
    }
  }

  // A planned boss is a secret until a route preview leads the crew to its
  // camp, and so is the boss a route option would swap in further on.
  for (const boss of state.plan?.bosses ?? []) {
    if (boss.modId !== null && boss.tier !== "temple" && boss.at > horizon(state)) hiddenIds.push(boss.modId);
  }
  for (const option of state.stage.tag === "route" ? state.stage.options : []) {
    if (option.swapBoss !== null && option.swapBoss.at > horizon(state)) hiddenIds.push(option.swapBoss.modId);
  }

  // A seat that surveys sees each previewed camp's coming objectives.
  const surveys = seated && rules.surveys(state, seatId);
  if (surveys) {
    for (const surveyed of surveyedCamps(state)) {
      for (const objective of surveyObjectives(surveyed, catalog)) {
        if (objective.kind === "win-card" || objective.kind === "ordered") bump(objective.target);
      }
    }
  }

  const forbiddenTokens = seed !== undefined ? [seed] : [];
  const ownHead = seated ? ownSeat?.offers[0] : undefined;
  const ownDraft = ownHead === undefined ? null : { kind: ownHead.kind, bundles: ownHead.bundles };
  const ownJson = ownDraft === null ? null : JSON.stringify(ownDraft.bundles);
  const foreignOffers = state.seats
    .filter((seat) => !seated || seat.seatId !== seatId)
    .flatMap((seat) => seat.offers.map((offer) => JSON.stringify(offer.bundles)))
    .filter((json) => json !== ownJson);

  const visibleLogEntryCount =
    attempt === null
      ? 0
      : attempt.log.filter(
          (entry) => entry.audience === "public" || (seated && entry.audience.includes(seatId)),
        ).length;

  return { hiddenIds, allowedIdentityCounts: counts, forbiddenTokens, ownDraft, foreignOffers, visibleLogEntryCount, concealedSeatIds, surveys };
}

/** Recursively walks `subtree`, collecting structural leak reasons: any
 * object key in FORBIDDEN_VIEW_KEYS, any string LEAF value, or any of its
 * ":"-separated segments (target choice ids such as `card:<id>`), exactly
 * equal to a hiddenIds entry, and any array equal to another seat's offer's
 * bundles. Uses Object.keys/the `in` operator (key presence), never a
 * truthiness/undefined comparison. */
function walkStructural(subtree: unknown, hiddenIds: ReadonlySet<string>, foreignOffers: ReadonlySet<string>, surveys: boolean, reasons: Set<string>): void {
  if (Array.isArray(subtree)) {
    if (foreignOffers.size > 0 && foreignOffers.has(JSON.stringify(subtree))) reasons.add("structural:foreign-offer");
    for (const item of subtree) walkStructural(item, hiddenIds, foreignOffers, surveys, reasons);
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
  if (!surveys && "survey" in obj && obj.survey !== null) reasons.add("structural:survey");

  for (const value of Object.values(obj)) {
    walkStructural(value, hiddenIds, foreignOffers, surveys, reasons);
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
 * excess identity count), by draft-offer/log-entry-count mismatch, by another
 * seat's offer anywhere in the view, and via a
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
  walkStructural(input.view, hiddenIds, new Set(input.secrets.foreignOffers), input.secrets.surveys, reasons);

  const counts = new Map<string, number>();
  collectIdentityCounts(input.view, counts);
  for (const [key, count] of counts.entries()) {
    const allowed = input.secrets.allowedIdentityCounts[key] ?? 0;
    if (count > allowed) {
      reasons.add(`typed:identity-count-exceeded:${key}`);
    }
  }

  const stage = input.view !== null && typeof input.view === "object" ? (input.view as Record<string, unknown>).stage : undefined;
  if (stage !== null && typeof stage === "object" && "yourOffer" in stage) {
    const viewDraftOffer = (stage as Record<string, unknown>).yourOffer;
    if (JSON.stringify(viewDraftOffer) !== JSON.stringify(input.secrets.ownDraft)) {
      reasons.add("structural:draft-offer-mismatch");
    }
  }

  if (stage !== null && typeof stage === "object") {
    const attempt = (stage as Record<string, unknown>).attempt;
    if (attempt !== null && typeof attempt === "object" && Array.isArray((attempt as Record<string, unknown>).log)) {
      const log = (attempt as Record<string, unknown>).log as unknown[];
      if (log.length !== input.secrets.visibleLogEntryCount) {
        reasons.add("structural:log-entry-count");
      }
    }
  }

  const seats = input.view !== null && typeof input.view === "object" ? (input.view as Record<string, unknown>).seats : undefined;
  if (Array.isArray(seats)) {
    for (const seat of seats as Record<string, unknown>[]) {
      const items = seat.items as Record<string, unknown> | undefined;
      if (input.secrets.concealedSeatIds.includes(String(seat.seatId)) && items?.backpack !== null) reasons.add("structural:fogged-backpack");
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
