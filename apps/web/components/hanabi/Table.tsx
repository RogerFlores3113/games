"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { Layers } from "lucide-react";
import type { HanabiView, Suit } from "@games/rules";
import { RANKS } from "@games/rules";
import { fusesRemainingForView } from "../../lib/hanabi-board-logic";
import { deckCountText, newlyCompletedStacks, STACK_FLASH_MS } from "../../lib/hanabi-visual-logic";
import { groupDiscardsBySuit, readDiscardViewPref, writeDiscardViewPref, type DiscardView } from "../../lib/hanabi-discard-logic";
import type { DropTarget, DropZoneStatus } from "../../lib/hanabi-drag-logic";
import { DECK_COUNTER_PX, DISCARD_AREA_PX, LEFT_COLUMN_PX, PLAY_AREA_PX } from "../../lib/layout-budget";
import { SUIT_VISUALS } from "../../lib/suit-visuals";
import { DiscardOverlay } from "./DiscardOverlay";
import { FireworkCardBack } from "./FireworkCard";
import { PlayedStack } from "./PlayedStack";
import { SuitGlyph } from "./SuitGlyph";
import { TokenColumn } from "./TokenColumn";

export interface TableDropStatus {
  play: DropZoneStatus;
  discard: DropZoneStatus;
  hovered: DropTarget["kind"];
}

export interface TableProps {
  game: HanabiView;
  playZoneRef?: RefObject<HTMLDivElement | null>;
  discardZoneRef?: RefObject<HTMLDivElement | null>;
  dropStatus?: TableDropStatus | null;
}

/** D-16: a drop-zone's box-shadow highlight (enabled zones only — a
 * disabled zone gets its reason label instead, never a glow implying it
 * will accept the drop). Stronger while the pointer is over this exact
 * zone. Adds no flow height — box-shadow paints outside layout. */
function dropZoneHighlightStyle(status: DropZoneStatus | undefined, hovered: boolean): CSSProperties {
  if (!status || !status.enabled) return {};
  return {
    boxShadow: hovered ? "0 0 0 4px var(--color-card-glow)" : "0 0 0 2px var(--color-card-glow)",
  };
}

/** Shared caption treatment for the Play/Discard area labels — reuses the
 * existing disabled-reason-caption typographic role (Label, muted, inset at
 * the outline's top-left corner) rather than a heading, per UI-SPEC. */
function AreaLabel({ children }: { children: string }) {
  return (
    <span
      className="text-[length:var(--text-label)] font-semibold"
      style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
    >
      {children}
    </span>
  );
}

/**
 * D-01: the tableau — stacks, tokens, deck/final-round count, and discard
 * pile — always rendered, no menu/drawer/tab/hover gate. D-11: a stack that
 * reaches rank 5 gets a single 600ms flash, never a continuously-running
 * animation.
 *
 * BOARD-01/BOARD-04/TILE-02 (Task 1 of 06.2-07's rework): a wooden
 * `.board-surface` panel laid out as a single `items-stretch` flex row with
 * two children — the left column (Play above Deck-counter above Discard,
 * each a fixed layout-budget height) and the right column (token totals,
 * swapped for the real `TokenColumn` in Task 2). Stack/discard art is
 * swapped for `PlayedStack`/`discardOrder` rendering in Tasks 2 and 3.
 */
