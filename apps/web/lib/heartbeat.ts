import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_PONG_TIMEOUT_MS } from "@games/schema";

/**
 * Pure client-side heartbeat/resume decisions (D-01/D-02/D-11). Framework-
 * free: no React, no browser globals — `room-socket.ts` is the only caller
 * and owns all DOM/timer wiring. Keeping these decisions pure lets them be
 * unit-proven before any socket/DOM plumbing exists.
 */

export interface ClientHeartbeatTiming {
  intervalMs: number;
  pongTimeoutMs: number;
}

/** partysocket's `OPEN` static is literally 1 (standard WebSocket readyState
 * numbering) — imported as a plain literal here rather than from
 * `partysocket`, since this module must stay framework-free. */
const OPEN_READY_STATE = 1;

/** D-15: `NEXT_PUBLIC_HEARTBEAT_INTERVAL_MS`/`NEXT_PUBLIC_HEARTBEAT_PONG_TIMEOUT_MS`
 * let tests shorten the real constants (Next only inlines literal
 * `process.env.NEXT_PUBLIC_*` property access, which is why the caller must
 * pass these as plain strings rather than this module reading `process.env`
 * itself). A finite integer >= 250ms wins; anything else (unset, empty,
 * non-numeric, non-integer, or too small) falls back to the real constant.
 * Production never sets these vars, so this always resolves to the real
 * constants there. */
function resolveOverride(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 250) {
    return fallback;
  }
  return parsed;
}

export function resolveClientHeartbeatTiming(
  rawInterval: string | undefined,
  rawPongTimeout: string | undefined,
): ClientHeartbeatTiming {
  return {
    intervalMs: resolveOverride(rawInterval, HEARTBEAT_INTERVAL_MS),
    pongTimeoutMs: resolveOverride(rawPongTimeout, HEARTBEAT_PONG_TIMEOUT_MS),
  };
}

export type ResumeAction = "none" | "ping" | "reconnect";

/**
 * D-01: decides what a `visibilitychange`-to-visible or `online` event
 * should do to the socket. Never fires while latched (D-11 — a superseded
 * tab must never auto-reclaim). Otherwise: a socket that isn't OPEN, or
 * hasn't heard from the server in longer than one full heartbeat cycle
 * (interval + pong timeout), is force-reconnected immediately rather than
 * waiting on partysocket's own backoff; anything more recent than that just
 * gets an immediate ping.
 */
export function resumeAction(input: {
  latched: boolean;
  readyState: number;
  lastHeardAt: number;
  now: number;
  timing: ClientHeartbeatTiming;
}): ResumeAction {
  const { latched, readyState, lastHeardAt, now, timing } = input;
  if (latched) {
    return "none";
  }
  if (readyState !== OPEN_READY_STATE) {
    return "reconnect";
  }
  if (now - lastHeardAt > timing.intervalMs + timing.pongTimeoutMs) {
    return "reconnect";
  }
  return "ping";
}

/**
 * D-02: true once a sent ping has gone unanswered — by a pong OR any other
 * frame, since `lastHeardAt` is updated on every inbound frame — for longer
 * than `pongTimeoutMs`. A frame that arrived AFTER the ping was sent (even
 * if it isn't literally the pong) proves the socket is alive, so this only
 * looks at whether `lastHeardAt` is still stale relative to `pingSentAt`.
 */
export function isPongOverdue(input: {
  pingSentAt: number;
  lastHeardAt: number;
  now: number;
  pongTimeoutMs: number;
}): boolean {
  const { pingSentAt, lastHeardAt, now, pongTimeoutMs } = input;
  if (lastHeardAt >= pingSentAt) {
    return false;
  }
  return now > pingSentAt + pongTimeoutMs;
}
