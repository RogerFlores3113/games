"use client";

import { MAX_PLAYERS, MIN_PLAYERS, type RoomView, type Variant } from "@games/schema";
import { TABLE_IMAGE_CREDIT } from "../lib/image-credits";
import { lobbySlots } from "../lib/lobby-seats";
import { Button } from "./Button";
import { PhotoCredit } from "./PhotoCredit";
import { ReconnectingBanner } from "./ReconnectingBanner";
import { RoomCode } from "./RoomCode";
import { SeatRow } from "./SeatRow";

export interface LobbyProps {
  view: RoomView;
  onSetVariant: (variant: Variant) => void;
  onStartGame: () => void;
  /** D-05: while true, the store's own socket is degraded and this last-
   * known view is display-only — Start game and every host variant control
   * are disabled, matching HanabiBoard's reconnecting treatment. */
  reconnecting?: boolean;
}

const VARIANT_OPTIONS: { value: Variant; label: string; blurb: string }[] = [
  { value: "base", label: "Base", blurb: "5 suits" },
  { value: "rainbow", label: "Rainbow", blurb: "+ rainbow" },
  { value: "black", label: "Black", blurb: "+ rainbow & black" },
];

/**
 * Live seat list, room code + copy link, and host-only variant picker +
 * Start game control. There is deliberately no toggle or column tracking
 * player readiness anywhere in this component (D-10, D-11) — if you find
 * yourself adding one, stop, it was cut.
 *
 * Owner request (2026-09-19): the lobby "is super ai-looking", so it now
 * sits on `.lobby-backdrop` (the table's own fireworks photo — arriving at
 * the table reads as the panel clearing, not a scene change) inside one
 * composed panel, rather than as two bare `--color-surface` slabs on a flat
 * background. The empty seats are drawn as "Open seat" placeholders so the
 * room's 2-5 capacity is legible as shape rather than only as a sentence.
 *
 * Test contracts this component must keep: the `room-code`, `seat-list`,
 * `variant-picker` and `start-game` testids; real `<input type="radio">`
 * elements with the accessible names Base/Rainbow/Black (e2e drives them via
 * `getByRole("radio", { name })`); and `seat-row` on REAL seats only, never
 * on a placeholder, since the e2e helpers count those rows to assert how
 * many players are seated.
 */
