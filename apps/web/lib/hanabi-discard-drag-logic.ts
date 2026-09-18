import type { Suit } from "@games/rules";
import type { Point, Rect } from "./hanabi-drag-logic";
import { applyPendingOrder } from "./hanabi-drag-logic";

export type { Point, Rect };
// Re-exported rather than redefined (D-27/D-22): `applyPendingOrder` is
// already generic over `{ id: string }`, so it works verbatim for discard
// tiles' optimistic-order-before-server-confirmation rendering.
export { applyPendingOrder };

/**
 * DISC-01/D-24..D-28: pure discard-pile drop resolution, mirroring
 * `hanabi-drag-logic.ts`'s remove-then-insert move semantics and no-op-drop
 * discipline for the shared discard pile.
 *
 * Unlike own-hand reorder, a discard-pile drop never resolves to a
 * play/discard outcome — every completed drag inside the discard area is a
 * reorder (D-25: any seated player, no per-seat ownership check, legal
 * anytime). This module therefore has a single zone model (an ordered array
 * of tile rects) rather than `hanabi-drag-logic.ts`'s three-zone
 * (slots/play/discard) model.
 *
 * A stale submission (another discard landed mid-drag, or a card was
 * removed from the pile between this drag's start and its drop) is NOT
 * detected or rejected here — the server's `canReorderDiscard` permutation
 * check (06.2-01) is the sole legality gate (D-26). This module performs no
 * legality derivation of its own, imports nothing from React or the socket
 * layer, and silently produces a request the server may reject; a rejected
 * request just never lands, and the next real server frame reconciles the
 * dragging player's optimistic order (D-27, last-write-wins).
 */

export type DiscardDropRequest = { type: "reorderDiscard"; cardIds: string[] };

/** Moves `draggedId` to `targetIndex` in `order`, preserving the relative
 * order of every other id (remove-then-insert move semantics, not a swap).
 * An unknown `draggedId` returns `order` unchanged. An out-of-range
 * `targetIndex` clamps to the ends. */
export function reorderedDiscardIds(
  order: readonly string[],
  draggedId: string,
  targetIndex: number,
): string[] {
  const currentIndex = order.indexOf(draggedId);
  if (currentIndex === -1) {
    return [...order];
  }
  const without = order.filter((id) => id !== draggedId);
  const clampedIndex = Math.max(0, Math.min(targetIndex, without.length));
  const result = without.slice();
  result.splice(clampedIndex, 0, draggedId);
  return result;
}

/** Maps a pointer position against an ordered array of discard tile rects
 * (in current display order) to the index the dragged tile would land at —
 * `0` through `tiles.length` inclusive, where `tiles.length` means "after
 * the last tile". Compares against each tile's horizontal midpoint in
 * order, matching the simple axis-based geometry this codebase already uses
 * for own-hand slot resolution (`hanabi-drag-logic.ts`'s `resolveDropTarget`
 * point-in-rect checks) rather than introducing row/wrap-aware geometry. */
export function discardDropIndex(
  point: Point,
  tiles: ReadonlyArray<{ cardId: string; rect: Rect }>,
): number {
  for (let i = 0; i < tiles.length; i += 1) {
    const rect = tiles[i]!.rect;
    const midX = (rect.left + rect.right) / 2;
    if (point.x < midX) {
      return i;
    }
  }
  return tiles.length;
}

/** Resolves a completed discard-tile drop into the request to send, or
 * `null` when the resulting order equals the current order (a no-op drop
 * sends nothing). No legality/reconnecting/ended gate lives here — the
 * caller (the `useDiscardDrag` hook) is responsible for that, matching
 * `hanabi-drag-logic.ts`'s own division of responsibility. */
export function requestForDiscardDrop(
  targetIndex: number,
  draggedId: string,
  currentOrder: readonly string[],
): DiscardDropRequest | null {
  const cardIds = reorderedDiscardIds(currentOrder, draggedId, targetIndex);
  if (cardIds.join(",") === currentOrder.join(",")) {
    return null;
  }
  return { type: "reorderDiscard", cardIds };
}

/** UAT gap 10/DISC-01: the one place the "group by suit" sort is computed.
 * Its output is a `reorderDiscard` submission like any drag's — a shared
 * re-sort of the server's `discardOrder`, not a local view toggle (the owner
 * was asked explicitly and chose the shared re-sort). `canReorderDiscard`
 * (packages/rules/src/hanabi/legality.ts) validates server-side that the
 * result is an exact permutation of the current discard ids, so a bug here
 * is rejected, never silently applied.
 *
 * Sorts by `suit`'s position in `suitOrder` (never a hardcoded suit list —
 * `game.stacks.map((s) => s.suit)` is the caller's canonical source, correct
 * for every variant including Rainbow/Black), then by `rank` ascending, then
 * by the tile's existing index in `discard` — a total, deterministic order,
 * so the same input always produces the same output on every client and the
 * sort is idempotent on an already-grouped sequence. T-06.2-42: a suit
 * absent from `suitOrder` (a malformed/stale frame) sorts last rather than
 * throwing, so this can never break a click handler. Never mutates its
 * input — sorts a copy. */
export function groupedBySuitOrder(
  discard: readonly { id: string; suit: Suit; rank: number }[],
  suitOrder: readonly Suit[],
): string[] {
  function suitPosition(suit: Suit): number {
    const index = suitOrder.indexOf(suit);
    return index === -1 ? suitOrder.length : index;
  }

  return discard
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const suitDiff = suitPosition(a.card.suit) - suitPosition(b.card.suit);
      if (suitDiff !== 0) return suitDiff;
      const rankDiff = a.card.rank - b.card.rank;
      if (rankDiff !== 0) return rankDiff;
      return a.index - b.index;
    })
    .map(({ card }) => card.id);
}
