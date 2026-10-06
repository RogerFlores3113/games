import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RoomCode, RoomView } from "@games/schema";
import { LOBBY_COMPONENTS } from "../components/game-ui";
import { Lobby } from "../components/Lobby";

function view(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: "ABCDEF" as RoomCode,
    gameId: "expedition",
    gameDisplayName: "Expedition",
    config: null,
    limits: { min: 3, max: 5 },
    status: "lobby",
    hostSeatId: "seat-1",
    youSeatId: "seat-1",
    seats: [
      { seatId: "seat-1", displayLabel: "Roger", connected: true, isHost: true },
      { seatId: "seat-2", displayLabel: "Bianca", connected: false, isHost: false },
    ],
    game: null,
    ...overrides,
  };
}

function render(v: RoomView): string {
  const GameLobby = LOBBY_COMPONENTS[v.gameId] ?? Lobby;
  return renderToStaticMarkup(createElement(GameLobby, { view: v, onSetConfig: () => {}, onStartGame: () => {} }));
}

describe("the Expedition lobby", () => {
  it("is the lobby an Expedition room gets, and Hanabi keeps the shared one", () => {
    expect(LOBBY_COMPONENTS.expedition).toBeDefined();
    expect(LOBBY_COMPONENTS.hanabi).toBeUndefined();
    expect(render(view())).toContain("Base camp");
  });

  it("marks only real seats as seat rows, with self, host and connection on each", () => {
    const html = render(view());
    expect(html.match(/data-testid="seat-row"/g)).toHaveLength(2);
    expect(html.match(/Open seat/g)).toHaveLength(3);
    expect(html).toContain('data-seat-id="seat-1" data-self="true" data-connected="true"');
    expect(html).toContain('data-seat-id="seat-2" data-self="false" data-connected="false"');
    expect(html).toContain(">Host<");
    expect(html).toContain(">Disconnected<");
    expect(html).toContain('<p data-testid="seat-count" class="trail-label trail-muted">2 / 5</p>');
  });

  it("gives the host a disabled Start game below the minimum, and a guest the waiting line", () => {
    expect(render(view())).toMatch(/<button[^>]*data-testid="start-game"[^>]*disabled=""/);
    expect(render(view())).toContain("Need 3–5 players");
    const guest = render(view({ youSeatId: "seat-2" }));
    expect(guest).not.toContain('data-testid="start-game"');
    expect(guest).toContain("Waiting for players — the host starts once 3 are seated.");
  });
});
