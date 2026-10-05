"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import type { CreateRoomRequest } from "@games/schema";
import { Button } from "../Button";
import { markSoloRoom } from "../../lib/dev/dev-solo";
import { writePendingGame } from "../../lib/pending-room";
import { writeDisplayName } from "../../lib/seat-token";

const SOLO_NAME = "Solo";

/** Dev builds only: an Expedition room for one player, filled with bots and
 * started as soon as it opens, its bots taking their own turns. */
export function PlaySoloButton() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function playSolo(event: MouseEvent<HTMLButtonElement>) {
    const typed = event.currentTarget.form?.elements.namedItem("displayName");
    const displayName = (typed instanceof HTMLInputElement ? typed.value.trim() : "") || SOLO_NAME;
    const request: CreateRoomRequest = { gameId: "expedition", displayName, config: null };
    setStarting(true);
    setFailed(false);
    try {
      const res = await fetch("/api/room", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
      if (!res.ok) throw new Error(`create failed: ${res.status}`);
      const { code, path } = (await res.json()) as { code: string; path: string };
      writeDisplayName(code, displayName);
      writePendingGame(code, "expedition");
      markSoloRoom(code);
      router.push(path);
    } catch {
      setFailed(true);
      setStarting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        data-testid="play-solo-dev"
        className="border-[var(--color-landing-panel-border)]! text-[var(--color-landing-text)]! hover:bg-black/5!"
        disabled={starting}
        onClick={playSolo}
      >
        {starting ? "Starting..." : "Play solo (dev)"}
      </Button>
      {failed && (
        <p className="text-[length:var(--text-label)]" style={{ color: "var(--color-landing-destructive)" }}>
          Couldn&apos;t create a solo room. Try again.
        </p>
      )}
    </>
  );
}
