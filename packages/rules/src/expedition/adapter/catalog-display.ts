// A phaser-free, function-free display catalogue of the sources, exported from @games/rules for the web client. This is an explicit
// ALLOWLIST projection: it never carries a function or a RuleModifier, so
// JSON.parse(JSON.stringify(v)) deep-equals v for every value. Window and
// limit badges come from the defs, so a source's text never repeats them.
//
// This file lives under adapter/ because purity.test.ts's Core fence forbids
// top-level files from importing ./run.

import { resolveTuned, type CharacterDef, type ItemUses, type Owner, type Rarity, type SourceDef, type UsageLimit } from "../content/source-def";
import { CATALOG } from "../run/catalog";
import type { TargetKind } from "../run/targets";
import { WINDOWS, type ActiveWindow } from "../run/windows";
import { RUN_LENGTHS } from "../run/balance";
import type { BossTier } from "../run/plan";
import type { RunLength } from "../run/types";
import { EVENTS } from "../content/events/registry";
import type { ModKind } from "../content/mods/mod-def";

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

export type ItemDisplay = {
  rarity: Rarity;
  price: number;
  /** "Single use", "Once per camp", "2 charges"; null for a passive item. */
  uses: string | null;
  /** How the uses come back, for phrasing what is left; null for a passive item. */
  usesKind: ItemUses["kind"] | null;
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
  /** null for a character or an upgrade. */
  item: ItemDisplay | null;
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

function usesBadge(uses: ItemUses): string {
  switch (uses.kind) {
    case "single-use":
      return "Single use";
    case "per-camp":
      return "Once per camp";
    case "charges":
      return `${uses.n} charges`;
  }
}

function limitBadge(limit: UsageLimit, character: CharacterDef | null): string {
  switch (limit.kind) {
    case "per-camp":
      return `${limit.times} per camp`;
    case "per-run":
      return limit.times === 1 ? "Once per run" : `${limit.times} per run`;
    case "pool": {
      const name = (character?.pool?.name ?? "pool").toLowerCase();
      return `${limit.cost} ${limit.cost === 1 && name.endsWith("s") ? name.slice(0, -1) : name}`;
    }
    case "supplies":
      return `${limit.cost} ${limit.cost === 1 ? "supply" : "supplies"}`;
  }
}

function badgeOf(def: SourceDef, character: CharacterDef | null): string {
  if (def.kind === "item") return def.uses === undefined ? "" : usesBadge(def.uses);
  return def.active === undefined ? "" : limitBadge(resolveTuned(def.active.limit, BASE_OWNER), character);
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
            limitBadge: badgeOf(def, character),
            targets: def.active.targets.map((spec) => spec.kind),
          },
    passive: def.passive !== undefined,
    item:
      def.kind === "item"
        ? { rarity: def.rarity, price: def.price, uses: def.uses === undefined ? null : usesBadge(def.uses), usesKind: def.uses?.kind ?? null }
        : null,
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

export type RunLengthDisplay = {
  id: RunLength;
  name: string;
  camps: number;
  bossCamps: { at: number; tier: BossTier }[];
};

function lengthDisplay(id: RunLength, name: string): RunLengthDisplay {
  return { id, name, camps: RUN_LENGTHS[id].camps, bossCamps: RUN_LENGTHS[id].bossCamps.map((b) => ({ at: b.at, tier: b.tier })) };
}

export const RUN_LENGTH_DISPLAY: Readonly<Record<RunLength, RunLengthDisplay>> = {
  short: lengthDisplay("short", "Short"),
  standard: lengthDisplay("standard", "Standard"),
  long: lengthDisplay("long", "Long"),
};

export type EventDisplay = { id: string; name: string; text: string };

export const EVENT_DISPLAY: Readonly<Record<string, EventDisplay>> = Object.fromEntries(
  Object.values(EVENTS).map((def) => [def.id, { id: def.id, name: def.name, text: def.text }]),
);

export type ModDisplay = { id: string; name: string; text: string; kind: ModKind };

export const MOD_DISPLAY: Readonly<Record<string, ModDisplay>> = Object.fromEntries(
  Object.values(CATALOG.mods).map((def) => [def.id, { id: def.id, name: def.name, text: def.text, kind: def.kind }]),
);
