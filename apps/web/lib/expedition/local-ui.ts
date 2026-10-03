import { IDLE_DRAG, gestureCardId, type DragState } from "./card-drag";
import type { ExpeditionAbilityStepView, ExpeditionTargetKind, ExpeditionView, RunAction } from "@games/rules";

/**
 * D-02 boundary: an ability's target steps and their legal choice ids come
 * from the server (`view.yourAbilities[].steps`). This module only walks
 * those steps; it never decides which ids are legal. The Whisper, which is
 * not an ability, builds the same two-step shape from the hand and the
 * other seats.
 *
 * `confirmTargeting` is the ONLY function in this module that produces a
 * `RunAction` — starting an ability or a Whisper never itself produces a
 * server request (D-02).
 */

export type Targeting =
  | { mode: "ability"; sourceId: string; selected: string[] }
  | { mode: "whisper"; selected: string[] };

/** What a picked thing on the table is, for matching it to a choice id. */
export type PickEntity = "card" | "seat" | "objective";

export interface LocalUiState {
  targeting: Targeting | null;
  hoveredCardId: string | null;
  lastTrickOpen: boolean;
  tooltipSourceId: string | null;
  tooltipObjectiveId: string | null;
  /** A teammate's source: read-only, so it never starts targeting. */
  tooltipMateSource: { seatId: string; sourceId: string } | null;
  /** The hand-card gesture in flight: press, drag, or the return after a
   * rejected drop. */
  drag: DragState;
}

export function initialLocalUi(): LocalUiState {
  return { targeting: null, hoveredCardId: null, lastTrickOpen: false, tooltipSourceId: null, tooltipObjectiveId: null, tooltipMateSource: null, drag: IDLE_DRAG };
}

function currentHandIds(view: ExpeditionView): string[] {
  return view.attempt?.camp?.yourHand.map((c) => c.id) ?? [];
}

function whisperSteps(view: ExpeditionView): ExpeditionAbilityStepView[] {
  const teammates = view.seats.map((s) => s.seatId).filter((seatId) => seatId !== view.yourSeatId);
  return [
    { kind: "card", prompt: "Whisper: choose a card to share", choices: currentHandIds(view).map((id) => `card:${id}`) },
    { kind: "player", prompt: "Whisper: choose a teammate", choices: teammates.map((id) => `seat:${id}`) },
  ];
}

/** The steps of the current targeting: the server's own for an ability. */
export function targetingSteps(ui: LocalUiState, view: ExpeditionView): ExpeditionAbilityStepView[] {
  const targeting = ui.targeting;
  if (targeting === null) return [];
  if (targeting.mode === "whisper") return whisperSteps(view);
  return view.yourAbilities.find((a) => a.sourceId === targeting.sourceId)?.steps ?? [];
}

/** The step still to pick, or null when nothing is targeting or every step
 * is picked. */
export function currentStep(ui: LocalUiState, view: ExpeditionView): ExpeditionAbilityStepView | null {
  if (ui.targeting === null) return null;
  return targetingSteps(ui, view)[ui.targeting.selected.length] ?? null;
}

export function nextTargetKind(ui: LocalUiState, view: ExpeditionView): ExpeditionTargetKind | null {
  return currentStep(ui, view)?.kind ?? null;
}

const ENTITY_PREFIXES: Readonly<Record<PickEntity, readonly string[]>> = {
  card: ["card"],
  seat: ["seat", "hand"],
  objective: ["objective"],
};

/** The current step's choice id for a clicked card, seat or objective, or
 * null when that thing is not a choice right now. */
export function choiceFor(ui: LocalUiState, view: ExpeditionView, entity: PickEntity, rawId: string): string | null {
  const step = currentStep(ui, view);
  if (step === null) return null;
  return ENTITY_PREFIXES[entity].map((prefix) => `${prefix}:${rawId}`).find((id) => step.choices.includes(id)) ?? null;
}

/** Whether the current targeting already picked this card, seat or
 * objective. */
export function isPicked(ui: LocalUiState, entity: PickEntity, rawId: string): boolean {
  if (ui.targeting === null) return false;
  const picked = ui.targeting.selected;
  return ENTITY_PREFIXES[entity].some((prefix) => picked.includes(`${prefix}:${rawId}`));
}

/** Begins targeting for `sourceId`. A no-op unless the server says the
 * ability is usable now (`yourAbilities[].usableNow`). */
export function beginAbilityTargeting(ui: LocalUiState, view: ExpeditionView, sourceId: string): LocalUiState {
  const ability = view.yourAbilities.find((a) => a.sourceId === sourceId);
  if (!ability || !ability.usableNow) return ui;
  return { ...ui, targeting: { mode: "ability", sourceId, selected: [] } };
}

