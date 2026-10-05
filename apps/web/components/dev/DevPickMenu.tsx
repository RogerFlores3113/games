"use client";

import { useEffect, useRef } from "react";
import type { DevShortcutWire, RoomView } from "@games/schema";
import type { DevPick } from "../../lib/dev/dev-store";
import { withSeatLabels } from "../../lib/dev/seat-labels";
import { DevShortcutControls, type DevField } from "./DevShortcutControls";

export interface DevPickMenuProps {
  picked: DevPick;
  shortcuts: readonly DevShortcutWire[];
  seats: RoomView["seats"];
  valueOf: (shortcut: DevShortcutWire, field: DevField) => string;
  onChange: (shortcut: DevShortcutWire, field: DevField, value: string) => void;
  /** Runs `shortcut` with its target field set to the picked thing. */
  onRun: (shortcut: DevShortcutWire, target: { field: string; id: string }) => void;
  onClose: () => void;
  inControl: boolean;
}

/** The shortcuts that act on the picked thing right now: its kind matches
 * and the thing is one of the target field's options. */
export function shortcutsFor(picked: DevPick, shortcuts: readonly DevShortcutWire[]): DevShortcutWire[] {
  return shortcuts.filter((s) => {
    if (s.target === undefined || s.target.kind !== picked.kind) return false;
    const field = s.fields.find((f) => f.name === s.target!.field);
    return field?.kind === "choice" && field.options.some((o) => o.value === picked.id);
  });
}

const MENU_WIDTH = 288;

/** A small menu at the right-click: what the dev tools can do to the
 * objective, boss or weather under the pointer. */
export function DevPickMenu({ picked, shortcuts, seats, valueOf, onChange, onRun, onClose, inControl }: DevPickMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const actions = picked.kind === null ? [] : shortcutsFor(picked, shortcuts);
  const targetField = actions[0]?.fields.find((f) => f.name === actions[0]!.target!.field);
  const title =
    targetField?.kind === "choice"
      ? withSeatLabels(targetField.options.find((o) => o.value === picked.id)?.label ?? picked.id, seats)
      : picked.kind === null
        ? "Nothing to debug here"
        : picked.id;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointerDown(event: MouseEvent) {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [onClose]);

  const left = Math.max(4, Math.min(picked.x, window.innerWidth - MENU_WIDTH - 4));
  const below = picked.y < window.innerHeight / 2;
  return (
    <div
      ref={ref}
      data-testid="dev-pick-menu"
      role="menu"
      className="fixed z-[1001] flex flex-col gap-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-[var(--color-text)] shadow-2xl"
      style={{ left, width: MENU_WIDTH, ...(below ? { top: picked.y + 4 } : { bottom: window.innerHeight - picked.y + 4 }) }}
    >
      <p data-testid="dev-pick-title" className="font-semibold">
        {title}
      </p>
      {actions.length === 0 && (
        <p className="text-[var(--color-text-muted)]">
          {picked.kind === null ? "Right-click a boss, a weather chip or an objective in a dealt camp." : "No dev powers for this right now."}
        </p>
      )}
      {actions.map((shortcut) => (
        <div key={shortcut.id} className="flex flex-wrap items-center gap-1">
          <DevShortcutControls
            fields={shortcut.fields.filter((f) => f.name !== shortcut.target!.field)}
            valueOf={(field) => valueOf(shortcut, field)}
            onChange={(field, value) => onChange(shortcut, field, value)}
            onRun={() => onRun(shortcut, { field: shortcut.target!.field, id: picked.id })}
            disabled={inControl}
            seats={seats}
            buttonLabel={shortcut.label}
            testIds={{ button: `dev-pick-${shortcut.id}`, field: (name) => `dev-pick-field-${shortcut.id}-${name}` }}
          />
        </div>
      ))}
    </div>
  );
}
