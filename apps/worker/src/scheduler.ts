// Pure, single-slot unified timer scheduler.
//
// A Cloudflare Durable Object can have exactly ONE pending alarm at a time —
// `ctx.storage.setAlarm` overwrites any alarm already scheduled (RESEARCH.md
// Pitfall 1). Naively calling `setAlarm` independently for idle GC (D-02),
// host-transfer grace (D-07), and lobby seat-release grace (D-12) would
// silently clobber each other.
//
// This module never touches `ctx.storage`, never calls `setAlarm`, and never
// reads `Date.now()` — every timestamp is an explicit argument, so it is
// fully deterministic and offline-testable. Plan 07 is the ONLY place that
// wires this to the real Durable Object alarm API.
//
// The core design choice: rather than incrementally mutating a timer table
// at each event and hoping the mutations stay consistent across hibernation
// wakes, `computeRoomTimers` RECOMPUTES the whole table from persisted room
// state on every change. A recomputed table cannot drift, and it makes
// `onStart` idempotent for free (RESEARCH.md Pitfall 2): calling it again on
// a hibernation wake yields the exact same table, never a pushed-forward
// deadline.

import type { RoomState } from "@games/schema";
import {
  HOST_TRANSFER_GRACE_MS,
  IDLE_GC_IN_PROGRESS_MS,
  IDLE_GC_LOBBY_MS,
  LOBBY_SEAT_RELEASE_GRACE_MS,
} from "@games/schema";

/** The closed set of timer kinds this phase schedules. */
export type TimerType = "idle_gc" | "host_transfer" | "seat_release";

/**
 * A single pending timer event. Timers are keyed by `type` plus `seatId` —
 * there is at most one `idle_gc` and at most one `host_transfer` per room,
 * and at most one `seat_release` per seat.
 */
export type TimerEvent = {
  type: TimerType;
  dueAt: number;
  seatId?: string;
};

function timerKey(type: TimerType, seatId?: string): string {
  return seatId === undefined ? type : `${type}:${seatId}`;
}

/**
 * Replaces any existing timer with the same key (type + seatId), returning a
 * NEW array sorted ascending by `dueAt`. Never mutates the input array.
 */
export function upsertTimer(timers: TimerEvent[], event: TimerEvent): TimerEvent[] {
  const key = timerKey(event.type, event.seatId);
  const withoutExisting = timers.filter((t) => timerKey(t.type, t.seatId) !== key);
  return [...withoutExisting, event].sort((a, b) => a.dueAt - b.dueAt);
}

/**
 * Removes the timer matching `type` (+ `seatId` if given), returning a NEW
 * array. Never mutates the input array.
 */
export function cancelTimer(timers: TimerEvent[], type: TimerType, seatId?: string): TimerEvent[] {
  const key = timerKey(type, seatId);
  return timers.filter((t) => timerKey(t.type, t.seatId) !== key);
}

/**
 * The minimum `dueAt` across all pending timers, or `null` when the table is
 * empty. This is the single value Plan 07 passes to `ctx.storage.setAlarm`;
 * `null` means "delete the alarm".
 */
export function nextDueAt(timers: TimerEvent[]): number | null {
  if (timers.length === 0) return null;
  return timers.reduce((min, t) => Math.min(min, t.dueAt), Number.POSITIVE_INFINITY);
}

/**
 * Partitions `timers` into those due at or before `now` and those not yet
 * due. `onAlarm` (Plan 07) processes ALL due events in one wake, not just
 * the earliest, because a single alarm firing may coincide with several
 * deadlines that became due at the same time.
 */
export function dueTimers(
  timers: TimerEvent[],
  now: number,
): { due: TimerEvent[]; remaining: TimerEvent[] } {
  const due: TimerEvent[] = [];
  const remaining: TimerEvent[] = [];
  for (const t of timers) {
    if (t.dueAt <= now) {
      due.push(t);
    } else {
      remaining.push(t);
    }
  }
  return { due, remaining };
}

/**
 * Derives the COMPLETE timer table from room state alone, given `now`. This
 * is the single source of truth for what should be pending — call it after
 * every state-changing event (join, leave, connect, disconnect, start,
 * alarm-processed) and persist the result; never mutate a stored table
 * incrementally.
 *
 * Derivation rules:
 * - always one `idle_gc` at `lastActivityAt + (in_progress ? 12h : 1h)` (D-02)
 * - one `host_transfer` at `hostSeat.disconnectedAt + 45s`, ONLY when
 *   status is "lobby", the host seat exists, and it is disconnected (D-07 —
 *   host transfer never applies mid-game)
 * - one `seat_release` per disconnected seat at `seat.disconnectedAt + 30s`,
 *   ONLY when status is "lobby" (D-12 — in-progress seats are never
 *   auto-released in this phase)
 */
export function computeRoomTimers(state: RoomState, now: number): TimerEvent[] {
  void now; // `now` is accepted for API symmetry/future use; not read directly here.
  let timers: TimerEvent[] = [];

  const idleGcMs = state.status === "in_progress" ? IDLE_GC_IN_PROGRESS_MS : IDLE_GC_LOBBY_MS;
  timers = upsertTimer(timers, {
    type: "idle_gc",
    dueAt: state.lastActivityAt + idleGcMs,
  });

  if (state.status === "lobby" && state.hostSeatId !== null) {
    const hostSeat = state.seats.find((s) => s.seatId === state.hostSeatId);
    if (hostSeat && !hostSeat.connected && hostSeat.disconnectedAt !== null) {
      timers = upsertTimer(timers, {
        type: "host_transfer",
        dueAt: hostSeat.disconnectedAt + HOST_TRANSFER_GRACE_MS,
      });
    }
  }

  if (state.status === "lobby") {
    for (const seat of state.seats) {
      if (!seat.connected && seat.disconnectedAt !== null) {
        timers = upsertTimer(timers, {
          type: "seat_release",
          dueAt: seat.disconnectedAt + LOBBY_SEAT_RELEASE_GRACE_MS,
          seatId: seat.seatId,
        });
      }
    }
  }

  return timers;
}