export function Table({ game, playZoneRef, discardZoneRef, dropStatus = null }: TableProps) {
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
  const discardGroups = groupDiscardsBySuit(game.discard, game.variant).filter((group) => group.total > 0);

  const playHighlight = dropZoneHighlightStyle(dropStatus?.play, dropStatus?.hovered === "play");
  const discardHighlight = dropZoneHighlightStyle(dropStatus?.discard, dropStatus?.hovered === "discard");
  const playDropState = dropStatus ? (dropStatus.play.enabled ? "enabled" : "disabled") : undefined;
  const discardDropState = dropStatus ? (dropStatus.discard.enabled ? "enabled" : "disabled") : undefined;

  return (
    <section
      data-testid="tableau"
      aria-label="Table"
      className="board-surface flex items-stretch gap-[length:var(--space-md)] p-[length:var(--space-sm)]"
    >
      <div className="flex flex-col gap-[length:var(--space-xs)]" style={{ height: LEFT_COLUMN_PX }}>
        {/* Play area (BOARD-01) */}
        <div
          className="relative flex flex-col gap-[length:var(--space-xs)] overflow-hidden rounded-md border p-[length:var(--space-xs)]"
          style={{ height: PLAY_AREA_PX, borderColor: "var(--color-border)" }}
        >
          <AreaLabel>Play</AreaLabel>
          <div
            ref={playZoneRef}
            data-testid="play-zone"
            data-drop-state={playDropState}
            className="relative flex flex-1 flex-wrap items-center gap-[length:var(--space-sm)] rounded-md"
            style={playHighlight}
          >
            {dropStatus && !dropStatus.play.enabled && dropStatus.play.reason && (
              <span
                data-testid="drop-reason-play"
                role="status"
                className="pointer-events-none absolute z-10 whitespace-nowrap rounded px-[length:var(--space-xs)] text-[length:var(--text-label)]"
                style={{
                  bottom: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  marginBottom: 4,
                  color: "var(--color-text-muted)",
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  lineHeight: "var(--text-label--line-height)",
                }}
              >
                {dropStatus.play.reason}
              </span>
            )}
            {game.stacks.map((stack) => (
              <PlayedStack key={stack.suit} stack={stack} flashing={flashingSuits.has(stack.suit)} />
            ))}
          </div>
        </div>

        {/* Deck counter (BOARD-04), between Play and Discard */}
        <div
          className="flex items-center justify-center gap-[length:var(--space-xs)]"
          style={{ height: DECK_COUNTER_PX }}
        >
          <FireworkCardBack width={32} height={44} />
          <p
            data-testid="deck-count"
            data-final-round={String(game.finalTurnsRemaining !== null)}
            className="text-[length:var(--text-label)] font-semibold"
            style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
          >
            {deckCountText(game)}
          </p>
        </div>

        {/* Discard area (BOARD-01) */}
        <div
          className="relative flex flex-col gap-[length:var(--space-xs)] overflow-hidden rounded-md border p-[length:var(--space-xs)]"
          style={{ height: DISCARD_AREA_PX, borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-[length:var(--space-xs)]">
            <AreaLabel>Discard</AreaLabel>
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
              <span aria-hidden="true" className="absolute" style={{ inset: "var(--touch-inset)" }} />
            </button>
          </div>

          <div
            ref={discardZoneRef}
            data-testid="discard-pile"
            data-discard-count={game.discard.length}
            data-view={view}
            data-drop-state={discardDropState}
            className="relative flex flex-1 flex-col gap-[length:var(--space-xs)] overflow-hidden rounded-md"
            style={discardHighlight}
          >
            {dropStatus && !dropStatus.discard.enabled && dropStatus.discard.reason && (
              <span
                data-testid="drop-reason-discard"
                role="status"
                className="pointer-events-none absolute z-10 whitespace-nowrap rounded px-[length:var(--space-xs)] text-[length:var(--text-label)]"
                style={{
                  bottom: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  marginBottom: 4,
                  color: "var(--color-text-muted)",
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  lineHeight: "var(--text-label--line-height)",
                }}
              >
                {dropStatus.discard.reason}
              </span>
            )}
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
                No tiles discarded yet
              </p>
            )}
          </div>
        </div>
      </div>

      <TokenColumn clueTokens={game.clueTokens} fusesRemaining={fusesRemaining} columnHeightPx={LEFT_COLUMN_PX} />

      {view === "expanded" && (
        <DiscardOverlay discard={game.discard} variant={game.variant} onClose={closeExpandedView} />
      )}
    </section>
  );
}
