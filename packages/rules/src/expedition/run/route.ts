// Camp specs and the routes between them. A spec is what a camp is
// (location, weather, the event that led there, its objective slots), fixed
// when the route is chosen, so a failed camp replays the same spec.

import { EVENTS } from "../content/events/registry";
import type { EventId } from "../content/events/event-def";
import type { ModDef, ModId } from "../content/mods/mod-def";
import type { ObjectiveSlot } from "../state";
import { MIX_FROM_CAMP, NORMAL_WEATHER_CHANCE, OBJECTIVE_RAMP, ROUTE_OPTIONS } from "./balance";
import { campIndex } from "./plan";
import { STREAMS, seededIndex } from "./rng";
import { campSlots, pairingRuleFor } from "./stack";
import type { CampIndex, Catalog, RunAt, RunLength, RunState } from "./types";

/** A trick-count slot resolves to no-tricks or exactly-n once per attempt. */
export type SlotTemplate = ObjectiveSlot | { readonly kind: "trick-count" };

export type CampSpec = {
  readonly index: CampIndex;
  readonly location: ModId;
  readonly weather: ModId;
  readonly event: EventId | null; // the event on the route that led here; null at camp 1
  readonly slots: readonly SlotTemplate[];
};

export type RouteChoice = "a" | "b" | "c";
export type RouteOption = { readonly id: RouteChoice; readonly next: CampSpec };

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
  return { index, location: FIRST_LOCATION, weather: FAIR_WEATHER, event: null, slots: slotsFor(OBJECTIVE_RAMP[length][0]!, "plain") };
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

/** A location by weight; fair at its normal chance, else a weighted
 * weather that no "never" pairing keeps from it (none left: fair). */
function drawPlace(seed: string, next: CampIndex, option: number, catalog: Catalog): { readonly location: ModId; readonly weather: ModId } {
  const mods = Object.values(catalog.mods);
  const location = drawWeighted(seed, STREAMS.routeField(next, 0, option, "location"), mods.filter((def) => def.kind === "location"));
  if (location === null) throw new Error("route: the catalogue has no location to draw");
  const chance = location.kind === "location" ? (location.normalWeatherChance ?? NORMAL_WEATHER_CHANCE) : NORMAL_WEATHER_CHANCE;
  if (seededIndex(seed, STREAMS.routeField(next, 0, option, "fair"), 100) < chance) return { location: location.id, weather: FAIR_WEATHER };
  const weathers = mods.filter((def) => def.kind === "weather" && pairingRuleFor(location.id, def.id, catalog)?.result !== "never");
  const weather = drawWeighted(seed, STREAMS.routeField(next, 0, option, "weather"), weathers);
  return { location: location.id, weather: weather?.id ?? FAIR_WEATHER };
}

function optionsAfter(seed: string, length: RunLength, cleared: CampIndex, catalog: Catalog): readonly RouteOption[] {
  const next = campIndex(cleared + 1);
  const count = ROUTE_OPTIONS.min + seededIndex(seed, STREAMS.routeCount(next), ROUTE_OPTIONS.max - ROUTE_OPTIONS.min + 1);
  const slotCount = OBJECTIVE_RAMP[length][next - 1]!;
  const mixes: readonly Mix[] = next < MIX_FROM_CAMP ? ["plain"] : ["plain", "ordered", "trick-count", ...(slotCount >= 4 ? (["both"] as const) : [])];
  const events = Object.keys(EVENTS).sort();
  return ROUTE_CHOICES.slice(0, count).map((id, i) => {
    const place = drawPlace(seed, next, i, catalog);
    const event = events[seededIndex(seed, STREAMS.routeField(next, 0, i, "event"), events.length)]!;
    const mix = mixes[seededIndex(seed, STREAMS.routeField(next, 0, i, "mix"), mixes.length)]!;
    return { id, next: { index: next, location: place.location, weather: place.weather, event, slots: slotsFor(slotCount, mix) } };
  });
}

/** 2 or 3 options (seeded count), each with a location by weight, its
 * weather, a uniform event and, from MIX_FROM_CAMP on, a seeded objective
 * mix. */
export function routeOptions(run: RunAt<"draft">, catalog: Catalog): readonly RouteOption[] {
  return optionsAfter(run.seed, planOf(run).length, run.stage.cleared, catalog);
}

/** Camp k's spec as a run would reach it by always taking route "a". For
 * the dev sandbox and test fixtures that start mid-run. */
export function campSpecAt(seed: string, length: RunLength, k: CampIndex, catalog: Catalog): CampSpec {
  return k === 1 ? firstCampSpec(length) : optionsAfter(seed, length, campIndex(k - 1), catalog)[0]!.next;
}

/** The objective types a route preview shows: the spec's slots after every
 * stack layer's `slots`. */
export function slotKindsFor(run: RunState, spec: CampSpec, catalog: Catalog): readonly SlotTemplate["kind"][] {
  return campSlots(run, spec, catalog).map((slot) => slot.kind);
}
