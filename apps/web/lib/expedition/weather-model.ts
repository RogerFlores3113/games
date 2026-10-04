import type { ExpeditionModView, ExpeditionView, ModDisplay } from "@games/rules";
import { MOD_DISPLAY } from "@games/rules";
import { modObjectId } from "./expedition-ids";
import type { Tooltip } from "./build-scene-model";
import { modName } from "./view-access";

/**
 * The camp's modifiers as the table shows them: a strip of chips naming
 * each one with its live status, and the sky a weather draws. A pure
 * display transform of the stage's `mods`.
 */

/** One camp modifier on the strip. */
export interface ModChip {
  id: string;
  objectId: string;
  /** Picks the chip's icon. */
  kind: ModDisplay["kind"];
  name: string;
  /** A live reading: "30%", "Lowest wins"; null when there is none. */
  badge: string | null;
  /** Strikes still to come, drawn as bolts. */
  pips: number;
  /** Something is happening now (a strike on this trick). */
  alert: boolean;
}

export type Precipitation = "none" | "rain" | "storm";

/** What the backdrop and the weather overlay draw. */
export interface Sky {
  /** The location id, which names its backdrop. */
  location: string;
  precipitation: Precipitation;
  /** Unique per strike, so its flash plays once however often the scene
   * redraws; null when no strike sits on the trick in play. */
  strike: string | null;
  /** Said under the stump while a strike sits on the trick. */
  notice: string | null;
}

export const STRIKE_NOTICE = "Lightning struck: the lowest card wins this trick";

const PRECIPITATION: Readonly<Record<string, Precipitation>> = {
  rain: "rain",
  thunderstorm: "storm",
};

const KIND_LABEL: Readonly<Record<ModDisplay["kind"], string>> = {
  location: "Location",
  weather: "Weather",
  pairing: "Pairing",
  animal: "Animal boss",
  disaster: "Disaster",
  temple: "Temple",
};

/** Camp modifiers that stop whispers, for the Whisper button's reason. */
const WHISPER_BLOCKERS: readonly string[] = ["rain"];

/** "Rain stops whispers" when a camp modifier is why; null otherwise. */
export function whisperBlocker(view: ExpeditionView): string | null {
  const blocker = modsOf(view).find((mod) => WHISPER_BLOCKERS.includes(mod.id));
  return blocker === undefined ? null : `${modDisplayName(blocker.id)} stops whispers`;
}

export function modDisplayName(id: string): string {
  return MOD_DISPLAY[id]?.name ?? modName(id);
}

function chipFor(mod: ExpeditionModView): ModChip {
  const strike = mod.status.some((part) => part.kind === "strike");
  const chance = mod.status.find((part) => part.kind === "chance");
  const badge = strike ? "Lowest wins" : chance !== undefined && chance.percent > 0 ? `${chance.percent}%` : null;
  return {
    id: mod.id,
    objectId: modObjectId(mod.id),
    kind: mod.kind,
    name: modDisplayName(mod.id),
    badge,
    pips: chance?.strikesLeft ?? 0,
    alert: strike,
  };
}

function modsOf(view: ExpeditionView): ExpeditionModView[] {
  const stage = view.stage;
  return stage.tag === "camp" || stage.tag === "loadout" ? stage.mods : [];
}

export function buildModChips(view: ExpeditionView): ModChip[] {
  return modsOf(view).map(chipFor);
}

export function buildSky(view: ExpeditionView): Sky | null {
  const stage = view.stage;
  if (stage.tag !== "camp") return null;
  const struck = stage.mods.some((mod) => mod.status.some((part) => part.kind === "strike"));
  const trick = stage.attempt.camp.currentTrick.index;
  return {
    location: stage.camp.location,
    precipitation: PRECIPITATION[stage.camp.weather] ?? "none",
    strike: struck ? `${stage.camp.index}:${stage.attempt.attemptNumber}:${trick}` : null,
    notice: struck ? STRIKE_NOTICE : null,
  };
}

/** The hovered chip's rules: its name, kind and one sentence, and what its
 * live reading means. */
export function modTooltip(view: ExpeditionView, modId: string): Tooltip | null {
  const mod = modsOf(view).find((m) => m.id === modId);
  if (mod === undefined) return null;
  const chip = chipFor(mod);
  const chance = mod.status.find((part) => part.kind === "chance");
  const badges = [KIND_LABEL[mod.kind]];
  if (chance !== undefined) badges.push(chance.percent > 0 ? `${chance.percent}% next trick` : "No more strikes", `${chance.strikesLeft} ${chance.strikesLeft === 1 ? "strike" : "strikes"} left`);
  return { title: chip.name, text: MOD_DISPLAY[modId]?.text ?? "", badges, reason: null };
}