export function Lobby({ view, onSetVariant, onStartGame, reconnecting = false }: LobbyProps) {
  const isHost = view.youSeatId === view.hostSeatId;
  const seatCount = view.seats.length;
  const canStart = seatCount >= MIN_PLAYERS && seatCount <= MAX_PLAYERS;
  const shareUrl =
    typeof window !== "undefined" ? window.location.href : `https://games.rogerflores.dev/room/${view.code}`;
  const slots = lobbySlots(view.seats, MAX_PLAYERS);

  return (
    <main className="lobby-backdrop flex min-h-screen w-full flex-col items-center justify-center px-[length:var(--space-md)] py-[length:var(--space-xl)]">
      <div className="flex w-full max-w-xl flex-col gap-[length:var(--space-md)]">
        {reconnecting && <ReconnectingBanner />}

        <div
          className="flex flex-col overflow-hidden rounded-xl border"
          style={{
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-border)",
            boxShadow: "0 24px 60px var(--color-tile-shadow)",
          }}
        >
          {/* Room code — the one thing a host has to hand to a friend, so it
              leads the panel and keeps RoomCode's speakable mono treatment. */}
          <section className="flex flex-col gap-[length:var(--space-xs)] p-[length:var(--space-lg)]">
            <p
              className="text-[length:var(--text-label)] font-semibold uppercase"
              style={{
                color: "var(--color-text-muted)",
                letterSpacing: "0.12em",
                lineHeight: "var(--text-label--line-height)",
              }}
            >
              Room code
            </p>
            <RoomCode code={view.code} shareUrl={shareUrl} />
            <p
              className="text-[length:var(--text-label)]"
              style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
            >
              Anyone with the link can take a seat — no account needed.
            </p>
          </section>

          <div className="h-px w-full" style={{ backgroundColor: "var(--color-border)" }} />

          <section className="flex flex-col gap-[length:var(--space-sm)] p-[length:var(--space-lg)]">
            <div className="flex items-baseline justify-between gap-[length:var(--space-sm)]">
              <h2
                className="text-[length:var(--text-label)] font-semibold uppercase"
                style={{
                  color: "var(--color-text-muted)",
                  letterSpacing: "0.12em",
                  lineHeight: "var(--text-label--line-height)",
                }}
              >
                {/* Doubles as the lobby's status line: below the minimum this
                    heading IS the "Waiting for players" state (asserted by
                    e2e/host-room-controls.spec.ts after a host restart), so
                    the panel never needs a second competing headline. */}
                {seatCount < MIN_PLAYERS ? "Waiting for players" : "Players"}
              </h2>
              <p
                data-testid="seat-count"
                className="font-mono text-[length:var(--text-label)]"
                style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
              >
                {seatCount} / {MAX_PLAYERS}
              </p>
            </div>

            <div data-testid="seat-list" className="flex flex-col gap-[length:var(--space-xs)]">
              {slots.map((slot) =>
                slot.kind === "seat" ? (
                  <SeatRow
                    key={slot.seat.seatId}
                    seatId={slot.seat.seatId}
                    name={slot.seat.displayLabel}
                    connected={slot.seat.connected}
                    isHost={slot.seat.isHost}
                    isSelf={slot.seat.seatId === view.youSeatId}
                  />
                ) : (
                  <p
                    key={`open-${slot.index}`}
                    aria-hidden="true"
                    className="rounded-md border border-dashed px-[length:var(--space-sm)] py-[length:var(--space-sm)] text-[length:var(--text-body)]"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-muted)",
                      lineHeight: "var(--text-body--line-height)",
                    }}
                  >
                    Open seat
                  </p>
                ),
              )}
            </div>

            {seatCount < MIN_PLAYERS && (
              <p
                className="text-[length:var(--text-label)]"
                style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
              >
                Hanabi needs {MIN_PLAYERS} to {MAX_PLAYERS} players — share the code above.
              </p>
            )}
          </section>

          {isHost ? (
            <>
              <div className="h-px w-full" style={{ backgroundColor: "var(--color-border)" }} />

              <section className="flex flex-col gap-[length:var(--space-md)] p-[length:var(--space-lg)]">
                <fieldset data-testid="variant-picker" className="flex flex-col gap-[length:var(--space-sm)]">
                  <legend
                    className="mb-[length:var(--space-xs)] text-[length:var(--text-label)] font-semibold uppercase"
                    style={{
                      color: "var(--color-text-muted)",
                      letterSpacing: "0.12em",
                      lineHeight: "var(--text-label--line-height)",
                    }}
                  >
                    Variant
                  </legend>
                  {/* Segmented control. The radio itself stays a real, focusable
                      input (visually hidden, never `display: none`) so keyboard
                      and screen-reader semantics — and the e2e specs'
                      getByRole("radio") — work exactly as before. */}
                  <div className="grid grid-cols-3 gap-[length:var(--space-xs)]">
                    {VARIANT_OPTIONS.map(({ value, label, blurb }) => {
                      const selected = view.variant === value;
                      return (
                        <label
                          key={value}
                          data-selected={selected ? "true" : "false"}
                          className="relative flex cursor-pointer flex-col items-center gap-[2px] rounded-md border px-[length:var(--space-xs)] py-[length:var(--space-sm)] text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)] has-[:disabled]:cursor-not-allowed"
                          style={{
                            backgroundColor: selected ? "var(--color-bg)" : "transparent",
                            borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
                          }}
                        >
                          {/* aria-label pins the accessible name to exactly
                              "Base"/"Rainbow"/"Black". Without it the wrapping
                              <label>'s full text content — including the blurb
                              — becomes the name ("Rainbow + rainbow"), and the
                              e2e specs' getByRole("radio", { name: "Rainbow" })
                              then matches both Rainbow and Black by substring. */}
                          <input
                            type="radio"
                            name="variant"
                            value={value}
                            aria-label={label}
                            checked={selected}
                            disabled={reconnecting}
                            onChange={() => onSetVariant(value)}
                            // Transparent but full-size, NOT `sr-only`: the
                            // e2e specs click the radio itself, and a clipped
                            // 1x1 sr-only input sits under the label's own text
                            // spans, so the click lands on them instead and
                            // Playwright reports an intercepted click.
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                          />
                          <span
                            className="text-[length:var(--text-body)] font-semibold"
                            style={{
                              color: selected ? "var(--color-accent)" : "var(--color-text)",
                              lineHeight: "var(--text-body--line-height)",
                            }}
                          >
                            {label}
                          </span>
                          <span
                            className="text-[length:var(--text-label)]"
                            style={{
                              color: "var(--color-text-muted)",
                              lineHeight: "var(--text-label--line-height)",
                            }}
                          >
                            {blurb}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="flex flex-col gap-[length:var(--space-xs)]">
                  <Button
                    data-testid="start-game"
                    variant="primary"
                    className="w-full"
                    onClick={onStartGame}
                    disabled={!canStart || reconnecting}
                  >
                    Start game
                  </Button>
                  {!canStart && (
                    <p
                      className="text-center text-[length:var(--text-label)]"
                      style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
                    >
                      Need {MIN_PLAYERS}–{MAX_PLAYERS} players
                    </p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="h-px w-full" style={{ backgroundColor: "var(--color-border)" }} />
              <p
                className="p-[length:var(--space-lg)] text-center text-[length:var(--text-label)]"
                style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
              >
                {canStart
                  ? "Waiting for the host to start the game."
                  : `Waiting for players — the host starts once ${MIN_PLAYERS} are seated.`}
              </p>
            </>
          )}
        </div>
      </div>

      <PhotoCredit credit={TABLE_IMAGE_CREDIT} theme="dark" />
    </main>
  );
}
