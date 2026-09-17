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

const SOURCE_PATH = fileURLToPath(new URL("../components/hanabi/NoteBox.tsx", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf-8");

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
