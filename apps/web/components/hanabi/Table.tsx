"use client";

import { useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import type { HanabiView, Suit } from "@games/rules";
import { MAX_FUSES, RANKS } from "@games/rules";
import { fusesRemainingForView } from "../../lib/hanabi-board-logic";
import { deckCountText, newlyCompletedStacks, STACK_FLASH_MS } from "../../lib/hanabi-visual-logic";
import { groupDiscardsBySuit, readDiscardViewPref, writeDiscardViewPref, type DiscardView } from "../../lib/hanabi-discard-logic";
import { SUIT_VISUALS } from "../../lib/suit-visuals";
import { DiscardOverlay } from "./DiscardOverlay";
import { FireworkCardFace } from "./FireworkCard";
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
  const flashClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // D-13: initial state is "compact" for SSR safety — the real (possibly
  // "expanded") preference is only readable client-side, so it is applied in
  // a mount effect rather than as the initializer.
  const [view, setView] = useState<DiscardView>("compact");

  useEffect(() => {
    setView(readDiscardViewPref());
  }, []);

  function closeExpandedView() {
    setView("compact");
    writeDiscardViewPref("compact");
  }

  function openExpandedView() {
    setView("expanded");
    writeDiscardViewPref("expanded");
  }

  // Unmount-only cleanup for the flash-clear timer.
  useEffect(
    () => () => {
      if (flashClearTimerRef.current !== null) clearTimeout(flashClearTimerRef.current);
    },
    [],
  );

  // WR-01: `game.stacks` is a new array on every server frame, so the clear
  // timer must NOT be this effect's cleanup — a frame inside the flash window
  // would cancel it and leave the flash stuck on.
  useEffect(() => {
    const prevStacks = prevStacksRef.current;
    prevStacksRef.current = game.stacks;

    // Skip on first render so a refresh never replays the flash.
    if (prevStacks === null) return;

    const completed = newlyCompletedStacks(prevStacks, game.stacks);
    if (completed.length === 0) return;

    setFlashingSuits(new Set(completed));
    if (flashClearTimerRef.current !== null) clearTimeout(flashClearTimerRef.current);
    flashClearTimerRef.current = setTimeout(() => {
      flashClearTimerRef.current = null;
      setFlashingSuits(new Set());
    }, STACK_FLASH_MS);
  }, [game.stacks]);

  const fusesRemaining = fusesRemainingForView(game);
  const fusesUsed = MAX_FUSES - fusesRemaining;
  const discardGroups = groupDiscardsBySuit(game.discard, game.variant).filter((group) => group.total > 0);

  return (
    <section
      data-testid="tableau"
      aria-label="Table"
      className="flex flex-wrap gap-[length:var(--space-sm)] rounded-md border p-[length:var(--space-xs)]"
      style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <div className="flex flex-wrap items-center gap-[length:var(--space-md)]">
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
                  {stack.topRank > 0 ? (
                    // Owner override (06.1-07): FireworkCardFace has no
                    // numeralSize prop — rank reads from burst count only.
                    <FireworkCardFace
                      suit={stack.suit}
                      rank={stack.topRank as 1 | 2 | 3 | 4 | 5}
                      width={48}
                      height={64}
                      exposeSuit
                      showBurstCount
                    />
                  ) : (
                    <>
                      <span style={{ opacity: 0.35 }}>
                        <SuitGlyph suit={stack.suit} size={18} exposeSuit />
                      </span>
                      <span
                        className="text-[length:var(--text-label)] font-semibold"
                        style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
                      >
                        —
                      </span>
                    </>
                  )}
                  <span className="sr-only">{stack.suit}</span>
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

      <div className="flex w-full flex-wrap items-start gap-[length:var(--space-md)]">
        <p
          data-testid="deck-count"
          data-final-round={String(game.finalTurnsRemaining !== null)}
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
        >
          {deckCountText(game)}
        </p>

        <div
          data-testid="discard-pile"
          data-discard-count={game.discard.length}
          data-view={view}
          className="flex flex-col gap-[length:var(--space-xs)]"
        >
          <div className="flex items-center gap-[length:var(--space-xs)]">
            <span
              className="text-[length:var(--text-label)] font-semibold"
              style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
            >
              Discard
            </span>
            <button
              type="button"
              data-testid="discard-toggle"
              aria-label="Show full discard pile"
              onClick={openExpandedView}
              // The visible/flow box stays icon-sized so this header row does
              // not grow past the "Discard" label's own height (needed for
              // the UI-11 1280x720 no-scroll fit) — the 44px touch target is
              // provided by an absolutely-positioned (out-of-flow) pseudo
              // element instead, per --size-touch-min.
              className="relative inline-flex items-center justify-center rounded-md before:absolute before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              style={{
                width: 16,
                height: 16,
                color: "var(--color-text-muted)",
                ["--touch-inset" as string]: "calc((var(--size-touch-min) - 16px) / -2)",
              }}
            >
              <Layers aria-hidden="true" size={16} />
              <span
                aria-hidden="true"
                className="absolute"
                style={{ inset: "var(--touch-inset)" }}
              />
            </button>
          </div>

          {discardGroups.length > 0 ? (
            <div className="flex flex-col gap-[length:var(--space-xs)]">
              {discardGroups.map((group) => (
                <div key={group.suit} className="flex items-center gap-[length:var(--space-xs)]">
                  <SuitGlyph suit={group.suit} size={14} title={SUIT_VISUALS[group.suit].label} />
                  <span
                    className="text-[length:var(--text-label)]"
                    style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
                  >
                    {RANKS.filter((rank) => (group.countsByRank[rank - 1] ?? 0) > 0)
                      .map((rank) => `${rank}×${group.countsByRank[rank - 1] ?? 0}`)
                      .join(" ")}
                  </span>
                </div>
              ))}
            </div>
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

      {view === "expanded" && (
        <DiscardOverlay discard={game.discard} variant={game.variant} onClose={closeExpandedView} />
      )}
    </section>
  );
}
