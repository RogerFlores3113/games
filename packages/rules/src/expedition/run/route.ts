// Camp specs and the routes between them. A spec is what a camp is
// (location, weather, its objective slots), fixed when the route is chosen,
// so a failed camp replays the same spec.

import type { ModDef, ModId } from "../content/mods/mod-def";
import type { ObjectiveSlot } from "../state";
import { BOTH_MIX_MIN_SLOTS, MIX_FROM_CAMP, NORMAL_WEATHER_CHANCE, OBJECTIVE_RAMP, ROUTE_OPTIONS } from "./balance";
import { rulesFor } from "./compose";
import { bossPool, campIndex, type RunPlan } from "./plan";
import { STREAMS, seededIndex } from "./rng";
import { campSlots, pairingRuleFor } from "./stack";
import type { CampIndex, Catalog, RunAt, RunLength, RunState } from "./types";

/** A trick-count slot resolves to no-tricks or exactly-n once per attempt. */
export type SlotTemplate = ObjectiveSlot | { readonly kind: "trick-count" };

export type CampSpec = {
  readonly index: CampIndex;
  readonly location: ModId;
  readonly weather: ModId;
  readonly slots: readonly SlotTemplate[];
};

export type RouteChoice = "a" | "b" | "c";
/** The boss a route puts at a later boss camp in place of the planned one. */
export type SwappedBoss = { readonly at: CampIndex; readonly modId: ModId };
/** `reroll` counts how often its location and weather were drawn again;
 * `swapBoss`, when set, rewrites the plan once the route is chosen. */
export type RouteOption = { readonly id: RouteChoice; readonly next: CampSpec; readonly reroll: number; readonly swapBoss: SwappedBoss | null };

const ROUTE_CHOICES: readonly RouteChoice[] = ["a", "b", "c"];

type Mix = "plain" | "ordered" | "trick-count" | "both";

const FIRST_LOCATION = "jungle";
/** The weather a route rolls at its location's normal chance. */
export const FAIR_WEATHER = "fair";

function slotsFor(count: number, mix: Mix): SlotTemplate[] {
  const ordered: SlotTemplate[] = mix === "ordered" || mix === "both" ? [{ kind: "ordered", order: 1 }, { kind: "ordered", order: 2 }] : [];
  const trickCount: SlotTemplate[] = mix === "trick-count" || mix === "both" ? [{ kind: "trick-count" }] : [];
  const winCards: SlotTemplate[] = Array.from({ length: count - ordered.length - trickCount.length }, () => ({ kind: "win-card" }));
  return [...ordered, ...winCards, ...trickCount];
}

export function planOf(run: RunState): NonNullable<RunState["plan"]> {
  if (run.plan === null) throw new Error("route: the run has no plan before the length vote");
  return run.plan;
}

/** Camp 1: the Jungle in fair weather, every slot a win-card. */
export function firstCampSpec(length: RunLength): CampSpec {
  const index = campIndex(1);
  return { index, location: FIRST_LOCATION, weather: FAIR_WEATHER, slots: slotsFor(OBJECTIVE_RAMP[length][0]!, "plain") };
}

/** One def by weight: ids sorted, a seeded index into the summed weights.
 * null when no def has weight. */
function drawWeighted(seed: string, stream: string, defs: readonly ModDef[]): ModDef | null {
  const pool = defs.filter((def) => def.weight > 0).sort((a, b) => (a.id < b.id ? -1 : 1));
  const total = pool.reduce((sum, def) => sum + def.weight, 0);
  if (total === 0) return null;
  let at = seededIndex(seed, stream, total);
  return pool.find((def) => (at -= def.weight) < 0)!;
}

/** What the crew's rules say about the routes a vote offers. */
type RouteRules = {
  readonly fairChance: (locationChance: number) => number;
  readonly count: (seeded: number) => number;
  readonly swapsBoss: (option: number) => boolean;
};
const BASE_ROUTE_RULES: RouteRules = { fairChance: (chance) => chance, count: (n) => n, swapsBoss: () => false };

function routeRules(run: RunState, catalog: Catalog): RouteRules {
  const rules = rulesFor(run, catalog);
  return {
    fairChance: (chance) => rules.normalWeatherChance(run, chance),
    count: (n) => rules.routeOptionCount(run, n),
    swapsBoss: (option) => rules.swapsBoss(run, option),
  };
}

/** A location by weight; fair at its normal chance (as the crew's rules
 * shift it), else a weighted weather that no "never" pairing keeps from it
 * (none left: fair). */
function drawPlace(seed: string, next: CampIndex, reroll: number, option: number, catalog: Catalog, fairChance: RouteRules["fairChance"]): { readonly location: ModId; readonly weather: ModId } {
  const mods = Object.values(catalog.mods);
  const location = drawWeighted(seed, STREAMS.routeField(next, reroll, option, "location"), mods.filter((def) => def.kind === "location"));
  if (location === null) throw new Error("route: the catalogue has no location to draw");
  const chance = fairChance(location.kind === "location" ? (location.normalWeatherChance ?? NORMAL_WEATHER_CHANCE) : NORMAL_WEATHER_CHANCE);
  if (seededIndex(seed, STREAMS.routeField(next, reroll, option, "fair"), 100) < chance) return { location: location.id, weather: FAIR_WEATHER };
  const weathers = mods.filter((def) => def.kind === "weather" && pairingRuleFor(location.id, def.id, catalog)?.result !== "never");
  const weather = drawWeighted(seed, STREAMS.routeField(next, reroll, option, "weather"), weathers);
  return { location: location.id, weather: weather?.id ?? FAIR_WEATHER };
}

