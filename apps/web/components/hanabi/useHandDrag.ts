"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { HanabiView } from "@games/rules";
import type { ActionContext } from "../../lib/hanabi-visual-logic";
import type { DropRequest, DropTarget, DropZones, Point } from "../../lib/hanabi-drag-logic";
import { exceedsDragThreshold, requestForDrop, resolveDropTarget } from "../../lib/hanabi-drag-logic";

/** D-18/D-22: a stale optimistic reorder is discarded (falls back to the
 * server's own order) once this much time has passed without a confirming
 * frame arriving. */
const PENDING_ORDER_TIMEOUT_MS = 2000;

export interface DragState {
  cardId: string;
  offset: Point;
  target: DropTarget;
}

export interface UseHandDragOptions {
  game: HanabiView | null;
  ctx: ActionContext;
  onDropRequest: (request: DropRequest) => void;
}

export interface UseHandDragResult {
  dragState: DragState | null;
  pendingOrder: string[] | null;
  droppedCardIdsRef: MutableRefObject<Set<string>>;
  registerSlot: (cardId: string, el: HTMLElement | null) => void;
  playZoneRef: RefObject<HTMLDivElement | null>;
  discardZoneRef: RefObject<HTMLDivElement | null>;
  onCardPointerDown: (cardId: string, event: ReactPointerEvent) => void;
  consumeClickSuppression: () => boolean;
}

/**
 * D-15/D-16/D-17/D-18/D-20/D-22: pointer-event own-hand drag. Every
 * legality/resolution decision routes through `hanabi-drag-logic.ts`'s pure
 * helpers (`resolveDropTarget`/`requestForDrop`) — this hook only tracks
 * pointer geometry and DOM refs, and calls `onDropRequest` exactly once per
 * completed drop (T-06.1-36). Nothing is sent on pointermove (D-18): the
 * hook never calls `onDropRequest` until pointerup resolves a target.
 */
export function useHandDrag({ game, ctx, onDropRequest }: UseHandDragOptions): UseHandDragResult {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const droppedCardIdsRef = useRef<Set<string>>(new Set());
  const slotsRef = useRef<Map<string, HTMLElement>>(new Map());
  const playZoneRef = useRef<HTMLDivElement | null>(null);
  const discardZoneRef = useRef<HTMLDivElement | null>(null);

  const startRef = useRef<Point | null>(null);
  const draggingCardIdRef = useRef<string | null>(null);
  const draggingActiveRef = useRef(false);
  const suppressClickRef = useRef(false);
  const pendingOrderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // T-06.1-37/T-06.1-38: latest game/ctx/onDropRequest read via refs inside
  // the window-level pointer handlers (subscribed once, see the effect
  // below) so a fresh game frame or a reconnecting/ended flip is never
  // resolved against a stale closure.
  const gameRef = useRef(game);
  const ctxRef = useRef(ctx);
  const onDropRequestRef = useRef(onDropRequest);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);
  useEffect(() => {
    onDropRequestRef.current = onDropRequest;
  }, [onDropRequest]);

  const registerSlot = useCallback((cardId: string, el: HTMLElement | null) => {
    if (el === null) {
      slotsRef.current.delete(cardId);
    } else {
      slotsRef.current.set(cardId, el);
    }
  }, []);

  const clearPendingOrderTimer = useCallback(() => {
    if (pendingOrderTimerRef.current !== null) {
      clearTimeout(pendingOrderTimerRef.current);
      pendingOrderTimerRef.current = null;
    }
  }, []);

  // D-22: clear the optimistic order whenever `game` changes identity (a new
  // server frame landed) — the server's own order is always authoritative.
  useEffect(() => {
    setPendingOrder(null);
    clearPendingOrderTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  useEffect(() => clearPendingOrderTimer, [clearPendingOrderTimer]);

  function buildZones(): DropZones {
    const slots = Array.from(slotsRef.current.entries()).map(([cardId, el]) => ({
      cardId,
      rect: el.getBoundingClientRect(),
    }));
    const play = playZoneRef.current !== null ? playZoneRef.current.getBoundingClientRect() : null;
    const discard = discardZoneRef.current !== null ? discardZoneRef.current.getBoundingClientRect() : null;
    return { slots, play, discard };
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
      const target = resolveDropTarget(point, buildZones());
      setDragState({ cardId, offset: { x: point.x - start.x, y: point.y - start.y }, target });
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
      const target = resolveDropTarget(point, buildZones());
      const handIds = game.yourHand.map((card) => card.id);
      const request = requestForDrop(target, cardId, handIds, game, ctxRef.current);

      if (request !== null) {
        if (request.type === "reorder") {
          setPendingOrder(request.cardIds);
          clearPendingOrderTimer();
          pendingOrderTimerRef.current = setTimeout(() => {
            pendingOrderTimerRef.current = null;
            setPendingOrder(null);
          }, PENDING_ORDER_TIMEOUT_MS);
        } else {
          droppedCardIdsRef.current.add(cardId);
        }
        // T-06.1-36: exactly one call per pointerup that resolves a request.
        onDropRequestRef.current(request);
      }

      suppressClickRef.current = true;
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

  function onCardPointerDown(cardId: string, event: ReactPointerEvent): void {
    if (event.button !== 0) return;
    if (ctx.reconnecting || ctx.ended) return;
    startRef.current = { x: event.clientX, y: event.clientY };
    draggingCardIdRef.current = cardId;
    draggingActiveRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function consumeClickSuppression(): boolean {
    const value = suppressClickRef.current;
    suppressClickRef.current = false;
    return value;
  }

  return {
    dragState,
    pendingOrder,
    droppedCardIdsRef,
    registerSlot,
    playZoneRef,
    discardZoneRef,
    onCardPointerDown,
    consumeClickSuppression,
  };
}
