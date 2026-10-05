"use client";

import type { DevShortcutWire, RoomView } from "@games/schema";
import { withSeatLabels } from "../../lib/dev/seat-labels";

export type DevField = DevShortcutWire["fields"][number];

export const devControlClass =
  "rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-xs text-[var(--color-text)] disabled:opacity-50";
export const devButtonClass =
  "cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50";

export function fieldInitial(field: DevField): string {
  if (field.kind === "choice") return field.options[0]?.value ?? "";
  return String(field.initial);
}

/** A shortcut's submitted params from its fields' current values. */
export function shortcutParams(shortcut: DevShortcutWire, valueOf: (field: DevField) => string): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const field of shortcut.fields) {
    const value = valueOf(field);
    params[field.name] = field.kind === "number" ? Number(value) : value;
  }
  return params;
}

export interface DevShortcutControlsProps {
  /** The fields to show; the others are submitted at their current value. */
  fields: readonly DevField[];
  valueOf: (field: DevField) => string;
  onChange: (field: DevField, value: string) => void;
  onRun: () => void;
  disabled: boolean;
  seats: RoomView["seats"];
  buttonLabel: string;
  testIds: { readonly button: string; field(name: string): string };
  /** Fields without their visible labels, for the toolbar. */
  compact?: boolean;
}

/** One shortcut's fields and its button, rendered the same in the dev
 * panel, the toolbar and the right-click menu. */
export function DevShortcutControls({
  fields,
  valueOf,
  onChange,
  onRun,
  disabled,
  seats,
  buttonLabel,
  testIds,
  compact = false,
}: DevShortcutControlsProps) {
  const sizing = compact ? "px-1 py-0.5 text-[11px]" : "";
  return (
    <>
      {fields.map((field) => {
        const testId = testIds.field(field.name);
        const control =
          field.kind === "choice" ? (
            <select
              data-testid={testId}
              aria-label={field.label}
              title={field.label}
              className={`${devControlClass} ${sizing} ${compact ? "max-w-[8rem]" : ""}`}
              value={valueOf(field)}
              onChange={(e) => onChange(field, e.target.value)}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {withSeatLabels(option.label, seats)}
                </option>
              ))}
            </select>
          ) : (
            <input
              data-testid={testId}
              aria-label={field.label}
              title={field.label}
              type={field.kind === "number" ? "number" : "text"}
              min={field.kind === "number" ? field.min : undefined}
              max={field.kind === "number" ? field.max : undefined}
              className={`${devControlClass} ${sizing} ${field.kind === "number" ? (compact ? "w-11" : "w-16") : "w-28"}`}
              value={valueOf(field)}
              onChange={(e) => onChange(field, e.target.value)}
            />
          );
        return compact ? (
          <span key={field.name}>{control}</span>
        ) : (
          <label key={field.name} className="flex items-center gap-1">
            <span className="text-[var(--color-text-muted)]">{field.label}</span>
            {control}
          </label>
        );
      })}
      <button
        type="button"
        data-testid={testIds.button}
        className={`${devButtonClass} ${sizing}`}
        disabled={disabled}
        onClick={onRun}
      >
        {buttonLabel}
      </button>
    </>
  );
}
