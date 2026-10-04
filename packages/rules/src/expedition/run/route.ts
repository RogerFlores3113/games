// Camp specs and the routes between them. A spec is what a camp is
// (location, weather, the event that led there, its objective slots), fixed
// when the route is chosen, so a failed camp replays the same spec. Until
// the locations and weathers land, every camp is the Jungle in fair
// weather, and routes differ only by event and objective mix.

import { EVENTS } from "../content/events/registry";
import type { EventId } from "../content/events/event-def";
import type { ObjectiveSlot } from "../state";
import { MIX_FROM_CAMP, OBJECTIVE_RAMP, ROUTE_OPTIONS } from "./balance";
import { campIndex } from "./plan";
import { STREAMS, seededIndex } from "./rng";
import type { CampIndex, RunAt, RunLength, RunState } from "./types";

/** A trick-count slot resolves to no-tricks or exactly-n once per attempt. */
export type SlotTemplate = ObjectiveSlot | { readonly kind: "trick-count" };

export type CampSpec = {
  readonly index: CampIndex;
  readonly location: string;
  readonly weather: string;
  readonly event: EventId | null; // the event on the route that led here; null at camp 1
  readonly slots: readonly SlotTemplate[];
};

export type RouteChoice = "a" | "b" | "c";
export type RouteOption = { readonly id: RouteChoice; readonly next: CampSpec };

const ROUTE_CHOICES: readonly RouteChoice[] = ["a", "b", "c"];

type Mix = "plain" | "ordered" | "trick-count" | "both";

const LOCATION = "jungle";
const WEATHER = "fair";

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
  return { index, location: LOCATION, weather: WEATHER, event: null, slots: slotsFor(OBJECTIVE_RAMP[length][0]!, "plain") };
}

function optionsAfter(seed: string, length: RunLength, cleared: CampIndex): readonly RouteOption[] {
  const next = campIndex(cleared + 1);
  const count = ROUTE_OPTIONS.min + seededIndex(seed, STREAMS.routeCount(next), ROUTE_OPTIONS.max - ROUTE_OPTIONS.min + 1);
  const slotCount = OBJECTIVE_RAMP[length][next - 1]!;
  const mixes: readonly Mix[] = next < MIX_FROM_CAMP ? ["plain"] : ["plain", "ordered", "trick-count", ...(slotCount >= 4 ? (["both"] as const) : [])];
  const events = Object.keys(EVENTS).sort();
  return ROUTE_CHOICES.slice(0, count).map((id, i) => {
    const event = events[seededIndex(seed, STREAMS.routeField(next, 0, i, "event"), events.length)]!;
    const mix = mixes[seededIndex(seed, STREAMS.routeField(next, 0, i, "mix"), mixes.length)]!;
    return { id, next: { index: next, location: LOCATION, weather: WEATHER, event, slots: slotsFor(slotCount, mix) } };
  });
}

/** 2 or 3 options (seeded count), each with a uniform event and, from
 * MIX_FROM_CAMP on, a seeded objective mix. */
export function routeOptions(run: RunAt<"draft">): readonly RouteOption[] {
  return optionsAfter(run.seed, planOf(run).length, run.stage.cleared);
}

/** Camp k's spec as a run would reach it by always taking route "a". For
 * the dev sandbox and test fixtures that start mid-run. */
export function campSpecAt(seed: string, length: RunLength, k: CampIndex): CampSpec {
  return k === 1 ? firstCampSpec(length) : optionsAfter(seed, length, campIndex(k - 1))[0]!.next;
}

/** The objective types a route preview shows. */
export function slotKindsFor(spec: CampSpec): readonly SlotTemplate["kind"][] {
  return spec.slots.map((slot) => slot.kind);
}
