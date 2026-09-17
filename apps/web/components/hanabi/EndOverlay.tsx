"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { HanabiView } from "@games/rules";
import { maxScoreFor, variantConfig } from "@games/rules";
import { bandForView } from "../../lib/hanabi-board-logic";
import { END_REASON_COPY, endReasonForView } from "../../lib/hanabi-visual-logic";
import { SuitGlyph } from "./SuitGlyph";

export interface EndOverlayProps {
  game: HanabiView;
}

/**
 * D-20/D-21: end-of-game modal over the still-visible board. Score/max,
 * band, the derived end reason (when non-null), every stack with glyph and
 * rank, and a single "New game" action linking to "/" — no other action exists.
 */
export function EndOverlay({ game }: EndOverlayProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const reason = endReasonForView(game);
  const maxScore = maxScoreFor(variantConfig(game.variant));

  useEffect(() => {
    linkRef.current?.focus();
  }, []);

  return (
    <div
      data-testid="end-overlay"
      className="fixed inset-0 flex items-center justify-center p-[length:var(--space-md)]"
      style={{ background: "rgba(11, 15, 26, 0.7)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-heading"
        className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-lg border-2 p-[length:var(--space-lg)] text-center"
        style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <h2
          id="game-over-heading"
          data-testid="game-over-heading"
          className="font-semibold"
          style={{ color: "var(--color-text)", fontSize: "var(--text-heading)", lineHeight: "var(--text-heading--line-height)" }}
        >
          Game over
        </h2>

        <p
          data-testid="final-score"
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
        >
          {`Final score: ${game.score} / ${maxScore} — ${bandForView(game)}`}
        </p>

        {reason !== null && (
          <p
            data-testid="end-reason"
            className="text-[length:var(--text-label)]"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            {END_REASON_COPY[reason]}
          </p>
        )}

        <ul data-testid="end-stacks" className="flex flex-wrap justify-center gap-[length:var(--space-sm)]">
          {game.stacks.map((stack) => (
            <li
              key={stack.suit}
              data-testid="end-stack"
              data-top-rank={stack.topRank}
              data-complete={String(stack.topRank === 5)}
              className="flex flex-col items-center justify-center gap-[length:var(--space-xs)] rounded-md"
              style={{
                width: "48px",
                height: "64px",
                backgroundColor: "var(--color-surface)",
                border: stack.topRank === 5 ? "2px solid var(--color-card-glow)" : "1px solid var(--color-border)",
                boxShadow:
                  stack.topRank === 5
                    ? "0 0 16px 0 rgba(255, 217, 138, 0.65), 0 0 4px 0 rgba(255, 217, 138, 0.9)"
                    : "none",
              }}
            >
              <SuitGlyph suit={stack.suit} size={18} title={stack.suit} />
              <span
                className="text-[length:var(--text-label)] font-semibold"
                style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
              >
                {stack.topRank > 0 ? stack.topRank : "—"}
              </span>
            </li>
          ))}
        </ul>

        <Link
          ref={linkRef}
          href="/"
          data-testid="new-game-link"
          className="inline-flex items-center justify-center gap-2 rounded-md px-4 text-[length:var(--text-label)] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-bg)] hover:brightness-95"
          style={{ minHeight: "var(--size-touch-min)", minWidth: "var(--size-touch-min)" }}
        >
          New game
        </Link>
      </div>
    </div>
  );
}
