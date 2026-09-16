"use client";

import { useState } from "react";
import clsx from "clsx";
import type { RoomView } from "@games/schema";
import { HanabiViewSchema } from "@games/schema/games/hanabi";
import type { Clue, HanabiView, Rank } from "@games/rules";
import { RANKS } from "@games/rules";
import {
  bandForView,
  cluableColorsForView,
  fusesRemainingForView,
  isDiscardDisabled,
  isGiveClueDisabled,
  isPlayDisabled,
} from "../lib/hanabi-board-logic";
import { Button } from "./Button";

export type HanabiActionRequest =
  | { type: "play"; cardId: string }
  | { type: "discard"; cardId: string }
  | { type: "clue"; targetSeatId: string; clue: Clue };

export interface HanabiBoardProps {
  view: RoomView;
  onAction: (request: HanabiActionRequest) => void;
}

/** WR-03: defers to the same strict wire schema the server's fail-closed gate
 * uses, so there is exactly one definition of "a valid HanabiView" and the
 * type predicate never claims more than was verified at runtime. */
function isHanabiView(game: unknown): game is HanabiView {
  return HanabiViewSchema.safeParse(game).success;
}

/**
 * D-11: deliberately plain, playable interim board — cheap to throw away.
 * Phase 6 replaces this wholesale with the colorblind glyph system, the
 * luminosity theme, persistent clue-memory rendering, and a designed end
 * screen. No card art, no animation, no suit-to-hue mapping here.
 *
 * The one load-bearing rule this file must never violate: a card in the
 * viewer's own hand renders NO identity signal — no suit, no rank, no
 * colour derived from either, no placeholder glyph hinting at either. Its
 * only permitted content is its accumulated clue facts and its slot
 * position. The server already guarantees the identity fields are absent
 * from a hidden `HanabiCardView`; this component must not visually
 * reintroduce a signal the data doesn't carry.
 */
