"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { HanabiView, Variant } from "@games/rules";
import { groupDiscardsBySuit } from "../../lib/hanabi-discard-logic";
import { SUIT_VISUALS } from "../../lib/suit-visuals";
import { FireworkCardFace } from "./FireworkCard";

export interface DiscardOverlayProps {
  discard: HanabiView["discard"];
  variant: Variant;
  onClose: () => void;
  /** D-09 (owner-revised 06.1-07): rank shown as burst count. Defaults true
   * to match the owner-approved compact/expanded card rendering elsewhere. */
  showBurstCount?: boolean;
}

/**
 * D-12/D-13: full-art expanded discard overlay. `EndOverlay`-shaped fixed
 * scrim + dialog panel over the still-visible table (layout underneath is
 * never shifted). Closes on the close button, a click on the scrim (not the
 * panel), or Escape. Every discarded card renders its owner-approved
 * `FireworkCardFace` (never `exposeSuit` — discards are already public via
 * `groupDiscardsBySuit`'s suit grouping and the sr-only label below, so the
 * card itself does not need the identity-leak-gated `data-glyph`/aria-label
 * path Task 2's compact stack heads use).
 */
export function DiscardOverlay({ discard, variant, onClose, showBurstCount = true }: DiscardOverlayProps) {
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

  const groups = groupDiscardsBySuit(discard, variant).filter((group) => group.total > 0);

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

        {groups.length > 0 ? (
          <div className="flex flex-col gap-[length:var(--space-sm)]">
            {groups.map((group) => {
              const cards = discard
                .filter((card) => card.suit === group.suit)
                .slice()
                .sort((a, b) => a.rank - b.rank);
              return (
                <div key={group.suit} className="flex flex-wrap gap-[length:var(--space-xs)]">
                  {cards.map((card) => (
                    <span
                      key={card.id}
                      data-testid="discard-overlay-card"
                      className="inline-flex flex-col items-center gap-[length:var(--space-xs)]"
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
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <p
            className="text-[length:var(--text-label)]"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            No cards discarded yet
          </p>
        )}
      </div>
    </div>
  );
}
