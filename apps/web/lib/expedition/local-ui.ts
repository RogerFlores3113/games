import { IDLE_DRAG, gestureCardId, type DragState } from "./card-drag";
import { attemptOf } from "./view-access";
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

/** `heldId`: the hand card or objective a rank pick is for, chosen first
 * on a card-value or objective-value step; the rank tray then offers its
 * ranks. */
export type Targeting =
  | { mode: "ability"; sourceKey: string; selected: string[]; heldId: string | null }
  | { mode: "whisper"; selected: string[] };

/** What a clicked thing on the table is, for matching it to a choice id.
 * Each maps to one id prefix; the board and the supplies are single ids. */
export type PickEntity = "card" | "seat" | "hand" | "objective" | "whisper" | "trick" | "value" | "board" | "supplies" | "item" | "route" | "option";

const ENTITY_PREFIX: Readonly<Record<PickEntity, string | null>> = {
  card: "card",
  seat: "seat",
  hand: "hand",
  objective: "objective",
  whisper: "whisper",
  trick: "trick",
  value: "value",
  board: null,
  supplies: null,
  item: "item",
  route: "route",
  option: "option",
};

/** The choice id a clicked entity stands for (`card:<id>`, `board`). */
export function choiceIdOf(entity: PickEntity, rawId: string): string {
  const prefix = ENTITY_PREFIX[entity];
  return prefix === null ? entity : `${prefix}:${rawId}`;
}

/** The steps whose choices are a thing and a rank for it: the thing is
 * clicked first, then a rank from the tray. */
const RANK_STEPS: Readonly<Partial<Record<ExpeditionTargetKind, { entity: PickEntity; prefix: string }>>> = {
  "card-value": { entity: "card", prefix: "value" },
  "objective-value": { entity: "objective", prefix: "objective-value" },
};

/** The choice ids for `rawId`'s ranks begin with this. */
function rankPrefix(kind: ExpeditionTargetKind, rawId: string): string | null {
  const rank = RANK_STEPS[kind];
  return rank === undefined ? null : `${rank.prefix}:${rawId}:`;
}

export interface LocalUiState {
  targeting: Targeting | null;
  hoveredCardId: string | null;
  lastTrickOpen: boolean;
  /** One of your source keys, or a def id where there is no instance (a draft card). */
  tooltipSourceId: string | null;
  tooltipObjectiveId: string | null;
  /** A teammate's source key: read-only, so it never starts targeting. */
  tooltipMateSource: { seatId: string; sourceKey: string } | null;
  /** A camp modifier's chip on the strip. */
  tooltipModId: string | null;
  /** The hand-card gesture in flight: press, drag, or the return after a
   * rejected drop. */
  drag: DragState;
  /** Which page of the pick tray is showing. */
  trayPage: number;
  /** The items of the bundle you just took, to name them once the offer is gone. */
  takenBundle: string[] | null;
  /** Which page of your backpack the loadout shows. */
  packPage: number;
}

export function initialLocalUi(): LocalUiState {
  return { targeting: null, hoveredCardId: null, lastTrickOpen: false, tooltipSourceId: null, tooltipObjectiveId: null, tooltipMateSource: null, tooltipModId: null, drag: IDLE_DRAG, trayPage: 0, takenBundle: null, packPage: 0 };
}

