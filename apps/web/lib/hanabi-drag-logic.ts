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

/** DRAG-01/D-08: per-slot pixel shift (along the hand's axis) for the
 * drop-gap preview during a hand reorder drag. Reuses `reorderedCardIds`'s
 * exact clamp/move semantics internally, so the gap the player sees is
 * always consistent with the reorder that would actually be submitted on
 * drop — this function decides no new legality and introduces no timer,
 * it is purely a function of the current hand order and drag state. The
 * dragged tile's own offset is always 0 (it tracks the pointer elsewhere,
 * not the gap). `draggedId === null` (no drag in progress) or an unknown
 * `draggedId` both yield all-zero offsets. */
export function shiftOffsetsForDrag(
  handIds: readonly string[],
  draggedId: string | null,
  targetIndex: number,
  slotPitchPx: number,
): Record<string, number> {
  const offsets: Record<string, number> = {};
  for (const id of handIds) {
    offsets[id] = 0;
  }
  if (draggedId === null || handIds.indexOf(draggedId) === -1) {
    return offsets;
  }
  const reordered = reorderedCardIds(handIds, draggedId, targetIndex);
  for (const id of handIds) {
    if (id === draggedId) continue;
    const finalIndex = reordered.indexOf(id);
    const originalIndex = handIds.indexOf(id);
    offsets[id] = (finalIndex - originalIndex) * slotPitchPx;
  }
  return offsets;
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

/** D-22: applies a pending optimistic order to `cards` without waiting for
 * the server's confirmed order. `pendingIds` must be an exact permutation of
 * `cards`' own ids (same length, every id present) — any mismatch (a stale
 * pending order from a card that has since been played/discarded/drawn, or
 * an id typo) returns `cards` unchanged rather than dropping/duplicating a
 * card. A `null` pendingIds also returns `cards` unchanged. */
export function applyPendingOrder<T extends { id: string }>(
  cards: T[],
  pendingIds: readonly string[] | null,
): T[] {
  if (pendingIds === null) {
    return cards;
  }
  if (pendingIds.length !== cards.length) {
    return cards;
  }
  const byId = new Map(cards.map((card) => [card.id, card]));
  const result: T[] = [];
  for (const id of pendingIds) {
    const card = byId.get(id);
    if (card === undefined) {
      return cards;
    }
    result.push(card);
  }
  return result;
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
