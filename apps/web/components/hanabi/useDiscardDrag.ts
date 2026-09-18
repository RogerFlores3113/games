"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { HanabiView } from "@games/rules";
import type { ActionContext } from "../../lib/hanabi-visual-logic";
import { exceedsDragThreshold } from "../../lib/hanabi-drag-logic";
import type { Point, Rect } from "../../lib/hanabi-drag-logic";
import type { DiscardDropRequest } from "../../lib/hanabi-discard-drag-logic";
import { discardDropIndex, requestForDiscardDrop } from "../../lib/hanabi-discard-drag-logic";
import { screenPxToBoardPx } from "../../lib/board-zoom";

/** D-27: a stale optimistic reorder is discarded (falls back to the
 * server's own order) once this much time has passed without a confirming
 * frame arriving. Matches `useHandDrag.ts`'s own timeout exactly. */
const PENDING_ORDER_TIMEOUT_MS = 2000;

export interface DiscardDragState {
  cardId: string;
  offset: Point;
  targetIndex: number;
}

export interface UseDiscardDragOptions {
  game: HanabiView | null;
  ctx: ActionContext;
  onDropRequest: (request: DiscardDropRequest) => void;
  /** UAT gaps 27/28: mirrors `useHandDrag.ts`'s own `zoom` option — see that
   * hook's header comment. Defaults to 1 (no-op) for existing callers/tests
   * that predate zoom-awareness. */
  zoom?: number;
}

export interface UseDiscardDragResult {
  dragState: DiscardDragState | null;
  pendingOrder: string[] | null;
  registerTile: (cardId: string, el: HTMLElement | null) => void;
  onTilePointerDown: (cardId: string, event: ReactPointerEvent) => void;
}

/**
 * DISC-01/D-24/D-25/D-27: pointer-event discard-pile drag. Mirrors
 * `useHandDrag.ts`'s structure exactly (window-level pointermove/pointerup/
 * pointercancel, `setPointerCapture` on pointerdown, `game`/`ctx`/
 * `onDropRequest` read via refs inside the window handlers so a stale
 * closure never resolves against an old server frame, pending order cleared
 * whenever `game` changes identity, the same 2000ms pending-order timeout
 * fallback) — but its zone model is a single registered array of discard
 * tile rects, since every drop here is a reorder (no play/discard outcome,
 * no per-seat ownership check per D-25).
 */
