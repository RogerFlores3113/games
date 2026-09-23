// D-11/MGR-03 (plan 08-08): render-contract guards proving Lobby.tsx's
// settings section comes from a per-game lookup (`LOBBY_SETTINGS`), not an
// `isHanabi`/gameId conditional — Hanabi renders its variant picker
// byte-identically, and a game with no registered entry renders no
// settings section at all.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GameId, RoomCode, RoomView } from "@games/schema";
import { Lobby } from "../components/Lobby";

function makeView(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: "ABCDEF" as RoomCode,
    gameId: "hanabi",
    gameDisplayName: "Hanabi",
    config: "rainbow",
    limits: { min: 2, max: 5 },
    status: "lobby",
    hostSeatId: "seat-1",
    youSeatId: "seat-1",
    seats: [{ seatId: "seat-1", displayLabel: "Roger", connected: true, isHost: true }],
    game: null,
    ...overrides,
  };
}

describe("Lobby settings section (D-11/MGR-03)", () => {
  it("host + Hanabi view: fieldset variant-picker, three Base/Rainbow/Black radios, Rainbow checked", () => {
    const markup = renderToStaticMarkup(
      createElement(Lobby, { view: makeView(), onSetConfig: () => {}, onStartGame: () => {} }),
    );
    expect(markup).toContain('data-testid="variant-picker"');
    expect(markup).toContain('aria-label="Base"');
    expect(markup).toContain('aria-label="Rainbow"');
    expect(markup).toContain('aria-label="Black"');
    // Rainbow's radio is the one carrying checked="" in the rendered markup.
    const rainbowIndex = markup.indexOf('aria-label="Rainbow"');
    const rainbowInputStart = markup.lastIndexOf("<input", rainbowIndex);
    const rainbowInputEnd = markup.indexOf(">", rainbowIndex);
    expect(markup.slice(rainbowInputStart, rainbowInputEnd)).toContain("checked=");
  });

  it("host + Hanabi view with fewer than 2 seats shows the generic needs-players copy", () => {
    const markup = renderToStaticMarkup(
      createElement(Lobby, {
        view: makeView({ seats: [] }),
        onSetConfig: () => {},
        onStartGame: () => {},
      }),
    );
    expect(markup).toContain("Hanabi needs 2 to 5 players — share the code above.");
  });

  it("host + a gameId with no LOBBY_SETTINGS entry: no variant-picker, no radios, no settings divider, generic copy uses that game's display name/limits", () => {
    const view = makeView({
      gameId: "__unregistered__" as GameId,
      gameDisplayName: "Other",
      limits: { min: 3, max: 4 },
      config: undefined,
      seats: [],
    });
    const markup = renderToStaticMarkup(
      createElement(Lobby, { view, onSetConfig: () => {}, onStartGame: () => {} }),
    );
    expect(markup).not.toContain("variant-picker");
    expect(markup).not.toContain('type="radio"');
    expect(markup).toContain("Other needs 3 to 4 players — share the code above.");
  });

  it("non-host Hanabi view shows no settings section", () => {
    const markup = renderToStaticMarkup(
      createElement(Lobby, {
        view: makeView({ youSeatId: "seat-2", seats: [...makeView().seats, { seatId: "seat-2", displayLabel: "Ann", connected: true, isHost: false }] }),
        onSetConfig: () => {},
        onStartGame: () => {},
      }),
    );
    expect(markup).not.toContain("variant-picker");
    expect(markup).not.toContain('type="radio"');
  });
});
