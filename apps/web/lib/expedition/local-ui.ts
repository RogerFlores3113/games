import { GEAR_DISPLAY } from "@games/rules";
import type { ExpeditionTargetKind, ExpeditionView, RunAction } from "@games/rules";

/**
 * D-02 boundary: `candidateIdsForKind` mirrors ONLY the target-kind filter
 * from run/toolkit.ts's `validateTargets` (teammate / own-card /
 * face-up-objective / own-objective membership) — it must NEVER call or
 * re-implement `canUse`/`canTarget`/legal-play logic. The server remains the
 * sole authority and may still refuse a request this module allowed the
 * player to build (e.g. a race where a teammate's objective just completed).
 * If you find yourself adding a rule beyond kind-membership here, stop — it
 * belongs on the server.
 *
 * `confirmTargeting` is the ONLY function in this module that produces a
 * `RunAction` — starting a gear use or a Whisper never itself produces a
 * server request (D-02).
 */

export type Targeting =
  | { mode: "gear"; gearId: string; selected: string[] }
  | { mode: "whisper"; cardId: string | null; targetSeatId: string | null };

export interface LocalUiState {
  targeting: Targeting | null;
  hoveredCardId: string | null;
  lastTrickOpen: boolean;
  tooltipGearId: string | null;
}

export function initialLocalUi(): LocalUiState {
  return { targeting: null, hoveredCardId: null, lastTrickOpen: false, tooltipGearId: null };
}

function currentHandIds(view: ExpeditionView): string[] {
  return view.attempt?.camp?.yourHand.map((c) => c.id) ?? [];
}

/** Every id currently eligible for `kind`, per view.seats/camp — mirrors the
 * server's own target-kind membership check (toolkit.ts's validateTargets),
 * never its canUse/canTarget legality. `teammate` reads `view.seats`
 * regardless of camp state; every other kind returns `[]` when there is no
 * open camp. */
export function candidateIdsForKind(kind: ExpeditionTargetKind, view: ExpeditionView): string[] {
  if (kind === "teammate") {
    return view.seats.map((s) => s.seatId).filter((seatId) => seatId !== view.yourSeatId);
  }
  const camp = view.attempt?.camp ?? null;
  if (camp === null) return [];
  if (kind === "own-card") {
    return camp.yourHand.map((c) => c.id);
  }
  if (kind === "face-up-objective") {
    return camp.objectives.filter((o) => o.ownerSeatId === null).map((o) => o.id);
  }
  // own-objective
  return camp.objectives.filter((o) => o.ownerSeatId === view.yourSeatId && o.status === "pending").map((o) => o.id);
}

/** The next target kind still needed to complete the current targeting, or
 * `null` when nothing is targeting or every target is already selected. */
export function nextTargetKind(ui: LocalUiState): ExpeditionTargetKind | null {
  if (ui.targeting === null) return null;
  if (ui.targeting.mode === "gear") {
    const targets = GEAR_DISPLAY[ui.targeting.gearId]?.targets ?? [];
    const kind = targets[ui.targeting.selected.length];
    return kind ?? null;
  }
  // whisper: own-card first, then teammate
  if (ui.targeting.cardId === null) return "own-card";
  if (ui.targeting.targetSeatId === null) return "teammate";
  return null;
}

/** Begins highlight-then-confirm targeting for `gearId`. A no-op (returns
 * `ui` unchanged) unless the server's own `view.yourGear[].usableNow` says
 * this gear is usable right now — gating is server-computed, never
 * re-derived here. */
export function beginGearTargeting(ui: LocalUiState, view: ExpeditionView, gearId: string): LocalUiState {
  const status = view.yourGear.find((g) => g.gearId === gearId);
  if (!status || !status.usableNow) return ui;
  return { ...ui, targeting: { mode: "gear", gearId, selected: [] } };
}

/** Begins Whisper targeting (own-card, then teammate). A no-op unless it is
 * currently the between-tricks window and the viewer holds a seat. */
export function beginWhisper(ui: LocalUiState, view: ExpeditionView): LocalUiState {
  if (view.attempt?.gearWindow !== "between-tricks" || view.yourSeatId === null) return ui;
  return { ...ui, targeting: { mode: "whisper", cardId: null, targetSeatId: null } };
}

