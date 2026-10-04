import type { ExpeditionView } from "@games/rules";
import { CHARACTER_DISPLAY, SOURCE_DISPLAY } from "@games/rules";
import type { Prompt } from "./build-prompt";
import { buildFiresidePrompt } from "./build-prompt";
import type { SceneServerInput, Tooltip, TopBar } from "./build-scene-model";
import { BOSS_CAMP_NUMBERS, FINAL_CAMP_NUMBER } from "./build-scene-model";
import { characterName, chargeText, sourceBadges, sourceKind, sourceName, sourceRulesText } from "./source-text";
import { draftObjectId, kitObjectId, READY_ID } from "./expedition-ids";
import type { LocalUiState } from "./local-ui";

/**
 * The fireside before and between camps: the trail so far, the muster or
 * the draft, your kit, the crew and the Ready button. A pure display
 * transform of the view; the worker decides whether a pick is legal.
 */

export type TrailState = "cleared" | "next" | "ahead";

export interface TrailStop {
  campNumber: number;
  state: TrailState;
  boss: boolean;
  /** Second label line under the marker: "cleared", "next", "try 2", "boss". */
  caption: string;
}

/** A draft offer. An upgrade belongs to your character and says which
 * power it improves; an item is a separate tool. */
export interface DraftItem {
  sourceId: string;
  objectId: string;
  name: string;
  kind: "upgrade" | "item";
  /** "Spyglass upgrade" or "Item". */
  ribbon: string;
  text: string;
  /** When it works and how often: ["Between tricks", "1 per camp"]. */
  badges: string[];
}

/** One of the six characters at muster. */
export interface CharacterCard {
  characterId: string;
  objectId: string;
  name: string;
  theme: string;
  power: { sourceId: string; name: string; text: string; badges: string[] };
  /** "Herbs: start 2, max 3"; null without a pool. */
  pool: string | null;
  /** The teammate who took it; "You" for your own pick. */
  takenBy: string | null;
  yours: boolean;
  pickable: boolean;
}

export type DraftPanel =
  | { kind: "offer"; items: DraftItem[] }
  | { kind: "taken"; sourceId: string; name: string }
  | { kind: "none"; text: string };

export interface KitItem {
  sourceId: string;
  objectId: string;
  name: string;
  kind: "character" | "upgrade" | "item";
  /** What is left: "2/3 herbs", "1 left", "always on". */
  charge: string;
}

export interface CrewRow {
  seatId: string;
  displayLabel: string;
  isYou: boolean;
  connected: boolean;
  status: "ready" | "drafting" | "choosing" | "resting";
  /** "The Scout", or null while still choosing. */
  character: string | null;
  sources: { sourceId: string; name: string }[];
}

export interface FiresideModel {
  sceneKey: "fireside";
  campNumber: number;
  topBar: TopBar;
  prompt: Prompt;
  trail: TrailStop[];
  /** The six characters while the crew musters; null after. */
  muster: CharacterCard[] | null;
  draft: DraftPanel;
  /** Your character, then your kit in draft order. Null for a spectator. */
  kit: KitItem[] | null;
  crew: CrewRow[];
  /** `blocked` while your character or draft pick is still due. Null for a
   * spectator. */
  ready: { objectId: string; state: "blocked" | "open" | "done" } | null;
  tooltip: Tooltip | null;
  lastResult: { campNumber: number; status: "succeeded" | "failed" } | null;
}

function liveSourceIds(seat: ExpeditionView["seats"][number]): string[] {
  return seat.characterId === null ? [...seat.kit] : [seat.characterId, ...seat.kit];
}

function buildTopBar(view: ExpeditionView): TopBar {
  return { supplies: view.supplies, camp: `Camp ${view.campNumber} of ${FINAL_CAMP_NUMBER}`, suppliesPick: null };
}

function buildTrail(view: ExpeditionView): TrailStop[] {
  return Array.from({ length: FINAL_CAMP_NUMBER }, (_, i) => {
    const campNumber = i + 1;
    const results = view.history.filter((h) => h.campNumber === campNumber);
    const cleared = results.some((h) => h.status === "succeeded");
    const state: TrailState = cleared ? "cleared" : campNumber === view.campNumber ? "next" : "ahead";
    const boss = BOSS_CAMP_NUMBERS.includes(campNumber);
    const parts: string[] = [];
    if (state === "cleared") parts.push("cleared");
    if (state === "next") parts.push(results.length === 0 ? "next" : `try ${results.length + 1}`);
    if (boss && state !== "cleared") parts.push("boss");
    return { campNumber, state, boss, caption: parts.join(", ") };
  });
}

/** Whether this fireside dealt a draft: one after a cleared camp. A failed
 * camp deals none. */
function draftDealtThisFireside(view: ExpeditionView): boolean {
  return view.history.at(-1)?.status === "succeeded";
}

