// Camp modifiers: locations, weathers, pairings, bosses and the temple are
// all one def type. A def's `full` body (and a boss's `half` body, for its
// return as a temple helper) uses whichever channels its mechanic needs:
// `rules` for a question the engine asks, `on` for something that happens
// at a moment (returning toolkit ops), `effect` for the layer an
// `add-modifier` from `on` switches on, `slots` for the camp's objective
// slots, and `status` for public table state.

import type { RuleModifier, RunRules } from "../../run/run-rules";
import type { EngineEvent, EngineEventType } from "../../run/react";
import type { CampSpec, SlotTemplate } from "../../run/route";
import type { ToolkitOp } from "../../run/toolkit";
import type { ActiveEffect, RunState } from "../../run/types";
import type { CampState, Suit } from "../../state";

/** Also the web art id. */
export type ModId = string;
export type ModKind = "location" | "weather" | "pairing" | "animal" | "disaster" | "temple";
export type Strength = "full" | "half";

export type ModCtx = {
  readonly run: RunState;
  readonly spec: CampSpec;
  readonly strength: Strength;
  /** null in the loadout, before the deal. */
  readonly camp: CampState | null;
  /** Seeded 0..n-1 on expedition-mod:{id}:{strength}:camp{k}:attempt{a}:rule:{label}.
   * The same label gives the same value within an attempt. */
  roll(label: string, n: number): number;
};

export type ReactionCtx<E extends EngineEventType = EngineEventType> = ModCtx & {
  readonly camp: CampState;
  readonly event: Extract<EngineEvent, { readonly type: E }>;
  readonly rules: RunRules;
  /** Seeded 0..n-1, numbered per call: ...:on:{eventKey}:draw{j}. */
  draw(n: number): number;
  /** Seeded. Up to n distinct card ids from that seat's hand. */
  randomCards(seatId: string, n: number): readonly string[];
};

export type Reactions = { readonly [E in EngineEventType]?: (ctx: ReactionCtx<E>) => readonly ToolkitOp[] };

/** Public table state. Carries no card id or identity by type, and reads
 * only the current trick. */
export type StatusPart =
  | { readonly kind: "chance"; readonly percent: number; readonly strikesLeft: number } // Thunderstorm: the next trick's chance
  | { readonly kind: "strike" } // a strike sits on this trick
  | { readonly kind: "meter"; readonly left: number; readonly of: number } // Flooding: tricks left before the river floods
  | { readonly kind: "facing"; readonly seatId: string } // Crocodile: the seat it watches this trick
  | { readonly kind: "dam"; readonly suit: Suit } // Beaver: the suit dammed this trick
  | { readonly kind: "streak"; readonly seatId: string; readonly count: number } // Tiger: the last winner's run of tricks
  | { readonly kind: "bitten"; readonly seatId: string; readonly tricksLeft: number }; // Snake: a bite counting this trick

export type ModBody = {
  readonly rules?: (ctx: ModCtx) => RuleModifier;
  readonly on?: Reactions;
  /** Required if and only if `on` can emit add-modifier. */
  readonly effect?: (effect: ActiveEffect, ctx: ModCtx) => RuleModifier;
  readonly slots?: (prev: readonly SlotTemplate[]) => readonly SlotTemplate[];
  readonly status?: (ctx: ModCtx) => readonly StatusPart[];
};

type DefBase<K extends ModKind> = {
  readonly id: ModId;
  readonly kind: K;
  readonly name: string;
  /** One sentence. */
  readonly text: string;
  /** Route draw weight; 0 is never drawn. */
  readonly weight: number;
  readonly full: ModBody;
};
export type LocationDef = DefBase<"location"> & {
  /** Percent chance of fair weather here; NORMAL_WEATHER_CHANCE when absent. */
  readonly normalWeatherChance?: number;
};
export type BossDef = DefBase<"animal" | "disaster"> & { readonly half: ModBody };
export type ModDef = LocationDef | DefBase<"weather"> | DefBase<"pairing"> | BossDef | DefBase<"temple">;

export function defineMod<D extends Exclude<ModDef, BossDef>>(def: D): D {
  return def;
}

export function defineBoss(def: BossDef): BossDef {
  return def;
}

/** The body a def plays at `strength`. Only a boss has a half body. */
export function bodyOf(def: ModDef, strength: Strength): ModBody {
  if (strength === "full") return def.full;
  if (def.kind !== "animal" && def.kind !== "disaster") throw new Error(`mods: "${def.id}" has no half body`);
  return def.half;
}
