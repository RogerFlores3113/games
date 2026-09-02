"use client";

import { useState } from "react";
import { Button } from "./Button";

const COPIED_LABEL_MS = 2000;

export interface RoomCodeProps {
  code: string;
  /** Full shareable URL to copy — e.g. `https://games.rogerflores.dev/room/ABC123`. */
  shareUrl: string;
}

/**
 * Display-role room code (Geist Mono, 40px, weight 600, letter-spaced) plus
 * an adjacent ghost "Copy link" button. Monospace + letter spacing exist
 * because this code is read aloud digit-by-digit over a voice call — do
 * not substitute the UI face (UI-SPEC § Typography).
 */
export function RoomCode({ code, shareUrl }: RoomCodeProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Clipboard permission denied or unavailable — the code is still
      // visible on-screen and speakable, so silently no-op rather than
      // throwing a UI error.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_LABEL_MS);
  }

  return (
    <div className="flex items-center gap-[length:var(--spacing-md)]">
      <span
        className="font-mono font-semibold tracking-wide"
        style={{
          color: "var(--color-accent)",
          fontSize: "var(--text-display)",
          lineHeight: "var(--text-display--line-height)",
          letterSpacing: "0.05em",
        }}
      >
        {code}
      </span>
      <Button variant="ghost" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy link"}
      </Button>
    </div>
  );
}
