/**
 * The phaser-free source of truth for card-pack ids (SCENE-08). Plan 12-06's
 * Phaser card-pack registry is typed `satisfies Readonly<Record<CardPackId,
 * CardPackDef>>` against `CardPackId` below, so a missing pack registration
 * is a compile error rather than a silent runtime gap.
 */

export const CARD_PACK_IDS = ["big-index", "classic"] as const;

export type CardPackId = (typeof CARD_PACK_IDS)[number];

export const DEFAULT_CARD_PACK_ID: CardPackId = "big-index";

export const CARD_PACK_LABELS: Readonly<Record<CardPackId, string>> = {
  "big-index": "Big Index",
  classic: "Classic",
};

/** True for exactly the two known card-pack ids. Any other string (or
 * non-string) is not a `CardPackId`. */
export function isCardPackId(value: unknown): value is CardPackId {
  return typeof value === "string" && (CARD_PACK_IDS as readonly string[]).includes(value);
}
