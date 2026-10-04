import type { ExpeditionModView, ExpeditionView, ModDisplay } from "@games/rules";
import { MOD_DISPLAY } from "@games/rules";
import { cardLabel, modObjectId, rankLabel } from "./expedition-ids";
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
  /** The river's meter: tricks left of the tricks it gives. */
  gauge: { left: number; of: number } | null;
  /** Something is happening now (a strike on this trick, the river one
   * trick from flooding). */
  alert: boolean;
}

export type Precipitation = "none" | "rain" | "storm";
/** What hangs over the backdrop besides rain. */
export type Haze = "none" | "night" | "fog";

/** What the backdrop and the weather overlay draw. */
export interface Sky {
  /** The location id, which names its backdrop. */
  location: string;
  precipitation: Precipitation;
  haze: Haze;
  /** How far the river has risen, 0 to 1; null without a flood. */
  flood: number | null;
  /** Unique per strike, so its flash plays once however often the scene
   * redraws; null when no strike sits on the trick in play. */
  strike: string | null;
  /** Said under the stump while a strike sits on the trick. */
  notice: string | null;
  /** The Blood Moon is up this trick: the sky turns red. */
  bloodMoon: boolean;
}

export const STRIKE_NOTICE = "Lightning struck: the lowest card wins this trick";

const PRECIPITATION: Readonly<Record<string, Precipitation>> = {
  rain: "rain",
  thunderstorm: "storm",
};

const HAZE: Readonly<Record<string, Haze>> = {
  night: "night",
  fog: "fog",
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

/** "Blocked by Rain" when a camp modifier is why, short enough for the
 * caption under the Whisper button; null otherwise. */
export function whisperBlocker(view: ExpeditionView): string | null {
  const blocker = modsOf(view).find((mod) => WHISPER_BLOCKERS.includes(mod.id));
  return blocker === undefined ? null : `Blocked by ${modDisplayName(blocker.id)}`;
}

export function modDisplayName(id: string): string {
  return MOD_DISPLAY[id]?.name ?? modName(id);
}

const BLOOD_MOON_ID = "blood-moon";

/** The camp modifier whose removed cards the strip names. */
const HEAT_ID = "magma";

/** The heat's toll in a few characters: whole ranks gone, then single
 * cards ("No 2s 3s 4♣"); null outside a dealt camp. */
export function heatNote(view: ExpeditionView): string | null {
  const removed = view.stage.tag === "camp" ? view.stage.attempt.camp.removedCards : null;
  if (removed === null || removed.length === 0) return null;
  const standard = removed.flatMap((card) => (card.kind === "standard" ? [card] : []));
  const ranks = [...new Set(standard.map((card) => card.rank))].sort((a, b) => a - b);
  const whole = ranks.filter((rank) => standard.filter((card) => card.rank === rank).length === 4);
  const singles = standard.filter((card) => !whole.includes(card.rank)).map(cardLabel);
  return `No ${[...whole.map((rank) => `${rankLabel(rank)}s`), ...singles].join(" ")}`;
}

function chipFor(mod: ExpeditionModView, view: ExpeditionView): ModChip {
  const strike = mod.status.some((part) => part.kind === "strike");
  const chance = mod.status.find((part) => part.kind === "chance");
  const meter = mod.status.find((part) => part.kind === "meter");
  const badge = strike
    ? "Lowest wins"
    : chance !== undefined && chance.percent > 0
      ? `${chance.percent}%`
      : meter !== undefined
        ? meter.left === 0 ? "Flooded" : `${meter.left} left`
        : mod.id === HEAT_ID
          ? heatNote(view)
          : null;
  return {
    id: mod.id,
    objectId: modObjectId(mod.id),
    kind: mod.kind,
    name: modDisplayName(mod.id),
    badge,
    pips: chance?.strikesLeft ?? 0,
    gauge: meter === undefined ? null : { left: meter.left, of: meter.of },
    alert: strike || (meter !== undefined && meter.left <= 1),
  };
}


function modsOf(view: ExpeditionView): ExpeditionModView[] {
  const stage = view.stage;
  return stage.tag === "camp" || stage.tag === "loadout" ? stage.mods : [];
}

export function buildModChips(view: ExpeditionView): ModChip[] {
  return modsOf(view).map((mod) => chipFor(mod, view));
}

export function buildSky(view: ExpeditionView): Sky | null {
  const stage = view.stage;
  if (stage.tag !== "camp") return null;
  const struck = stage.mods.some((mod) => mod.status.some((part) => part.kind === "strike"));
  const trick = stage.attempt.camp.currentTrick.index;
  const meter = stage.mods.flatMap((mod) => mod.status).find((part) => part.kind === "meter");
  return {
    location: stage.camp.location,
    precipitation: PRECIPITATION[stage.camp.weather] ?? "none",
    haze: HAZE[stage.camp.weather] ?? "none",
    flood: meter === undefined || meter.of === 0 ? null : (meter.of - meter.left) / meter.of,
    strike: struck ? `${stage.camp.index}:${stage.attempt.attemptNumber}:${trick}` : null,
    notice: struck ? STRIKE_NOTICE : null,
    bloodMoon: stage.mods.some((mod) => mod.id === BLOOD_MOON_ID && !mod.status.some((part) => part.kind === "alternating" && !part.activeNow)),
  };
}

/** The hovered chip's rules: its name, kind and one sentence, and what its
 * live reading means. */
export function modTooltip(view: ExpeditionView, modId: string): Tooltip | null {
  const mod = modsOf(view).find((m) => m.id === modId);
  if (mod === undefined) return null;
  const chip = chipFor(mod, view);
  const chance = mod.status.find((part) => part.kind === "chance");
  const meter = mod.status.find((part) => part.kind === "meter");
  const badges = [KIND_LABEL[mod.kind]];
  if (chance !== undefined) badges.push(chance.percent > 0 ? `${chance.percent}% next trick` : "No more strikes", `${chance.strikesLeft} ${chance.strikesLeft === 1 ? "strike" : "strikes"} left`);
  if (meter !== undefined) badges.push(meter.left === 0 ? "The river has flooded" : `Floods after ${meter.left} more ${meter.left === 1 ? "trick" : "tricks"}`);
  if (modId === HEAT_ID && chip.badge !== null) badges.push(chip.badge.replace(/^No /, "Burned: "));
  return { title: chip.name, text: MOD_DISPLAY[modId]?.text ?? "", badges, reason: null };
}
