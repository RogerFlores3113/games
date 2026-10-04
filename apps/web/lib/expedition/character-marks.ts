import type { ExpeditionView } from "@games/rules";
import type { SeatBossMark } from "./boss-model";
import type { LocalUiState } from "./local-ui";
import { currentStep } from "./local-ui";
import { cardLabel } from "./expedition-ids";
import { attemptOf } from "./view-access";

/**
 * What the nine characters leave on the table: the Hermit's vow on a seat,
 * the Perfumist's pink mist over a hallucinated trick, and the Magician's
 * fanned-out hands while a swap is aimed.
 */

/** Seats under the Hermit's vow: a trick they win now fails the camp. */
export function vowMarks(view: ExpeditionView): Record<string, SeatBossMark> {
  const effects = attemptOf(view)?.effects ?? [];
  const sworn = effects.flatMap((e) => (e.origin.kind === "seat" && e.origin.sourceId === "hermit" && e.params !== null && typeof e.params.seatId === "string" ? [e.params.seatId] : []));
  return Object.fromEntries(sworn.map((seatId) => [seatId, { label: "vow", alert: false }]));
}

/** The trick in play is misted: every card goes back to its hand. */
export function mistOver(view: ExpeditionView): boolean {
  const attempt = attemptOf(view);
  if (attempt === null) return false;
  const trick = attempt.camp.currentTrick.index;
  return attempt.effects.some((e) => e.origin.kind === "seat" && e.origin.sourceId === "perfumist" && e.lasts === "trick" && e.atTrick === trick);
}

export interface FanPlace {
  choiceId: string;
  objectId: string;
  selected: boolean;
  targetable: boolean;
}

/** A teammate's hand fanned face down, and the cards you were shown from it. */
export interface FanRow {
  seatId: string;
  name: string;
  places: FanPlace[];
  known: (FanPlace & { label: string })[];
}

export interface FanPicker {
  title: string;
  rows: FanRow[];
}

export function fanObjectId(choiceId: string): string {
  return `pick:${choiceId}`;
}

/** While a fanned-card step is open: each teammate's hand as a row of card
 * backs, one per place in their seeded fan, and the cards you know face up.
 * A seat already picked from in this use cannot be picked again. */
export function buildFanPicker(view: ExpeditionView, ui: LocalUiState, nameOf: (seatId: string) => string): FanPicker | null {
  const step = currentStep(ui, view);
  if (step?.kind !== "fanned-card" || ui.targeting === null) return null;
  const selected = ui.targeting.selected;
  const usedSeats = new Set(selected.filter((id) => id.startsWith("fan:")).map((id) => id.split(":")[1]));
  const reveals = attemptOf(view)?.reveals ?? [];
  const rows = new Map<string, FanRow>();
  for (const choiceId of step.choices) {
    const [, seatId, place, cardId] = choiceId.split(":") as [string, string, string, string | undefined];
    const row = rows.get(seatId) ?? { seatId, name: nameOf(seatId), places: [], known: [] };
    rows.set(seatId, row);
    const pick = { choiceId, objectId: fanObjectId(choiceId), selected: selected.includes(choiceId), targetable: !usedSeats.has(seatId) };
    if (place === "known") {
      const identity = reveals.find((r) => r.cardId === cardId)?.identity;
      row.known.push({ ...pick, label: identity === undefined ? "?" : cardLabel(identity) });
    } else row.places.push(pick);
  }
  return { title: step.prompt, rows: [...rows.values()] };
}
