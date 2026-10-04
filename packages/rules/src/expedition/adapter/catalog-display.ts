// A phaser-free, function-free display catalogue of the sources, exported from @games/rules for the web client. This is an explicit
// ALLOWLIST projection: it never carries a function or a RuleModifier, so
// JSON.parse(JSON.stringify(v)) deep-equals v for every value. Window and
// limit badges come from the defs, so a source's text never repeats them.
//
// This file lives under adapter/ because purity.test.ts's Core fence forbids
// top-level files from importing ./run.

import { resolveTuned, type ActiveAbility, type CharacterDef, type Owner, type SourceDef } from "../content/source-def";
import { CATALOG } from "../run/catalog";
import type { TargetKind } from "../run/targets";
import { WINDOWS, type ActiveWindow } from "../run/windows";

export type ExpeditionTargetKind = TargetKind;
export type ExpeditionActiveWindow = ActiveWindow;

export type SourceActiveDisplay = {
  window: ActiveWindow;
  /** Badge text, e.g. "Between tricks". */
  windowPhrase: string;
  /** Badge text for the base limit, e.g. "1 per camp", "1 herb". */
  limitBadge: string;
  targets: ExpeditionTargetKind[];
};

export type SourceDisplay = {
  id: string;
  name: string;
  text: string;
  kind: "character" | "upgrade" | "item";
  /** The character a power or upgrade belongs to; null for items. */
  characterId: string | null;
  /** null for a source with no active ability. */
  active: SourceActiveDisplay | null;
  passive: boolean;
};

export type CharacterDisplay = {
  id: string;
  name: string;
  theme: string;
  /** The base power's name: "Spyglass". */
  power: string;
  pool: { name: string; start: number; max: number } | null;
  upgradeIds: string[];
};

/** Badges show the untuned limit: an owner with no upgrades. */
const BASE_OWNER: Owner = { seatId: "", hasUpgrade: () => false };

function characterOf(def: SourceDef): CharacterDef | null {
  if (def.kind === "character") return def;
  if (def.kind === "upgrade") return CATALOG.characters[def.characterId] ?? null;
  return null;
}

function limitBadge(active: ActiveAbility, character: CharacterDef | null): string {
  const limit = resolveTuned(active.limit, BASE_OWNER);
  switch (limit.kind) {
    case "per-camp":
      return `${limit.times} per camp`;
    case "per-run":
      return limit.times === 1 ? "Once per run" : `${limit.times} per run`;
    case "single-use":
      return "Single use";
    case "pool": {
      const name = (character?.pool?.name ?? "pool").toLowerCase();
      return `${limit.cost} ${limit.cost === 1 && name.endsWith("s") ? name.slice(0, -1) : name}`;
    }
    case "supplies":
      return `${limit.cost} ${limit.cost === 1 ? "supply" : "supplies"}`;
  }
}

function toSourceDisplay(def: SourceDef): SourceDisplay {
  const character = characterOf(def);
  return {
    id: def.id,
    name: def.name,
    text: def.text,
    kind: def.kind,
    characterId: character?.id ?? null,
    active:
      def.active === undefined
        ? null
        : {
            window: def.active.window,
            windowPhrase: WINDOWS[def.active.window].phrase,
            limitBadge: limitBadge(def.active, character),
            targets: def.active.targets.map((spec) => spec.kind),
          },
    passive: def.passive !== undefined,
  };
}

export const SOURCE_DISPLAY: Readonly<Record<string, SourceDisplay>> = Object.fromEntries(
  Object.values(CATALOG.sources).map((def) => [def.id, toSourceDisplay(def)]),
);

export const CHARACTER_DISPLAY: Readonly<Record<string, CharacterDisplay>> = Object.fromEntries(
  Object.values(CATALOG.characters).map((def) => [
    def.id,
    {
      id: def.id,
      name: def.name,
      theme: def.theme,
      power: def.power,
      pool: def.pool === undefined ? null : { name: def.pool.name, start: def.pool.start, max: def.pool.max },
      upgradeIds: def.upgrades.map((upgrade) => upgrade.id),
    },
  ]),
);
