// The ONE stateful component in the system: a `partyserver` `Server<Env>`
// subclass, one Durable Object instance per room code. This file is
// deliberately thin glue over the four pure modules built in Wave 2
// (room-state.ts, seat-identity.ts, scheduler.ts, persistence.ts) — every
// decision about WHAT happens already lives there, tested in isolation.
// This file's only job is WHEN it happens: connection lifecycle, message
// dispatch, alarm scheduling, and persistence, wired through `ctx.storage`
// and `partyserver`'s hibernation-aware WebSocket lifecycle.
//
// Two structural invariants a reviewer (or Phase 2's HIDE-02 audit) can
// grep-verify directly in this file:
//   1. Exactly one alarm-arming call site (`ctx.storage.` + the Alarm API's
//      scheduling method), inside `#syncAlarm`.
//   2. Exactly one `toSeatView` call site (the literal invocation with an opening paren), inside `#pushState` — every
//      outbound frame is produced per-connection for that connection's own
//      seat. This class never calls the room-wide broadcast helper (CLAUDE.md "What NOT to Use":
//      broadcasting one shared state object to all seats is forbidden).

import { Server, type Connection, type ConnectionContext } from "partyserver";
import {
  encodeServerMessage,
  parseClientMessage,
  SUPERSEDED_CLOSE_CODE,
  type RoomCode,
  type RoomState,
} from "@games/schema";
import {
  createEmptyRoom,
  joinRoom,
  releaseSeat,
  markConnected,
  transferHost,
  setVariant,
  startGame,
  applyGameAction,
  toSeatView,
} from "./room-state";
import { mintSeatId, mintSeatToken, rebindSeatConnection, type SeatBindings } from "./seat-identity";
import { computeRoomTimers, dueTimers, nextDueAt, type TimerEvent } from "./scheduler";
import { loadRoom, loadTimers, saveRoom } from "./persistence";

/** The Durable Object namespace binding declared in wrangler.jsonc. */
export interface Env {
  ROOM: DurableObjectNamespace<RoomDO>;
}

/** Allowed WebSocket handshake origins. Browsers do NOT CORS-gate the WS
 * handshake (RESEARCH.md Pitfall 7 / T-1-05), so this is enforced here or
 * nowhere. A request with NO `Origin` header (non-browser clients, this
 * plan's own integration test) is allowed through — origin checking is
 * defense-in-depth against a browser-based scraper, not the confidentiality
 * control (per-seat projection is). */
