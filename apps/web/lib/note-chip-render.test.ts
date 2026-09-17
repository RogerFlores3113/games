// D-01/D-02/D-03/D-05/D-06 (NOTE-02, plan 06.1-11): render-contract and
// source-boundary guards for the private per-card note chip. Mirrors
// firework-card-render.test.ts's renderToStaticMarkup pattern (server-render,
// string-assert the DOM) plus a source scan proving the chip cannot reach the
// wire or the client state store (T-06.1-32).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoteChip } from "../components/hanabi/NoteChip";

const SOURCE_PATH = fileURLToPath(new URL("../components/hanabi/NoteChip.tsx", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf-8");

describe("note-chip-render", () => {
  it("server render is an empty-state button with the Add note label and the slot testid", () => {
    const markup = renderToStaticMarkup(
      createElement(NoteChip, { roomCode: "ABCD", seatId: "s1", cardId: "c1", slotNumber: 1 }),
    );
    expect(markup).toContain("<button");
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-label="Add note"');
    expect(markup).toContain('data-testid="note-chip-slot-1"');
  });

  it("source imports nothing from room-socket, room-store, nanoid, or onAction/send, and its props are exactly roomCode/seatId/cardId/slotNumber", () => {
    expect(source).not.toMatch(/room-socket|room-store|nanoid|onAction|send\(/);
    const propsMatch = source.match(/export interface NoteChipProps \{([^}]*)\}/);
    expect(propsMatch).not.toBeNull();
    const propNames = [...(propsMatch?.[1] ?? "").matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
    expect(propNames.sort()).toEqual(["cardId", "roomCode", "seatId", "slotNumber"]);
  });

  it("source is capped at NOTE_MAX_LENGTH and uses the Note… placeholder", () => {
    expect(source).toContain("maxLength={NOTE_MAX_LENGTH}");
    expect(source).toContain('placeholder="Note…"');
  });

  it("source stops pointerdown propagation so a future hand drag never starts from the chip", () => {
    expect(source).toContain("stopPropagation");
  });
});
