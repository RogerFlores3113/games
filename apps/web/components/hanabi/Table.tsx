"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { Group, Layers } from "lucide-react";
import type { HanabiView, Suit } from "@games/rules";
import { nextPlayableRank, variantConfig } from "@games/rules";
import { fusesRemainingForView } from "../../lib/hanabi-board-logic";
import { deckCountText, newlyCompletedStacks, STACK_FLASH_MS } from "../../lib/hanabi-visual-logic";
import { readDiscardViewPref, writeDiscardViewPref, type DiscardView } from "../../lib/hanabi-discard-logic";
import type { DropTarget, DropZoneStatus } from "../../lib/hanabi-drag-logic";
import { applyPendingOrder } from "../../lib/hanabi-discard-drag-logic";
import type { DiscardDragState } from "./useDiscardDrag";
import {
  BOARD_INNER_PX,
  BOARD_PANEL_PADDING_PX,
  DECK_COUNTER_CARD_HEIGHT_PX,
  DECK_COUNTER_CARD_WIDTH_PX,
  DECK_COUNTER_PX,
  DISCARD_AREA_HEIGHT_PX,
  DISCARD_AREA_WIDTH_PX,
  DISCARD_TILE_HEIGHT_PX,
  DISCARD_TILE_WIDTH_PX,
  MIDDLE_GAP_PX,
  PLAY_AREA_HEIGHT_PX,
  PLAY_AREA_WIDTH_PX,
  SUIT_COLUMN_GAP_PX,
  TOKEN_AREA_WIDTH_PX,
  TURN_SIGN_HEIGHT_PX,
  TURN_SIGN_WIDTH_PX,
} from "../../lib/layout-budget";
import { SUIT_VISUALS } from "../../lib/suit-visuals";
import { DiscardOverlay } from "./DiscardOverlay";
import { FireworkCardBack, FireworkCardFace } from "./FireworkCard";
import { PlayedStack } from "./PlayedStack";
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
  /** DISC-01: discard-pile drag wiring, threaded through from
   * `useDiscardDrag` via `HanabiBoard`. Optional so `table-render.test.ts`'s
   * existing render calls (which predate this plan) keep working unchanged. */
  discardDragState?: DiscardDragState | null;
  discardPendingOrder?: string[] | null;
  registerDiscardTile?: (cardId: string, el: HTMLElement | null) => void;
  onDiscardTilePointerDown?: (cardId: string, event: ReactPointerEvent) => void;
  /** UAT gap 10/DISC-01: re-sorts the shared discard order by suit for every
   * player via the existing `reorderDiscard` action (see
   * `groupedBySuitOrder`'s header comment). Optional so pre-06.2-18 render
   * calls keep working unchanged; the button below is disabled whenever this
   * is absent. */
  onGroupDiscardBySuit?: () => void;
  /** UAT gap 37 (seventh owner review): the board-level turn sign's copy —
   * "{name}'s turn" / "Your turn!" / "" once the game has ended — computed
   * by `turnSignText` (hanabi-board-logic.ts) and threaded straight through
   * from `HanabiBoard`, same pattern as `OwnHand`'s existing `turnText`
   * prop. Optional so pre-existing `table-render.test.ts` calls keep
   * working unchanged; renders nothing when absent/empty. */
  turnSignText?: string;
  /** UAT gap 38: whether the viewer's own turn is current — gates the
   * "Your turn!" text onto `--color-turn` (violet), matching the own-hand
   * turn-indicator's own accent treatment. */
  isYourTurn?: boolean;
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

