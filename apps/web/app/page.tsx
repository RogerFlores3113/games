"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../components/Button";
import { PhotoCredit } from "../components/PhotoCredit";
import { LANDING_IMAGE_CREDIT } from "../lib/image-credits";
import { writeDisplayName } from "../lib/seat-token";
import { writePendingVariant } from "../lib/pending-variant";

type VariantOption = "base" | "rainbow" | "black";
type GameOption = "" | "hanabi" | "innovation";

// The page is server-rendered, so its form exists before React attaches
// `onSubmit`. A click in that window falls through to a native GET submit
// that reloads "/?displayName=…" with an empty form, and the name is lost.
// `useSyncExternalStore` returns the server snapshot (false) during SSR and
// hydration, and the client snapshot (true) afterwards, so "Create room"
// only becomes clickable once the real handler is attached.
const noopSubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

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
  const [game, setGame] = useState<GameOption>("");
  const [displayName, setDisplayName] = useState("");
  const [variant, setVariant] = useState<VariantOption>("base");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();
  const isHanabi = game === "hanabi";

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
      // retype it (D-03) — the room page reads this to send its `join`
      // message automatically. localStorage, not sessionStorage (WR-06), so
      // it survives into a new tab alongside the seat token.
      writeDisplayName(json.code, displayName.trim());
      // WR-04: the Durable Object always starts a room on "base"; the host's
      // client applies this choice with `set_variant` after its first join.
      writePendingVariant(json.code, variant);
      router.push(json.path);
    } catch {
      setError("Couldn't create a room — check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="landing-backdrop flex min-h-screen items-center justify-center px-[length:var(--space-md)] py-[length:var(--space-xl)]">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-[length:var(--space-md)] rounded-lg p-[length:var(--space-lg)] shadow-lg"
        style={{
          backgroundColor: "var(--color-landing-panel)",
          border: "1px solid var(--color-landing-panel-border)",
        }}
      >
        <h1
          className="text-[length:var(--text-heading)] font-semibold"
          style={{
            color: "var(--color-landing-text)",
            lineHeight: "var(--text-heading--line-height)",
          }}
        >
          Board games
        </h1>

        <div className="flex flex-col gap-[length:var(--space-sm)]">
          <label
            htmlFor="game"
            className="text-[length:var(--text-label)] font-semibold"
            style={{
              color: "var(--color-landing-text)",
              lineHeight: "var(--text-label--line-height)",
            }}
          >
            Game
          </label>
          <select
            id="game"
            name="game"
            required
            value={game}
            onChange={(event) => setGame(event.target.value as GameOption)}
            className="rounded-md border px-[length:var(--space-sm)] py-[length:var(--space-sm)] text-[length:var(--text-body)]"
            style={{
              backgroundColor: "var(--color-landing-panel)",
              borderColor: "var(--color-landing-panel-border)",
              color: "var(--color-landing-text)",
            }}
          >
            <option value="" disabled>
              Choose a game…
            </option>
            <option value="hanabi">Hanabi</option>
            <option value="innovation" disabled>
              Innovation - WIP
            </option>
          </select>
        </div>

        <div className="flex flex-col gap-[length:var(--space-sm)]">
          <label
            htmlFor="displayName"
            className="text-[length:var(--text-label)] font-semibold"
            style={{
              color: "var(--color-landing-text)",
              lineHeight: "var(--text-label--line-height)",
            }}
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
              backgroundColor: "var(--color-landing-panel)",
              borderColor: "var(--color-landing-panel-border)",
              color: "var(--color-landing-text)",
            }}
          />
          {error && (
            <p
              className="text-[length:var(--text-label)]"
              style={{ color: "var(--color-landing-destructive)" }}
            >
              {error}
            </p>
          )}
        </div>

        {isHanabi && (
          <>
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

            <Button type="submit" variant="primary" disabled={submitting || !hydrated}>
              {submitting ? "Creating..." : "Create room"}
            </Button>
          </>
        )}
      </form>
      <PhotoCredit credit={LANDING_IMAGE_CREDIT} theme="light" />
    </main>
  );
}
