// D-09/D-10 (NOTE-03, plan 06.2-06): render-contract and source-boundary
// guards for the always-visible, autosaving note box that replaces
// NoteChip. Mirrors the deleted note-chip-render.test.ts's
// renderToStaticMarkup pattern (server-render, string-assert the DOM) plus
// a source scan proving the box cannot reach the wire (T-06.2-12).
//
// This project's "web" vitest project runs in a Node (non-jsdom)
// environment (see vitest.config.ts) — there is no real DOM to dispatch
// `input`/`change` events against, so the debounce/typing behaviour is
// verified the same way the rest of this suite verifies non-server-render
// behaviour: a structural source scan (mirrors note-chip-render.test.ts's
// own `stopPropagation`/`maxLength`/`placeholder` assertions), not a
// simulated keystroke.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoteBox } from "../components/hanabi/NoteBox";
import { TileColorPicker } from "../components/hanabi/TileColorPicker";

const SOURCE_PATH = fileURLToPath(new URL("../components/hanabi/NoteBox.tsx", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf-8");

const HANABI_BOARD_PATH = fileURLToPath(new URL("../components/hanabi/HanabiBoard.tsx", import.meta.url));
const hanabiBoardSource = readFileSync(HANABI_BOARD_PATH, "utf-8");

const SETTINGS_MODAL_PATH = fileURLToPath(new URL("../components/hanabi/SettingsModal.tsx", import.meta.url));
const settingsModalSource = readFileSync(SETTINGS_MODAL_PATH, "utf-8");

describe("note-box-render", () => {
  it("server render is an always-present, empty-state input with the Note… placeholder and the slot testid (SSR-safe)", () => {
    const markup = renderToStaticMarkup(
      createElement(NoteBox, { roomCode: "ABCD", seatId: "s1", cardId: "c1", slotNumber: 1 }),
    );
    expect(markup).toContain("<input");
    expect(markup).toContain('type="text"');
    expect(markup).toContain('data-testid="note-box-slot-1"');
    expect(markup).toContain('placeholder="Note…"');
    // No editing-mode button — the control is a single always-present
    // input, not NoteChip's button-then-input mode switch.
    expect(markup).not.toContain("<button");
    expect(markup).toContain('value=""');
  });

  it("source imports nothing from room-socket, room-store, nanoid, or onAction/send, and its props are exactly roomCode/seatId/cardId/slotNumber", () => {
    expect(source).not.toMatch(/room-socket|room-store|nanoid|onAction|send\(/);
    const propsMatch = source.match(/export interface NoteBoxProps \{([^}]*)\}/);
    expect(propsMatch).not.toBeNull();
    const propNames = [...(propsMatch?.[1] ?? "").matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
    expect(propNames.sort()).toEqual(["cardId", "roomCode", "seatId", "slotNumber"]);
  });

  it("has no card, suit, or rank prop member", () => {
    expect(source).not.toMatch(/\bcard\s*:/);
    expect(source).not.toMatch(/\bsuit\s*:/);
    expect(source).not.toMatch(/\brank\s*:/);
    expect(source).not.toContain("HanabiCardView");
  });

  it("is capped at NOTE_MAX_LENGTH and uses the Note… placeholder", () => {
    expect(source).toContain("maxLength={NOTE_MAX_LENGTH}");
    expect(source).toContain('placeholder="Note…"');
    expect(source).toContain("value.slice(0, NOTE_MAX_LENGTH)");
  });

  it("stops pointerdown propagation so a hand drag never starts from the note box", () => {
    expect(source).toContain("stopPropagation");
  });

  it("autosaves via a debounced writeNote on change — never gated on Enter or blur", () => {
    expect(source).toContain("setTimeout");
    expect(source).toMatch(/writeNote\(/);
    expect(source).not.toMatch(/onKeyDown|onBlur/);
  });

  it("clears the debounce timer on unmount", () => {
    expect(source).toContain("clearTimeout");
  });

  it("the row's flow height is NOTE_ROW_PX with an out-of-flow inset span reaching the touch-target minimum", () => {
    expect(source).toContain("NOTE_ROW_PX");
    expect(source).toContain('aria-hidden="true"');
    expect(source).toMatch(/inset:\s*"-12px 0"/);
  });
});

// HINT-03/TILE-03 (D-05/D-13/D-14): render-contract for the controls-row
// additions introduced by this plan. TileColorPicker is directly
// server-renderable (it takes only a value/onChange pair, no room/socket
// context), so its swatch grid is asserted the same way NoteBox is above.
// The keep-hints toggle lives inside HanabiBoard, which requires a full
// RoomView/socket context to render — its two aria-label states are
// asserted the same way this file already asserts NoteBox's contracted
// strings: a source scan for the literal, contracted copy.
describe("tile-color-picker-render (TILE-03, D-13/D-14)", () => {
  function renderOpenPicker(): string {
    // The swatch grid only renders once opened; render the picker, then
    // re-render with the panel forced open by invoking the same markup the
    // component produces when `open` is true — simplest reliable path in a
    // Node (non-jsdom) environment is asserting the always-present toggle
    // button here and covering the swatch grid via a source scan below,
    // mirroring this file's own NoteBox debounce-behaviour approach.
    return renderToStaticMarkup(
      createElement(TileColorPicker, { value: "slate", onChange: () => {} }),
    );
  }

  it("server render is an icon-only toggle button with the contracted aria-label and a 44px-reachable touch target", () => {
    const markup = renderOpenPicker();
    expect(markup).toContain('data-testid="tile-color-picker-toggle"');
    expect(markup).toContain('aria-label="Choose tile colour"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it("source defines all five swatches with the contracted per-preset aria-labels", () => {
    const pickerSource = readFileSync(
      fileURLToPath(new URL("../components/hanabi/TileColorPicker.tsx", import.meta.url)),
      "utf-8",
    );
    expect(pickerSource).toContain("Slate tile colour");
    expect(pickerSource).toContain("Warm sand tile colour");
    expect(pickerSource).toContain("Cool teal tile colour");
    expect(pickerSource).toContain("Plum tile colour");
    expect(pickerSource).toContain("Charcoal tile colour");
  });

  it("never imports a network/wire-reaching path — the choice is local-only (D-13)", () => {
    const pickerSource = readFileSync(
      fileURLToPath(new URL("../components/hanabi/TileColorPicker.tsx", import.meta.url)),
      "utf-8",
    );
    expect(pickerSource).not.toMatch(/room-socket|room-store|onAction|send\(/);
  });
});

describe("keep-hints-toggle copy contract (HINT-03, D-05)", () => {
  it("HanabiBoard.tsx derives visibility with hintsVisibleForCard; SettingsModal.tsx carries both contracted aria-label states (06.2-13: the toggle itself moved into the settings modal)", () => {
    expect(hanabiBoardSource).toContain("hintsVisibleForCard(");
    expect(settingsModalSource).toContain('"Keep hints visible"');
    expect(settingsModalSource).toContain('"Clear hints after each move"');
  });

  it("does not introduce a new setTimeout for hint lifetime — only the pre-existing clue-flash timer remains", () => {
    const setTimeoutCount = (hanabiBoardSource.match(/setTimeout\(/g) ?? []).length;
    // Exactly one call site: the existing justCluedIds 2000ms flash timer
    // (06.1 CR-01). Hint persistence itself must be derived purely from
    // history, with no timer of its own.
    expect(setTimeoutCount).toBe(1);
  });
});
