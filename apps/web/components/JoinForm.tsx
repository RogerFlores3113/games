"use client";

import { useState, type FormEvent } from "react";
import { Button } from "./Button";
import { RoomCode } from "./RoomCode";

export interface JoinFormProps {
  /** The room code from the URL — shown above the form so the joining
   * player can confirm they're entering the right room before typing
   * their name (UI-SPEC § Screens & States, item 2). */
  code: string;
  /** Called with the trimmed display name once the player submits. The
   * caller owns opening the socket connection. */
  onJoin: (displayName: string) => void;
  /** Shown under the name field when the previous join attempt was rejected
   * by the server (WR-05). */
  error?: string;
}

/**
 * The join screen for a `/room/[code]` visitor with no saved seat token.
 * Display name only — no variant picker (locked to the host's choice) and
 * nothing else to fill out (ROOM-02).
 */
export function JoinForm({ code, onJoin, error }: JoinFormProps) {
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const shareUrl =
    typeof window !== "undefined" ? window.location.href : `https://games.rogerflores.dev/room/${code}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      return;
    }
    setSubmitting(true);
    onJoin(trimmed);
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
        <RoomCode code={code} shareUrl={shareUrl} />

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
            autoFocus
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

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Joining..." : "Join room"}
        </Button>
      </form>
    </main>
  );
}
