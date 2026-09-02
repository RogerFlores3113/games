"use client";

import type { RoomView } from "@games/schema";
import type { CounterView } from "@games/rules";
import { Button } from "./Button";

export interface CounterGameProps {
  view: RoomView;
  onIncrement: () => void;
}

function isCounterView(game: unknown): game is CounterView {
  return (
    typeof game === "object" &&
    game !== null &&
    "count" in game &&
    "activeSeatId" in game &&
    "isYourTurn" in game
  );
}

/**
 * D-15: deliberately minimal — one large number, a turn indicator, one "+1"
 * button. No card art, no board chrome. This screen exists to prove turn
 * order and broadcast, not to look finished, so its Phase 2 deletion stays
 * a small, legible diff.
 */
export function CounterGame({ view, onIncrement }: CounterGameProps) {
  const game = isCounterView(view.game) ? view.game : null;
  const activeSeat = game ? view.seats.find((seat) => seat.seatId === game.activeSeatId) : undefined;
  const isYourTurn = game?.isYourTurn ?? false;

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-[length:var(--spacing-xl)] px-[length:var(--spacing-md)]"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <span
        className="font-mono font-semibold"
        style={{
          color: "var(--color-text)",
          fontSize: "var(--text-display)",
          lineHeight: "var(--text-display--line-height)",
        }}
      >
        {game ? game.count : 0}
      </span>

      <p
        className="text-[length:var(--text-body)]"
        style={{
          color: isYourTurn ? "var(--color-accent)" : "var(--color-text-muted)",
          lineHeight: "var(--text-body--line-height)",
        }}
      >
        {isYourTurn ? "Your turn" : `Waiting for ${activeSeat?.displayLabel ?? "…"}`}
      </p>

      <Button variant="primary" disabled={!isYourTurn} onClick={onIncrement}>
        +1
      </Button>
    </main>
  );
}
