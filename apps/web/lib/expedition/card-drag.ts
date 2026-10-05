export interface Point {
  x: number;
  y: number;
}

/**
 * The life of one hand-card gesture, as a state machine. A press becomes a
 * drag only once the pointer travels `DRAG_THRESHOLD` stage px, so a plain
 * click stays a click. A card dropped over the table plays it when legal;
 * every other release sends it back to its slot, with the reason when the
 * card was illegal. Pure: the scene feeds pointer events in and runs the
 * returned effect.
 */

export const DRAG_THRESHOLD = 4;

export type DragState =
  | { phase: "idle" }
  | { phase: "pressed"; cardId: string; origin: Point; legal: boolean; reason: string | null }
  | { phase: "dragging"; cardId: string; legal: boolean; reason: string | null }
  | { phase: "returning"; cardId: string; reason: string | null }
  /** Dropped on the table and sent to the server: the card stays out of the
   * hand until the next view takes it. */
  | { phase: "playing"; cardId: string };

export type DragEvent =
  | { type: "press"; cardId: string; at: Point; legal: boolean; reason: string | null }
  | { type: "move"; at: Point }
  /** `overTable`: the pointer is over the table zone (layout.ts decides). */
  | { type: "release"; overTable: boolean }
  | { type: "settle" }
  | { type: "cancel" };

/** What the scene must do besides adopt the new state. */
export type DragEffect = { kind: "none" } | { kind: "click"; cardId: string } | { kind: "play"; cardId: string };

export const IDLE_DRAG: DragState = { phase: "idle" };

const NONE: DragEffect = { kind: "none" };

export function reduceDrag(state: DragState, event: DragEvent): { state: DragState; effect: DragEffect } {
  switch (event.type) {
    case "press":
      if (state.phase !== "idle" && state.phase !== "returning") return { state, effect: NONE };
      return { state: { phase: "pressed", cardId: event.cardId, origin: event.at, legal: event.legal, reason: event.reason }, effect: NONE };
    case "move": {
      if (state.phase !== "pressed") return { state, effect: NONE };
      const travelled = Math.hypot(event.at.x - state.origin.x, event.at.y - state.origin.y);
      if (travelled < DRAG_THRESHOLD) return { state, effect: NONE };
      return { state: { phase: "dragging", cardId: state.cardId, legal: state.legal, reason: state.reason }, effect: NONE };
    }
    case "release":
      if (state.phase === "pressed") {
        if (state.legal) return { state: IDLE_DRAG, effect: { kind: "click", cardId: state.cardId } };
        return { state: { phase: "returning", cardId: state.cardId, reason: state.reason }, effect: NONE };
      }
      if (state.phase === "dragging") {
        if (state.legal && event.overTable) return { state: { phase: "playing", cardId: state.cardId }, effect: { kind: "play", cardId: state.cardId } };
        return { state: { phase: "returning", cardId: state.cardId, reason: state.legal ? null : state.reason }, effect: NONE };
      }
      return { state, effect: NONE };
    case "settle":
      return { state: state.phase === "returning" || state.phase === "playing" ? IDLE_DRAG : state, effect: NONE };
    case "cancel":
      return { state: IDLE_DRAG, effect: NONE };
  }
}

/** The card a gesture holds, or null when idle. */
export function gestureCardId(state: DragState): string | null {
  return state.phase === "idle" ? null : state.cardId;
}
