"use client";

import { useState } from "react";
import type { DevShortcutWire, RoomView } from "@games/schema";
import { safeGetItem, safeSetItem } from "../../lib/safe-storage";
import type { DevResultFrame } from "../../lib/dev/dev-store";
import { DevShortcutControls, devButtonClass, type DevField } from "./DevShortcutControls";

export interface DevToolbarProps {
  view: RoomView;
  shortcuts: readonly DevShortcutWire[];
  valueOf: (shortcut: DevShortcutWire, field: DevField) => string;
  onChange: (shortcut: DevShortcutWire, field: DevField, value: string) => void;
  onRun: (shortcut: DevShortcutWire) => void;
  onFillAndStart: () => void;
  open: boolean;
  onToggleOpen: () => void;
  botsPlay: boolean;
  onBotsPlay: (on: boolean) => void;
  result: DevResultFrame | null;
  inControl: boolean;
}

const PICK_HINT = "Right-click a boss, a weather chip or an objective for more.";
const COLLAPSED_KEY = "games:dev-toolbar-collapsed";

/** The always-visible strip along the bottom edge: the shortcuts a solo
 * playtest reaches for, bots on or off, and the last answer. */
export function DevToolbar({
  view,
  shortcuts,
  valueOf,
  onChange,
  onRun,
  onFillAndStart,
  open,
  onToggleOpen,
  botsPlay,
  onBotsPlay,
  result,
  inControl,
}: DevToolbarProps) {
  const [collapsed, setCollapsed] = useState(() => safeGetItem(COLLAPSED_KEY) === "1");
  const onToolbar = view.status === "lobby" ? [] : shortcuts.filter((s) => s.toolbar !== undefined);
  const picks = shortcuts.some((s) => s.target !== undefined);
  const compact = "px-1 py-0.5 text-[11px]";
  return (
    <div
      data-testid="dev-toolbar"
      className="fixed bottom-0 left-0 z-[1000] flex max-w-[100vw] items-center gap-1 overflow-x-auto whitespace-nowrap rounded-tr border-r border-t border-[var(--color-border)] bg-[var(--color-surface)]/90 px-1 py-0.5 text-[11px] text-[var(--color-text)]"
    >
      <button
        type="button"
        data-testid="dev-toggle"
        aria-expanded={open}
        title="Dev panel (backtick)"
        onClick={onToggleOpen}
        className={`${devButtonClass} ${compact} font-bold tracking-wider text-[var(--color-text-muted)]`}
      >
        DEV
      </button>
      <button
        type="button"
        data-testid="dev-toolbar-collapse"
        aria-label={collapsed ? "Show the dev toolbar" : "Hide the dev toolbar"}
        title={collapsed ? "Show the dev toolbar" : "Hide the dev toolbar"}
        onClick={() => {
          safeSetItem(COLLAPSED_KEY, collapsed ? "0" : "1");
          setCollapsed(!collapsed);
        }}
        className={`${devButtonClass} ${compact}`}
      >
        {collapsed ? "›" : "‹"}
      </button>
      {!collapsed && view.status === "lobby" && (
        <button type="button" data-testid="dev-toolbar-fill-start" className={`${devButtonClass} ${compact}`} disabled={inControl} onClick={onFillAndStart}>
          Fill with bots and start
        </button>
      )}
      {!collapsed && onToolbar.map((shortcut) => (
        <span key={shortcut.id} className="flex items-center gap-0.5 border-l border-[var(--color-border)] pl-1">
          <DevShortcutControls
            fields={shortcut.fields}
            valueOf={(field) => valueOf(shortcut, field)}
            onChange={(field, value) => onChange(shortcut, field, value)}
            onRun={() => onRun(shortcut)}
            disabled={inControl}
            seats={view.seats}
            buttonLabel={shortcut.toolbar!}
            testIds={{ button: `dev-toolbar-${shortcut.id}`, field: (name) => `dev-toolbar-field-${shortcut.id}-${name}` }}
            compact
          />
        </span>
      ))}
      {!collapsed && view.status !== "lobby" && (
        <label className="flex items-center gap-1 border-l border-[var(--color-border)] pl-1">
          <input data-testid="dev-toolbar-bots" type="checkbox" checked={botsPlay} onChange={(e) => onBotsPlay(e.target.checked)} />
          Bots play
        </label>
      )}
      {!collapsed && (
      <span
        data-testid="dev-toolbar-result"
        title={result?.message}
        className="max-w-[24rem] truncate border-l border-[var(--color-border)] pl-1"
        style={{ color: result && !result.ok ? "var(--color-destructive)" : "var(--color-text-muted)" }}
      >
        {result?.message ?? (picks ? PICK_HINT : "")}
      </span>
      )}
    </div>
  );
}
