import type { SfxId } from "./sound-bank";

/**
 * The one door through which any code asks for a sound. The Phaser director
 * registers itself as the sink once the game exists. Until then, or when
 * audio is unavailable, `playCue` is a silent no-op that still records the
 * cue so the e2e bridge can observe what the game asked for.
 */

type CueSink = (id: SfxId) => void;

const RECENT_LIMIT = 50;
const recent: SfxId[] = [];
let sink: CueSink | null = null;

export function setCueSink(next: CueSink | null): void {
  sink = next;
}

export function playCue(id: SfxId): void {
  recent.push(id);
  if (recent.length > RECENT_LIMIT) recent.shift();
  try {
    sink?.(id);
  } catch {
    // audio must never break the game
  }
}

/** The last played cues, oldest first. */
export function recentCues(): SfxId[] {
  return [...recent];
}
