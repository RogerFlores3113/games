"use client";

import { useEffect, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Pencil } from "lucide-react";
import { NOTE_MAX_LENGTH, readNote, writeNote } from "../../lib/hanabi-notes";

export interface NoteChipProps {
  roomCode: string;
  seatId: string;
  cardId: string;
  slotNumber: number;
}

/**
 * D-01/D-02/D-03/D-05/D-06: a private, browser-local note chip for a single
 * own-hand card. This component talks to browser storage exclusively
 * through `hanabi-notes.ts`'s `readNote`/`writeNote` — it never imports
 * anything that could reach the wire or the server-synced client state
 * cache, and its props carry only ids, never a card's suit/rank identity.
 *
 * Initial render (and SSR) always shows the empty state — the real stored
 * value is only readable client-side, so it is loaded in a mount effect
 * (mirrors Table.tsx's discard-view-preference pattern) rather than as the
 * state initializer, keeping SSR and first client render in sync.
 */
export function NoteChip({ roomCode, seatId, cardId, slotNumber }: NoteChipProps) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setText(readNote(roomCode, seatId, cardId));
  }, [roomCode, seatId, cardId]);

  function stopPointerPropagation(e: PointerEvent) {
    e.stopPropagation();
  }

  function beginEditing() {
    setDraft(text);
    setEditing(true);
  }

  function commit(value: string) {
    const next = value.slice(0, NOTE_MAX_LENGTH);
    writeNote(roomCode, seatId, cardId, next);
    setText(next);
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      commit(draft);
    } else if (e.key === "Escape") {
      cancel();
    }
  }

  if (editing) {
    return (
      <input
        type="text"
        data-testid={`note-input-slot-${slotNumber}`}
        maxLength={NOTE_MAX_LENGTH}
        placeholder="Note…"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(draft)}
        onPointerDown={stopPointerPropagation}
        className="absolute z-10 rounded-md"
        style={{
          top: 0,
          left: 0,
          minWidth: 160,
          height: 20,
          padding: "0 4px",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          outline: "2px solid var(--color-accent)",
          color: "var(--color-text)",
          fontSize: "var(--text-label)",
          lineHeight: "var(--text-label--line-height)",
        }}
      />
    );
  }

  const populated = text !== "";

  return (
    <button
      type="button"
      data-testid={`note-chip-slot-${slotNumber}`}
      aria-label={populated ? `Edit note: ${text}` : "Add note"}
      onClick={beginEditing}
      onPointerDown={stopPointerPropagation}
      className="relative inline-flex w-full items-center justify-center rounded-md"
      style={{
        height: 20,
        color: "var(--color-text)",
        backgroundColor: populated ? "var(--color-surface)" : "transparent",
        border: populated ? "1px solid var(--color-border)" : "none",
      }}
    >
      {populated ? (
        <span
          className="w-full px-[4px] text-center font-semibold"
          style={{
            fontSize: "var(--text-label)",
            lineHeight: "var(--text-label--line-height)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </span>
      ) : (
        <Pencil aria-hidden="true" size={12} color="var(--color-text-muted)" />
      )}
      {/* Out-of-flow touch target: the row's own flow height stays 20px
          (the MarksZone note-row budget), but the effective hit area is
          expanded to >= 44px via this absolutely-positioned inset span, so
          the layout never grows (mirrors Table.tsx's discard-toggle
          pattern). */}
      <span aria-hidden="true" className="absolute" style={{ inset: "-12px 0" }} />
    </button>
  );
}