/** Begins Whisper targeting (a card, then a teammate). A no-op unless it is
 * currently the between-tricks window and the viewer holds a seat. */
export function beginWhisper(ui: LocalUiState, view: ExpeditionView): LocalUiState {
  if (view.attempt?.window !== "between-tricks" || view.yourSeatId === null) return ui;
  return { ...ui, targeting: { mode: "whisper", selected: [] } };
}

/** Picks `choiceId` for the current step. A no-op unless it is one of that
 * step's choices. */
export function selectTarget(ui: LocalUiState, view: ExpeditionView, choiceId: string): LocalUiState {
  if (ui.targeting === null) return ui;
  const step = currentStep(ui, view);
  if (step === null || !step.choices.includes(choiceId)) return ui;
  return { ...ui, targeting: { ...ui.targeting, selected: [...ui.targeting.selected, choiceId] } };
}

/** Clears the current targeting only. Hover and last-trick state are
 * untouched. */
export function cancelTargeting(ui: LocalUiState): LocalUiState {
  return { ...ui, targeting: null };
}

function afterPrefix(choiceId: string): string {
  return choiceId.slice(choiceId.indexOf(":") + 1);
}

/** Builds a fresh `RunAction` literal with exactly the keys `parseRunAction`
 * expects, once every step is picked; otherwise returns `{ ui, request:
 * null }` unchanged. This is the ONLY function in this module that can
 * produce a request (D-02, T-12-03). */
export function confirmTargeting(ui: LocalUiState, view: ExpeditionView): { ui: LocalUiState; request: RunAction | null } {
  const targeting = ui.targeting;
  if (targeting === null || currentStep(ui, view) !== null) return { ui, request: null };
  if (targeting.mode === "ability") {
    return { ui: { ...ui, targeting: null }, request: { type: "use-ability", sourceId: targeting.sourceId, targets: [...targeting.selected] } };
  }
  const [card, seat] = targeting.selected;
  if (card === undefined || seat === undefined) return { ui, request: null };
  return { ui: { ...ui, targeting: null }, request: { type: "whisper", targetSeatId: afterPrefix(seat), cardId: afterPrefix(card) } };
}

/** Reconciles local UI state against a freshly-received server view:
 * clears an ability targeting once the ability is no longer usable, clears
 * a Whisper once the window is no longer between tricks, drops any pick
 * (and everything after it) that the server no longer offers, and clears
 * hover or drag on a card that left the hand. Never mutates `ui`. */
export function reconcileLocalUi(ui: LocalUiState, view: ExpeditionView): LocalUiState {
  let next = ui;
  const handIds = currentHandIds(view);
  const targeting = next.targeting;

  if (targeting !== null) {
    const stillOpen =
      targeting.mode === "ability"
        ? view.yourAbilities.some((a) => a.sourceId === targeting.sourceId && a.usableNow)
        : view.attempt?.window === "between-tricks";
    if (!stillOpen) {
      next = { ...next, targeting: null };
    } else {
      const steps = targetingSteps(next, view);
      const kept = targeting.selected.findIndex((id, i) => !(steps[i]?.choices.includes(id) ?? false));
      if (kept !== -1) next = { ...next, targeting: { ...targeting, selected: targeting.selected.slice(0, kept) } };
    }
  }

  const held = gestureCardId(next.drag);
  if (held !== null && !handIds.includes(held)) {
    next = { ...next, drag: IDLE_DRAG };
  }

  if (next.hoveredCardId !== null && !handIds.includes(next.hoveredCardId)) {
    next = { ...next, hoveredCardId: null };
  }

  return next;
}

export function setHoveredCard(ui: LocalUiState, cardId: string | null): LocalUiState {
  return { ...ui, hoveredCardId: cardId };
}

export function setLastTrickOpen(ui: LocalUiState, open: boolean): LocalUiState {
  return { ...ui, lastTrickOpen: open };
}

export function setTooltipSource(ui: LocalUiState, sourceId: string | null): LocalUiState {
  return ui.tooltipSourceId === sourceId ? ui : { ...ui, tooltipSourceId: sourceId };
}

export function setTooltipObjective(ui: LocalUiState, objectiveId: string | null): LocalUiState {
  return ui.tooltipObjectiveId === objectiveId ? ui : { ...ui, tooltipObjectiveId: objectiveId };
}

export function setTooltipMateSource(ui: LocalUiState, mate: { seatId: string; sourceId: string } | null): LocalUiState {
  const same = ui.tooltipMateSource?.seatId === mate?.seatId && ui.tooltipMateSource?.sourceId === mate?.sourceId;
  return same ? ui : { ...ui, tooltipMateSource: mate };
}

export function setDrag(ui: LocalUiState, drag: DragState): LocalUiState {
  return ui.drag === drag ? ui : { ...ui, drag };
}