/** The next animal or disaster boss camp from `next` on, with another boss
 * of its tier in place of the planned one; null when there is none to swap. */
function drawSwap(seed: string, plan: RunPlan, next: CampIndex, option: number, catalog: Catalog): SwappedBoss | null {
  const boss = plan.bosses.find((b) => b.at >= next && b.tier !== "temple" && b.modId !== null);
  if (boss === undefined) return null;
  const others = bossPool(boss.tier, catalog).filter((id) => id !== boss.modId);
  if (others.length === 0) return null;
  return { at: boss.at, modId: others[seededIndex(seed, STREAMS.routeField(next, 0, option, "boss"), others.length)]! };
}

const MAX_OPTIONS = 3;

function optionsAfter(seed: string, plan: RunPlan, cleared: CampIndex, catalog: Catalog, rules: RouteRules): readonly RouteOption[] {
  const length = plan.length;
  const next = campIndex(cleared + 1);
  const count = rules.count(ROUTE_OPTIONS.min + seededIndex(seed, STREAMS.routeCount(next), ROUTE_OPTIONS.max - ROUTE_OPTIONS.min + 1));
  if (!Number.isInteger(count) || count < 1 || count > MAX_OPTIONS) throw new Error(`route: routeOptionCount gave ${count}, outside 1 to ${MAX_OPTIONS}`);
  const slotCount = OBJECTIVE_RAMP[length][next - 1]!;
  const mixes: readonly Mix[] = next < MIX_FROM_CAMP ? ["plain"] : ["plain", "ordered", "trick-count", ...(slotCount >= BOTH_MIX_MIN_SLOTS ? (["both"] as const) : [])];
  return ROUTE_CHOICES.slice(0, count).map((id, i) => {
    const place = drawPlace(seed, next, 0, i, catalog, rules.fairChance);
    const mix = mixes[seededIndex(seed, STREAMS.routeField(next, 0, i, "mix"), mixes.length)]!;
    const swapBoss = rules.swapsBoss(i) ? drawSwap(seed, plan, next, i, catalog) : null;
    return { id, next: { index: next, location: place.location, weather: place.weather, slots: slotsFor(slotCount, mix) }, reroll: 0, swapBoss };
  });
}

/** 2 or 3 options to the camp after `from` (seeded count, then the crew's
 * routeOptionCount), each with a location by weight, its weather and, from
 * MIX_FROM_CAMP on, a seeded objective mix; an option the crew's swapsBoss
 * names also leads to a different boss. */
export function routeOptions(run: RunState, from: CampIndex, catalog: Catalog): readonly RouteOption[] {
  return optionsAfter(run.seed, planOf(run), from, catalog, routeRules(run, catalog));
}

/** The option with its location and weather drawn again on the next
 * reroll's streams; its objective mix and any boss swap stay. */
export function rerollOption(run: RunAt<"route">, choice: RouteChoice, catalog: Catalog): RunAt<"route"> {
  const i = run.stage.options.findIndex((o) => o.id === choice);
  const option = run.stage.options[i];
  if (option === undefined) throw new Error(`route: no option ${choice} to reroll`);
  const reroll = option.reroll + 1;
  const next = option.next.index;
  const place = drawPlace(run.seed, next, reroll, i, catalog, routeRules(run, catalog).fairChance);
  const rerolled: RouteOption = { ...option, reroll, next: { ...option.next, location: place.location, weather: place.weather } };
  return { ...run, stage: { ...run.stage, options: run.stage.options.map((o) => (o.id === choice ? rerolled : o)) } };
}

/** The plan once a route is taken: its boss swap written in. */
export function planAfter(plan: RunPlan, option: RouteOption): RunPlan {
  const swap = option.swapBoss;
  return swap === null ? plan : { ...plan, bosses: plan.bosses.map((b) => (b.at === swap.at ? { ...b, modId: swap.modId } : b)) };
}

/** Camp k's spec as a run would reach it by always taking route "a". For
 * the dev sandbox and test fixtures that start mid-run. */
export function campSpecAt(seed: string, length: RunLength, k: CampIndex, catalog: Catalog): CampSpec {
  return k === 1 ? firstCampSpec(length) : optionsAfter(seed, { length, bosses: [] }, campIndex(k - 1), catalog, BASE_ROUTE_RULES)[0]!.next;
}

/** The objective types a route preview shows: the spec's slots after every
 * stack layer's `slots`. */
export function slotKindsFor(run: RunState, spec: CampSpec, catalog: Catalog): readonly SlotTemplate["kind"][] {
  return campSlots(run, spec, catalog).map((slot) => slot.kind);
}
