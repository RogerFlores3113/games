const VARIANTS: { value: string; label: string }[] = [
  { value: "base", label: "Base" },
  { value: "rainbow", label: "Rainbow" },
  { value: "black", label: "Black" },
];

/**
 * D-12/D-17: Hanabi's create-room variant fieldset, shown on its start page
 * (`CreateSettings` in `game-catalog.ts`). Uncontrolled radios named by the `name` prop (the
 * per-game `config.hanabi` field, see `configFieldName`) — so the JS
 * enhancement reads its value via `FormData`, and the native form POST
 * (pre-hydration) carries it exactly the same way.
 */
export function HanabiCreateSettings({ name }: { name: string }) {
  return (
    <fieldset className="flex flex-col gap-[length:var(--space-sm)]">
      <legend
        className="text-[length:var(--text-label)] font-semibold"
        style={{
          color: "var(--color-landing-text)",
          lineHeight: "var(--text-label--line-height)",
        }}
      >
        Variant
      </legend>
      <div className="flex gap-[length:var(--space-md)]">
        {VARIANTS.map(({ value, label }) => (
          <label
            key={value}
            className="flex items-center gap-[length:var(--space-xs)] text-[length:var(--text-body)]"
            style={{ color: "var(--color-landing-text)" }}
          >
            <input type="radio" name={name} value={value} defaultChecked={value === "base"} />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
