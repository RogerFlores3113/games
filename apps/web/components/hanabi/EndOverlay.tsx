"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { HanabiView } from "@games/rules";
import { isStackComplete, maxScoreFor, variantConfig } from "@games/rules";
import { bandForView } from "../../lib/hanabi-board-logic";
import { END_REASON_COPY, endReasonForView } from "../../lib/hanabi-visual-logic";
import { SuitGlyph } from "./SuitGlyph";

export interface EndOverlayProps {
  game: HanabiView;
  /** Owner request (2026-09-18): only the host sees "Back to lobby". Hiding
   * it is a UX nicety, not the security boundary — the worker independently
   * refuses `restart_lobby` from a non-host with `not_host`. */
  isHost?: boolean;
  /** Absent for a non-host render. */
  onRestartLobby?: () => void;
}

/**
 * D-20/D-21: end-of-game modal over the still-visible board. Score/max,
 * band, the derived end reason (when non-null), every stack with glyph and
 * rank, "New game" linking to "/", and — host only, owner request
 * (2026-09-18) — "Back to lobby", which restarts the SAME room for
 * everyone rather than starting a brand new one.
 */
export function EndOverlay({ game, isHost = false, onRestartLobby }: EndOverlayProps) {
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
          {game.stacks.map((stack) => {
            const complete = isStackComplete(stack);
            const playedCount = stack.playedRanks.length;
            return (
              <li
                key={stack.suit}
                data-testid="end-stack"
                data-played-count={playedCount}
                data-complete={String(complete)}
                className="flex flex-col items-center justify-center gap-[length:var(--space-xs)] rounded-md"
                style={{
                  width: "48px",
                  height: "64px",
                  backgroundColor: "var(--color-surface)",
                  border: complete ? "2px solid var(--color-card-glow)" : "1px solid var(--color-border)",
                  boxShadow: complete
                    ? "0 0 16px 0 rgba(255, 217, 138, 0.65), 0 0 4px 0 rgba(255, 217, 138, 0.9)"
                    : "none",
                }}
              >
                <SuitGlyph suit={stack.suit} size={18} title={stack.suit} />
                <span
                  className="text-[length:var(--text-label)] font-semibold"
                  style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
                >
                  {playedCount > 0 ? playedCount : "—"}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-center gap-[length:var(--space-sm)]">
          {isHost && onRestartLobby && (
            <button
              type="button"
              data-testid="restart-lobby-button"
              onClick={onRestartLobby}
              className="inline-flex items-center justify-center gap-2 rounded-md border px-4 text-[length:var(--text-label)] font-semibold transition-colors hover:bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              style={{
                minHeight: "var(--size-touch-min)",
                minWidth: "var(--size-touch-min)",
                borderColor: "var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              Back to lobby
            </button>
          )}

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
    </div>
  );
}
