import type { ExpeditionView } from "@games/rules";
import { BOSS_DISPLAY, GEAR_DISPLAY } from "@games/rules";
import type { Prompt } from "./build-prompt";
import { buildFiresidePrompt } from "./build-prompt";
import type { SceneServerInput, Tooltip, TopBar } from "./build-scene-model";
import { BOSS_CAMP_NUMBERS, FINAL_CAMP_NUMBER, gearRulesText } from "./build-scene-model";
import { draftObjectId, loadoutObjectId, READY_ID } from "./expedition-ids";
import type { LocalUiState } from "./local-ui";

/**
 * The fireside between camps: the trail so far, the draft, the backpack, the
 * crew and the Ready button. A pure display transform of the view. `fits` is
 * guidance only: the worker still refuses an over-capacity `set-loadout`.
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
  gearId: string;
  objectId: string;
  name: string;
  size: number;
  window: string;
}

export type DraftPanel =
  | { kind: "offer"; items: DraftItem[] }
  | { kind: "taken"; gearId: string; name: string }
  | { kind: "none"; text: string };

export interface OwnedItem {
  gearId: string;
  objectId: string;
  name: string;
  size: number;
  equipped: boolean;
  /** Why clicking this tile would do nothing: null when it can be toggled. */
  blocked: { caption: string; reason: string } | null;
}

export interface PackedItem {
  gearId: string;
  name: string;
  size: number;
  /** Index of the first capacity slot this item fills. */
  firstSlot: number;
}

export interface CrewRow {
  seatId: string;
  displayLabel: string;
  isYou: boolean;
  connected: boolean;
  status: "ready" | "drafting" | "packing";
  gear: { gearId: string; name: string }[];
}

export interface FiresideModel {
  sceneKey: "fireside";
  campNumber: number;
  topBar: TopBar;
  prompt: Prompt;
  trail: TrailStop[];
  draft: DraftPanel;
  /** Null for a spectator. */
  backpack: { capacity: number; used: number; packed: PackedItem[]; owned: OwnedItem[] } | null;
  crew: CrewRow[];
  /** `blocked` while your draft pick is still due. Null for a spectator. */
  ready: { objectId: string; state: "blocked" | "open" | "done" } | null;
  tooltip: Tooltip | null;
  lastResult: { campNumber: number; status: "succeeded" | "failed" } | null;
}

const WINDOW_LABEL: Readonly<Record<string, string>> = {
  "pre-deal": "before the deal",
  "objective-pick": "at the pick",
  "between-tricks": "between tricks",
  passive: "always on",
};

const TONIC_ID = "overclock";

function gearName(gearId: string): string {
  return GEAR_DISPLAY[gearId]?.name ?? gearId;
}

function gearSize(gearId: string): number {
  return GEAR_DISPLAY[gearId]?.size ?? 0;
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

/** Whether this fireside dealt a draft: the run's opening one, or the one
 * after a cleared camp. A failed camp deals none. */
function draftDealtThisFireside(view: ExpeditionView): boolean {
  const last = view.history.at(-1);
  return last === undefined || last.status === "succeeded";
}

function buildDraft(view: ExpeditionView): DraftPanel {
  if (view.yourSeatId === null) return { kind: "none", text: "" };
  if (view.yourDraftOffer !== null) {
    return {
      kind: "offer",
      items: view.yourDraftOffer.map((gearId) => ({
        gearId,
        objectId: draftObjectId(gearId),
        name: gearName(gearId),
        size: gearSize(gearId),
        window: WINDOW_LABEL[GEAR_DISPLAY[gearId]?.window ?? ""] ?? "",
      })),
    };
  }
  // A pick appends to the owned list, so the newest owned gear is the one
  // just taken.
  const taken = view.yourOwnedGearIds.at(-1);
  if (draftDealtThisFireside(view) && taken !== undefined) return { kind: "taken", gearId: taken, name: gearName(taken) };
  return { kind: "none", text: "No new gear after a failed camp" };
}

function buildBackpack(view: ExpeditionView): FiresideModel["backpack"] {
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined) return null;
  const capacity = view.yourCapacity ?? 0;
  let used = 0;
  const packed: PackedItem[] = you.equippedGearIds.map((gearId) => {
    const item = { gearId, name: gearName(gearId), size: gearSize(gearId), firstSlot: used };
    used += item.size;
    return item;
  });
  const baseCapacity = view.yourBaseCapacity ?? capacity;
  const free = Math.max(0, capacity - used);
  const owned = view.yourOwnedGearIds.map((gearId): OwnedItem => {
    const equipped = you.equippedGearIds.includes(gearId);
    const size = gearSize(gearId);
    let blocked: OwnedItem["blocked"] = null;
    if (equipped && gearId === TONIC_ID && used > baseCapacity) {
      blocked = { caption: "needed", reason: "Your other gear needs the Tonic's +2" };
    } else if (!equipped && used + size > capacity) {
      blocked = { caption: "too big", reason: `too big to pack: needs ${size} free, ${free} left` };
    }
    return { gearId, objectId: loadoutObjectId(gearId), name: gearName(gearId), size, equipped, blocked };
  });
  return { capacity, used, packed, owned };
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
      status: seat.draftPending ? "drafting" : seat.ready ? "ready" : "packing",
      gear: seat.equippedGearIds.map((gearId) => ({ gearId, name: gearName(gearId) })),
    };
  });
}

function buildReady(view: ExpeditionView): FiresideModel["ready"] {
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined) return null;
  const state = view.yourDraftOffer !== null ? "blocked" : you.ready ? "done" : "open";
  return { objectId: READY_ID, state };
}

function buildTooltip(ui: LocalUiState, backpack: FiresideModel["backpack"]): Tooltip | null {
  if (ui.tooltipGearId === null) return null;
  const rules = gearRulesText(ui.tooltipGearId);
  if (rules === null) return null;
  const owned = backpack?.owned.find((o) => o.gearId === ui.tooltipGearId);
  return { ...rules, reason: owned?.blocked?.reason ?? null };
}

export function buildFiresideModel(server: SceneServerInput, ui: LocalUiState, reconnecting = false): FiresideModel {
  const { game: view, roomSeats } = server;
  const backpack = buildBackpack(view);
  const last = view.history.at(-1);
  return {
    sceneKey: "fireside",
    campNumber: view.campNumber,
    topBar: buildTopBar(view),
    prompt: buildFiresidePrompt(view, roomSeats, { reconnecting }),
    trail: buildTrail(view),
    draft: buildDraft(view),
    backpack,
    crew: buildCrew(server),
    ready: buildReady(view),
    tooltip: buildTooltip(ui, backpack),
    lastResult: last === undefined ? null : { campNumber: last.campNumber, status: last.status },
  };
}

/** The loadout after clicking `gearId` in the backpack: packs it if it was
 * out, unpacks it if it was in. */
export function toggledLoadout(model: FiresideModel, gearId: string): string[] {
  const packed = model.backpack?.packed.map((p) => p.gearId) ?? [];
  return packed.includes(gearId) ? packed.filter((id) => id !== gearId) : [...packed, gearId];
}
