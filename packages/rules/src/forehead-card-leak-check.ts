// The SINGLE leak checker used by all three D-11 layers: this package's own
// adapter property test (forehead-card.property.test.ts, layer 1),
// apps/worker's wire-level property test (layer 2), and apps/worker's
// wrangler-dev integration test capturing real socket frames (layer 3).
// Reusing the exact same checker across all three is what makes the D-13
// canary suite evidence about every layer at once, not just this one.
//
// Type-only import from "./forehead-card" and nothing else — this module
// stays zero-runtime-dependency, per packages/rules' FDN-02 rule.

import type { ForeheadCardState } from "./forehead-card";

export interface SeatSecrets {
  readonly ownCard: { readonly id: string; readonly value: string } | null;
  readonly forbiddenTokens: readonly string[];
}

/** Derives the secrets a given seat's view must never leak: its own card
 * (identity + value), the undealt deck values, and the server seed (D-14).
 * `ownCard` is null for a seat that is not (or no longer) seated. */
export function secretsForSeat(
  state: ForeheadCardState,
  seatId: string,
  seed: string | undefined,
): SeatSecrets {
  const hand = state.hands.find((h) => h.seatId === seatId);
  const ownCard = hand === undefined ? null : { id: hand.card.id, value: hand.card.value };
  const forbiddenTokens: string[] = [...state.deck];
  if (seed !== undefined) forbiddenTokens.push(seed);
  return { ownCard, forbiddenTokens };
}

/** Recursively walks `subtree`, collecting structural leak reasons. Uses the
 * `in` operator (key presence), never a truthiness/undefined comparison
 * (D-12) — `JSON.stringify` silently drops `undefined`-valued keys, so a
 * truthiness check would miss a card built with `value: undefined` instead
 * of correctly omitted. */
function walkStructural(subtree: unknown, secrets: SeatSecrets, reasons: Set<string>): void {
  if (Array.isArray(subtree)) {
    for (const item of subtree) walkStructural(item, secrets, reasons);
    return;
  }
  if (subtree === null || typeof subtree !== "object") return;

  const obj = subtree as Record<string, unknown>;

  if ("yourCard" in obj) {
    const yourCard = obj.yourCard;
    if (yourCard !== null && typeof yourCard === "object" && "value" in yourCard) {
      reasons.add("structural:yourCard-has-value");
    }
  }

  if (obj.hidden === true && "value" in obj) {
    reasons.add("structural:hidden-card-has-value");
  }

  if (secrets.ownCard !== null && obj.id === secrets.ownCard.id && "value" in obj) {
    reasons.add("structural:own-card-id-has-value");
  }

  for (const value of Object.values(obj)) {
    walkStructural(value, secrets, reasons);
  }
}

/** Checks a projected seat view for leaks of `secrets`, both structurally
 * (own-card-identity/hidden-card key presence, walked recursively over the
 * pre-stringify object) and via a raw substring scan of `serialized` (the
 * actual string that would be sent over the wire). Returns an empty array
 * when clean. Reasons are deduplicated, in first-seen order. */
export function checkSeatViewForLeaks(input: {
  view: unknown;
  serialized: string;
  secrets: SeatSecrets;
}): string[] {
  const reasons = new Set<string>();
  walkStructural(input.view, input.secrets, reasons);

  if (
    input.secrets.ownCard !== null &&
    input.secrets.ownCard.value.length > 0 &&
    input.serialized.includes(input.secrets.ownCard.value)
  ) {
    reasons.add("string:own-value");
  }

  for (const token of input.secrets.forbiddenTokens) {
    if (token.length === 0) continue;
    if (input.serialized.includes(token)) {
      reasons.add(`string:forbidden-token:${token}`);
    }
  }

  return [...reasons];
}
