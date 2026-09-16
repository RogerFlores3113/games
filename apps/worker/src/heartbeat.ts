// Pure heartbeat/zombie-sweep timing helpers (D-02/D-03/D-15).
//
// No Date.now(), no ctx, no socket I/O — every timestamp is an explicit
// argument, exactly like scheduler.ts's own module-header discipline, so
// this module is fully deterministic and offline-testable. room-do.ts is
// the only place these are wired to the real Durable Object/runtime APIs.

import { SOCKET_STALE_MS, ZOMBIE_SWEEP_INTERVAL_MS } from "@games/schema";

/** D-15: wrangler `--var` overrides for socket-staleness timing, so socket
 * tests never sleep for real minutes. Production never sets these — see
 * room-do.ts's Env doc comment. */
export interface HeartbeatEnv {
  SOCKET_STALE_MS?: string;
  ZOMBIE_SWEEP_INTERVAL_MS?: string;
}

export interface HeartbeatTiming {
  socketStaleMs: number;
  zombieSweepIntervalMs: number;
}

/** Parses a single override: a string that parses to a finite integer >=
 * 500ms wins; anything else (undefined, "", "abc", "0", "-5", "12.5") falls
 * back to `fallback`. A sub-500ms threshold would make the sweep itself
 * indistinguishable from network jitter, so it is rejected rather than
 * silently honored. */
function resolveOverride(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  if (!/^-?\d+$/.test(raw)) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 500) return fallback;
  return parsed;
}

/** D-15: resolves the live timing table from wrangler-injected env vars,
 * falling back to the packages/schema constants when unset or invalid. */
export function resolveHeartbeatTiming(env: HeartbeatEnv): HeartbeatTiming {
  return {
    socketStaleMs: resolveOverride(env.SOCKET_STALE_MS, SOCKET_STALE_MS),
    zombieSweepIntervalMs: resolveOverride(env.ZOMBIE_SWEEP_INTERVAL_MS, ZOMBIE_SWEEP_INTERVAL_MS),
  };
}

/** D-03: the most recent moment this socket is known to have been alive —
 * the later of its last auto-responded ping and the moment it was bound to
 * a seat (so a just-joined socket that has not pinged yet is not reaped).
 * Missing values count as 0 (older than any real timestamp). */
export function socketLastSeenAt(autoResponseAt: Date | null, boundAt: number | undefined): number {
  const autoResponseMs = autoResponseAt === null ? 0 : autoResponseAt.getTime();
  const boundMs = boundAt ?? 0;
  return Math.max(autoResponseMs, boundMs);
}

/** D-03: strictly-greater-than staleness check — a socket last seen exactly
 * `staleMs` ago is NOT yet stale (boundary inclusive of "still alive"). */
export function isSocketStale(lastSeenAt: number, now: number, staleMs: number): boolean {
  return now - lastSeenAt > staleMs;
}
