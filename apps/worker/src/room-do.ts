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

import { Server, type Connection, type ConnectionContext } from "partyserver";
import {
  encodeServerMessage,
  parseClientMessage,
  ROOM_ABANDONED_CLOSE_CODE,
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

/** The Durable Object namespace binding declared in wrangler.jsonc. */
export interface Env {
  ROOM: DurableObjectNamespace<RoomDO>;
  /** Optional comma-separated extra WebSocket origins, set at deploy time in
   * wrangler.jsonc `vars`. Used to allow a Vercel production/preview origin
   * without a code change. See `origin.ts`. */
  ALLOWED_ORIGINS?: string;
}


/** The shape this class attaches to each connection. Hibernation-safe:
 * `partyserver`'s `setState` is backed by `serializeAttachment`. */
interface SeatAttachment {
  readonly seatId?: string;
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
    const { room, wasReset } = await loadRoom(this.ctx.storage, () =>
      createEmptyRoom(this.name as RoomCode, "base", Date.now()),
    );
    this.room = room;
    this.#persisted = !wasReset;
    // An unpersisted room schedules nothing (and clears any stale alarm).
    await this.#syncAlarm(this.#persisted ? computeRoomTimers(room, Date.now()) : []);
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
        await this.#handleJoin(connection, room, msg.displayName, msg.seatToken, now);
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

    // CR-01: a closing socket's attachment can be stale. A superseded tab
    // (D-08), or a half-dead socket from before a wifi blip, can close AFTER
    // a newer connection already reclaimed the same seat. `#handleJoin`
    // detaches superseded sockets before closing them, but a stale close
    // must still never mark a seat disconnected while another live
    // connection holds it — in the lobby that would release a player who
    // is sitting right there. `getConnections()` only yields OPEN sockets,
    // so any binding found here belongs to a different, live connection.
    const liveOwner = this.bindings[seatId];
    if (liveOwner !== undefined && liveOwner !== connection.id) return;

    const room = await this.#ensureRoom();
    // WR-01: nothing to mark when the seat is already gone — released, or
    // the whole room garbage-collected. Committing here would resurrect a
    // deleted room and re-arm its alarm.
    if (!this.#persisted || !room.seats.some((seat) => seat.seatId === seatId)) return;
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
      if (!this.#persisted) {
        // A stale alarm for a room with nothing in storage: never save
        // (that would resurrect it), just make sure nothing stays armed.
        await this.#syncAlarm([]);
        return;
      }
      const timers = await loadTimers(this.ctx.storage);
      const { due } = dueTimers(timers, Date.now());

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
          // WR-01: detach each socket BEFORE closing it, so its `onClose`
          // finds no seat and cannot write a fresh room back into the
          // storage just wiped. The terminal close code stops `partysocket`
          // from reconnecting into a brand-new empty lobby.
          for (const connection of this.getConnections()) {
            connection.setState(null);
            connection.close(ROOM_ABANDONED_CLOSE_CODE, "room abandoned");
          }
          this.room = null;
          this.#persisted = false;
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
      await this.#syncAlarm(this.#persisted ? computeRoomTimers(room, Date.now()) : []);
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
    // unlike an instance field (see the `bindings` getter).
    connection.setState({ seatId: result.seatId });

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
    const timers = computeRoomTimers(room, now);
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
