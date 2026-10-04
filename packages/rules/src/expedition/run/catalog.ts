// The production CATALOG: the six characters (with their upgrades) and the
// thirteen items. buildCatalog flattens every source
// into one index; tests build their own catalogues through it.

import { CHARACTERS } from "../content/characters/registry";
import { ITEMS } from "../content/items/registry";
import type { CharacterDef, ItemDef, SourceDef } from "../content/source-def";
import type { Catalog } from "./types";

export function buildCatalog(parts: {
  readonly characters: Readonly<Record<string, CharacterDef>>;
  readonly items: Readonly<Record<string, ItemDef>>;
}): Catalog {
  const sources: Record<string, SourceDef> = {};
  const add = (def: SourceDef): void => {
    if (sources[def.id] !== undefined) throw new Error(`buildCatalog: duplicate source id "${def.id}"`);
    sources[def.id] = def;
  };
  for (const character of Object.values(parts.characters)) {
    add(character);
    for (const upgrade of character.upgrades) add(upgrade);
  }
  for (const item of Object.values(parts.items)) add(item);
  return { characters: parts.characters, items: parts.items, sources };
}

export const CATALOG: Catalog = buildCatalog({ characters: CHARACTERS, items: ITEMS });
