// Item rarity as the client shows it: three tiers. Rarity follows the
// strength of an item's effect (see the rules package's PRICE_BANDS).

import { SOURCE_DISPLAY } from "@games/rules";

export type ItemRarity = "common" | "uncommon" | "rare";

/** The rarity of the item `sourceId` names; common for anything else. */
export function rarityOf(sourceId: string | null | undefined): ItemRarity {
  if (sourceId === null || sourceId === undefined) return "common";
  return SOURCE_DISPLAY[sourceId]?.item?.rarity ?? "common";
}

/** "Common item" / "Uncommon item" / "Rare item". */
export function rarityItemLabel(rarity: ItemRarity): string {
  return `${rarity[0]!.toUpperCase()}${rarity.slice(1)} item`;
}

/** The badge word of a tier worth a badge: null for common. */
export function rarityTag(rarity: ItemRarity): string | null {
  return rarity === "common" ? null : rarity === "rare" ? "Rare" : "Uncommon";
}
