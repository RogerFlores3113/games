"use client";

import { useEffect, useRef, useState } from "react";
import type { HanabiView, Suit } from "@games/rules";
import { MAX_FUSES } from "@games/rules";
import { fusesRemainingForView } from "../../lib/hanabi-board-logic";
import { deckCountText, newlyCompletedStacks, STACK_FLASH_MS } from "../../lib/hanabi-visual-logic";
import { SuitGlyph } from "./SuitGlyph";

export interface TableProps {
  game: HanabiView;
}

/**
 * D-01: the tableau — stacks, tokens, deck/final-round count, and discard
 * pile — always rendered, no menu/drawer/tab/hover gate. D-11: a stack that
 * reaches rank 5 gets a single 600ms flash, never a continuously-running
 * animation.
 */
export function Table({ game }: TableProps) {
  const prevStacksRef = useRef<HanabiView["stacks"] | null>(null);
  const [flashingSuits, setFlashingSuits] = useState<ReadonlySet<Suit>>(new Set());

  useEffect(() => {
    const prevStacks = prevStacksRef.current;
    prevStacksRef.current = game.stacks;

    // Skip on first render so a refresh never replays the flash.
    if (prevStacks === null) return;

    const completed = newlyCompletedStacks(prevStacks, game.stacks);
    if (completed.length === 0) return;

    setFlashingSuits(new Set(completed));
    const timer = setTimeout(() => {
      setFlashingSuits(new Set());
    }, STACK_FLASH_MS);
    return () => clearTimeout(timer);
  }, [game.stacks]);

  const fusesRemaining = fusesRemainingForView(game);
  const fusesUsed = MAX_FUSES - fusesRemaining;

  return (
    <section
      data-testid="tableau"
      aria-label="Table"
      className="flex flex-wrap gap-[length:var(--space-md)] rounded-md border p-[length:var(--space-md)]"
      style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <div className="flex flex-wrap items-center gap-[length:var(--space-lg)]">
        <div className="flex flex-col gap-[length:var(--space-xs)]">
          <span
            className="text-[length:var(--text-label)] font-semibold"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            Fireworks
          </span>
          <div className="flex flex-wrap gap-[length:var(--space-sm)]">
            {game.stacks.map((stack) => {
              const complete = stack.topRank === 5;
              const flashing = flashingSuits.has(stack.suit);
              return (
                <div
                  key={stack.suit}
                  data-testid={"played-stack-" + stack.suit}
                  data-top-rank={stack.topRank}
                  data-complete={String(complete)}
                  className={"flex flex-col items-center justify-center gap-[length:var(--space-xs)] rounded-md" + (flashing ? " anim-stack-flash" : "")}
                  style={{
                    width: "48px",
                    height: "64px",
                    backgroundColor: "var(--color-surface)",
                    // Completed-stack static glow: same LUMINOSITY_FRAME "known" values as
                    // luminosity-frame.ts — inlined here since that module lives in 06-03's
                    // scope and this component consumes stack completion, not card facts.
                    border: complete ? "2px solid var(--color-card-glow)" : "1px solid var(--color-border)",
                    boxShadow: complete
                      ? "0 0 16px 0 rgba(255, 217, 138, 0.65), 0 0 4px 0 rgba(255, 217, 138, 0.9)"
                      : "none",
                  }}
                >
                  <SuitGlyph suit={stack.suit} size={18} exposeSuit />
                  <span className="sr-only">{stack.suit}</span>
                  <span
                    className="text-[length:var(--text-label)] font-semibold"
                    style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
                  >
                    {stack.topRank > 0 ? stack.topRank : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-[length:var(--space-xs)]">
          <p
            data-testid="clue-tokens"
            className="text-[length:var(--text-body)]"
            style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
          >
            {game.clueTokens} clue tokens
          </p>
          <div aria-hidden="true" className="flex gap-[length:var(--space-xs)]">
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: i < game.clueTokens ? "var(--color-text)" : "transparent",
                  border: i < game.clueTokens ? "none" : "1px solid var(--color-border)",
                }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-[length:var(--space-xs)]">
          <p
            data-testid="fuse-tokens"
            className="text-[length:var(--text-body)]"
            style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
          >
            {fusesRemaining} fuses left
          </p>
          <div aria-hidden="true" className="flex gap-[length:var(--space-xs)]">
            {Array.from({ length: MAX_FUSES }, (_, i) => (
              <span
                key={i}
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: i < fusesUsed ? "var(--color-destructive)" : "var(--color-text)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex w-full flex-wrap items-start gap-[length:var(--space-lg)]">
        <p
          data-testid="deck-count"
          data-final-round={String(game.finalTurnsRemaining !== null)}
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
        >
          {deckCountText(game)}
        </p>

        <div data-testid="discard-pile" className="flex flex-col gap-[length:var(--space-xs)]">
          <span
            className="text-[length:var(--text-label)] font-semibold"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            Discard
          </span>
          {game.discard.length > 0 ? (
            <ul className="flex max-w-full flex-wrap gap-[length:var(--space-xs)]">
              {game.discard.map((card) => (
                <li
                  key={card.id}
                  className="flex flex-col items-center justify-center gap-[length:var(--space-xs)] rounded-md border"
                  style={{
                    width: "48px",
                    height: "64px",
                    backgroundColor: "var(--color-surface)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <SuitGlyph suit={card.suit} size={18} exposeSuit />
                  <span className="sr-only">{card.suit}</span>
                  <span
                    className="text-[length:var(--text-label)] font-semibold"
                    style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
                  >
                    {card.rank}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p
              className="text-[length:var(--text-body)]"
              style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }}
            >
              No cards discarded yet
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
