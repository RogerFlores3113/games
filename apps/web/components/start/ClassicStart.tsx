"use client";

import Link from "next/link";
import { Button } from "../Button";
import { PhotoCredit } from "../PhotoCredit";
import { LANDING_IMAGE_CREDIT } from "../../lib/image-credits";
import type { StartScreenProps } from "./start-screen";
import { useCreateRoom } from "./use-create-room";

/**
 * The plain create-room screen: the board-game-night photo behind one light
 * panel with a name field, the game's settings and "Create room". The form
 * posts natively to `/api/room` (D-17) with a fetch enhancement on top.
 */
export function ClassicStart({ gameId, name, initialError, children }: StartScreenProps) {
  const { submitting, error, onSubmit } = useCreateRoom(initialError);

  return (
    <main className="landing-backdrop flex min-h-screen items-center justify-center px-[length:var(--space-md)] py-[length:var(--space-xl)]">
      <form
        method="post"
        action="/api/room"
        onSubmit={onSubmit}
        className="flex w-full max-w-sm flex-col gap-[length:var(--space-md)] rounded-lg p-[length:var(--space-lg)] shadow-lg"
        style={{
          backgroundColor: "var(--color-landing-panel)",
          border: "1px solid var(--color-landing-panel-border)",
        }}
      >
        <input type="hidden" name="gameId" value={gameId} />
        <div className="flex flex-col gap-[length:var(--space-xs)]">
          <Link
            href="/"
            className="self-start text-[length:var(--text-label)] font-semibold underline-offset-4 hover:underline"
            style={{ color: "var(--color-landing-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            ← All games
          </Link>
          <h1
            className="text-[length:var(--text-heading)] font-semibold"
            style={{ color: "var(--color-landing-text)", lineHeight: "var(--text-heading--line-height)" }}
          >
            {name}
          </h1>
        </div>

        <div className="flex flex-col gap-[length:var(--space-sm)]">
          <label
            htmlFor="displayName"
            className="text-[length:var(--text-label)] font-semibold"
            style={{ color: "var(--color-landing-text)", lineHeight: "var(--text-label--line-height)" }}
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
            <p className="text-[length:var(--text-label)]" style={{ color: "var(--color-landing-destructive)" }}>
              {error}
            </p>
          )}
        </div>

        {children}

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Creating..." : "Create room"}
        </Button>
      </form>
      <PhotoCredit credit={LANDING_IMAGE_CREDIT} theme="light" />
    </main>
  );
}
