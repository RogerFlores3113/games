"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../components/Button";
import { PhotoCredit } from "../components/PhotoCredit";
import { LANDING_IMAGE_CREDIT } from "../lib/image-credits";
import { CreateRoomRequestSchema } from "@games/schema";
import { writeDisplayName } from "../lib/seat-token";
import { writePendingConfig, writePendingGame } from "../lib/pending-room";
import { LANDING_GAME_OPTIONS, LANDING_SETTINGS } from "../components/game-ui";
import { configFieldName, readCreateRoomForm } from "../lib/create-room-form";

const CHECK_NAME_ERROR = "Couldn't create a room — check your name and try again.";
const CHECK_CONNECTION_ERROR = "Couldn't create a room — check your connection and try again.";

export interface LandingFormProps {
  initialError: boolean;
}

// D-17: `[data-game-settings]` panels are hidden by default and shown by a
// pure-CSS `:has()` rule keyed on the selected `<option>` — this works
// before hydration (no React state involved), so choosing Hanabi reveals
// its variant radios even if JS hasn't attached yet.
const GAME_SETTINGS_CSS = [
  "[data-game-settings]{display:none}",
  ...Object.keys(LANDING_SETTINGS).map(
    (gameId) =>
      `form:has(select[name="gameId"] option[value="${gameId}"]:checked) [data-game-settings="${gameId}"]{display:block}`,
  ),
].join("\n");

/**
 * D-03/D-17: room creation is ONE screen — display name, game picker,
 * per-game settings, "Create room". The `<form>` submits natively to
 * `/api/room` (works before hydration, D-17/MGR-08) with a `fetch`-based
 * JS enhancement layered on top (D-02: writes the pending game/config/name
 * to localStorage before navigating, avoiding a full page reload).
 */
export default function LandingForm({ initialError }: LandingFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError ? CHECK_NAME_ERROR : null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const parsed = CreateRoomRequestSchema.safeParse(readCreateRoomForm(formData));
    if (!parsed.success) {
      setError(CHECK_NAME_ERROR);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        setError(CHECK_NAME_ERROR);
        setSubmitting(false);
        return;
      }
      const json = (await res.json()) as { code: string; path: string };
      // D-02: carried into the lobby so the host's first join auto-applies
      // them, without ever appearing in the shareable room link.
      writeDisplayName(json.code, parsed.data.displayName);
      writePendingGame(json.code, parsed.data.gameId);
      writePendingConfig(json.code, parsed.data.config);
      router.push(json.path);
    } catch {
      setError(CHECK_CONNECTION_ERROR);
      setSubmitting(false);
    }
  }

  return (
    <main className="landing-backdrop flex min-h-screen items-center justify-center px-[length:var(--space-md)] py-[length:var(--space-xl)]">
      <style>{GAME_SETTINGS_CSS}</style>
      <form
        method="post"
        action="/api/room"
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
            name="gameId"
            required
            defaultValue=""
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
            {LANDING_GAME_OPTIONS.map(({ value, label, disabled }) => (
              <option key={value} value={value} disabled={disabled}>
                {label}
              </option>
            ))}
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
            defaultValue=""
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

        {Object.entries(LANDING_SETTINGS).map(([gameId, Settings]) => (
          <div key={gameId} data-game-settings={gameId}>
            <Settings name={configFieldName(gameId)} />
          </div>
        ))}

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Creating..." : "Create room"}
        </Button>
      </form>
      <PhotoCredit credit={LANDING_IMAGE_CREDIT} theme="light" />
    </main>
  );
}
