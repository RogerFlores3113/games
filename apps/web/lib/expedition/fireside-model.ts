import type { ExpeditionView } from "@games/rules";
import { BOSS_DISPLAY, CHARACTER_DISPLAY, SOURCE_DISPLAY } from "@games/rules";
import type { Prompt } from "./build-prompt";
import { buildFiresidePrompt } from "./build-prompt";
import type { SceneServerInput, Tooltip, TopBar } from "./build-scene-model";
import { BOSS_CAMP_NUMBERS, FINAL_CAMP_NUMBER, sourceName, sourceRulesText } from "./build-scene-model";
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

export interface DraftItem {
  sourceId: string;
  objectId: string;
  name: string;
  /** Badge line: the window and limit, "Always", or a character's theme. */
  badge: string;
}

/** `pick` says which request a tile sends: muster picks a character, a
 * draft takes an upgrade or item. */
export type DraftPanel =
  | { kind: "offer"; pick: "character" | "draft"; items: DraftItem[] }
  | { kind: "taken"; sourceId: string; name: string }
  | { kind: "none"; text: string };

export interface KitItem {
  sourceId: string;
  objectId: string;
  name: string;
  badge: string;
}

export interface CrewRow {
  seatId: string;
  displayLabel: string;
  isYou: boolean;
  connected: boolean;
  status: "ready" | "drafting" | "choosing" | "resting";
  sources: { sourceId: string; name: string }[];
}

export interface FiresideModel {
  sceneKey: "fireside";
  campNumber: number;
  topBar: TopBar;
  prompt: Prompt;
  trail: TrailStop[];
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

function badgeFor(sourceId: string): string {
  const display = SOURCE_DISPLAY[sourceId];
  if (display === undefined) return "";
  if (display.kind === "character") return CHARACTER_DISPLAY[sourceId]?.theme ?? "";
  if (display.active === null) return "Always";
  return `${display.active.windowPhrase}, ${display.active.limitBadge}`;
}

function liveSourceIds(seat: ExpeditionView["seats"][number]): string[] {
  return seat.characterId === null ? [...seat.kit] : [seat.characterId, ...seat.kit];
}

function bossFor(view: ExpeditionView, campNumber: number): string | null {
  if (campNumber === 3) return view.bossTwists.camp3;
  if (campNumber === 6) return view.bossTwists.camp6;
  return null;
}

function buildTopBar(view: ExpeditionView): TopBar {
  const camp = `Camp ${view.campNumber} of ${FINAL_CAMP_NUMBER}`;
  if (!BOSS_CAMP_NUMBERS.includes(view.campNumber)) return { supplies: view.supplies, camp, boss: null };
  const bossId = bossFor(view, view.campNumber);
  const text = bossId === null ? "Boss camp ahead" : `Boss ahead: ${BOSS_DISPLAY[bossId]?.name ?? bossId}`;
  return { supplies: view.supplies, camp, boss: { text, dim: false } };
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

function itemFor(sourceId: string): DraftItem {
  return { sourceId, objectId: draftObjectId(sourceId), name: sourceName(sourceId), badge: badgeFor(sourceId) };
}

function buildDraft(view: ExpeditionView): DraftPanel {
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined) return { kind: "none", text: "" };
  if (view.runPhase === "muster") {
    if (you.characterId !== null) return { kind: "taken", sourceId: you.characterId, name: sourceName(you.characterId) };
    const taken = new Set(view.seats.map((s) => s.characterId));
    return { kind: "offer", pick: "character", items: Object.keys(CHARACTER_DISPLAY).filter((id) => !taken.has(id)).map(itemFor) };
  }
  if (view.yourDraftOffer !== null) return { kind: "offer", pick: "draft", items: view.yourDraftOffer.map(itemFor) };
  // A pick appends to the kit, so its last source is the one just taken.
  const taken = you.kit.at(-1);
  if (draftDealtThisFireside(view) && taken !== undefined) return { kind: "taken", sourceId: taken, name: sourceName(taken) };
  return { kind: "none", text: view.history.length === 0 ? "" : "Nothing new after a failed camp" };
}

function buildKit(view: ExpeditionView): KitItem[] | null {
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined) return null;
  return liveSourceIds(you).map((sourceId) => ({ sourceId, objectId: kitObjectId(sourceId), name: sourceName(sourceId), badge: badgeFor(sourceId) }));
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
    draft: buildDraft(view),
    kit: buildKit(view),
    crew: buildCrew(server),
    ready: buildReady(view),
    tooltip: buildTooltip(ui),
    lastResult: last === undefined ? null : { campNumber: last.campNumber, status: last.status },
  };
}
