import type { ExpeditionView } from "@games/rules";
import { SOURCE_DISPLAY } from "@games/rules";
import { BACKPACK_ID, kitObjectId, sourceObjectId } from "./expedition-ids";
import type { LocalUiState } from "./local-ui";
import { isSpent, liveSourceKeys, sourceIdOfKey, sourceKind, sourceName, usesLabel, type SourceKind, type UsesLabel } from "./source-text";

/**
 * Your kit as the bar on the left shows it, in camp and between camps:
 * your item slots, then your character's powers and upgrade. Whether a
 * source can be used is the server's `usableNow`, copied.
 */

/** The upgrade that lets the Pack Rat open the backpack once in camp. */
export const PACK_ANIMAL = "pack-rat.pack-animal";

export interface KitEntry {
  sourceKey: string;
  sourceId: string;
  /** `source:<key>` in camp, `kit:<key>` between camps. */
  objectId: string;
  name: string;
  kind: SourceKind;
  uses: UsesLabel;
  spent: boolean;
  usable: boolean;
  /** Usable and nothing is being aimed: it glows. */
  pulse: boolean;
  /** Being aimed right now. */
  active: boolean;
}

export interface KitBar {
  /** Popped out: each entry shows its name and what is left. */
  open: boolean;
  /** One per item slot, in order: the equipped item, or null when empty. */
  items: (KitEntry | null)[];
  /** The character's powers, the upgrade, then a camp's gift to the crew. */
  powers: KitEntry[];
  /** In camp, the Pack Rat's backpack with Pack Animal, which opens it once
   * per camp; null for everyone else and between camps. */
  backpack: { objectId: string; sourceKey: string; usable: boolean; pulse: boolean; active: boolean } | null;
}

/** Abilities the camp grants every seat (the temple's skip), keyed by the
 * granting modifier's id. */
export function grantedKeys(view: ExpeditionView): string[] {
  const stage = view.stage;
  return stage.tag === "camp" ? stage.mods.flatMap((m) => (SOURCE_DISPLAY[m.id]?.kind === "grant" ? [m.id] : [])) : [];
}

/** Your kit, or null for a spectator or before you have an explorer. */
export function buildKitBar(view: ExpeditionView, ui: LocalUiState): KitBar | null {
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined || you.characterId === null) return null;
  const inCamp = view.stage.tag === "camp";
  const aimed = ui.targeting?.mode === "ability" ? ui.targeting.sourceKey : null;
  const usableNow = (key: string) => view.yourAbilities.some((a) => a.sourceKey === key && a.usableNow);
  const entry = (key: string): KitEntry => {
    const sourceId = sourceIdOfKey(you, key);
    const remaining = you.usage.find((u) => u.sourceKey === key)?.remaining ?? null;
    const usable = usableNow(key);
    return {
      sourceKey: key,
      sourceId,
      objectId: inCamp ? sourceObjectId(key) : kitObjectId(key),
      name: sourceName(sourceId),
      kind: sourceKind(sourceId),
      uses: usesLabel(sourceId, remaining),
      spent: isSpent(remaining),
      usable,
      pulse: usable && ui.targeting === null,
      active: aimed === key,
    };
  };
  const keys = [...liveSourceKeys(you), ...grantedKeys(view)];
  const powers = keys.filter((key) => sourceKind(sourceIdOfKey(you, key)) !== "item").map(entry);
  const slotCount = Math.max(view.yourItemSlots, you.items.equipped.length);
  const items = Array.from({ length: slotCount }, (_, i) => {
    const item = you.items.equipped[i];
    return item === undefined ? null : entry(item.uid);
  });
  const packAnimal = inCamp && you.upgradeId === PACK_ANIMAL;
  const usable = packAnimal && usableNow(PACK_ANIMAL);
  return {
    open: ui.kitOpen,
    items,
    powers,
    backpack: packAnimal ? { objectId: BACKPACK_ID, sourceKey: PACK_ANIMAL, usable, pulse: usable && ui.targeting === null, active: aimed === PACK_ANIMAL } : null,
  };
}
