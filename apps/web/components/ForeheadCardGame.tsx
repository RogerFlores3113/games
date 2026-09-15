"use client";

import type { RoomView } from "@games/schema";
import type { ForeheadCardValue, ForeheadCardView } from "@games/rules";
import { FOREHEAD_CARD_VALUES } from "@games/rules";
import { Button } from "./Button";

export interface ForeheadCardGameProps {
  view: RoomView;
  onGuess: (value: ForeheadCardValue) => void;
}

function isForeheadCardView(game: unknown): game is ForeheadCardView {
  return (
    typeof game === "object" &&
    game !== null &&
    "yourCard" in game &&
    "otherCards" in game &&
    Array.isArray((game as { otherCards: unknown[] }).otherCards) &&
    "revealed" in game &&
    Array.isArray((game as { revealed: unknown[] }).revealed)
  );
}

/**
 * D-03: deliberately minimal — every other seat's card face up, the
 * viewer's own card as an empty face-down tile, a turn indicator, the
 * revealed pile with score and deck count, and one guess button per
 * possible value. This screen exists to prove HIDE-01/D-03 redaction in a
 * real browser, not to look finished — it is deleted in Phase 4 once the
 * real Hanabi board lands.
 */
export function ForeheadCardGame({ view, onGuess }: ForeheadCardGameProps) {
  const game = isForeheadCardView(view.game) ? view.game : null;

  function labelFor(seatId: string): string {
    return view.seats.find((seat) => seat.seatId === seatId)?.displayLabel ?? "…";
  }

  const isEnded = view.status === "ended";
  const isYourTurn = game?.isYourTurn ?? false;

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-[length:var(--space-xl)] px-[length:var(--space-md)] py-[length:var(--space-3xl)]"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {!isEnded && (
        <p
          data-testid="turn-indicator"
          className="text-[length:var(--text-body)]"
          style={{
            color: isYourTurn ? "var(--color-accent)" : "var(--color-text-muted)",
            lineHeight: "var(--text-body--line-height)",
          }}
        >
          {isYourTurn ? "Your turn — guess your card" : `Waiting for ${labelFor(game?.activeSeatId ?? "")}`}
        </p>
      )}

      {game && (
        <div data-testid="other-cards" className="flex flex-wrap items-end gap-[length:var(--space-sm)]">
          {game.otherCards.map((entry) => (
            <div
              key={entry.card.id}
              data-testid="other-card"
              data-seat-id={entry.seatId}
              className="flex flex-col items-center gap-[length:var(--space-xs)]"
            >
              <span
                className="text-[length:var(--text-label)] font-semibold"
                style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
              >
                {labelFor(entry.seatId)}
              </span>
              <div
                className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-md border px-[length:var(--space-md)]"
                style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
              >
                {!entry.card.hidden && (
                  <span
                    className="font-semibold"
                    style={{
                      color: "var(--color-text)",
                      fontSize: "var(--text-heading)",
                      lineHeight: "var(--text-heading--line-height)",
                    }}
                  >
                    {entry.card.value}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-[length:var(--space-xs)]" style={{ marginTop: "var(--space-lg)" }}>
        <span
          className="text-[length:var(--text-label)] font-semibold"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
        >
          Your card
        </span>
        <div
          data-testid="own-card"
          className="min-h-[64px] min-w-[64px] rounded-md border"
          style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
        />
      </div>

      {!isEnded ? (
        <div className="flex flex-col items-center gap-[length:var(--space-sm)]">
          <p
            className="font-semibold"
            style={{
              color: "var(--color-text)",
              fontSize: "var(--text-heading)",
              lineHeight: "var(--text-heading--line-height)",
            }}
          >
            Guess your card
          </p>
          <div className="flex flex-wrap justify-center gap-[length:var(--space-sm)]">
            {FOREHEAD_CARD_VALUES.map((value) => (
              <Button
                key={value}
                variant="primary"
                data-testid={`guess-button-${value}`}
                disabled={!isYourTurn}
                onClick={() => onGuess(value)}
              >
                {value}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-[length:var(--space-sm)]">
          <p
            className="font-semibold"
            style={{
              color: "var(--color-text)",
              fontSize: "var(--text-heading)",
              lineHeight: "var(--text-heading--line-height)",
            }}
          >
            Game over
          </p>
          <p
            data-testid="final-score"
            className="text-[length:var(--text-body)]"
            style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
          >
            Final score: {game?.score ?? 0}
          </p>
        </div>
      )}

      <div
        className="flex flex-col items-center gap-[length:var(--space-xs)] rounded-md px-[length:var(--space-lg)] py-[length:var(--space-md)]"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <span
          className="text-[length:var(--text-label)] font-semibold"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
        >
          Revealed
        </span>
        <ul data-testid="revealed-list" className="flex flex-col items-center gap-[length:var(--space-xs)]">
          {game && game.revealed.length > 0 ? (
            game.revealed.map((entry) => (
              <li
                key={entry.id}
                data-testid="revealed-entry"
                className="text-[length:var(--text-body)]"
                style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
              >
                {labelFor(entry.seatId)}: {entry.value}
              </li>
            ))
          ) : (
            <li
              className="text-[length:var(--text-body)]"
              style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }}
            >
              No cards revealed yet
            </li>
          )}
        </ul>
        <p
          data-testid="score"
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
        >
          Score: {game?.score ?? 0}
        </p>
        <p
          data-testid="deck-count"
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }}
        >
          {game?.deckCount ?? 0} left in deck
        </p>
      </div>
    </main>
  );
}
