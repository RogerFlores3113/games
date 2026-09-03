"use client";

import { MAX_PLAYERS, MIN_PLAYERS, type RoomView, type Variant } from "@games/schema";
import { Button } from "./Button";
import { RoomCode } from "./RoomCode";
import { SeatRow } from "./SeatRow";

export interface LobbyProps {
  view: RoomView;
  onSetVariant: (variant: Variant) => void;
  onStartGame: () => void;
}

const VARIANT_OPTIONS: { value: Variant; label: string }[] = [
  { value: "base", label: "Base" },
  { value: "rainbow", label: "Rainbow" },
  { value: "black", label: "Black" },
];

/**
 * Live seat list, room code + copy link, and host-only variant picker +
 * Start game control. There is deliberately no toggle or column tracking
 * player readiness anywhere in this component (D-10, D-11) — if you find
 * yourself adding one, stop, it was cut.
 */
export function Lobby({ view, onSetVariant, onStartGame }: LobbyProps) {
  const isHost = view.youSeatId === view.hostSeatId;
  const seatCount = view.seats.length;
  const canStart = seatCount >= MIN_PLAYERS && seatCount <= MAX_PLAYERS;
  const shareUrl =
    typeof window !== "undefined" ? window.location.href : `https://games.rogerflores.dev/room/${view.code}`;

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-[length:var(--space-xl)] px-[length:var(--space-md)] py-[length:var(--space-2xl)] lg:max-w-3xl lg:justify-center lg:py-[length:var(--space-3xl)]"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <RoomCode code={view.code} shareUrl={shareUrl} />

      <div
        className="flex flex-col gap-[length:var(--space-sm)] rounded-lg p-[length:var(--space-lg)]"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        {seatCount < MIN_PLAYERS && (
          <div className="flex flex-col gap-[length:var(--space-xs)] text-center">
            <h2
              className="text-[length:var(--text-heading)] font-semibold"
              style={{ color: "var(--color-text)", lineHeight: "var(--text-heading--line-height)" }}
            >
              Waiting for players
            </h2>
            <p
              className="text-[length:var(--text-body)]"
              style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }}
            >
              Share the room code above — you need 2 to 5 players to start.
            </p>
          </div>
        )}

        <div data-testid="seat-list" className="flex flex-col gap-[length:var(--space-sm)]">
          {view.seats.map((seat) => (
            <SeatRow
              key={seat.seatId}
              seatId={seat.seatId}
              name={seat.displayLabel}
              connected={seat.connected}
              isHost={seat.isHost}
              isSelf={seat.seatId === view.youSeatId}
            />
          ))}
        </div>
      </div>

      {isHost && (
        <div
          className="flex flex-col gap-[length:var(--space-md)] rounded-lg p-[length:var(--space-lg)]"
          style={{ backgroundColor: "var(--color-surface)" }}
        >
          <fieldset data-testid="variant-picker" className="flex flex-col gap-[length:var(--space-sm)]">
            <legend
              className="text-[length:var(--text-label)] font-semibold"
              style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
            >
              Variant
            </legend>
            <div className="flex gap-[length:var(--space-md)]">
              {VARIANT_OPTIONS.map(({ value, label }) => (
                <label
                  key={value}
                  className="flex items-center gap-[length:var(--space-xs)] text-[length:var(--text-body)]"
                  style={{ color: "var(--color-text)" }}
                >
                  <input
                    type="radio"
                    name="variant"
                    value={value}
                    checked={view.variant === value}
                    onChange={() => onSetVariant(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-[length:var(--space-xs)]">
            <Button data-testid="start-game" variant="primary" onClick={onStartGame} disabled={!canStart}>
              Start game
            </Button>
            {!canStart && (
              <p
                className="text-[length:var(--text-label)]"
                style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
              >
                Need 2–5 players
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
