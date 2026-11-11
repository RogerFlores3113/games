import { PALETTE } from "../palette";
import type { ItemRarity } from "../../../../lib/expedition/rarity";

/** Rare keeps the blue it always had; uncommon reuses the connected green. */
export function rarityColor(rarity: ItemRarity, common: string = PALETTE.textDim): string {
  return rarity === "rare" ? PALETTE.rain : rarity === "uncommon" ? PALETTE.statusConnected : common;
}
