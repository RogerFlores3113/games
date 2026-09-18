// The ONE stateful component in the system: a `partyserver` `Server<Env>`
// subclass, one Durable Object instance per room code. This file is
// deliberately thin glue over the four pure modules built in Wave 2
// (room-state.ts, seat-identity.ts, scheduler.ts, persistence.ts) — every
// decision about WHAT happens already lives there, tested in isolation.
// This file's only job is WHEN it happens: connection lifecycle, message
// dispatch, alarm scheduling, and persistence, wired through `ctx.storage`
// and `partyserver`'s hibernation-aware WebSocket lifecycle.
//
// Three structural invariants a reviewer (or Phase 2's HIDE-02/HIDE-03/D-09
// structural audit, apps/worker/src/source-structure.test.ts) can
// mechanically verify directly in this file:
//   1. Exactly one alarm-arming call site (`ctx.storage.` + the Alarm API's
//      scheduling method), inside `#syncAlarm`.
//   2. Exactly one socket writer: `#send` is the ONLY method that ever calls
//      `connection.send`. Every other method builds a `ServerMessage`/
//      `OutboundFrame` value and hands it to `this.#send(...)`. This class
//      never calls the room-wide broadcast helper (CLAUDE.md "What NOT to
//      Use": broadcasting one shared state object to all seats is
//      forbidden) — every connection gets its own frame from its own
//      `#viewFor` call.
//   3. Exactly one view source: `#viewFor` is the ONLY method that produces
//      a view for a `joined`/`state` frame, and it does so by calling
//      `projectSeatView` (seat-projection.ts) — never `toSeatView` directly.
//      `projectSeatView` is itself the sole `toSeatView` call site in the
//      whole worker. Join, live update, and reconnect all share this one
//      path (D-10): there is no separate resume serializer anywhere.
//   4. (D-02, Phase 5) Exactly one deliberate exception to invariant #2: the
//      heartbeat pong is answered by the Cloudflare runtime's
//      `setWebSocketAutoResponse`, registered once in `onStart`. It never
//      routes through `#send`, never wakes the DO, and never invokes
//      `onMessage` — a tested exception, not a second writer
//      (source-structure.test.ts P5-1/P5-2/P5-3).

import { Server, type Connection, type ConnectionContext } from "partyserver";
import {
  encodeServerMessage,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  parseClientMessage,
  ROOM_ABANDONED_CLOSE_CODE,
  STALE_SOCKET_CLOSE_CODE,
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
  deferIdleGc,
  startGame,
  applyGameAction,
  deleteRoom,
  restartLobby,
} from "./room-state";
import {
  mintGameSeed,
  mintSeatId,
  mintSeatToken,
  rebindSeatConnection,
  bindingsFromConnections,
  type SeatBindings,
} from "./seat-identity";
import { computeRoomTimers, dueTimers, nextDueAt, type TimerEvent } from "./scheduler";
import { loadRoom, loadTimers, saveRoom } from "./persistence";
import { isOriginAllowed } from "./origin";
import { projectSeatView, type OutboundFrame, type ProjectedRoomView } from "./seat-projection";
import {
  isHeartbeatPing,
  orphanedConnectedSeatIds,
  resolveAlarmWrite,
  resolveHeartbeatTiming,
  socketLastSeenAt,
  isSocketStale,
  type HeartbeatTiming,
} from "./heartbeat";

/** The Durable Object namespace binding declared in wrangler.jsonc. */
export interface Env {
  ROOM: DurableObjectNamespace<RoomDO>;
  /** Optional comma-separated extra WebSocket origins, set at deploy time in
   * wrangler.jsonc `vars`. Used to allow a Vercel production/preview origin
   * without a code change. See `origin.ts`. */
  ALLOWED_ORIGINS?: string;
  /** D-15: test-only overrides for the zombie-sweep timing, passed via
   * wrangler dev `--var`; never set in production. */
  SOCKET_STALE_MS?: string;
  ZOMBIE_SWEEP_INTERVAL_MS?: string;
}


/** The shape this class attaches to each connection. Hibernation-safe:
 * `partyserver`'s `setState` is backed by `serializeAttachment`. */
interface SeatAttachment {
  readonly seatId?: string;
  /** D-03: epoch ms when this connection claimed its seat. Lets the zombie
   * sweep exempt a just-joined socket that has not pinged yet. */
  readonly boundAt?: number;
}

