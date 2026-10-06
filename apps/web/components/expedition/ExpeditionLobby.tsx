"use client";

import { useState } from "react";
import clsx from "clsx";
import { lobbySlots } from "../../lib/lobby-seats";
import { pixelFont } from "../fonts";
import type { LobbyProps } from "../Lobby";
import { ReconnectingBanner } from "../ReconnectingBanner";

const COPIED_LABEL_MS = 2000;

/**
 * Expedition's pre-game room: the crew gathers at base camp before setting
 * out. Same contract as the shared `Lobby` (the `room-code`, `seat-list`,
 * `seat-count` and `start-game` testids, `seat-row` on real seats only, the
 * "Copy link" button), drawn in the game's own wood, parchment and pixel
 * lettering instead of the fireworks-night panel.
 */
export function ExpeditionLobby({ view, onStartGame, reconnecting = false }: LobbyProps) {
  const isHost = view.youSeatId === view.hostSeatId;
  const seatCount = view.seats.length;
  const canStart = seatCount >= view.limits.min && seatCount <= view.limits.max;
  const shareUrl =
    typeof window !== "undefined" ? window.location.href : `https://games.rogerflores.dev/room/${view.code}`;
  const slots = lobbySlots(view.seats, view.limits.max);

  return (
    <main
      className={`${pixelFont.variable} trail-camp-backdrop trail-type flex min-h-screen w-full flex-col items-center justify-center px-[length:var(--space-md)] py-[length:var(--space-md)]`}
    >
      {reconnecting && <ReconnectingBanner />}
      <div className="flex w-full max-w-[540px] flex-col">
        <header className="flex items-end justify-between gap-[length:var(--space-sm)] px-[length:var(--space-xs)]">
          <div className="flex flex-col gap-[length:var(--space-xs)] pb-[length:var(--space-sm)]">
            <p className="trail-kicker">Base camp</p>
            <h1 className="trail-title trail-title-sm">{view.gameDisplayName}</h1>
          </div>
          <div className="trail-panda" aria-hidden="true" />
        </header>

        <div className="trail-wood">
          <div className="trail-parchment flex flex-col gap-[length:var(--space-md)]">
            <section className="flex flex-col gap-[length:var(--space-sm)]">
              <p className="trail-label trail-muted">Room code</p>
              <div className="flex flex-wrap items-center justify-between gap-[length:var(--space-md)]">
                <span data-testid="room-code" className="trail-code">
                  {view.code}
                </span>
                <CopyLinkButton shareUrl={shareUrl} />
              </div>
            </section>

            <section className="flex flex-col gap-[length:var(--space-sm)]">
              <div className="flex items-baseline justify-between gap-[length:var(--space-sm)]">
                <h2 className="trail-label">{seatCount < view.limits.min ? "Waiting for players" : "Crew"}</h2>
                <p data-testid="seat-count" className="trail-label trail-muted">
                  {seatCount} / {view.limits.max}
                </p>
              </div>
              <div data-testid="seat-list" className="flex flex-col gap-[length:var(--space-sm)]">
                {slots.map((slot) =>
                  slot.kind === "seat" ? (
                    <div
                      key={slot.seat.seatId}
                      data-testid="seat-row"
                      data-seat-id={slot.seat.seatId}
                      data-self={slot.seat.seatId === view.youSeatId ? "true" : "false"}
                      data-connected={slot.seat.connected ? "true" : "false"}
                      className={clsx("trail-seat", slot.seat.seatId === view.youSeatId && "trail-seat-self")}
                    >
                      <span className="trail-seat-hat" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{slot.seat.displayLabel}</span>
                      {slot.seat.isHost && <span className="trail-badge">Host</span>}
                      <span className="trail-status" data-connected={slot.seat.connected ? "true" : "false"}>
                        {slot.seat.connected ? "Connected" : "Disconnected"}
                      </span>
                    </div>
                  ) : (
                    <p key={`open-${slot.index}`} aria-hidden="true" className="trail-seat trail-seat-open">
                      Open seat
                    </p>
                  ),
                )}
              </div>
            </section>

            {isHost ? (
              <div className="flex flex-col gap-[length:var(--space-xs)]">
                <button
                  type="button"
                  data-testid="start-game"
                  className="trail-button"
                  onClick={onStartGame}
                  disabled={!canStart || reconnecting}
                >
                  Start game
                </button>
                {!canStart && (
                  <p className="trail-muted text-center text-[16px]">
                    Need {view.limits.min}–{view.limits.max} players
                  </p>
                )}
              </div>
            ) : (
              <p className="trail-muted text-center text-[18px]">
                {canStart
                  ? "Waiting for the host to start the game."
                  : `Waiting for players — the host starts once ${view.limits.min} are seated.`}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function CopyLinkButton({ shareUrl }: { shareUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // No clipboard: the code is on screen to read out instead.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_LABEL_MS);
  }

  return (
    <button type="button" className="trail-button trail-button-quiet" onClick={handleCopy}>
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
