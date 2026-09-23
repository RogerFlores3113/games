"use client";

import { VariantSchema, type Variant } from "@games/schema";

export interface HanabiLobbySettingsProps {
  config: unknown;
  onSetConfig: (config: unknown) => void;
}

const VARIANT_OPTIONS: { value: Variant; label: string; blurb: string }[] = [
  { value: "base", label: "Base", blurb: "5 suits" },
  { value: "rainbow", label: "Rainbow", blurb: "+ rainbow" },
  { value: "black", label: "Black", blurb: "+ rainbow & black" },
];

/**
 * D-11/MGR-03: Hanabi's host-only lobby settings — moved byte-for-byte out
 * of `Lobby.tsx` (which is now game-agnostic) into this per-game component,
 * looked up via `game-ui.tsx`'s `LOBBY_SETTINGS` map. Visually and
 * behaviorally unchanged from the shipped variant picker.
 *
 * Test contracts this component must keep: the `variant-picker` testid;
 * real `<input type="radio">` elements with the accessible names
 * Base/Rainbow/Black (e2e drives them via `getByRole("radio", { name })`).
 */
export function HanabiLobbySettings({ config, onSetConfig }: HanabiLobbySettingsProps) {
  // D-05/UI-SPEC: the segmented picker's markup stays byte-identical; only
  // its selected value now derives from `config` (opaque at the schema
  // layer) instead of a top-level `variant` field. An unparseable config
  // (a future non-Hanabi game with a differently-shaped config) selects
  // nothing rather than throwing.
  const selectedVariant = VariantSchema.safeParse(config);

  return (
    <fieldset data-testid="variant-picker" className="flex flex-col gap-[length:var(--space-sm)]">
      <legend
        className="mb-[length:var(--space-xs)] text-[length:var(--text-label)] font-semibold uppercase"
        style={{
          color: "var(--color-text-muted)",
          letterSpacing: "0.12em",
          lineHeight: "var(--text-label--line-height)",
        }}
      >
        Variant
      </legend>
      {/* Segmented control. The radio itself stays a real, focusable
          input (visually hidden, never `display: none`) so keyboard
          and screen-reader semantics — and the e2e specs'
          getByRole("radio") — work exactly as before. */}
      <div className="grid grid-cols-3 gap-[length:var(--space-xs)]">
        {VARIANT_OPTIONS.map(({ value, label, blurb }) => {
          const selected = selectedVariant.success && selectedVariant.data === value;
          return (
            <label
              key={value}
              data-selected={selected ? "true" : "false"}
              className="relative flex cursor-pointer flex-col items-center gap-[2px] rounded-md border px-[length:var(--space-xs)] py-[length:var(--space-sm)] text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-accent)] has-[:disabled]:cursor-not-allowed"
              style={{
                backgroundColor: selected ? "var(--color-bg)" : "transparent",
                borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
              }}
            >
              {/* aria-label pins the accessible name to exactly
                  "Base"/"Rainbow"/"Black". Without it the wrapping
                  <label>'s full text content — including the blurb
                  — becomes the name ("Rainbow + rainbow"), and the
                  e2e specs' getByRole("radio", { name: "Rainbow" })
                  then matches both Rainbow and Black by substring. */}
              <input
                type="radio"
                name="variant"
                value={value}
                aria-label={label}
                checked={selected}
                onChange={() => onSetConfig(value)}
                // Transparent but full-size, NOT `sr-only`: the
                // e2e specs click the radio itself, and a clipped
                // 1x1 sr-only input sits under the label's own text
                // spans, so the click lands on them instead and
                // Playwright reports an intercepted click.
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <span
                className="text-[length:var(--text-body)] font-semibold"
                style={{
                  color: selected ? "var(--color-accent)" : "var(--color-text)",
                  lineHeight: "var(--text-body--line-height)",
                }}
              >
                {label}
              </span>
              <span
                className="text-[length:var(--text-label)]"
                style={{
                  color: "var(--color-text-muted)",
                  lineHeight: "var(--text-label--line-height)",
                }}
              >
                {blurb}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
