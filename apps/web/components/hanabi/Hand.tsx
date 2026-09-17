import type { HanabiCardView, Variant } from "@games/rules";
import { MarksZone } from "./MarksZone";
import { OwnHandCard } from "./OwnHandCard";
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
  isTarget: boolean;
  previewIds: ReadonlySet<string>;
  justCluedIds: ReadonlySet<string>;
  disabled: boolean;
  onSelectTarget: () => void;
}

/** D-02/D-16/D-19: one teammate's hand — the active-player ring, restyled
 * seat status, and a select-then-act "give this teammate a clue" button
 * wrapping their card row. Preserves `other-hand-{seatId}` /
 * `other-hand-card-{id}` testids (D-24) — no other testid in this component
 * may start with "other-hand-". */
export function TeammateHand({
  hand,
  label,
  connected,
  variant,
  isActive,
  isTarget,
  previewIds,
  justCluedIds,
  disabled,
  onSelectTarget,
}: TeammateHandProps) {
  return (
    <div
      data-testid={"other-hand-" + hand.seatId}
      data-active={String(isActive)}
      data-target={String(isTarget)}
      className="flex flex-col items-center gap-[length:var(--space-xs)] rounded-md p-[length:var(--space-xs)]"
      style={{
        border: isActive ? "2px solid var(--color-accent)" : "2px solid transparent",
        boxShadow: isActive ? "0 0 12px 0 rgba(245, 185, 66, 0.4)" : "none",
      }}
    >
      <div className="flex items-center gap-[length:var(--space-sm)]">
        <span
          className="text-[length:var(--text-label)] font-semibold"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
        >
          {label}
        </span>
        <SeatStatus seatId={hand.seatId} connected={connected} />
        {/* WR-03: the keyboard/screen-reader clue-target control is a separate
            button — wrapping the card row in a labelled button made every
            card's identity text presentational (never announced). */}
        <button
          type="button"
          aria-label={`Give ${label} a clue`}
          aria-pressed={isTarget}
          disabled={disabled}
          onClick={onSelectTarget}
          className="rounded px-[length:var(--space-xs)] text-[length:var(--text-label)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed"
          style={{
            color: "var(--color-text-muted)",
            lineHeight: "var(--text-label--line-height)",
            border: "1px solid var(--color-border)",
          }}
        >
          Clue
        </button>
      </div>

      {/* Pointer shortcut: clicking the row also targets this teammate. The
          row is a labelled group (not a button) so each card stays readable
          by assistive tech; the button above is the accessible equivalent. */}
      <div
        role="group"
        aria-label={`${label}'s cards`}
        onClick={disabled ? undefined : onSelectTarget}
        className={"flex gap-[length:var(--space-xs)] rounded-md" + (disabled ? " cursor-not-allowed" : " cursor-pointer")}
        style={{
          outline: isTarget ? "2px solid var(--color-text)" : undefined,
          outlineOffset: isTarget ? "2px" : undefined,
        }}
      >
        {hand.cards.map((card) => (
          <div key={card.id} className="flex flex-col items-center">
            <MarksZone facts={card.facts} variant={variant} scale="teammate" testId={`marks-zone-${card.id}`} />
            <TeammateCard card={card} preview={previewIds.has(card.id)} justClued={justCluedIds.has(card.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export interface OwnHandProps {
  cards: HanabiCardView[];
  variant: Variant;
  youSeatId: string | null;
  connected: boolean;
  isYourTurn: boolean;
  turnText: string;
  selectedCardId: string | null;
  justCluedIds: ReadonlySet<string>;
  disabled: boolean;
  onSelectCard: (cardId: string) => void;
}

/** D-02/D-15/D-19: the viewer's own hand. Every `OwnHandCard` receives only
 * `card.facts` — never the card itself — structurally preserving the D-15
 * identity boundary at this call site too. */
export function OwnHand({
  cards,
  variant,
  youSeatId,
  connected,
  isYourTurn,
  turnText,
  selectedCardId,
  justCluedIds,
  disabled,
  onSelectCard,
}: OwnHandProps) {
  return (
    <section
      data-testid="own-band"
      data-active={String(isYourTurn)}
      className="flex flex-col items-center gap-[3px] rounded-md p-[3px]"
      style={{
        border: isYourTurn ? "2px solid var(--color-accent)" : "2px solid transparent",
        boxShadow: isYourTurn ? "0 0 12px 0 rgba(245, 185, 66, 0.4)" : "none",
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
          <div key={card.id} className="flex flex-col items-center">
            <MarksZone facts={card.facts} variant={variant} scale="own" testId={`marks-zone-slot-${i + 1}`} />
            <OwnHandCard
              facts={card.facts}
              slotNumber={i + 1}
              selected={selectedCardId === card.id}
              justClued={justCluedIds.has(card.id)}
              disabled={disabled}
              onSelect={() => onSelectCard(card.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
