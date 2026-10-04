// The production CATALOG: the characters (with their powers and upgrades),
// the items and the camp modifiers. buildCatalog flattens every source
// into one index; tests build their own catalogues through it.

import { CHARACTERS } from "../content/characters/registry";
import { ITEMS } from "../content/items/registry";
import { MODS } from "../content/mods/registry";
import { PAIRINGS, type PairingRule } from "../content/mods/pairings";
import type { ModDef } from "../content/mods/mod-def";
import type { CharacterDef, ItemDef, SourceDef } from "../content/source-def";
import type { Catalog } from "./types";

export function buildCatalog(parts: {
  readonly characters: Readonly<Record<string, CharacterDef>>;
  readonly items: Readonly<Record<string, ItemDef>>;
  readonly mods: Readonly<Record<string, ModDef>>;
  readonly pairings: readonly PairingRule[];
}): Catalog {
  const sources: Record<string, SourceDef> = {};
  const add = (def: SourceDef): void => {
    if (sources[def.id] !== undefined) throw new Error(`buildCatalog: duplicate source id "${def.id}"`);
    sources[def.id] = def;
  };
  for (const character of Object.values(parts.characters)) {
    add(character);
    for (const power of character.powers) add(power);
    for (const upgrade of character.upgrades) add(upgrade);
  }
  for (const item of Object.values(parts.items)) add(item);
  for (const [id, mod] of Object.entries(parts.mods)) {
    if (mod.id !== id) throw new Error(`buildCatalog: mod "${mod.id}" is registered as "${id}"`);
  }
  return { characters: parts.characters, items: parts.items, mods: parts.mods, pairings: parts.pairings, sources };
}

export const CATALOG: Catalog = buildCatalog({ characters: CHARACTERS, items: ITEMS, mods: MODS, pairings: PAIRINGS });
