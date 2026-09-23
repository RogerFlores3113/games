"use client";

import type { RoomView } from "@games/schema";
import { TABLE_IMAGE_CREDIT } from "../lib/image-credits";
import { lobbySlots } from "../lib/lobby-seats";
import { LOBBY_SETTINGS } from "./game-ui";
import { Button } from "./Button";
import { PhotoCredit } from "./PhotoCredit";
import { ReconnectingBanner } from "./ReconnectingBanner";
import { RoomCode } from "./RoomCode";
import { SeatRow } from "./SeatRow";

export interface LobbyProps {
  view: RoomView;
  onSetConfig: (config: unknown) => void;
  onStartGame: () => void;
  /** D-05: while true, the store's own socket is degraded and this last-
   * known view is display-only — Start game and every host variant control
   * are disabled, matching HanabiBoard's reconnecting treatment. */
  reconnecting?: boolean;
}

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
export function Lobby({ view, onSetConfig, onStartGame, reconnecting = false }: LobbyProps) {
  const isHost = view.youSeatId === view.hostSeatId;
  const seatCount = view.seats.length;
  const canStart = seatCount >= view.limits.min && seatCount <= view.limits.max;
  const shareUrl =
    typeof window !== "undefined" ? window.location.href : `https://games.rogerflores.dev/room/${view.code}`;
  const slots = lobbySlots(view.seats, view.limits.max);
  // D-11/MGR-03: per-game lookup, not an `isHanabi`/gameId conditional. A
  // game with no registered entry (the D-10 toy game, Expedition today)
  // renders no settings section at all.
  const Settings = LOBBY_SETTINGS[view.gameId];

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
                {seatCount < view.limits.min ? "Waiting for players" : "Players"}
              </h2>
              <p
                data-testid="seat-count"
                className="font-mono text-[length:var(--text-label)]"
                style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
              >
                {seatCount} / {view.limits.max}
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

            {seatCount < view.limits.min && (
              <p
                className="text-[length:var(--text-label)]"
                style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
              >
                {view.gameDisplayName} needs {view.limits.min} to {view.limits.max} players — share the code above.
              </p>
            )}
          </section>

          {isHost ? (
            <>
              {Settings && (
                <>
                  <div className="h-px w-full" style={{ backgroundColor: "var(--color-border)" }} />
                  <section className="flex flex-col gap-[length:var(--space-md)] p-[length:var(--space-lg)]">
                    <Settings config={view.config} onSetConfig={onSetConfig} />
                  </section>
                </>
              )}

              <div className="h-px w-full" style={{ backgroundColor: "var(--color-border)" }} />

              <section className="flex flex-col gap-[length:var(--space-md)] p-[length:var(--space-lg)]">
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
                      Need {view.limits.min}–{view.limits.max} players
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
                  : `Waiting for players — the host starts once ${view.limits.min} are seated.`}
              </p>
            </>
          )}
        </div>
      </div>

      <PhotoCredit credit={TABLE_IMAGE_CREDIT} theme="dark" />
    </main>
  );
}
