import type { ExpeditionView } from "@games/rules";
import { RUN_LENGTH_DISPLAY } from "@games/rules";
import type { StopKind } from "./trail-model";
import { focusCampIndex, plannedBossAt } from "./view-access";
import { modDisplayName } from "./weather-model";

/**
 * The map of the run so far, opened from the top bar's camp label: every
 * camp of the run in order, where it was played or is headed, its boss as
 * far as the routes have revealed it, how it went, and where the crew is.
 * A pure display transform of the view.
 */

export interface MapPlace {
  locationId: string;
  location: string;
  weatherId: string;
  weather: string;
}

export interface MapStop {
  index: number;
  /** "lost" is the camp a lost run ended at. */
  state: "cleared" | "here" | "lost" | "ahead";
  kind: StopKind;
  /** Where it was played, or where the crew heads; null until a route
   * decides it. */
  place: MapPlace | null;
  /** The boss's id once a route preview has revealed it, and its name, or
   * its tier's ("Animal boss") until then; null for a plain camp. */
  boss: { id: string | null; tier: "animal" | "disaster" | "temple"; name: string } | null;
  /** "Cleared on try 2", "You are here, try 3", "Next", or "". */
  note: string;
}

export interface ProgressMap {
  /** "Standard run, camp 3 of 6". */
  heading: string;
  stops: MapStop[];
}

const TIER_NAME = { animal: "Animal boss", disaster: "Disaster boss", temple: "The Temple" } as const;

function placeOf(location: string, weather: string): MapPlace {
  return { locationId: location, location: modDisplayName(location), weatherId: weather, weather: modDisplayName(weather) };
}

/** Where the crew is or heads to, while it is settled. */
function placeAhead(view: ExpeditionView): MapPlace | null {
  const stage = view.stage;
  if (stage.tag === "loadout" || stage.tag === "camp") return placeOf(stage.camp.location, stage.camp.weather);
  if (stage.tag === "event") return placeOf(stage.next.location, stage.next.weather);
  return null;
}

function tries(n: number): string {
  return n === 1 ? "" : `, try ${n}`;
}

/** Null at muster, before the run's length is chosen. */
export function buildProgressMap(view: ExpeditionView): ProgressMap | null {
  if (view.campCount === null || view.length === null) return null;
  const focus = focusCampIndex(view);
  const atCamp = view.stage.tag === "loadout" || view.stage.tag === "camp";
  const lostAt = view.stage.tag === "ended" && view.stage.result === "lost" ? (view.history.at(-1)?.camp ?? null) : null;
  const stops = Array.from({ length: view.campCount }, (_, i): MapStop => {
    const index = i + 1;
    const results = view.history.filter((h) => h.camp === index && h.status !== "restarted");
    const played = results.at(-1);
    const failed = results.filter((h) => h.status === "failed").length;
    const planned = plannedBossAt(view, index);
    const kind: StopKind = planned?.tier ?? "camp";
    const boss = planned === null ? null : { id: planned.bossId, tier: planned.tier, name: planned.bossId === null ? TIER_NAME[planned.tier] : modDisplayName(planned.bossId) };
    const base = { index, kind, boss };
    if (results.some((h) => h.status === "cleared")) {
      return { ...base, state: "cleared", place: placeOf(played!.location, played!.weather), note: failed === 0 ? "Cleared" : `Cleared on try ${failed + 1}` };
    }
    if (index === lostAt) return { ...base, state: "lost", place: played === undefined ? null : placeOf(played.location, played.weather), note: "Lost here" };
    if (index === focus) {
      const note = atCamp ? `You are here${tries(failed + 1)}` : `Next${tries(failed + 1)}`;
      return { ...base, state: "here", place: placeAhead(view) ?? (played === undefined ? null : placeOf(played.location, played.weather)), note };
    }
    return { ...base, state: "ahead", place: null, note: "" };
  });
  const where = focus === null ? `${view.campCount} camps` : `camp ${focus} of ${view.campCount}`;
  return { heading: `${RUN_LENGTH_DISPLAY[view.length].name} run, ${where}`, stops };
}
