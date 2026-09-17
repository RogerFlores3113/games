"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { NOTE_MAX_LENGTH, readNote, writeNote } from "../../lib/hanabi-notes";
import { NOTE_ROW_PX } from "../../lib/layout-budget";

export interface NoteBoxProps {
  roomCode: string;
  seatId: string;
  cardId: string;
  slotNumber: number;
}

/** D-09: debounce window for autosave — typing does not persist on every
 * keystroke, but never requires an explicit Enter/blur to commit either. */
const AUTOSAVE_DEBOUNCE_MS = 400;

/**
 * D-01/D-02/D-03/D-09/D-10: a private, browser-local, ALWAYS-VISIBLE note
 * box for a single own-hand card — replaces the click-to-reveal `NoteChip`.
 * This component talks to browser storage exclusively through
 * `hanabi-notes.ts`'s `readNote`/`writeNote` — it never imports anything
 * that could reach the wire or the server-synced client state cache, and
 * its props carry only ids, never a card's suit/rank identity.
 *
 * Initial render (and SSR) always shows the empty state — the real stored
 * value is only readable client-side, so it is loaded in a mount effect
 * (mirrors Table.tsx's discard-view-preference pattern, and NoteChip's own
 * prior behaviour) rather than as the state initializer, keeping SSR and
 * first client render in sync.
 *
 * Unlike NoteChip, there is no button-then-input mode switch: the input is
 * always present, always editable, and autosaves on a debounced timer
 * (cleared on unmount) rather than committing only on Enter/blur.
 */
export function NoteBox({ roomCode, seatId, cardId, slotNumber }: NoteBoxProps) {
  const [text, setText] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(readNote(roomCode, seatId, cardId));
  }, [roomCode, seatId, cardId]);

  // Unmount-only cleanup for the autosave debounce timer.
  useEffect(
    () => () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    },
    [],
  );

  function stopPointerPropagation(e: PointerEvent) {
    e.stopPropagation();
  }

  function handleChange(value: string) {
    const next = value.slice(0, NOTE_MAX_LENGTH);
    setText(next);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      writeNote(roomCode, seatId, cardId, next);
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  return (
    // A <label> (not a <button>+span pair, since the control is a real text
    // input now): clicking anywhere within the out-of-flow inset span below
    // still focuses the input, because a label delegates click/focus to its
    // first form control — the standard HTML mechanism for exactly this
    // enlarged-hit-area shape.
    <label
      className="relative inline-flex w-full items-center justify-center rounded-md"
      style={{ height: NOTE_ROW_PX }}
    >
      <input
        type="text"
        data-testid={`note-box-slot-${slotNumber}`}
        aria-label={`Note for card in slot ${slotNumber}`}
        maxLength={NOTE_MAX_LENGTH}
        placeholder="Note…"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onPointerDown={stopPointerPropagation}
        className="w-full rounded-md bg-transparent text-center font-semibold transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--color-accent)] hover:border-[var(--color-text-muted)]"
        style={{
          height: NOTE_ROW_PX,
          padding: "0 4px",
          border: "1px solid var(--color-border)",
          color: "var(--color-text)",
          fontSize: "var(--text-label)",
          lineHeight: "var(--text-label--line-height)",
        }}
      />
      {/* Out-of-flow touch target: the row's own flow height stays
          NOTE_ROW_PX (the own-hand note-row budget in layout-budget.ts),
          but the effective hit area is expanded to >= 44px via this
          absolutely-positioned inset span, so the layout never grows
          (mirrors NoteChip's/Table.tsx's discard-toggle pattern). */}
      <span aria-hidden="true" className="absolute" style={{ inset: "-12px 0" }} />
    </label>
  );
}
