"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { DEV_PANEL_ENABLED } from "../../lib/dev/dev-gate";
import { pixelFont } from "../fonts";
import type { StartScreenProps } from "./start-screen";
import { useCreateRoom } from "./use-create-room";

// Behind the inlined constant, like the room page's dev panel.
const PlaySoloButton = DEV_PANEL_ENABLED
  ? dynamic(() => import("../dev/PlaySoloButton").then((m) => m.PlaySoloButton), { ssr: false })
  : null;

/**
 * Expedition's create-room screen: the jungle trail at sunset, the pixel
 * lettering of the game, and the form on a parchment sheet in a wooden
 * frame. Same native-post-plus-fetch form as every start page (D-17).
 */
export function ExpeditionStart({ gameId, name, initialError, children }: StartScreenProps) {
  const { submitting, error, onSubmit } = useCreateRoom(initialError);

  return (
    <main className={`${pixelFont.variable} trail-backdrop trail-type relative flex min-h-screen flex-col`}>
      <nav className="px-[length:var(--space-md)] pt-[length:var(--space-md)] sm:px-[length:var(--space-xl)] sm:pt-[length:var(--space-lg)]">
        <Link href="/" className="trail-back">
          ← All games
        </Link>
      </nav>

      <div className="flex flex-1 items-center justify-center px-[length:var(--space-md)] py-[length:var(--space-xl)] sm:justify-start sm:px-[length:var(--space-3xl)]">
        <div className="flex w-full max-w-[440px] flex-col gap-[length:var(--space-lg)]">
          <header className="flex flex-col gap-[length:var(--space-xs)]">
            <p className="trail-kicker">Co-op trick-taking · 3–5 players</p>
            <h1 className="trail-title">{name}</h1>
            <p className="trail-lede">Lead your crew down the jungle trail, camp by camp, to the lost temple.</p>
          </header>

          <div className="trail-wood">
            <form method="post" action="/api/room" onSubmit={onSubmit} className="trail-parchment flex flex-col gap-[length:var(--space-md)]">
              <input type="hidden" name="gameId" value={gameId} />
              <div className="flex flex-col gap-[length:var(--space-sm)]">
                <label htmlFor="displayName" className="trail-label">
                  Your name
                </label>
                <input id="displayName" name="displayName" type="text" required maxLength={24} defaultValue="" className="trail-input" />
                {error && (
                  <p role="alert" className="trail-error">
                    {error}
                  </p>
                )}
              </div>

              {children}

              <button type="submit" className="trail-button" disabled={submitting}>
                {submitting ? "Creating..." : "Create room"}
              </button>
              {PlaySoloButton && <PlaySoloButton className="trail-button trail-button-quiet" errorClassName="trail-error" />}
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