function itemFor(view: ExpeditionView, sourceId: string): DraftItem {
  const display = SOURCE_DISPLAY[sourceId];
  const kind = sourceKind(sourceId) === "upgrade" ? "upgrade" : "item";
  const ribbon = kind === "upgrade" && display?.characterId != null ? `${sourceName(display.characterId)} upgrade` : "Item";
  return { sourceId, objectId: draftObjectId(sourceId), name: sourceName(sourceId), kind, ribbon, text: display?.text ?? "", badges: sourceBadges(sourceId) };
}

function buildMuster(server: SceneServerInput): CharacterCard[] | null {
  const { game: view, roomSeats } = server;
  if (view.runPhase !== "muster") return null;
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  return Object.values(CHARACTER_DISPLAY).map((c) => {
    const holder = view.seats.find((s) => s.characterId === c.id);
    const yours = holder !== undefined && holder.seatId === view.yourSeatId;
    const takenBy = holder === undefined ? null : yours ? "You" : (roomSeats.find((r) => r.seatId === holder.seatId)?.displayLabel ?? "?");
    const power = SOURCE_DISPLAY[c.id];
    return {
      characterId: c.id,
      objectId: draftObjectId(c.id),
      name: c.name,
      theme: c.theme,
      power: { sourceId: c.id, name: c.power, text: power?.text ?? "", badges: sourceBadges(c.id) },
      pool: c.pool === null ? null : `${c.pool.name}: start ${c.pool.start}, max ${c.pool.max}`,
      takenBy,
      yours,
      pickable: holder === undefined && you !== undefined && you.characterId === null,
    };
  });
}

function buildDraft(view: ExpeditionView): DraftPanel {
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined || view.runPhase === "muster") return { kind: "none", text: "" };
  if (view.yourDraftOffer !== null) return { kind: "offer", items: view.yourDraftOffer.map((id) => itemFor(view, id)) };
  // A pick appends to the kit, so its last source is the one just taken.
  const taken = you.kit.at(-1);
  if (draftDealtThisFireside(view) && taken !== undefined) return { kind: "taken", sourceId: taken, name: sourceName(taken) };
  return { kind: "none", text: view.history.length === 0 ? "" : "Nothing new after a failed camp" };
}

function buildKit(view: ExpeditionView): KitItem[] | null {
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined) return null;
  return liveSourceIds(you).map((sourceId) => ({
    sourceId,
    objectId: kitObjectId(sourceId),
    name: sourceName(sourceId),
    kind: sourceKind(sourceId),
    charge: chargeText(sourceId, you.usage.find((u) => u.sourceId === sourceId)?.remaining ?? null),
  }));
}

function buildCrew(server: SceneServerInput): CrewRow[] {
  const { game: view, roomSeats } = server;
  const ids = view.seats.map((s) => s.seatId);
  const youAt = view.yourSeatId === null ? -1 : ids.indexOf(view.yourSeatId);
  const ordered = youAt <= 0 ? view.seats : [...view.seats.slice(youAt), ...view.seats.slice(0, youAt)];
  return ordered.map((seat) => {
    const room = roomSeats.find((r) => r.seatId === seat.seatId);
    return {
      seatId: seat.seatId,
      displayLabel: room?.displayLabel ?? "?",
      isYou: seat.seatId === view.yourSeatId,
      connected: room?.connected ?? false,
      status: seat.characterId === null ? "choosing" : seat.draftPending ? "drafting" : seat.ready ? "ready" : "resting",
      character: seat.characterId === null ? null : characterName(seat.characterId),
      sources: liveSourceIds(seat).map((sourceId) => ({ sourceId, name: sourceName(sourceId) })),
    };
  });
}

function buildReady(view: ExpeditionView): FiresideModel["ready"] {
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined) return null;
  const state = you.characterId === null || view.yourDraftOffer !== null ? "blocked" : you.ready ? "done" : "open";
  return { objectId: READY_ID, state };
}

function buildTooltip(ui: LocalUiState): Tooltip | null {
  if (ui.tooltipSourceId === null) return null;
  const rules = sourceRulesText(ui.tooltipSourceId);
  return rules === null ? null : { ...rules, reason: null };
}

export function buildFiresideModel(server: SceneServerInput, ui: LocalUiState, reconnecting = false): FiresideModel {
  const { game: view, roomSeats } = server;
  const last = view.history.at(-1);
  return {
    sceneKey: "fireside",
    campNumber: view.campNumber,
    topBar: buildTopBar(view),
    prompt: buildFiresidePrompt(view, roomSeats, { reconnecting }),
    trail: buildTrail(view),
    muster: buildMuster(server),
    draft: buildDraft(view),
    kit: buildKit(view),
    crew: buildCrew(server),
    ready: buildReady(view),
    tooltip: buildTooltip(ui),
    lastResult: last === undefined ? null : { campNumber: last.campNumber, status: last.status },
  };
}