/** BOARD-01/DISC-01/T-06.2-15: resolves the board's discard tile sequence
 * from the server-authoritative `discardOrder`, defensively. An id in
 * `discardOrder` with no matching `discard` entry is skipped (never thrown);
 * a `discard` entry missing from `discardOrder` (a malformed/stale frame) is
 * appended at the end so a real discarded tile can never be hidden. */
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
 * BOARD-01..05/TILE-02/DISC-01 (06.2-22, third owner review, UAT gaps
 * 19-22 — "the slots for the play area should be blank... Hint tokens and
 * Fuses are too large — cut by 33%. Put the 50 cards left in the deck as a
 * '50 x [CARD IMAGE]', and put it below the hints and fuses icon. Then
 * make the discard pile to the right of the hints and fuses. This should
 * give us the real estate we need for a nice large board."): a wooden
 * `.board-surface` panel laid out as a flex row of THREE fixed sibling
 * regions —
 *   1. Play (left) — no longer shares its column with Deck/Discard, so it
 *      grows into the space they vacated (gap 22's "real estate").
 *   2. A narrow right-hand column: the clue/fuse token runs (33% smaller,
 *      gap 20) stacked above the Deck counter (gap 21, "{n} x [card
 *      back]", moved out of the Play column).
 *   3. Discard (gap 22), to the right of the token column.
 * This supersedes 06.2-21's vertical Play/Deck/Discard stack. The panel's
 * own height is a constant, `BOARD_INNER_PX` plus its own top+bottom
 * padding, identical whether the game is empty or full (RESEARCH.md
 * Pitfall 1). The compact Discard strip renders the server's shared
 * `discardOrder` (resolved defensively via `resolveDiscardOrder`) inside a
 * short, clipping reservation — "shrunk by default"; `discard-toggle` opens
 * the unchanged `DiscardOverlay` to read/rearrange the full pile.
 */
export function Table({
  game,
  playZoneRef,
  discardZoneRef,
  dropStatus = null,
  discardDragState = null,
  discardPendingOrder = null,
  registerDiscardTile,
  onDiscardTilePointerDown,
  onGroupDiscardBySuit,
  turnSignText = "",
  isYourTurn = false,
}: TableProps) {
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
  const serverOrderedDiscard = resolveDiscardOrder(game.discardOrder, game.discard);
  // DISC-01/D-27: while a discard-pile drag is pending confirmation, the
  // dragging player's own view shows the pending order immediately;
  // `applyPendingOrder` falls back to `serverOrderedDiscard` unchanged if
  // the pending ids no longer match the current pile (stale, per D-27).
  const orderedDiscard = applyPendingOrder(serverOrderedDiscard, discardPendingOrder);

  const playHighlight = dropZoneHighlightStyle(dropStatus?.play, dropStatus?.hovered === "play");
  const discardHighlight = dropZoneHighlightStyle(dropStatus?.discard, dropStatus?.hovered === "discard");
  const playDropState = dropStatus ? (dropStatus.play.enabled ? "enabled" : "disabled") : undefined;
  const discardDropState = dropStatus ? (dropStatus.discard.enabled ? "enabled" : "disabled") : undefined;

  return (
    <section
      data-testid="tableau"
      aria-label="Table"
      className="board-surface flex items-start gap-[length:var(--space-md)] p-[length:var(--space-sm)]"
      style={{ height: BOARD_INNER_PX + 2 * BOARD_PANEL_PADDING_PX }}
    >
      {/* Region 1: Play area (BOARD-01/BOARD-05) — fixed width and height,
          never derived from suit count or stack progress. UAT gap 22: no
          longer shares a column with Deck/Discard, so it is now the
          tableau's own largest region. */}
      <div
        className="relative flex flex-col gap-[length:var(--space-xs)] overflow-hidden rounded-md border p-[length:var(--space-xs)]"
        style={{ width: PLAY_AREA_WIDTH_PX, height: PLAY_AREA_HEIGHT_PX, borderColor: "var(--color-border)" }}
      >
        <AreaLabel>Play</AreaLabel>
        <div
          ref={playZoneRef}
          data-testid="play-zone"
          data-drop-state={playDropState}
          className="relative flex flex-1 items-start rounded-md"
          style={{ gap: SUIT_COLUMN_GAP_PX, flexWrap: "nowrap", ...playHighlight }}
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
            <PlayedStack
              key={stack.suit}
              stack={stack}
              nextRank={nextPlayableRank(variantConfig(game.variant), stack)}
              flashing={flashingSuits.has(stack.suit)}
            />
          ))}
        </div>
      </div>

      {/* Regions 2+3 plus the turn sign, gap closure 07-12 (owner gap 4,
          verbatim: "can we take the discard area and swap that into the
          space that says 'X's turn'? should give the discard pile more
          real estate to breathe and thus a larger tile size."): wrapped in
          one flex-col matching Play's own reserved height (BOARD_INNER_PX).
          The top row holds the token column plus, in the SMALL spot Discard
          used to occupy beside it, the turn sign (own fixed
          TURN_SIGN_WIDTH_PX/HEIGHT_PX reservation — the same box the
          compact Discard strip used to fill). Below that row, Discard now
          fills the LARGE leftover area (own fixed DISCARD_AREA_WIDTH_PX/
          HEIGHT_PX reservation) that used to hold the turn sign — full
          width of the right-hand column, substantially taller, so its
          tiles render larger (see DISCARD_TILE_WIDTH_PX/HEIGHT_PX,
          layout-budget.ts). `tableau`/`play-zone`/`clue-tokens`' own
          measured boxes (UAT gap 1's fixed-geometry proof) are untouched by
          this swap. */}
      <div className="flex flex-col" style={{ height: BOARD_INNER_PX, gap: MIDDLE_GAP_PX }}>
        <div className="flex items-start gap-[length:var(--space-md)]">
          {/* Region 2: the clue/fuse token runs stacked above the Deck
              counter, "{n} x [card back]", per the owner's literal
              description (unchanged by gap 4's swap). */}
          <div className="flex flex-col" style={{ width: TOKEN_AREA_WIDTH_PX, gap: MIDDLE_GAP_PX }}>
            <TokenColumn clueTokens={game.clueTokens} fusesRemaining={fusesRemaining} />

            <div
              className="flex items-center justify-center gap-[length:var(--space-xs)]"
              style={{ height: DECK_COUNTER_PX }}
            >
              {game.finalTurnsRemaining === null ? (
                <span
                  data-testid="deck-count"
                  data-final-round="false"
                  className="flex items-center gap-[length:var(--space-xs)] text-[length:var(--text-label)] font-semibold"
                  style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
                >
                  {game.deckCount} x
                  <FireworkCardBack width={DECK_COUNTER_CARD_WIDTH_PX} height={DECK_COUNTER_CARD_HEIGHT_PX} />
                </span>
              ) : (
                <span
                  data-testid="deck-count"
                  data-final-round="true"
                  className="text-[length:var(--text-label)] font-semibold"
                  style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
                >
                  {deckCountText(game)}
                </span>
              )}
            </div>
          </div>

          {/* Turn sign (UAT gap 37, moved into this smaller spot by gap 4):
              "{name}'s turn" / "Your turn!" / "" once the game has ended.
              aria-live="polite" announces every turn change to
              screen-reader users without an explicit re-focus. Empty string
              (game ended, see turnSignText) renders an empty live region
              rather than no region at all, so a screen reader that already
              has the region focused hears silence, not a leftover stale
              announcement. `break-words` lets a long "{name}'s turn" wrap
              inside this now-narrower fixed box instead of overflowing. */}
          <div
            data-testid="turn-sign"
            role="status"
            aria-live="polite"
            className="flex items-center justify-center break-words text-center font-semibold"
            style={{
              width: TURN_SIGN_WIDTH_PX,
              height: TURN_SIGN_HEIGHT_PX,
              color: isYourTurn ? "var(--color-turn)" : "var(--color-text-muted)",
              fontSize: "var(--text-label)",
              lineHeight: "var(--text-label--line-height)",
            }}
          >
            {turnSignText}
          </div>
        </div>

        {/* Region 3 (BOARD-01/DISC-01, gap 4: "give the discard pile more
            real estate to breathe and thus a larger tile size"): Discard
            now fills the large lower area below the token+turn-sign row,
            full width of the right-hand column. discard-toggle (and the
            zone itself) still opens the unchanged, full-size
            DiscardOverlay for a pile deeper than this box's own
            DISCARD_MIN_VISIBLE_TILES reservation. */}
        <div
          className="relative flex flex-col gap-[length:var(--space-xs)] overflow-hidden rounded-md border p-[length:var(--space-xs)]"
          style={{ width: DISCARD_AREA_WIDTH_PX, height: DISCARD_AREA_HEIGHT_PX, borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center justify-between gap-[length:var(--space-xs)]">
            <AreaLabel>Discard</AreaLabel>
            <div className="flex items-center gap-[length:var(--space-xs)]">
              {/* UAT gap 10/DISC-01: same icon-sized-box/out-of-flow-touch-
                  target pattern as discard-toggle beside it — the hit-area
                  span is a DESCENDANT of the button (06.2-10's fixed
                  sibling-swallows-click bug), and the visible box stays
                  icon-sized so this header row does not grow (the discard
                  region is a fixed reservation, 06.2-16/21/22). The inward
                  (right) side of this button's hit-area is capped at half
                  the row's gap-xs rather than the full 44px reach, so it
                  can never overlap discard-toggle's own hit-area beside it
                  — a full symmetric expansion on both adjacent buttons
                  would intercept each other's clicks. */}
              <button
                type="button"
                data-testid="discard-group-by-suit"
                aria-label="Group discard by suit"
                onClick={onGroupDiscardBySuit}
                disabled={!onGroupDiscardBySuit || game.discard.length < 2}
                className="relative inline-flex cursor-pointer items-center justify-center rounded-md before:absolute before:content-[''] transition-colors hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--color-text-muted)]"
                style={{ width: 14, height: 14, color: "var(--color-text-muted)" }}
              >
                <Group aria-hidden="true" size={14} />
                <span
                  aria-hidden="true"
                  className="absolute"
                  style={{ top: -15, bottom: -15, left: -15, right: -2 }}
                />
              </button>
              <button
                type="button"
                data-testid="discard-toggle"
                aria-label="Show full discard pile"
                onClick={openExpandedView}
                // The visible/flow box stays icon-sized so this header row does
                // not grow past the "Discard" label's own height (needed for
                // the UI-11 1280x720 no-scroll fit) — the 44px touch target is
                // provided by an absolutely-positioned (out-of-flow) pseudo
                // element instead, per --size-touch-min. The left (inward)
                // side is capped at half the gap so it cannot overlap
                // discard-group-by-suit's own hit-area beside it.
                className="relative inline-flex cursor-pointer items-center justify-center rounded-md before:absolute before:content-[''] transition-colors hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                style={{ width: 14, height: 14, color: "var(--color-text-muted)" }}
              >
                <Layers aria-hidden="true" size={14} />
                <span
                  aria-hidden="true"
                  className="absolute"
                  style={{ top: -15, bottom: -15, right: -15, left: -2 }}
                />
              </button>
            </div>
          </div>

          {/* UAT gap 31 (fifth owner review): the highlight ring lives on this
              OUTER div, which does NOT clip its own overflow — a box-shadow
              painted on a self-clipping element gets clipped by its own
              bounds in Chromium, unlike the Play area's roomier wrapper, so
              the ring rendered as a barely-visible sliver instead of the same
              clean glow the Play area shows. The actual "clip a pile deeper
              than DISCARD_MIN_VISIBLE_TILES" behavior moves to the INNER div
              below, which keeps `overflow-hidden` — only pile CONTENT is
              clipped now, never the hover highlight painted on the zone
              around it. Reuses the exact same `dropZoneHighlightStyle`
              output Play already uses — no second highlight style
              invented. */}
          <div
            ref={discardZoneRef}
            data-testid="discard-pile"
            data-discard-count={game.discard.length}
            data-view={view}
            data-drop-state={discardDropState}
            className="relative flex min-h-0 flex-1 rounded-md"
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
            <div className="flex min-h-0 flex-1 flex-wrap items-start gap-[length:var(--space-xs)] overflow-hidden rounded-md">
              {orderedDiscard.length > 0 ? (
                orderedDiscard.map((card) => {
                  const dragging = discardDragState?.cardId === card.id;
                  // D-20: mirrors OwnHandCard's drag-lift transform — tracks
                  // the pointer via translate while dragging, no continuous
                  // animation otherwise (drag-snap handles the release).
                  const dragTransform =
                    dragging && discardDragState
                      ? `translate(${discardDragState.offset.x}px, ${discardDragState.offset.y}px) scale(1.05)`
                      : undefined;
                  return (
                    <span
                      key={card.id}
                      ref={(el) => registerDiscardTile?.(card.id, el)}
                      data-testid={`discard-tile-${card.id}`}
                      data-dragging={String(dragging)}
                      onPointerDown={(event) => onDiscardTilePointerDown?.(card.id, event)}
                      className={
                        "relative inline-flex flex-col items-center" +
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
                        width={DISCARD_TILE_WIDTH_PX}
                        height={DISCARD_TILE_HEIGHT_PX}
                      />
                      <span className="sr-only">{`${SUIT_VISUALS[card.suit].label} ${card.rank}`}</span>
                    </span>
                  );
                })
              ) : (
                // UAT gap 24 (fourth owner review): "remove the 'No tiles
                // discarded yet'" — empty means empty, no placeholder copy
                // visible on screen; the "Discard" label above already names
                // the region, so an sr-only equivalent is enough for screen
                // readers/tests (matches gap 6's "accessible but not obtrusive"
                // precedent).
                <p className="sr-only">No tiles discarded yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {view === "expanded" && (
        <DiscardOverlay
          discard={game.discard}
          discardOrder={game.discardOrder}
          variant={game.variant}
          onClose={closeExpandedView}
          discardDragState={discardDragState}
          discardPendingOrder={discardPendingOrder}
          registerDiscardTile={registerDiscardTile}
          onDiscardTilePointerDown={onDiscardTilePointerDown}
          onGroupDiscardBySuit={onGroupDiscardBySuit}
        />
      )}
    </section>
  );
}