export function HanabiBoard({ view, onAction }: HanabiBoardProps) {
  const game = isHanabiView(view.game) ? view.game : null;
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [clueTarget, setClueTarget] = useState<string | null>(null);
  const [clueValue, setClueValue] = useState<Clue | null>(null);

  function labelFor(seatId: string): string {
    return view.seats.find((seat) => seat.seatId === seatId)?.displayLabel ?? "…";
  }

  const isEnded = view.status === "ended";

  if (!game) {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-[length:var(--space-md)]"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <p
          role="status"
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }}
        >
          Loading game…
        </p>
      </main>
    );
  }

  const cluableColors = cluableColorsForView(game);
  const giveClueDisabled = clueTarget && clueValue ? isGiveClueDisabled(game, clueTarget, clueValue) : true;
  const noTouchCaption =
    clueTarget && clueValue && game.isYourTurn && game.clueTokens > 0 && giveClueDisabled
      ? `That clue wouldn't touch any of ${labelFor(clueTarget)}'s cards`
      : null;

  return (
    <main
      className="flex min-h-screen flex-col items-center gap-[length:var(--space-xl)] px-[length:var(--space-md)] py-[length:var(--space-3xl)]"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {!isEnded && (
        <p
          data-testid="turn-indicator"
          className="text-[length:var(--text-body)]"
          style={{
            color: game.isYourTurn ? "var(--color-accent)" : "var(--color-text-muted)",
            lineHeight: "var(--text-body--line-height)",
          }}
        >
          {game.isYourTurn ? "Your turn" : `Waiting for ${labelFor(game.activeSeatId)}`}
        </p>
      )}

      <div className="flex flex-col items-center gap-[length:var(--space-md)]">
        {game.otherHands.map((hand) => (
          <div
            key={hand.seatId}
            data-testid={`other-hand-${hand.seatId}`}
            className="flex flex-col items-center gap-[length:var(--space-xs)]"
          >
            <span
              className="text-[length:var(--text-label)] font-semibold"
              style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
            >
              {labelFor(hand.seatId)}&apos;s hand
            </span>
            <div className="flex flex-wrap justify-center gap-[length:var(--space-sm)]">
              {hand.cards.map((card) => (
                <div
                  key={card.id}
                  data-testid={`other-hand-card-${card.id}`}
                  className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-md border px-[length:var(--space-md)]"
                  style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
                >
                  {!card.hidden && (
                    <span
                      className="font-semibold"
                      style={{ color: "var(--color-text)", fontSize: "var(--text-heading)", lineHeight: "var(--text-heading--line-height)" }}
                    >
                      {card.suit} {card.rank}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start justify-center gap-[length:var(--space-xl)]">
        <div className="flex flex-col items-center gap-[length:var(--space-xs)]">
          <span
            className="text-[length:var(--text-label)] font-semibold"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            Played
          </span>
          <div className="flex gap-[length:var(--space-sm)]">
            {game.stacks.map((stack) => (
              <div
                key={stack.suit}
                data-testid={`played-stack-${stack.suit}`}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md border"
                style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
              >
                <span
                  className="text-[length:var(--text-body)]"
                  style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
                >
                  {stack.suit} {stack.topRank > 0 ? stack.topRank : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-[length:var(--space-xs)]" data-testid="discard-pile">
          <span
            className="text-[length:var(--text-label)] font-semibold"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            Discard
          </span>
          {game.discard.length > 0 ? (
            <ul className="flex flex-col items-center gap-[length:var(--space-xs)]">
              {game.discard.map((card) => (
                <li
                  key={card.id}
                  className="text-[length:var(--text-body)]"
                  style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
                >
                  {card.suit} {card.rank}
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

        <div className="flex flex-col items-center gap-[length:var(--space-xs)]">
          <p data-testid="clue-tokens" className="text-[length:var(--text-body)]" style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}>
            {game.clueTokens} clue tokens
          </p>
          <p data-testid="fuse-tokens" className="text-[length:var(--text-body)]" style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}>
            {fusesRemainingForView(game)} fuses left
          </p>
          <p data-testid="deck-count" className="text-[length:var(--text-body)]" style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}>
            {game.deckCount} cards left in deck
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-[length:var(--space-xs)]" style={{ marginTop: "var(--space-lg)" }}>
        <span
          className="text-[length:var(--text-label)] font-semibold"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
        >
          Your hand
        </span>
        <div data-testid="own-hand" className="flex flex-wrap justify-center gap-[length:var(--space-sm)]">
          {game.yourHand.map((card, index) => {
            const slotNumber = index + 1;
            const selected = selectedCardId === card.id;
            return (
              <button
                key={card.id}
                type="button"
                data-testid={`own-hand-slot-${slotNumber}`}
                onClick={() => setSelectedCardId(card.id)}
                className={clsx(
                  "flex min-h-[64px] min-w-[64px] flex-col items-center justify-center gap-[length:var(--space-xs)] rounded-md border px-[length:var(--space-sm)]",
                  selected && "ring-2 ring-[var(--color-accent)]",
                )}
                style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
              >
                <span
                  className="text-[length:var(--text-label)] font-semibold"
                  style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
                >
                  Slot {slotNumber}
                </span>
                {!card.hidden ? null : (
                  <div className="flex flex-wrap justify-center gap-[length:var(--space-xs)]">
                    {card.facts.positiveClues.map((clue, i) => (
                      <span
                        key={`pos-${i}`}
                        className="text-[length:var(--text-label)]"
                        style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
                      >
                        Told: {clue.value}
                      </span>
                    ))}
                    {card.facts.negativeClues.map((clue, i) => (
                      <span
                        key={`neg-${i}`}
                        className="text-[length:var(--text-label)]"
                        style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
                      >
                        Told: not {clue.value}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {!isEnded ? (
        <div className="flex flex-col items-center gap-[length:var(--space-md)]">
          <div className="flex flex-col items-center gap-[length:var(--space-xs)]">
            <div className="flex gap-[length:var(--space-sm)]">
              <Button
                data-testid="play-button"
                disabled={isPlayDisabled(game) || !selectedCardId}
                onClick={() => selectedCardId && onAction({ type: "play", cardId: selectedCardId })}
              >
                Play
              </Button>
              <Button
                data-testid="discard-button"
                disabled={isDiscardDisabled(game) || !selectedCardId}
                onClick={() => selectedCardId && onAction({ type: "discard", cardId: selectedCardId })}
              >
                Discard
              </Button>
            </div>
            {isDiscardDisabled(game) && game.isYourTurn && game.clueTokens >= 8 && (
              <p
                className="text-[length:var(--text-label)]"
                style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
              >
                Clue tokens are full — you can&apos;t discard
              </p>
            )}
          </div>

          <div className="flex flex-col items-center gap-[length:var(--space-sm)]">
            <span
              className="text-[length:var(--text-label)] font-semibold"
              style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
            >
              Clue
            </span>
            <div className="flex flex-wrap justify-center gap-[length:var(--space-sm)]">
              {game.otherHands.map((hand) => (
                <Button
                  key={hand.seatId}
                  variant={clueTarget === hand.seatId ? "primary" : "ghost"}
                  data-testid={`clue-target-${hand.seatId}`}
                  onClick={() => setClueTarget(hand.seatId)}
                >
                  {labelFor(hand.seatId)}
                </Button>
              ))}
            </div>

            <span
              className="text-[length:var(--text-label)] font-semibold"
              style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
            >
              Color or rank
            </span>
            <div className="flex flex-wrap justify-center gap-[length:var(--space-sm)]">
              {cluableColors.map((color) => (
                <Button
                  key={color}
                  variant={clueValue?.type === "color" && clueValue.value === color ? "primary" : "ghost"}
                  data-testid={`clue-value-${color}`}
                  onClick={() => setClueValue({ type: "color", value: color })}
                >
                  {color}
                </Button>
              ))}
              {RANKS.map((rank: Rank) => (
                <Button
                  key={rank}
                  variant={clueValue?.type === "rank" && clueValue.value === rank ? "primary" : "ghost"}
                  data-testid={`clue-value-${rank}`}
                  onClick={() => setClueValue({ type: "rank", value: rank })}
                >
                  {rank}
                </Button>
              ))}
            </div>

            <Button
              data-testid="give-clue-button"
              disabled={!clueTarget || !clueValue || giveClueDisabled}
              onClick={() => clueTarget && clueValue && onAction({ type: "clue", targetSeatId: clueTarget, clue: clueValue })}
            >
              Give clue
            </Button>
            {!game.isYourTurn ? null : game.clueTokens <= 0 ? (
              <p
                className="text-[length:var(--text-label)]"
                style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
              >
                No clue tokens left
              </p>
            ) : (
              noTouchCaption && (
                <p
                  className="text-[length:var(--text-label)]"
                  style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
                >
                  {noTouchCaption}
                </p>
              )
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-[length:var(--space-sm)]">
          <p
            data-testid="game-over-heading"
            className="font-semibold"
            style={{ color: "var(--color-text)", fontSize: "var(--text-heading)", lineHeight: "var(--text-heading--line-height)" }}
          >
            Game over
          </p>
          <p
            data-testid="final-score"
            className="text-[length:var(--text-body)]"
            style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
          >
            Final score: {game.score} — {bandForView(game)}
          </p>
        </div>
      )}
    </main>
  );
}