/** A connection carrying `SeatAttachment`, for the derived `bindings` getter. */
interface ConnectionWithSeat {
  readonly id: string;
  readonly state?: SeatAttachment | null;
}

export class RoomDO extends Server<Env> {
  static options = { hibernate: true };

  /** Rehydrated in `onStart`. Never trust this across a hibernation wake
   * without re-loading — memory is wiped on eviction, deploys, and
   * maintenance restarts (RESEARCH.md anti-patterns). */
  room: RoomState | null = null;

  /** WR-08: whether `room` exists in storage. A room nobody has joined is
   * held in memory only, and must arm no alarm either — recomputed from
   * storage in `onStart` on every wake, set by `#commit`. */
  #persisted = false;

  /** seatId -> connectionId, DERIVED from the live connections on every read
   * rather than cached in a field.
   *
   * It used to be an in-memory field. Durable Object memory is wiped on a
   * hibernation wake while the hibernated WebSockets survive, so the room
   * woke holding zero bindings, `#pushState` iterated an empty map, and
   * nobody already in the lobby was told a new player had joined — the seat
   * list only updated on a manual reload (ROOM-04). The seat id now rides on
   * each connection's own attachment (`setState`), which IS hibernation-safe,
   * so there is no cached copy left to go stale. */
  get bindings(): SeatBindings {
    return bindingsFromConnections(this.getConnections() as unknown as Iterable<ConnectionWithSeat>);
  }