const ALLOWED_ORIGINS = [
  "https://games.rogerflores.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

export class RoomDO extends Server<Env> {
  static options = { hibernate: true };

  /** Rehydrated in `onStart`. Never trust this across a hibernation wake
   * without re-loading — memory is wiped on eviction, deploys, and
   * maintenance restarts (RESEARCH.md anti-patterns). */
  room: RoomState | null = null;

  /** In-memory, non-persisted seatId -> connectionId map (Plan 05). Empty on
   * every wake; connection ids are meaningless after hibernation eviction. */
  bindings: SeatBindings = {};

  async onStart(): Promise<void> {
    const { room } = await loadRoom(this.ctx.storage, () =>
      createEmptyRoom(this.name as RoomCode, "base", Date.now()),
    );
    this.room = room;
    const timers = computeRoomTimers(room, Date.now());
    await this.#syncAlarm(timers);
  }

  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    const origin = ctx.request.headers.get("Origin");
    if (origin !== null && !ALLOWED_ORIGINS.includes(origin)) {
      connection.close(1008, "origin not allowed");
      return;
    }
    // No seat assignment here — the client sends an explicit `join` message
    // (with an optional seatToken) once connected. This makes first-join and
    // reconnect the SAME validated code path (RT-05, Phase 5), rather than
    // parsing seat identity out of the connect URL.
  }

  async onMessage(connection: Connection, raw: string | ArrayBuffer | ArrayBufferView): Promise<void> {
    const parsed = parseClientMessage(String(raw));
    if (!parsed.ok) {
      connection.send(encodeServerMessage({ type: "error", code: "bad_request" }));
      return;
    }
    const msg = parsed.message;
    const now = Date.now();
    const room = await this.#ensureRoom();

    if (msg.type === "join") {
      await this.#handleJoin(connection, room, msg.displayName, msg.seatToken, now);
      return;
    }

    // Every other message type resolves the actor's seat from the
    // connection-layer `bindings` map — NEVER from the message body, which
    // has no `seatId` field to supply (T-1-04 boundary).
    const actorSeatId = this.#seatIdFor(connection.id);
    if (actorSeatId === null) {
      connection.send(encodeServerMessage({ type: "error", code: "not_seated" }));
      return;
    }

    if (msg.type === "set_variant") {
      const result = setVariant(room, actorSeatId, msg.variant);
      if (!result.ok) {
        connection.send(encodeServerMessage({ type: "error", code: result.reason }));
        return;
      }
      await this.#commit(result.state, now);
      await this.#pushState();
      return;
    }

    if (msg.type === "start_game") {
      const result = startGame(room, actorSeatId, now, this.name);
      if (!result.ok) {
        connection.send(encodeServerMessage({ type: "error", code: result.reason }));
        return;
      }
      await this.#commit(result.state, now);
      await this.#pushState();
      return;
    }

    if (msg.type === "game_action") {
      const result = applyGameAction(room, actorSeatId, msg.request, now);
      if (!result.ok) {
        connection.send(encodeServerMessage({ type: "error", code: result.reason }));
        return;
      }
      await this.#commit(result.state, now);
      await this.#pushState();
      return;
    }

    if (msg.type === "leave") {
      const nextState = releaseSeat(room, actorSeatId, now);
      delete this.bindings[actorSeatId];
      await this.#commit(nextState, now);
      await this.#pushState();
      return;
    }
  }

  async onClose(connection: Connection): Promise<void> {
    const seatId = this.#seatIdFor(connection.id);
    if (seatId === null) return;

    // Only clear the binding if THIS connection is still the bound one — a
    // superseded connection's close() must not clobber the newer binding
    // that already replaced it (D-08).
    if (this.bindings[seatId] === connection.id) {
      delete this.bindings[seatId];
    }

    const room = await this.#ensureRoom();
    const now = Date.now();
    const nextState = markConnected(room, seatId, false, now);
    await this.#commit(nextState, now);
    // ROOM-04: pushes the live disconnected indicator to remaining seats;
    // also re-syncs the alarm — a disconnect is what arms D-07/D-12.
    await this.#pushState();
  }

  onError(connection: Connection, error: unknown): void {
    // Never rethrow — an exception escaping a handler tears down the room
    // for every seat (T-1-10).
    console.error(`RoomDO connection error (${connection.id}):`, error);
  }

  async onAlarm(): Promise<void> {
    try {
      const room = await this.#ensureRoom();
      const timers = await loadTimers(this.ctx.storage);
      const { due } = dueTimers(timers, Date.now());

      let current = room;
      let now = Date.now();

      for (const event of due) {
        now = Date.now();
        if (event.type === "host_transfer") {
          current = transferHost(current, now);
        } else if (event.type === "seat_release" && event.seatId !== undefined) {
          current = releaseSeat(current, event.seatId, now);
        } else if (event.type === "idle_gc") {
          // Abandoned room: close every connection, wipe all storage, and
          // return WITHOUT rescheduling (ROOM-08). A deleted room must not
          // keep waking itself up.
          for (const connection of this.getConnections()) {
            connection.close(1000, "room abandoned");
          }
          this.bindings = {};
          this.room = null;
          await this.ctx.storage.deleteAll();
          return;
        }
      }

      this.room = current;
      const finalNow = Date.now();
      await saveRoom(this.ctx.storage, current, computeRoomTimers(current, finalNow));
      await this.#pushState();
      await this.#syncAlarm(computeRoomTimers(current, finalNow));
    } catch (error) {
      console.error("RoomDO onAlarm failed:", error);
      // Re-sync even on failure so one bad event cannot permanently disarm
      // a room's GC.
      const room = await this.#ensureRoom();
      await this.#syncAlarm(computeRoomTimers(room, Date.now()));
    }
  }

  // ---------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------

  async #ensureRoom(): Promise<RoomState> {
    if (this.room === null) {
      await this.onStart();
    }
    return this.room as RoomState;
  }

  #seatIdFor(connectionId: string): string | null {
    for (const [seatId, boundConnectionId] of Object.entries(this.bindings)) {
      if (boundConnectionId === connectionId) return seatId;
    }
    return null;
  }

  async #handleJoin(
    connection: Connection,
    room: RoomState,
    displayName: string,
    seatToken: string | undefined,
    now: number,
  ): Promise<void> {
    const result = joinRoom(room, {
      displayName,
      seatToken: seatToken as RoomState["seats"][number]["seatToken"] | undefined,
      now,
      mintSeatId,
      mintSeatToken,
    });

    if (!result.ok) {
      connection.send(encodeServerMessage({ type: "refused", reason: result.reason }));
      connection.close(1000, result.reason);
      return;
    }

    const rebind = rebindSeatConnection(this.bindings, result.seatId, connection.id);
    this.bindings = rebind.bindings;

    if (rebind.supersededConnectionId !== null) {
      const superseded = this.getConnection(rebind.supersededConnectionId);
      if (superseded !== undefined) {
        superseded.send(encodeServerMessage({ type: "superseded" }));
        superseded.close(SUPERSEDED_CLOSE_CODE, "superseded");
      }
    }

    await this.#commit(result.state, now);

    // The only message that ever carries a seat token — sent to exactly the
    // one connection that just claimed the seat.
    connection.send(
      encodeServerMessage({
        type: "joined",
        seatId: result.seatId,
        seatToken: result.seatToken,
        view: this.#viewFor(result.state, result.seatId),
      }),
    );

    // Push the fresh state to everyone else (ROOM-04 live seat list).
    await this.#pushState();
  }

  /** The sole wrapper around `toSeatView` — the literal call site
   * the literal invocation of `toSeatView` with its call parenthesis appears exactly once in this file, right here. Both
   * `#pushState` and the `joined` reply above route through this one
   * method, so there is exactly one place in the whole worker that turns a
   * `RoomState` into anything sent over a socket (Phase 2's HIDE-02 audit
   * reads this file). */
  #viewFor(room: RoomState, seatId: string) {
    return toSeatView(room, seatId);
  }

  /** The ONLY outbound path other than the `joined`/`refused`/`superseded`/
   * `error` replies above. Every connection gets its OWN `#viewFor` call
   * with its OWN seat id — there is no shared payload to leak. No other
   * method in this class may call `connection.send` with a payload it did
   * not obtain from `#viewFor` (Phase 2's HIDE-02 audit reads this file). */
  async #pushState(): Promise<void> {
    const room = await this.#ensureRoom();
    for (const connection of this.getConnections()) {
      const seatId = this.#seatIdFor(connection.id);
      if (seatId === null) continue;
      connection.send(encodeServerMessage({ type: "state", view: this.#viewFor(room, seatId) }));
    }
  }

  /** Persists the room, recomputes timers, and re-syncs the alarm — the
   * trio that must happen together after every mutation, factored into one
   * method so no call site can forget one of the three. */
  async #commit(room: RoomState, now: number): Promise<void> {
    this.room = room;
    const timers = computeRoomTimers(room, now);
    await saveRoom(this.ctx.storage, room, timers);
    await this.#syncAlarm(timers);
  }

  /** The single writer that arms the Durable Object's one alarm slot. Reads
   * the CURRENT pending alarm and only re-arms it when the next due time
   * actually differs, deleting the alarm when there is nothing left to
   * schedule.
   *
   * This guard is what prevents Pitfall 2: unconditionally re-arming the
   * alarm on every hibernation wake (including `onStart`, which reruns on
   * EVERY wake, not just true cold start) would perpetually defer the
   * deadline so it never fires. Do not delete this comparison. */
  async #syncAlarm(timers: TimerEvent[]): Promise<void> {
    const next = nextDueAt(timers);
    const currentAlarm = await this.ctx.storage.getAlarm();

    if (next === null) {
      if (currentAlarm !== null) {
        await this.ctx.storage.deleteAlarm();
      }
      return;
    }

    if (next !== currentAlarm) {
      await this.ctx.storage.setAlarm(next);
    }
  }
}
