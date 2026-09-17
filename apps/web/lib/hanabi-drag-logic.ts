import type { HanabiView } from "@games/rules";
import type { ActionContext, ActionIntent } from "./hanabi-visual-logic";
import { disabledReasonFor } from "./hanabi-visual-logic";

/**
 * D-15/D-16/D-17/D-19/D-20: pure drag-drop resolution for own-hand
 * reorder/play/discard. Pointer-event based (never the legacy HTML5 Drag
 * and Drop API) so touch can be added later without a rewrite (D-20).
 * Keyboard reorder is deliberately absent (D-19) — Play/Discard buttons
 * remain the keyboard fallback for actions (HAND-02), unaffected by this
 * module.
 *
 * Play/discard legality is NEVER re-derived here — every disabled/enabled
 * decision for those two zones dispatches through `disabledReasonFor`
 * (hanabi-visual-logic.ts), the same chokepoint the action buttons use.
 * Reorder's off-turn-allowed / reconnecting-blocked rule is not a
 * view-derived legality rule (D-17 says reorder is legal anytime including
 * off-turn) — it mirrors `HanabiBoard`'s own `act()` guard and is checked
 * directly against `ctx.reconnecting`/`ctx.ended`, never against whose
 * turn it currently is.
 */

export const DRAG_THRESHOLD_PX = 6;

export type Point = { x: number; y: number };

export type Rect = { left: number; top: number; right: number; bottom: number };

export type DropZones = {
  slots: ReadonlyArray<{ cardId: string; rect: Rect }>;
  play: Rect | null;
  discard: Rect | null;
};

export type DropTarget =
  | { kind: "reorder"; targetIndex: number }
  | { kind: "play" }
  | { kind: "discard" }
  | { kind: "none" };

export type DropRequest =
  | { type: "reorder"; cardIds: string[] }
  | { type: "play"; cardId: string }
  | { type: "discard"; cardId: string };

/** Euclidean distance between `start` and `current`, at or past
 * `DRAG_THRESHOLD_PX`. */
export function exceedsDragThreshold(start: Point, current: Point): boolean {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  return Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD_PX;
}

function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/** Resolves a drop point against every zone. Reorder slots are checked
 * before play/discard (own-hand slots sit between the two zones on the
 * board). Outside every zone (or a null play/discard zone) resolves to
 * `{ kind: "none" }` — the drag snaps back. */
export function resolveDropTarget(point: Point, zones: DropZones): DropTarget {
  for (let i = 0; i < zones.slots.length; i += 1) {
    const slot = zones.slots[i];
    if (slot !== undefined && pointInRect(point, slot.rect)) {
      return { kind: "reorder", targetIndex: i };
    }
  }
  if (zones.play !== null && pointInRect(point, zones.play)) {
    return { kind: "play" };
  }
  if (zones.discard !== null && pointInRect(point, zones.discard)) {
    return { kind: "discard" };
  }
  return { kind: "none" };
}

/** Moves `draggedId` to `targetIndex` in `handIds`, preserving the relative
 * order of every other card (remove-then-insert move semantics, not a
 * swap). An unknown `draggedId` returns `handIds` unchanged. */
export function reorderedCardIds(
  handIds: readonly string[],
  draggedId: string,
  targetIndex: number,
): string[] {
  const currentIndex = handIds.indexOf(draggedId);
  if (currentIndex === -1) {
    return [...handIds];
  }
  const without = handIds.filter((id) => id !== draggedId);
  const clampedIndex = Math.max(0, Math.min(targetIndex, without.length));
  const result = without.slice();
  result.splice(clampedIndex, 0, draggedId);
  return result;
}

export type DropZoneStatus = { enabled: boolean; reason: string | null };

/** Wraps `disabledReasonFor` for a drag zone — adds no rule of its own. */
export function dropZoneStatus(
  view: HanabiView,
  zone: "play" | "discard",
  draggedCardId: string,
  ctx: ActionContext,
): DropZoneStatus {
  const intent: ActionIntent = { kind: zone, selectedCardId: draggedCardId };
  const reason = disabledReasonFor(view, intent, ctx);
  return { enabled: reason === null, reason };
}

/** Resolves a completed drop into the request to send, or `null` when the
 * drop should be a no-op (unchanged reorder, disabled zone, "none" target,
 * or reconnecting/ended for a reorder). */
export function requestForDrop(
  target: DropTarget,
  draggedCardId: string,
  handIds: readonly string[],
  view: HanabiView,
  ctx: ActionContext,
): DropRequest | null {
  if (target.kind === "none") {
    return null;
  }

  if (target.kind === "reorder") {
    if (ctx.reconnecting || ctx.ended) {
      return null;
    }
    const cardIds = reorderedCardIds(handIds, draggedCardId, target.targetIndex);
    if (cardIds.join(",") === handIds.join(",")) {
      return null;
    }
    return { type: "reorder", cardIds };
  }

  const status = dropZoneStatus(view, target.kind, draggedCardId, ctx);
  if (!status.enabled) {
    return null;
  }
  return { type: target.kind, cardId: draggedCardId };
}