function currentHandIds(view: ExpeditionView): string[] {
  return attemptOf(view)?.camp.yourHand.map((c) => c.id) ?? [];
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
  return view.yourAbilities.find((a) => a.sourceKey === targeting.sourceKey)?.steps ?? [];
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

/** The current step's choice id for a clicked entity, or null when it is
 * not a choice right now. On a card-value or objective-value step a card or
 * an objective is a choice when any of its ranks is: the click holds it,
 * then a rank is picked. */
export function choiceFor(ui: LocalUiState, view: ExpeditionView, entity: PickEntity, rawId: string): string | null {
  const step = currentStep(ui, view);
  if (step === null) return null;
  const rank = RANK_STEPS[step.kind];
  if (rank !== undefined && rank.entity === entity) {
    const prefix = rankPrefix(step.kind, rawId)!;
    return step.choices.some((id) => id.startsWith(prefix)) ? choiceIdOf(entity, rawId) : null;
  }
  const id = choiceIdOf(entity, rawId);
  return step.choices.includes(id) ? id : null;
}

/** Whether the current targeting already picked this entity, or holds it
 * for a rank pick. */
export function isPicked(ui: LocalUiState, entity: PickEntity, rawId: string): boolean {
  const targeting = ui.targeting;
  if (targeting === null) return false;
  const ranks = Object.values(RANK_STEPS).filter((rank) => rank.entity === entity);
  if (ranks.length > 0 && targeting.mode === "ability" && targeting.heldId === rawId) return true;
  if (ranks.some((rank) => targeting.selected.some((id) => id.startsWith(`${rank.prefix}:${rawId}:`)))) return true;
  return targeting.selected.includes(choiceIdOf(entity, rawId));
}

/** The rank choices for the card or objective held on a rank step. */
export function valueChoices(ui: LocalUiState, view: ExpeditionView): string[] {
  const targeting = ui.targeting;
  const step = currentStep(ui, view);
  if (targeting?.mode !== "ability" || targeting.heldId === null || step === null) return [];
  const prefix = rankPrefix(step.kind, targeting.heldId);
  return prefix === null ? [] : step.choices.filter((id) => id.startsWith(prefix));
}

/** Picks every leading `self` step: it has exactly one choice. */
function autoPick(ui: LocalUiState, view: ExpeditionView): LocalUiState {
  let next = ui;
  for (let step = currentStep(next, view); step?.kind === "self" && step.choices.length === 1; step = currentStep(next, view)) {
    next = { ...next, targeting: { ...next.targeting!, selected: [...next.targeting!.selected, step.choices[0]!] } };
  }
  return next;
}

/** Begins targeting for the ability used through `sourceKey`. A no-op
 * unless the server says it is usable now (`yourAbilities[].usableNow`). */
export function beginAbilityTargeting(ui: LocalUiState, view: ExpeditionView, sourceKey: string): LocalUiState {
  const ability = view.yourAbilities.find((a) => a.sourceKey === sourceKey);
  if (!ability || !ability.usableNow) return ui;
  return autoPick({ ...ui, trayPage: 0, targeting: { mode: "ability", sourceKey, selected: [], heldId: null } }, view);
}

/** Begins Whisper targeting (a card, then a teammate). A no-op unless it is
 * currently the between-tricks window and the viewer holds a seat. */
export function beginWhisper(ui: LocalUiState, view: ExpeditionView): LocalUiState {
  if (attemptOf(view)?.window !== "between-tricks" || view.yourSeatId === null) return ui;
  return { ...ui, targeting: { mode: "whisper", selected: [] } };
}

/** Picks `choiceId` for the current step. A no-op unless it is one of that
 * step's choices. On a card-value or objective-value step, `card:<id>` or
 * `objective:<id>` holds that thing for the rank pick instead. */
export function selectTarget(ui: LocalUiState, view: ExpeditionView, choiceId: string): LocalUiState {
  const targeting = ui.targeting;
  if (targeting === null) return ui;
  const step = currentStep(ui, view);
  if (step === null) return ui;
  const rank = RANK_STEPS[step.kind];
  const entityPrefix = rank === undefined ? null : ENTITY_PREFIX[rank.entity];
  if (rank !== undefined && targeting.mode === "ability" && choiceId.startsWith(`${entityPrefix}:`)) {
    const rawId = choiceId.slice(`${entityPrefix}:`.length);
    if (!step.choices.some((id) => id.startsWith(rankPrefix(step.kind, rawId)!))) return ui;
    return { ...ui, targeting: { ...targeting, heldId: rawId } };
  }
  if (!step.choices.includes(choiceId)) return ui;
  const held = targeting.mode === "ability" ? targeting.heldId : null;
  if (held !== null && !choiceId.startsWith(rankPrefix(step.kind, held) ?? "")) return ui;
  const picked = { ...targeting, selected: [...targeting.selected, choiceId] };
  return autoPick({ ...ui, trayPage: 0, targeting: picked.mode === "ability" ? { ...picked, heldId: null } : picked }, view);
}

/** With every step picked, a click on another choice of the last step
 * takes the place of the last pick (a different Pop-up Shop buy). */
export function repickLast(ui: LocalUiState, view: ExpeditionView, choiceId: string): LocalUiState {
  const targeting = ui.targeting;
  if (targeting === null || currentStep(ui, view) !== null || targeting.selected.length === 0) return ui;
  const last = targetingSteps(ui, view)[targeting.selected.length - 1];
  if (last === undefined || !last.choices.includes(choiceId) || targeting.selected.at(-1) === choiceId) return ui;
  return { ...ui, targeting: { ...targeting, selected: targeting.selected.slice(0, -1) } };
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
    return { ui: { ...ui, targeting: null }, request: { type: "use-ability", sourceKey: targeting.sourceKey, targets: [...targeting.selected] } };
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
        ? view.yourAbilities.some((a) => a.sourceKey === targeting.sourceKey && a.usableNow)
        : attemptOf(view)?.window === "between-tricks";
    if (!stillOpen) {
      next = { ...next, targeting: null };
    } else {
      const steps = targetingSteps(next, view);
      const kept = targeting.selected.findIndex((id, i) => !(steps[i]?.choices.includes(id) ?? false));
      if (kept !== -1) next = { ...next, targeting: { ...targeting, selected: targeting.selected.slice(0, kept) } };
      const held = next.targeting;
      if (held?.mode === "ability" && held.heldId !== null && valueChoices(next, view).length === 0) {
        next = { ...next, targeting: { ...held, heldId: null } };
      }
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

export function setTooltipMateSource(ui: LocalUiState, mate: { seatId: string; sourceKey: string } | null): LocalUiState {
  const same = ui.tooltipMateSource?.seatId === mate?.seatId && ui.tooltipMateSource?.sourceKey === mate?.sourceKey;
  return same ? ui : { ...ui, tooltipMateSource: mate };
}

export function setTooltipMod(ui: LocalUiState, modId: string | null): LocalUiState {
  return ui.tooltipModId === modId ? ui : { ...ui, tooltipModId: modId };
}

export function nextTrayPage(ui: LocalUiState): LocalUiState {
  return { ...ui, trayPage: ui.trayPage + 1 };
}

export function setDrag(ui: LocalUiState, drag: DragState): LocalUiState {
  return ui.drag === drag ? ui : { ...ui, drag };
}
