// D-13/D-14/D-05 (TILE-03/HINT-03/UI-11, plan 06.2-13): render-contract
// guards for the centre-justified settings modal that now holds every
// non-play preference control (tile colour, volume, mute, hint
// persistence), replacing the bottom-controls-row's scattered toggles.
// Mirrors note-box-render.test.ts's renderToStaticMarkup + source-scan
// pattern — this "web" vitest project runs in Node (no real DOM), so
// Escape/backdrop-click handlers are proven by scanning the source for the
// keydown registration and stopPropagation, not by dispatching events.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RoomCode, RoomView } from "@games/schema";
import type { HanabiView } from "@games/rules";
import { SettingsModal } from "../components/hanabi/SettingsModal";
import { TileColorPicker } from "../components/hanabi/TileColorPicker";
import { HanabiBoard } from "../components/hanabi/HanabiBoard";

const SOURCE_PATH = fileURLToPath(new URL("../components/hanabi/SettingsModal.tsx", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf-8");

function baseProps() {
  return {
    open: true,
    onClose: () => {},
    muted: false,
    volume: 0.5,
    onToggleMute: () => {},
    onVolumeChange: () => {},
    keepHints: false,
    onToggleKeepHints: () => {},
    tileColorHex: null as string | null,
    onTileColorChange: () => {},
  };
}

describe("settings-modal-render", () => {
  it("renders nothing when closed — no settings-modal testid in the markup", () => {
    const markup = renderToStaticMarkup(createElement(SettingsModal, { ...baseProps(), open: false }));
    expect(markup).not.toContain("settings-modal");
  });

  it("when open, renders the dialog shell with an accessible name", () => {
    const markup = renderToStaticMarkup(createElement(SettingsModal, baseProps()));
    expect(markup).toContain('data-testid="settings-modal"');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Settings"');
  });

  it("when open, contains all four control groups: audio volume/mute, keep-hints, and the tile-colour input", () => {
    const markup = renderToStaticMarkup(createElement(SettingsModal, baseProps()));
    expect(markup).toContain('data-testid="audio-volume"');
    expect(markup).toContain('data-testid="audio-mute-toggle"');
    expect(markup).toContain('data-testid="keep-hints-toggle"');
    expect(markup).toContain('data-testid="tile-color-input"');
  });

  it("UAT gap 30 (overturns D-14): renders the native colour input directly — no preset swatch grid, no picker toggle", () => {
    const markup = renderToStaticMarkup(createElement(SettingsModal, baseProps()));
    expect(markup).not.toContain("tile-color-picker-toggle");
    expect(markup).not.toContain("tile-color-swatch");
  });

  it("has a close button", () => {
    const markup = renderToStaticMarkup(createElement(SettingsModal, baseProps()));
    expect(markup).toContain('data-testid="settings-close"');
    expect(markup).toContain('aria-label="Close settings"');
  });

  it("registers an Escape keydown handler on window, calling onClose (mirrors DiscardOverlay)", () => {
    expect(source).toContain('window.addEventListener("keydown"');
    expect(source).toMatch(/event\.key === "Escape"/);
    expect(source).toContain("onClose");
  });

  it("backdrop click calls onClose; the panel stops propagation", () => {
    expect(source).toMatch(/onClick=\{onClose\}/);
    expect(source).toContain("stopPropagation");
  });

  it("the keep-hints touch-target span is a DESCENDANT of the button, not a sibling", () => {
    const buttonIndex = source.indexOf('data-testid="keep-hints-toggle"');
    expect(buttonIndex).toBeGreaterThan(-1);
    const buttonOpenTagEnd = source.indexOf(">", buttonIndex);
    const closingButtonIndex = source.indexOf("</button>", buttonOpenTagEnd);
    const insetSpanIndex = source.indexOf('style={{ inset:', buttonOpenTagEnd);
    expect(insetSpanIndex).toBeGreaterThan(-1);
    expect(insetSpanIndex).toBeLessThan(closingButtonIndex);
  });

  it("source contains no raw hex colour literal (tokens only)", () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("TileColorPicker (UAT gap 30, overturns D-14)", () => {
  it("renders a native colour input with a null (default) value", () => {
    const markup = renderToStaticMarkup(createElement(TileColorPicker, { value: null, onChange: () => {} }));
    expect(markup).toContain('data-testid="tile-color-input"');
    expect(markup).toContain('type="color"');
  });

  it("renders the stored hex colour as the input's value when one is chosen", () => {
    const markup = renderToStaticMarkup(createElement(TileColorPicker, { value: "#a37fd1", onChange: () => {} }));
    expect(markup).toContain('value="#a37fd1"');
  });
});

// 06.2-13 Task 2: the bottom row is stripped to play controls only — the
// relocated preference controls must render nowhere in the default
// (closed-modal) HanabiBoard markup, only the gear trigger that opens them.
const BASE_GAME: HanabiView = {
  variant: "base",
  yourSeatId: "seat-1",
  yourHand: [],
  otherHands: [],
  stacks: [
    { suit: "red", playedRanks: [] },
    { suit: "yellow", playedRanks: [] },
    { suit: "green", playedRanks: [] },
    { suit: "blue", playedRanks: [] },
    { suit: "white", playedRanks: [] },
  ],
  discard: [],
  discardOrder: [],
  clueTokens: 8,
  fuses: 3,
  deckCount: 50,
  finalTurnsRemaining: null,
  activeSeatId: "seat-1",
  isYourTurn: true,
  score: 0,
  history: [],
};

const BASE_VIEW: RoomView = {
  code: "ABCDEF" as RoomCode,
  variant: "base",
  status: "in_progress",
  hostSeatId: "seat-1",
  youSeatId: "seat-1",
  seats: [{ seatId: "seat-1", displayLabel: "Roger", connected: true, isHost: true }],
  game: BASE_GAME,
};

describe("HanabiBoard: relocated controls live only inside the (closed) settings modal", () => {
  it("default markup contains settings-toggle and none of the four relocated control testids", () => {
    const markup = renderToStaticMarkup(createElement(HanabiBoard, { view: BASE_VIEW, onAction: () => {} }));
    expect(markup).toContain('data-testid="settings-toggle"');
    expect(markup).not.toContain("audio-mute-toggle");
    expect(markup).not.toContain("audio-volume");
    expect(markup).not.toContain("keep-hints-toggle");
    expect(markup).not.toContain("tile-color-input");
  });
});
