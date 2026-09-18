"use client";

import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Group, X } from "lucide-react";
import type { HanabiView, Variant } from "@games/rules";
import { applyPendingOrder } from "../../lib/hanabi-discard-drag-logic";
import { SUIT_VISUALS } from "../../lib/suit-visuals";
import { FireworkCardFace } from "./FireworkCard";
import type { DiscardDragState } from "./useDiscardDrag";

export interface DiscardOverlayProps {
  discard: HanabiView["discard"];
  /** DISC-01: the shared, server-authoritative discard arrangement.
   * Defaults to `discard`'s own array order when omitted (pre-DISC-01
   * callers, and the render-test fixtures that predate this prop) so the
   * overlay still renders a sensible sequence without it. */
  discardOrder?: readonly string[];
  variant: Variant;
  onClose: () => void;
  /** D-09 (owner-revised 06.1-07): rank shown as burst count. Defaults true
   * to match the owner-approved compact/expanded card rendering elsewhere. */
  showBurstCount?: boolean;
  /** DISC-01: the same discard-pile drag wiring `Table.tsx`'s compact view
   * uses (from `useDiscardDrag`, threaded through `HanabiBoard`), so a tile
   * can be rearranged from this expanded view too — both views read and
   * edit the one shared `discardOrder`. Omitted entirely, the overlay is
   * still fully readable, just not draggable. */
  discardDragState?: DiscardDragState | null;
  discardPendingOrder?: string[] | null;
  registerDiscardTile?: (cardId: string, el: HTMLElement | null) => void;
  onDiscardTilePointerDown?: (cardId: string, event: ReactPointerEvent) => void;
  /** UAT gap 10/DISC-01: same shared re-sort `Table.tsx`'s compact discard
   * header offers — this is where the suit grouping was lost when the
   * single shared draggable order landed, so the expanded view gets its own
   * copy of the control. Omitted entirely, the overlay renders as before. */
  onGroupDiscardBySuit?: () => void;
}

/** DISC-01/T-06.2-15: mirrors `Table.tsx`'s `resolveDiscardOrder` exactly —
 * an id in `discardOrder` with no matching `discard` entry is skipped
 * (never thrown), and a `discard` entry missing from `discardOrder` (a
 * malformed/stale frame) is appended at the end so a real discarded tile
 * can never be hidden. Kept as a sibling copy rather than a shared import
 * to stay within this task's own file list; both copies must stay in sync
 * if the defensive rule ever changes. */
function resolveDiscardOrder(
  discardOrder: readonly string[],
  discard: HanabiView["discard"],
): HanabiView["discard"] {
  const byId = new Map(discard.map((card) => [card.id, card]));
  const seen = new Set<string>();
  const ordered: HanabiView["discard"] = [];
  for (const id of discardOrder) {
    const card = byId.get(id);
    if (!card) continue;
    ordered.push(card);
    seen.add(id);
  }
  for (const card of discard) {
    if (!seen.has(card.id)) ordered.push(card);
  }
  return ordered;
}

/**
 * D-12/D-13: full-art expanded discard overlay. `EndOverlay`-shaped fixed
 * scrim + dialog panel over the still-visible table (layout underneath is
 * never shifted). Closes on the close button, a click on the scrim (not the
 * panel), or Escape. Every discarded card renders its owner-approved
 * `FireworkCardFace` (never `exposeSuit` — discards are already public, so
 * the card itself does not need the identity-leak-gated `data-glyph`/
 * aria-label path Task 2's compact stack heads use).
 *
 * DISC-01: tiles render in the shared `discardOrder` sequence (not grouped
 * by suit) — a linear sequence is what dragging rearranges, and grouping by
 * suit would conflict with a single shared position-based order that must
 * render identically here and on the board.
 */
export function DiscardOverlay({
  discard,
  discardOrder,
  variant: _variant,
  onClose,
  showBurstCount = true,
  discardDragState = null,
  discardPendingOrder = null,
  registerDiscardTile,
  onDiscardTilePointerDown,
  onGroupDiscardBySuit,
}: DiscardOverlayProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const serverOrdered = resolveDiscardOrder(discardOrder ?? discard.map((card) => card.id), discard);
  const orderedDiscard = applyPendingOrder(serverOrdered, discardPendingOrder ?? null);

  return (
    <div
      data-testid="discard-overlay"
      className="fixed inset-0 flex items-center justify-center p-[length:var(--space-md)]"
      style={{ background: "rgba(11, 15, 26, 0.7)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-overlay-heading"
        className="mx-auto flex max-h-full w-full max-w-3xl flex-col gap-[length:var(--space-md)] overflow-y-auto rounded-lg border-2 p-[length:var(--space-lg)]"
        style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-[length:var(--space-md)]">
          <h2
            id="discard-overlay-heading"
            className="font-semibold"
            style={{
              color: "var(--color-text)",
              fontSize: "var(--text-heading)",
              lineHeight: "var(--text-heading--line-height)",
            }}
          >
            Discard pile
          </h2>
          <div className="flex items-center gap-[length:var(--space-xs)]">
            <button
              type="button"
              data-testid="discard-overlay-group-by-suit"
              aria-label="Group discard by suit"
              onClick={onGroupDiscardBySuit}
              disabled={!onGroupDiscardBySuit || discard.length < 2}
              className="inline-flex items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-40"
              style={{
                minHeight: "var(--size-touch-min)",
                minWidth: "var(--size-touch-min)",
                color: "var(--color-text)",
              }}
            >
              <Group aria-hidden="true" size={20} />
            </button>
            <button
              ref={closeRef}
              type="button"
              data-testid="discard-overlay-close"
              aria-label="Show compact discard pile"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              style={{
                minHeight: "var(--size-touch-min)",
                minWidth: "var(--size-touch-min)",
                color: "var(--color-text)",
              }}
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>
        </div>

        {orderedDiscard.length > 0 ? (
          <div className="flex flex-wrap gap-[length:var(--space-sm)]">
            {orderedDiscard.map((card) => {
              const dragging = discardDragState?.cardId === card.id;
              // D-20: mirrors the board's compact tiles and OwnHandCard's
              // own drag-lift transform.
              const dragTransform =
                dragging && discardDragState
                  ? `translate(${discardDragState.offset.x}px, ${discardDragState.offset.y}px) scale(1.05)`
                  : undefined;
              return (
                <span
                  key={card.id}
                  ref={(el) => registerDiscardTile?.(card.id, el)}
                  data-testid="discard-overlay-card"
                  data-dragging={String(dragging)}
                  onPointerDown={(event) => onDiscardTilePointerDown?.(card.id, event)}
                  className={
                    "relative inline-flex flex-col items-center gap-[length:var(--space-xs)]" +
                    (dragging ? " cursor-grabbing" : " cursor-grab") +
                    (dragging ? "" : " drag-snap")
                  }
                  style={{
                    transform: dragTransform,
                    zIndex: dragging ? 10 : undefined,
                    touchAction: "none",
                  }}
                >
                  <FireworkCardFace
                    suit={card.suit}
                    rank={card.rank}
                    width={48}
                    height={64}
                    showBurstCount={showBurstCount}
                  />
                  <span className="sr-only">{`${SUIT_VISUALS[card.suit].label} ${card.rank}`}</span>
                </span>
              );
            })}
          </div>
        ) : (
          // UAT gap 24 (fourth owner review): "remove the 'No tiles discarded
          // yet'" — empty means empty, no placeholder copy. The dialog's own
          // heading ("Discard pile") plus the empty content area already
          // communicate the state.
          <p className="sr-only">No cards discarded yet</p>
        )}
      </div>
    </div>
  );
}
