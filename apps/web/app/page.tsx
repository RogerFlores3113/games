"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../components/Button";

type VariantOption = "base" | "rainbow" | "black";

const VARIANTS: { value: VariantOption; label: string }[] = [
  { value: "base", label: "Base" },
  { value: "rainbow", label: "Rainbow" },
  { value: "black", label: "Black" },
];

/**
 * D-03: room creation is ONE screen — display name, variant picker,
 * "Create room". The host lands directly in the lobby, already seated,
 * with no intermediate screen in between. The lobby (Plan 09) is where the
 * link-distribution affordance lives.
 */
export default function HomePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [variant, setVariant] = useState<VariantOption>("base");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, variant }),
      });
      if (!res.ok) {
        setError("Couldn't create a room — check your name and try again.");
        setSubmitting(false);
        return;
      }
      const json = (await res.json()) as { code: string; path: string };
      // Carry the entered display name into the lobby so the host does not
      // retype it (D-03) — Plan 09's lobby reads this to send its `join`
      // message automatically.
      sessionStorage.setItem(`room:${json.code}:displayName`, displayName);
      router.push(json.path);
    } catch {
      setError("Couldn't create a room — check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-[length:var(--space-md)]"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-[length:var(--space-md)] rounded-lg p-[length:var(--space-lg)]"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <h1
          className="text-[length:var(--text-heading)] font-semibold"
          style={{ color: "var(--color-text)", lineHeight: "var(--text-heading--line-height)" }}
        >
          games.rogerflores.dev
        </h1>

        <div className="flex flex-col gap-[length:var(--space-sm)]">
          <label
            htmlFor="displayName"
            className="text-[length:var(--text-label)] font-semibold"
            style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
          >
            Your name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            maxLength={24}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="rounded-md border px-[length:var(--space-sm)] py-[length:var(--space-sm)] text-[length:var(--text-body)]"
            style={{
              backgroundColor: "var(--color-bg)",
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
          />
          {error && (
            <p
              className="text-[length:var(--text-label)]"
              style={{ color: "var(--color-destructive)" }}
            >
              {error}
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-[length:var(--space-sm)]">
          <legend
            className="text-[length:var(--text-label)] font-semibold"
            style={{ color: "var(--color-text)", lineHeight: "var(--text-label--line-height)" }}
          >
            Variant
          </legend>
          <div className="flex gap-[length:var(--space-md)]">
            {VARIANTS.map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-[length:var(--space-xs)] text-[length:var(--text-body)]"
                style={{ color: "var(--color-text)" }}
              >
                <input
                  type="radio"
                  name="variant"
                  value={value}
                  checked={variant === value}
                  onChange={() => setVariant(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Creating..." : "Create room"}
        </Button>
      </form>
    </main>
  );
}
