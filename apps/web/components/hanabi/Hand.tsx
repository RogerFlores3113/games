import type { PointerEvent as ReactPointerEvent } from "react";
import type { Clue, HanabiCardView, HanabiView, Variant } from "@games/rules";
import { shiftOffsetsForDrag } from "../../lib/hanabi-drag-logic";
import type { ActionContext } from "../../lib/hanabi-visual-logic";
import { NOTE_ROW_PX } from "../../lib/layout-budget";
import { NoteBox } from "./NoteBox";
import { CARD_WIDTH, OwnHandCard } from "./OwnHandCard";
import { TeammateCard } from "./TeammateCard";

export interface SeatStatusProps {
  seatId: string;
  connected: boolean;
}

/** D-03: the Phase 4/5 seat-status contract, restyled compactly for the
 * in-game hand header — testid, data-connected flag, and copy are all
 * preserved verbatim (Playwright asserts against them directly). */
export function SeatStatus({ seatId, connected }: SeatStatusProps) {
  return (
    <div
      data-testid={"seat-status-" + seatId}
      data-connected={String(connected)}
      className="flex items-center gap-[length:var(--space-xs)]"
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full"
        style={{
          backgroundColor: connected ? "var(--color-status-connected)" : "var(--color-status-disconnected)",
        }}
      />
      <span
        className="text-[length:var(--text-label)]"
        style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
      >
        {connected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
}

export interface TeammateHandProps {
  hand: { seatId: string; cards: HanabiCardView[] };
  label: string;
  connected: boolean;
  variant: Variant;
  isActive: boolean;
  justCluedIds: ReadonlySet<string>;
  /** UAT gap 16: the redacted view and shared action-legality context —
   * threaded down to each `TeammateCard` so its quick-clue popover can
   * derive its own two buttons' disabled state from the same
   * `disabledReasonFor` source every other control uses, rather than a
   * new invented rule. */
  game: HanabiView;
  ctx: ActionContext;
  /** UAT gap 16: the id of the ONE card whose quick-clue popover is
   * currently open (across the whole board, not just this hand), or null.
   * Owned by `HanabiBoard` so at most one popover is ever open at once. */
  openCardId: string | null;
  onToggleCard: (cardId: string) => void;
  onGiveClue: (targetSeatId: string, clue: Clue) => void;
  /** HINT-03/D-05: the set of card ids whose hint overlay currently
   * renders, derived per-render by `hintsVisibleForCard` (turn-history
   * based, never a timer). `undefined` means "not yet wired" and every
   * card renders its hint, matching the pre-06.2-06 default. */
  hintsVisible?: ReadonlySet<string>;
  /** TILE-03/D-13: the viewer's personal tile-colour preference, applied to
   * every teammate tile too (D-13 — affects only that player's own view). */
  tileColor?: string;
}

/** D-02/D-19, UAT gap 16: one teammate's hand — the active-player ring,
 * restyled seat status, and a row of tiles each carrying its OWN quick-clue
 * popover (via `TeammateCard`). Preserves `other-hand-{seatId}` /
 * `other-hand-card-{id}` testids (D-24) — no other testid in this component
 * may start with "other-hand-". The `variant` prop is unused now that the
 * deleted automatic clue-mark pip band (HINT-04) no longer reads a card's
 * candidate suits per variant, but stays on the props type — HanabiBoard.tsx
 * still threads it through, and TeammateCard's own hint derivation is
 * variant-independent (facts alone). The deleted `CluePicker`'s
 * separate "select a teammate as the clue target" step (the former `Clue`
 * button and the whole row's click-to-target affordance) is gone — a
 * teammate is now only ever a clue target by way of clicking one of their
 * own tiles, which implies both the target (this hand's seat) and the clue
 * itself (that tile's own suit/rank) at once. */
export function TeammateHand({
  hand,
  label,
  connected,
  isActive,
  justCluedIds,
  game,
  ctx,
  openCardId,
  onToggleCard,
  onGiveClue,
  hintsVisible,
  tileColor,
}: TeammateHandProps) {
  // 06.2-21, owner review: "hands are just username + hand itself on a
  // small board (same tiling background as play board)" — the outer
  // wrapper is now the same `.board-surface` tiled panel Table.tsx uses,
  // with minimal padding rather than a bordered/padded card. The active-
  // turn ring is now a thin box-shadow ring (adds no layout height) instead
  // of a 2px border, so it doesn't grow the fixed teammate-band footprint.
  return (
    <div
      data-testid={"other-hand-" + hand.seatId}
      data-active={String(isActive)}
      className="board-surface flex flex-col items-center gap-[2px] rounded-md p-[2px]"
      style={{
        boxShadow: isActive ? "0 0 0 2px var(--color-accent), 0 0 12px 0 rgba(245, 185, 66, 0.4)" : "none",
      }}
    >
      <div className="flex items-center gap-[length:var(--space-xs)]">
        <span
          className="text-[length:var(--text-label)] font-semibold"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
        >
          {label}
        </span>
        <SeatStatus seatId={hand.seatId} connected={connected} />
      </div>

      <div role="group" aria-label={`${label}'s cards`} className="flex gap-[length:var(--space-xs)] rounded-md">
        {hand.cards.map((card) => (
          <TeammateCard
            key={card.id}
            card={card}
            seatId={hand.seatId}
            game={game}
            ctx={ctx}
            justClued={justCluedIds.has(card.id)}
            open={openCardId === card.id}
            onToggle={() => onToggleCard(card.id)}
            onGiveClue={(clue) => onGiveClue(hand.seatId, clue)}
            hintsVisible={hintsVisible ? hintsVisible.has(card.id) : true}
            tileColor={tileColor}
          />
        ))}
      </div>
    </div>
  );
}

export interface OwnHandProps {
  cards: HanabiCardView[];
  variant: Variant;
  roomCode: string;
  youSeatId: string | null;
  connected: boolean;
  isYourTurn: boolean;
  turnText: string;
  selectedCardId: string | null;
  justCluedIds: ReadonlySet<string>;
  disabled: boolean;
  onSelectCard: (cardId: string) => void;
  /** D-15/D-16/D-20: drag state and callbacks from `useHandDrag`, threaded
   * through unchanged — `OwnHand` never re-derives drag geometry itself. */
  draggingCardId: string | null;
  dragOffset: { x: number; y: number } | null;
  /** DRAG-01/D-08: the current reorder drop index and the measured slot
   * pitch, threaded straight from `useHandDrag`'s `dragState` — `OwnHand`
   * feeds both into `shiftOffsetsForDrag` to compute the drop-gap preview.
   * `null`/`undefined` (no drag, or hovering a non-reorder zone) yields an
   * all-zero shift via that same pure function. */
  dropIndex?: number | null;
  slotPitchPx?: number | null;
  onCardPointerDown: (cardId: string, event: ReactPointerEvent) => void;
  registerSlot: (cardId: string, el: HTMLElement | null) => void;
  consumeClickSuppression: () => boolean;
  /** HINT-03/D-05: the set of card ids whose hint overlay currently
   * renders, derived per-render by `hintsVisibleForCard` (turn-history
   * based, never a timer). `undefined` means "not yet wired" and every
   * card renders its hint, matching the pre-06.2-06 default. */
  hintsVisible?: ReadonlySet<string>;
  /** TILE-03/D-13: the viewer's personal tile-colour preference. */
  tileColor?: string;
}

/** D-02/D-15/D-19: the viewer's own hand. Every `OwnHandCard` receives only
 * `card.facts` — never the card itself — structurally preserving the D-15
 * identity boundary at this call site too. Each slot keeps a fixed
 * `NOTE_ROW_PX`-tall note row above the card holding the existing
 * `NoteBox` (HINT-04 removes the marks-zone band that used to sit there
 * instead; 06.2-06 replaced the click-to-reveal chip with this
 * always-visible, autosaving box). */
export function OwnHand({
  cards,
  variant,
  roomCode,
  youSeatId,
  connected,
  isYourTurn,
  turnText,
  selectedCardId,
  justCluedIds,
  disabled,
  onSelectCard,
  draggingCardId,
  dragOffset,
  dropIndex,
  slotPitchPx,
  onCardPointerDown,
  registerSlot,
  consumeClickSuppression,
  hintsVisible,
  tileColor,
}: OwnHandProps) {
  // DRAG-01/D-08: the drop-gap preview — a pure function of the current
  // hand order and drag state (see shiftOffsetsForDrag's own header), never
  // cached or timer-driven. When no drag is in flight, draggingCardId is
  // null and every offset resolves to 0 regardless of the other inputs.
  const handIds = cards.map((card) => card.id);
  const currentDragIndex = draggingCardId !== null ? handIds.indexOf(draggingCardId) : -1;
  const effectiveTargetIndex = dropIndex ?? (currentDragIndex === -1 ? 0 : currentDragIndex);
  const shiftOffsets = shiftOffsetsForDrag(
    handIds,
    draggingCardId,
    effectiveTargetIndex,
    slotPitchPx ?? CARD_WIDTH,
  );

  // 06.2-21, owner review: same board-surface/minimal-padding treatment as
  // TeammateHand — the active-turn ring is a box-shadow ring (no layout
  // height) instead of a 2px border.
  return (
    <section
      data-testid="own-band"
      data-active={String(isYourTurn)}
      className="board-surface flex flex-col items-center gap-[2px] rounded-md p-[2px]"
      style={{
        boxShadow: isYourTurn ? "0 0 0 2px var(--color-accent), 0 0 12px 0 rgba(245, 185, 66, 0.4)" : "none",
      }}
    >
      <div className="flex flex-row items-center gap-[length:var(--space-sm)]">
        <p
          data-testid="turn-indicator"
          data-your-turn={String(isYourTurn)}
          className={
            isYourTurn
              ? "rounded px-[length:var(--space-sm)] text-[length:var(--text-label)] font-semibold"
              : "text-[length:var(--text-body)]"
          }
          style={
            isYourTurn
              ? {
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg)",
                  lineHeight: "var(--text-label--line-height)",
                }
              : { color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }
          }
        >
          {turnText}
        </p>
        <span
          className="text-[length:var(--text-label)] font-semibold"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
        >
          Your hand
        </span>
        {youSeatId !== null && <SeatStatus seatId={youSeatId} connected={connected} />}
      </div>

      <div data-testid="own-hand" className="flex gap-[length:var(--space-md)]">
        {cards.map((card, i) => (
          <div
            key={card.id}
            data-card-id={card.id}
            ref={(el) => registerSlot(card.id, el)}
            className="flex flex-col items-center"
            style={{ width: CARD_WIDTH }}
          >
            {/* fix(06.2): explicit width matching the card below — an
                unconstrained `w-full` note input previously inherited the
                browser's ~200px default text-input width instead of
                CARD_WIDTH, silently doubling every own-hand slot's footprint
                and starving the controls row of the space it needed to sit
                beside the hand rather than wrap under it (UI-11). */}
            <div
              className="flex items-center justify-end"
              style={{ height: NOTE_ROW_PX, width: CARD_WIDTH }}
            >
              {youSeatId !== null && (
                <NoteBox key={card.id} roomCode={roomCode} seatId={youSeatId} cardId={card.id} slotNumber={i + 1} />
              )}
            </div>
            <OwnHandCard
              facts={card.facts}
              slotNumber={i + 1}
              selected={selectedCardId === card.id}
              justClued={justCluedIds.has(card.id)}
              disabled={disabled}
              dragging={draggingCardId === card.id}
              dragOffset={draggingCardId === card.id ? dragOffset : null}
              onPointerDown={(event) => onCardPointerDown(card.id, event)}
              onSelect={() => {
                if (consumeClickSuppression()) return;
                onSelectCard(card.id);
              }}
              hintsVisible={hintsVisible ? hintsVisible.has(card.id) : true}
              tileColor={tileColor}
              shiftOffsetPx={shiftOffsets[card.id] ?? 0}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