/** Selects `id` for the current targeting's next needed kind. A no-op if
 * nothing is targeting, every target is already selected, or `id` is not a
 * legal candidate for that kind. */
export function selectTarget(ui: LocalUiState, view: ExpeditionView, id: string): LocalUiState {
  if (ui.targeting === null) return ui;
  const kind = nextTargetKind(ui);
  if (kind === null) return ui;
  if (!candidateIdsForKind(kind, view).includes(id)) return ui;

  if (ui.targeting.mode === "gear") {
    return { ...ui, targeting: { ...ui.targeting, selected: [...ui.targeting.selected, id] } };
  }
  // whisper
  if (ui.targeting.cardId === null) {
    return { ...ui, targeting: { ...ui.targeting, cardId: id } };
  }
  return { ...ui, targeting: { ...ui.targeting, targetSeatId: id } };
}

/** Clears the current targeting only. Hover and last-trick state are
 * untouched. */
export function cancelTargeting(ui: LocalUiState): LocalUiState {
  return { ...ui, targeting: null };
}

/** Builds and returns a fresh `RunAction` literal with exactly the keys
 * `parseRunAction` expects, only once every declared target is selected;
 * otherwise returns `{ ui, request: null }` unchanged. This is the ONLY
 * function in this module that can produce a request (D-02, T-12-03). */
export function confirmTargeting(ui: LocalUiState): { ui: LocalUiState; request: RunAction | null } {
  if (ui.targeting === null) return { ui, request: null };

  if (ui.targeting.mode === "gear") {
    if (nextTargetKind(ui) !== null) return { ui, request: null };
    const request: RunAction = {
      type: "use-gear",
      gearId: ui.targeting.gearId,
      targets: [...ui.targeting.selected],
    };
    return { ui: { ...ui, targeting: null }, request };
  }

  // whisper
  if (ui.targeting.cardId === null || ui.targeting.targetSeatId === null) return { ui, request: null };
  const request: RunAction = {
    type: "whisper",
    targetSeatId: ui.targeting.targetSeatId,
    cardId: ui.targeting.cardId,
  };
  return { ui: { ...ui, targeting: null }, request };
}

/** Reconciles local UI state against a freshly-received server view: clears
 * a gear targeting whose gear is no longer usable, clears a whisper
 * targeting once the window is no longer between-tricks, drops a selected
 * own-card target (and anything targeted after it) once that card leaves
 * the hand, resets a whisper whose selected card left the hand, and clears
 * hover on a card that left the hand. Never mutates `ui`. */
export function reconcileLocalUi(ui: LocalUiState, view: ExpeditionView): LocalUiState {
  let next = ui;
  const handIds = currentHandIds(view);

  if (next.targeting !== null) {
    if (next.targeting.mode === "gear") {
      const gearId = next.targeting.gearId;
      const status = view.yourGear.find((g) => g.gearId === gearId);
      if (!status || !status.usableNow) {
        next = { ...next, targeting: null };
      } else {
        const targets = GEAR_DISPLAY[gearId]?.targets ?? [];
        const selected = next.targeting.selected;
        let cutoff = selected.length;
        for (let i = 0; i < selected.length; i++) {
          if (targets[i] === "own-card" && !handIds.includes(selected[i]!)) {
            cutoff = i;
            break;
          }
        }
        if (cutoff < selected.length) {
          next = { ...next, targeting: { ...next.targeting, selected: selected.slice(0, cutoff) } };
        }
      }
    } else {
      if (view.attempt?.gearWindow !== "between-tricks") {
        next = { ...next, targeting: null };
      } else if (next.targeting.cardId !== null && !handIds.includes(next.targeting.cardId)) {
        next = { ...next, targeting: { mode: "whisper", cardId: null, targetSeatId: null } };
      }
    }
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

export function setTooltipGear(ui: LocalUiState, gearId: string | null): LocalUiState {
  return ui.tooltipGearId === gearId ? ui : { ...ui, tooltipGearId: gearId };
}
