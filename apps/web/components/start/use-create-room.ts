"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CreateRoomRequestSchema } from "@games/schema";
import { writeDisplayName } from "../../lib/seat-token";
import { writePendingConfig, writePendingGame } from "../../lib/pending-room";
import { readCreateRoomForm } from "../../lib/create-room-form";

const CHECK_NAME_ERROR = "Couldn't create a room — check your name and try again.";
const CHECK_CONNECTION_ERROR = "Couldn't create a room — check your connection and try again.";

/**
 * The fetch-based enhancement of a start page's create form. The form also
 * posts natively to `/api/room` (D-17), so it works before hydration; once
 * React attaches, this handler takes over and writes the pending game,
 * config and name to localStorage (D-02) before navigating.
 */
export function useCreateRoom(initialError: boolean) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError ? CHECK_NAME_ERROR : null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = CreateRoomRequestSchema.safeParse(readCreateRoomForm(new FormData(event.currentTarget)));
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

  return { submitting, error, onSubmit };
}