export function useDiscardDrag({ game, ctx, onDropRequest, zoom = 1 }: UseDiscardDragOptions): UseDiscardDragResult {
  const [dragState, setDragState] = useState<DiscardDragState | null>(null);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const tilesRef = useRef<Map<string, HTMLElement>>(new Map());

  const startRef = useRef<Point | null>(null);
  const draggingCardIdRef = useRef<string | null>(null);
  const draggingActiveRef = useRef(false);
  const pendingOrderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest game/ctx/onDropRequest read via refs inside the window-level
  // pointer handlers (subscribed once, see the effect below) so a fresh
  // game frame or a reconnecting/ended flip is never resolved against a
  // stale closure — the same discipline as useHandDrag.ts.
  const gameRef = useRef(game);
  const ctxRef = useRef(ctx);
  const onDropRequestRef = useRef(onDropRequest);
  // UAT gaps 27/28: mirrors useHandDrag.ts's zoomRef — read inside the
  // window-level pointer handlers so a resize mid-drag never resolves
  // against a stale zoom factor.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);
  useEffect(() => {
    onDropRequestRef.current = onDropRequest;
  }, [onDropRequest]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const registerTile = useCallback((cardId: string, el: HTMLElement | null) => {
    if (el === null) {
      tilesRef.current.delete(cardId);
    } else {
      tilesRef.current.set(cardId, el);
    }
  }, []);

  const clearPendingOrderTimer = useCallback(() => {
    if (pendingOrderTimerRef.current !== null) {
      clearTimeout(pendingOrderTimerRef.current);
      pendingOrderTimerRef.current = null;
    }
  }, []);

  // D-27: clear the optimistic order whenever `game` changes identity (a
  // new server frame landed) — the server's own order is always
  // authoritative.
  useEffect(() => {
    setPendingOrder(null);
    clearPendingOrderTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  useEffect(() => clearPendingOrderTimer, [clearPendingOrderTimer]);

  /**
   * Rule 1 fix (surfaced by the post-06.2-21 board-size follow-up): the
   * currently-dragged tile must never appear in its own drop-index
   * comparison set. `discardDropIndex` compares the pointer against each
   * tile's rect in order, and the dragged tile's own rect visually FOLLOWS
   * the pointer (D-20's translate-to-cursor drag feedback) — since a
   * `dragLocatorTo`-style grab starts at the tile's own center, the
   * dragged tile's rect center coincides almost exactly with the pointer
   * for the entire drag, putting the very first comparison (against
   * itself) on a sub-pixel tie that a real browser's floating-point
   * layout resolves inconsistently. Depending on which side of that tie
   * the accumulated rounding lands, the drop can resolve to the dragged
   * tile's own original index — a silent no-op — before ever reaching the
   * OTHER (static) tiles' comparisons. Excluding the dragged id here
   * matches `useHandDrag.ts`'s own-hand equivalent, whose registered slot
   * rects are the STATIC layout positions (never the moving card), so it
   * never had this class of bug.
   */
  function buildTiles(excludeCardId: string | null): ReadonlyArray<{ cardId: string; rect: Rect }> {
    return Array.from(tilesRef.current.entries())
      .filter(([cardId]) => cardId !== excludeCardId)
      .map(([cardId, el]) => ({
        cardId,
        rect: el.getBoundingClientRect(),
      }));
  }

  function endDrag(): void {
    startRef.current = null;
    draggingCardIdRef.current = null;
    draggingActiveRef.current = false;
    setDragState(null);
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent): void {
      const cardId = draggingCardIdRef.current;
      const start = startRef.current;
      if (cardId === null || start === null) return;
      const point: Point = { x: event.clientX, y: event.clientY };
      if (!draggingActiveRef.current) {
        if (!exceedsDragThreshold(start, point)) return;
        draggingActiveRef.current = true;
      }
      const targetIndex = discardDropIndex(point, buildTiles(cardId));
      // UAT gap 27: same screen-px-to-pre-zoom-css-px conversion as
      // useHandDrag.ts — this offset is applied as a pre-zoom `translate()`
      // on the dragged tile (DiscardOverlay.tsx/Table.tsx).
      const zoomNow = zoomRef.current;
      setDragState({
        cardId,
        offset: {
          x: screenPxToBoardPx(point.x - start.x, zoomNow),
          y: screenPxToBoardPx(point.y - start.y, zoomNow),
        },
        targetIndex,
      });
    }

    function handlePointerUp(event: PointerEvent): void {
      const cardId = draggingCardIdRef.current;
      const wasActive = draggingActiveRef.current;
      const game = gameRef.current;
      if (cardId === null) return;

      if (!wasActive || game === null) {
        endDrag();
        return;
      }

      const point: Point = { x: event.clientX, y: event.clientY };
      const targetIndex = discardDropIndex(point, buildTiles(cardId));
      const request = requestForDiscardDrop(targetIndex, cardId, game.discardOrder);

      if (request !== null) {
        setPendingOrder(request.cardIds);
        clearPendingOrderTimer();
        pendingOrderTimerRef.current = setTimeout(() => {
          pendingOrderTimerRef.current = null;
          setPendingOrder(null);
        }, PENDING_ORDER_TIMEOUT_MS);
        // Exactly one call per pointerup that resolves a request.
        onDropRequestRef.current(request);
      }

      endDrag();
    }

    function handlePointerCancel(): void {
      endDrag();
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearPendingOrderTimer]);

  function onTilePointerDown(cardId: string, event: ReactPointerEvent): void {
    if (event.button !== 0) return;
    if (ctx.reconnecting || ctx.ended) return;
    startRef.current = { x: event.clientX, y: event.clientY };
    draggingCardIdRef.current = cardId;
    draggingActiveRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  return {
    dragState,
    pendingOrder,
    registerTile,
    onTilePointerDown,
  };
}
