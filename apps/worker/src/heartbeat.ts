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

/** CR-02 (review): seats persisted as `connected: true` that have NO live
 * socket bound to them at all. This is exactly what a deploy, eviction, or
 * DO restart leaves behind — every hibernated socket is dropped and its
 * close event is not guaranteed to reach the new instance — so the
 * timestamp-based check above (which only ever sees OPEN sockets) can never
 * find them. `bindings` must be read in the same synchronous section as
 * `seats`: a join binds its socket (`setState`) before it persists
 * `connected: true`, so a seat mid-join is never reported here. */
export function orphanedConnectedSeatIds(
  seats: readonly { readonly seatId: string; readonly connected: boolean }[],
  bindings: Readonly<Record<string, string>>,
): string[] {
  return seats.filter((seat) => seat.connected && bindings[seat.seatId] === undefined).map((seat) => seat.seatId);
}

/** What `#syncAlarm` should do with the Durable Object's single alarm slot. */
export type AlarmWrite = { kind: "set"; at: number } | { kind: "delete" } | { kind: "keep" };

/** CR-01/WR-01 (review): the pure decision behind `#syncAlarm`.
 *
 * - `next === null` deletes a pending alarm (nothing left to schedule).
 * - Outside the alarm handler, a pending alarm that is already OVERDUE
 *   (`currentAlarm <= now`) is authoritative and never replaced: the
 *   runtime is about to deliver it (delivery is best-effort and may lag or
 *   be retried), and overwriting it with a later target — e.g. a
 *   hibernation wake recomputing the next grid boundary after the pending
 *   one has passed — would defer the sweep by a whole interval, again and
 *   again for a DO that hibernates between moves (RESEARCH.md Pitfall 3).
 *   The handler that alarm triggers always re-arms on its way out.
 * - Inside the alarm handler (`inAlarmHandler`), the firing alarm is being
 *   consumed, so the next target is always written whenever it differs from
 *   what `getAlarm()` reports — otherwise a runtime that still reports the
 *   firing alarm would leave the room with no alarm at all.
 * - Pitfall 2: an unchanged target is never re-written. */
export function resolveAlarmWrite(
  next: number | null,
  currentAlarm: number | null,
  now: number,
  options: { inAlarmHandler: boolean },
): AlarmWrite {
  if (next === null) {
    return currentAlarm === null ? { kind: "keep" } : { kind: "delete" };
  }
  if (!options.inAlarmHandler && currentAlarm !== null && currentAlarm <= now) {
    return { kind: "keep" };
  }
  if (next === currentAlarm) return { kind: "keep" };
  return { kind: "set", at: next };
}