  async onStart(): Promise<void> {
    // D-02: registered once per DO instance (applies to every hibernatable
    // socket the DO holds — not per-connection), re-armed on every wake
    // because onStart reruns on EVERY hibernation wake (see the class-level
    // comment above and `bindings`' own doc comment on this rerun
    // behavior). Answered by the Cloudflare runtime without waking the DO
    // or entering onMessage/#send — a deliberate, tested exception to the
    // single-writer invariant (not a second writer).
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG));

    const { room, wasReset } = await loadRoom(this.ctx.storage, () =>
      createEmptyRoom(this.name as RoomCode, "base", Date.now()),
    );
    this.room = room;
    this.#persisted = !wasReset;
    // An unpersisted room schedules nothing (and clears any stale alarm).
    await this.#syncAlarm(this.#persisted ? this.#timers(room, Date.now()) : []);
  }

  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    if (!isOriginAllowed(ctx.request.headers.get("Origin"), this.env.ALLOWED_ORIGINS)) {
      connection.close(1008, "origin not allowed");
      return;
    }
    // No seat assignment here — the client sends an explicit `join` message
    // (with an optional seatToken) once connected. This makes first-join and
    // reconnect the SAME validated code path (RT-05, Phase 5), rather than
    // parsing seat identity out of the connect URL.
  }

  async onMessage(connection: Connection, raw: string | ArrayBuffer | ArrayBufferView): Promise<void> {
    // WR-04: a heartbeat that reaches here instead of the auto-response is
    // dropped without a reply (see `isHeartbeatPing`). Still never routed
    // through #send (P5-2).
    if (isHeartbeatPing(raw)) return;
    const parsed = parseClientMessage(String(raw));
    if (!parsed.ok) {
      this.#send(connection, { type: "error", code: "bad_request" });
      return;
    }
    // WR-04: contain any exception escaping dispatch, mirroring `onAlarm`:
    // an escaping throw must not tear down the room (T-1-10), and the
    // requesting client still gets an answer instead of silence.
    try {
      const msg = parsed.message;
      const now = Date.now();
      const room = await this.#ensureRoom();

      if (msg.type === "join") {
        await this.#handleJoin(connection, room, msg.displayName, msg.seatToken, msg.joinId, now);
        return;
      }

      // Every other message type resolves the actor's seat from the
      // connection-layer `bindings` map — NEVER from the message body, which
      // has no `seatId` field to supply (T-1-04 boundary).
      const actorSeatId = this.#seatIdFor(connection as unknown as ConnectionWithSeat);
      if (actorSeatId === null) {
        this.#send(connection, { type: "error", code: "not_seated" });
        return;
      }

      if (msg.type === "set_variant") {
        const result = setVariant(room, actorSeatId, msg.variant, now);
        if (!result.ok) {
          this.#send(connection, { type: "error", code: result.reason });
          return;
        }
        await this.#commit(result.state, now);
        await this.#pushState();
        return;
      }

      if (msg.type === "start_game") {
        // WR-07: a secret seed, never the public room code (see mintGameSeed).
        const result = startGame(room, actorSeatId, now, mintGameSeed());
        if (!result.ok) {
          this.#send(connection, { type: "error", code: result.reason });
          return;
        }
        await this.#commit(result.state, now);
        await this.#pushState();
        return;
      }

      if (msg.type === "game_action") {
        const result = applyGameAction(room, actorSeatId, msg.actionId, msg.request, now);
        if (!result.ok) {
          this.#send(connection, { type: "error", code: result.reason, detail: result.detail });
          return;
        }
        await this.#commit(result.state, now);
        await this.#pushState();
        return;
      }

      if (msg.type === "delete_room") {
        const result = deleteRoom(room, actorSeatId, msg.actionId, now);
        if (!result.ok) {
          this.#send(connection, { type: "error", code: result.reason });
          return;
        }
        // Tell every connected player BEFORE tearing anything down — the
        // same `#abandonRoom` teardown idle GC's `onAlarm` branch uses
        // (detach-then-close, then wipe storage), so there is exactly one
        // teardown implementation, not two.
        for (const conn of this.getConnections()) {
          this.#send(conn, { type: "room_closed", reason: "host_deleted" });
        }
        await this.#abandonRoom();
        return;
      }

      if (msg.type === "restart_lobby") {
        const result = restartLobby(room, actorSeatId, msg.actionId, now);
        if (!result.ok) {
          this.#send(connection, { type: "error", code: result.reason });
          return;
        }
        await this.#commit(result.state, now);
        await this.#pushState();
        return;
      }

      if (msg.type === "leave") {
        // CR-03: `releaseSeat` refuses mid-game — the seat stays in turn order.
        const result = releaseSeat(room, actorSeatId, now);
        if (!result.ok) {
          this.#send(connection, { type: "error", code: result.reason });
          return;
        }
        connection.setState(null);
        await this.#commit(result.state, now);
        await this.#pushState();
        return;
      }
    } catch (error) {
      console.error(`RoomDO onMessage failed (${connection.id}):`, error);
      this.#send(connection, { type: "error", code: "bad_request" });
    }
  }

  async onClose(connection: Connection): Promise<void> {
    const seatId = this.#seatIdFor(connection as unknown as ConnectionWithSeat);
    if (seatId === null) return;
    connection.setState(null);

    const room = await this.#ensureRoom();
    const now = Date.now();
    const next = this.#disconnectSeat(room, seatId, connection.id, now);
    if (next === room) return;
    await this.#commit(next, now);
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
      if (!this.#persisted) {
        // A stale alarm for a room with nothing in storage: never save
        // (that would resurrect it), just make sure nothing stays armed.
        await this.#syncAlarm([], { inAlarmHandler: true });
        return;
      }
      const timers = await loadTimers(this.ctx.storage);
      // CR-01 (review): the zombie sweep is decided from LIVE state, never
      // from the persisted table. A stored `zombie_sweep` entry can be
      // missing (a room saved before Phase 5) or stale (a no-op sweep does
      // not save), and trusting it left the room either re-arming an alarm
      // in the past or with no alarm at all. Every alarm firing runs the
      // sweep instead: it is idempotent and cheap — staleness is judged
      // against the live auto-response timestamps, and a sweep that changes
      // nothing writes nothing. It runs FIRST so a due host transfer below
      // never hands the host to a seat this sweep is about to flip.
      const { due: storedDue } = dueTimers(timers, Date.now());
      const due: TimerEvent[] = [
        { type: "zombie_sweep", dueAt: Date.now() },
        ...storedDue.filter((event) => event.type !== "zombie_sweep"),
      ];

      let current = room;
      let now = Date.now();

      for (const event of due) {
        now = Date.now();
        if (event.type === "host_transfer") {
          current = transferHost(current, now);
        } else if (event.type === "seat_release" && event.seatId !== undefined) {
          // Defense in depth (CR-03): a stale lobby timer that outlived the
          // game start is refused by `releaseSeat` and simply dropped.
          const released = releaseSeat(current, event.seatId, now);
          if (released.ok) current = released.state;
        } else if (event.type === "idle_gc") {
          // WR-02: a room with a live, seated socket is not idle. Restart
          // the idle clock instead of deleting it — decided from the actual
          // open sockets, never from the persisted `connected` flags.
          if (Object.keys(this.bindings).length > 0) {
            current = deferIdleGc(current, now);
            continue;
          }
          // Abandoned room: close every connection, wipe all storage, and
          // return WITHOUT rescheduling (ROOM-08). A deleted room must not
          // keep waking itself up.
          await this.#abandonRoom();
          return;
        } else if (event.type === "zombie_sweep") {
          // D-03: a seated socket can go half-open (mobile suspend, dead
          // wifi) without ever delivering a close event. The runtime's
          // auto-response timestamp is the only live signal for "did this
          // socket answer recently". A stale one is detached FIRST (CR-01 —
          // exactly the supersede/idle-GC discipline above), then closed
          // with a NON-terminal code so the client reconnects on its own,
          // and only then flipped through the SAME #disconnectSeat helper
          // onClose uses — no second state-mutation call site. The detach
          // guarantees a late-arriving onClose for this same socket finds
          // no seat on its attachment and no-ops. This branch changes ONLY
          // the `connected` flag (D-08): no transferHost/releaseSeat/
          // applyGameAction call here, ever.
          //
          // CR-02 (review): a seat still `connected: true` in storage with NO
          // socket bound at all (a deploy/eviction/restart dropped it and
          // its close never arrived) is just as gone. It is collected from
          // the bindings BEFORE any stale socket below is detached, so a
          // stale socket's seat is never listed twice.
          const { socketStaleMs } = this.#timing();
          const gone: { seatId: string; connectionId: string | null }[] = orphanedConnectedSeatIds(
            current.seats,
            this.bindings,
          ).map((seatId) => ({ seatId, connectionId: null }));
          const connections = [...this.getConnections()];
          for (const connection of connections) {
            const seatId = this.#seatIdFor(connection as unknown as ConnectionWithSeat);
            if (seatId === null) continue;
            const lastSeen = socketLastSeenAt(
              this.ctx.getWebSocketAutoResponseTimestamp(connection as unknown as WebSocket),
              (connection.state as SeatAttachment | null)?.boundAt,
            );
            if (!isSocketStale(lastSeen, now, socketStaleMs)) continue;
            connection.setState(null);
            connection.close(STALE_SOCKET_CLOSE_CODE, "stale");
            gone.push({ seatId, connectionId: connection.id });
          }
          for (const { seatId, connectionId } of gone) {
            current = this.#disconnectSeat(current, seatId, connectionId, now);
          }
        }
      }

      const finalNow = Date.now();
      // A no-op sweep (every socket healthy) must not write storage or push
      // an identical state frame to everyone every interval — that would
      // burn free-tier row writes and spam idle connections with noise.
      if (current !== room) {
        this.room = current;
        await saveRoom(this.ctx.storage, current, this.#timers(current, finalNow));
        await this.#pushState();
      }
      await this.#syncAlarm(this.#timers(current, finalNow), { inAlarmHandler: true });
    } catch (error) {
      console.error("RoomDO onAlarm failed:", error);
      // Re-sync even on failure so one bad event cannot permanently disarm
      // a room's GC. `#timers` derives a fresh (future) sweep boundary, so a
      // sweep that throws cannot re-arm an alarm in the past (CR-01).
      const room = await this.#ensureRoom();
      await this.#syncAlarm(this.#persisted ? this.#timers(room, Date.now()) : [], { inAlarmHandler: true });
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

  /** D-15: resolves the live timing table from wrangler-injected env vars
   * (test-only overrides), falling back to the packages/schema constants. */
  #timing(): HeartbeatTiming {
    return resolveHeartbeatTiming(this.env);
  }

  /** The ONLY call site of `computeRoomTimers` in this file — every other
   * method routes through here so the zombie-sweep interval override (D-15)
   * is applied consistently everywhere a timer table is derived.
   *
   * A pure derivation with no in-memory memo (CR-01/WR-01, review): the
   * grid-aligned `zombie_sweep.dueAt` is identical for every call inside one
   * interval window and always lies in the future, so this never yields a
   * past target. The cross-boundary race (RESEARCH.md Pitfall 3 — traffic
   * or a hibernation wake recomputing the NEXT boundary before the pending
   * alarm is delivered) is closed in `#syncAlarm` instead, which never
   * replaces an overdue pending alarm outside the alarm handler. That guard
   * survives hibernation; the old in-memory memo did not. */
  #timers(room: RoomState, now: number): TimerEvent[] {
    return computeRoomTimers(room, now, { zombieSweepIntervalMs: this.#timing().zombieSweepIntervalMs });
  }

  /** Shared disconnect logic for both `onClose` and the zombie-sweep branch
   * of `onAlarm` — the ONLY caller of `markConnected` in this file. Returns
   * `room` UNCHANGED (same reference) when the disconnect should be a no-op,
   * so callers can cheaply detect "nothing to commit" via `next === room`:
   *
   *   - CR-01: `closingConnectionId` is stale — a DIFFERENT, live connection
   *     already holds this seat (`getConnections()` only yields OPEN
   *     sockets, so any binding found here belongs to a live connection).
   *   - WR-01: the room was never persisted, or the seat no longer exists
   *     (released, or the whole room garbage-collected) — committing here
   *     would resurrect a deleted room and re-arm its alarm.
   *
   * `closingConnectionId` is `null` for a CR-02 orphaned seat that has no
   * socket at all; the CR-01 guard then still refuses if a live connection
   * has claimed the seat in the meantime. */
  #disconnectSeat(room: RoomState, seatId: string, closingConnectionId: string | null, now: number): RoomState {
    const liveOwner = this.bindings[seatId];
    if (liveOwner !== undefined && liveOwner !== closingConnectionId) return room;
    if (!this.#persisted || !room.seats.some((seat) => seat.seatId === seatId)) return room;
    return markConnected(room, seatId, false, now);
  }

  /** The ONE teardown implementation for "this room is gone right now,
   * forever" — shared by `onAlarm`'s idle-GC branch (ROOM-08) and the
   * host's `delete_room` action (owner request, 2026-09-18), so there is
   * exactly one place that closes every socket and wipes storage rather than
   * two copies that could drift.
   *
   * WR-01: detach each socket BEFORE closing it, so its `onClose` finds no
   * seat and cannot write a fresh room back into the storage this is about
   * to wipe. The terminal close code stops `partysocket` from reconnecting
   * into a brand-new empty lobby — a later open of the same link creates an
   * ordinary fresh WR-08 lobby rather than crashing, which is the "room not
   * found" state the owner asked for. */
  async #abandonRoom(): Promise<void> {
    for (const connection of this.getConnections()) {
      connection.setState(null);
      connection.close(ROOM_ABANDONED_CLOSE_CODE, "room abandoned");
    }
    this.room = null;
    this.#persisted = false;
    await this.ctx.storage.deleteAll();
  }

  /** Read the seat straight off the connection's own attachment.
   *
   * Deliberately NOT via the derived `bindings` map: by the time `onClose`
   * runs, the closing connection is already out of `getConnections()`, so a
   * map lookup returns null and the room never marks the seat disconnected —
   * the other players would keep seeing a departed teammate as "Connected". */
  #seatIdFor(connection: ConnectionWithSeat): string | null {
    const seatId = connection.state?.seatId;
    return typeof seatId === "string" && seatId.length > 0 ? seatId : null;
  }

  async #handleJoin(
    connection: Connection,
    room: RoomState,
    displayName: string,
    seatToken: string | undefined,
    joinId: string | undefined,
    now: number,
  ): Promise<void> {
    // WR-03: a connection that already holds a seat may not join again.
    // Without this, one socket could mint a fresh seat per `join` — each old
    // seat left `connected: true` forever, never released, possibly still
    // host — and fill the whole room by itself. A seat that no longer exists
    // (e.g. released) does not count.
    const existingSeatId = this.#seatIdFor(connection as unknown as ConnectionWithSeat);
    if (existingSeatId !== null && room.seats.some((seat) => seat.seatId === existingSeatId)) {
      this.#send(connection, { type: "error", code: "bad_request" });
      return;
    }

    const result = joinRoom(room, {
      displayName,
      seatToken: seatToken as RoomState["seats"][number]["seatToken"] | undefined,
      joinId,
      now,
      mintSeatId,
      mintSeatToken,
    });

    if (!result.ok) {
      this.#send(connection, { type: "refused", reason: result.reason });
      connection.close(1000, result.reason);
      return;
    }

    const rebind = rebindSeatConnection(this.bindings, result.seatId, connection.id);
    // Ride the seat id on the connection attachment: survives hibernation,
    // unlike an instance field (see the `bindings` getter). D-03: boundAt
    // marks this moment so a just-joined socket that has not pinged yet is
    // never mistaken for a zombie by the sweep.
    connection.setState({ seatId: result.seatId, boundAt: now });

    if (rebind.supersededConnectionId !== null) {
      const superseded = this.getConnection(rebind.supersededConnectionId);
      if (superseded !== undefined) {
        // Detach BEFORE closing (CR-01): the superseded socket's `onClose`
        // must find no seat on its attachment, or it would mark the seat the
        // new connection now holds as disconnected.
        superseded.setState(null);
        this.#send(superseded, { type: "superseded" });
        superseded.close(SUPERSEDED_CLOSE_CODE, "superseded");
      }
    }

    await this.#commit(result.state, now);

    // D-07 fail-closed: a view that fails the active game's strict schema
    // sends an error frame (no view) instead of `joined` — the seat claim
    // itself already succeeded (result.ok above), so this is reported as a
    // view failure, not a join failure.
    const view = this.#viewFor(result.state, result.seatId);
    if (view === null) {
      this.#send(connection, { type: "error", code: "bad_request", detail: "view_unavailable" });
    } else {
      // The only message that ever carries a seat token — sent to exactly
      // the one connection that just claimed the seat.
      this.#send(connection, {
        type: "joined",
        seatId: result.seatId,
        seatToken: result.seatToken,
        view,
      });
    }

    // Push the fresh state to everyone else (ROOM-04 live seat list), in
    // both branches above — a view failure for this connection must not
    // stop the rest of the room from hearing about the seat change.
    await this.#pushState();
  }

  /** The sole wrapper around `projectSeatView` — the literal call site
   * appears exactly once in this file, right here. Both `#pushState` and
   * the `joined` reply above route through this one method, so there is
   * exactly one place in the whole worker that turns a `RoomState` into a
   * view sent over a socket, and that view can only ever have passed
   * `projectSeatView`'s fail-closed schema gate (Phase 2's HIDE-02/D-09
   * structural audit reads this file). Returns `null` on a validation
   * failure (D-07) — callers must send an `error` frame with `detail:
   * "view_unavailable"` instead of a `joined`/`state` frame. */
  #viewFor(room: RoomState, seatId: string): ProjectedRoomView | null {
    return projectSeatView(room, seatId);
  }

  /** The ONE method in this class that ever calls `connection.send` (D-08).
   * Every other method builds an `OutboundFrame` value and hands it here —
   * never `connection.send` directly. `joined`/`state` frames can only
   * carry a view obtained from `#viewFor`, which is branded so a
   * hand-constructed view cannot type-check here even by accident. */
  #send(connection: Connection, frame: OutboundFrame): void {
    connection.send(encodeServerMessage(frame));
  }

  /** The ONLY outbound path other than the `joined`/`refused`/`superseded`/
   * `error` replies above. Every connection gets its OWN `#viewFor` call
   * with its OWN seat id — there is no shared payload to leak. A view
   * failure for one connection (D-07) sends that connection an `error`
   * frame and continues serving the rest of the room; it never skips a
   * connection silently and never falls back to an unvalidated view. */
  async #pushState(): Promise<void> {
    const room = await this.#ensureRoom();
    for (const connection of this.getConnections()) {
      const seatId = this.#seatIdFor(connection as unknown as ConnectionWithSeat);
      if (seatId === null) continue;
      const view = this.#viewFor(room, seatId);
      if (view === null) {
        this.#send(connection, { type: "error", code: "bad_request", detail: "view_unavailable" });
        continue;
      }
      this.#send(connection, { type: "state", view });
    }
  }

  /** Persists the room, recomputes timers, and re-syncs the alarm — the
   * trio that must happen together after every mutation, factored into one
   * method so no call site can forget one of the three. */
  async #commit(room: RoomState, now: number): Promise<void> {
    this.room = room;
    const timers = this.#timers(room, now);
    await saveRoom(this.ctx.storage, room, timers);
    this.#persisted = true;
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
   * deadline so it never fires. Do not delete this comparison.
   *
   * CR-01/WR-01 (review): outside the alarm handler, a pending alarm that is
   * already overdue is left alone — it is about to be delivered, and its
   * handler re-arms with `inAlarmHandler: true`. See `resolveAlarmWrite`. */
  async #syncAlarm(timers: TimerEvent[], options: { inAlarmHandler: boolean } = { inAlarmHandler: false }): Promise<void> {
    const next = nextDueAt(timers);
    const currentAlarm = await this.ctx.storage.getAlarm();
    const write = resolveAlarmWrite(next, currentAlarm, Date.now(), options);

    if (write.kind === "delete") {
      await this.ctx.storage.deleteAlarm();
    } else if (write.kind === "set") {
      await this.ctx.storage.setAlarm(write.at);
    }
  }
}
