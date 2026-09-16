"use client";

import { useCallback, useEffect, useRef } from "react";
import usePartySocket from "partysocket/react";
import type { PartySocket } from "partysocket";
import {
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  ROOM_ABANDONED_CLOSE_CODE,
  ServerMessageSchema,
  type DisplayName,
} from "@games/schema";
import { clearSeatToken, readJoinSeatToken, writeSeatToken } from "./seat-token";
import { isTerminalCloseCode } from "./close-codes";
import { isPongOverdue, resolveClientHeartbeatTiming, resumeAction } from "./heartbeat";
import { useRoomStore } from "./room-store";

/**
 * Default matches `wrangler dev`'s local port (see `.env.example`). Plan 11
 * fills in the production `*.workers.dev` host at deploy time.
 */
const WORKER_HOST = process.env.NEXT_PUBLIC_WORKER_HOST ?? "localhost:8787";

// D-15: test-only override (literal property access so Next inlines each
// read). Unset in production, so this always resolves to the real
// HEARTBEAT_INTERVAL_MS/HEARTBEAT_PONG_TIMEOUT_MS constants there.
const HEARTBEAT_TIMING = resolveClientHeartbeatTiming(
  process.env.NEXT_PUBLIC_HEARTBEAT_INTERVAL_MS,
  process.env.NEXT_PUBLIC_HEARTBEAT_PONG_TIMEOUT_MS,
);

export interface UseRoomSocketOptions {
  code: string;
  displayName: DisplayName | string;
}

export interface RoomSocketHandle {
  socket: PartySocket;
  /** D-11: "Use this tab" entry point. Resets the stop-reconnecting latch
   * and reconnects with the same stored seat token — the ONLY place outside
   * the `[code]` reset effect that clears the latch. Every automatic
   * reconnect trigger (visibility, online, heartbeat pong timeout) checks
   * the latch first, so two tabs can never ping-pong each other
   * automatically; only this explicit user action can. */
  reclaimSeat: () => void;
}

/**
 * Opens the `partysocket` connection to the Worker's RoomDO and keeps
 * `room-store.ts` in sync with every inbound frame. Retry/backoff timing
 * entirely stays inside `partysocket` itself (RESEARCH.md § Don't
 * Hand-Roll) — this hook never implements its own retry loop. It only adds
 * force-reconnect TRIGGERS on top: a raw-literal heartbeat with pong
 * timeout (D-02), and immediate reconnect on tab resume or network return
 * (D-01).
 */
export function useRoomSocket({ code, displayName }: UseRoomSocketOptions): RoomSocketHandle {
  const applyServerMessage = useRoomStore((state) => state.applyServerMessage);
  const setStatus = useRoomStore((state) => state.setStatus);
  // Flipped true on `refused`/`superseded` so partysocket's own
  // reconnection logic stops trying — otherwise it would keep retrying
  // against a newer tab (D-08) or a room that has already refused us. Also
  // checked by every D-01/D-02 automatic reconnect trigger (D-11).
  const stopReconnectingRef = useRef(false);
  // D-02: updated on EVERY inbound frame (including the raw pong) and on
  // every `open`, so a stale value alone proves the socket is dead.
  const lastHeardAtRef = useRef(0);
  const pingSentAtRef = useRef<number | null>(null);
  const pongCheckTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const socket = usePartySocket({
    host: WORKER_HOST,
    party: "room",
    room: code,
    minReconnectionDelay: 1000,
    maxReconnectionDelay: 30000,
    reconnectionDelayGrowFactor: 1.5,
    // D-06: nothing sent while disconnected is queued or replayed on the
    // new socket. A click that races a drop is dropped, never resurrected
    // ahead of the fresh `join`; the actionId dedup (Phase 4) already
    // covers a send that did reach the server before the drop.
    maxEnqueuedMessages: 0,
    shouldReconnectOnClose: (event) => !stopReconnectingRef.current && !isTerminalCloseCode(event.code),
    onClose: (event) => {
      if (event.code === ROOM_ABANDONED_CLOSE_CODE) {
        // WR-01: the room was garbage-collected. Its seat token is dead, and
        // reconnecting would only create a fresh empty lobby.
        stopReconnectingRef.current = true;
        clearSeatToken(code);
        setStatus("abandoned");
        return;
      }
      // D-05: a non-terminal close (network blip, pong-timeout force
      // reconnect, zombie-sweep close) while not latched keeps the last
      // view visible with a "reconnecting" banner rather than dropping back
      // to the full-screen "Connecting…" page — but only once a view has
      // actually been received. Terminal statuses (superseded/abandoned/
      // refused/join_failed) are never overwritten here.
      if (stopReconnectingRef.current || isTerminalCloseCode(event.code)) {
        return;
      }
      const current = useRoomStore.getState();
      if (
        current.status === "seated" ||
        current.status === "joining" ||
        current.status === "reconnecting" ||
        current.status === "connecting"
      ) {
        setStatus(current.view !== null ? "reconnecting" : "connecting");
      }
    },
    onOpen: () => {
      lastHeardAtRef.current = Date.now();
      pingSentAtRef.current = null;
      // D-05: keep the "reconnecting" banner over the last view until a
      // fresh `joined`/`state` frame actually arrives, rather than flashing
      // back to "joining" (which would drop the board in RoomClient).
      if (useRoomStore.getState().status !== "reconnecting") {
        setStatus("joining");
      }
      // One code path for first join AND every automatic reconnect — the
      // seat token is re-read and replayed on every `open`, never only on
      // mount (D-05, RT-03 groundwork). Byte-identical to a fresh join
      // (D-13) — reconnect never gets a separate frame shape.
      socket.send(
        JSON.stringify({
          type: "join",
          displayName,
          // WR-05: a malformed stored token is dropped, not replayed into a
          // join the server must reject.
          seatToken: readJoinSeatToken(code),
        }),
      );
    },
    onMessage: (event) => {
      // D-02: any inbound frame, including the raw HEARTBEAT_PONG, proves
      // the socket is alive — recorded before attempting to parse it.
      lastHeardAtRef.current = Date.now();

      if (event.data === HEARTBEAT_PONG) {
        // The pong is a raw literal answered by the runtime's
        // setWebSocketAutoResponse (D-02/D-13) — it never reaches
        // ServerMessageSchema and carries no state.
        return;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        // A skewed deploy or garbled frame degrades to "ignore it," never
        // a crashed tab (T-1-03).
        return;
      }

      const result = ServerMessageSchema.safeParse(raw);
      if (!result.success) {
        return;
      }
      const message = result.data;

      if (message.type === "joined") {
        writeSeatToken(code, message.seatToken);
      }
      if (message.type === "refused" || message.type === "superseded") {
        stopReconnectingRef.current = true;
      }
      if (
        message.type === "error" &&
        (useRoomStore.getState().status === "joining" || useRoomStore.getState().status === "reconnecting")
      ) {
        // WR-05: the server rejected our `join` itself. Replaying the same
        // frame on every reconnect can never succeed — the room flow falls
        // back to the join form instead (see RoomClient).
        stopReconnectingRef.current = true;
      }

      applyServerMessage(message);
    },
  });

  // D-02: sends the raw ping literal (never JSON.stringify'd — the runtime's
  // setWebSocketAutoResponse compares byte-for-byte) and arms a pong-timeout
  // check. Declared as a plain function (not useCallback) since it closes
  // over refs only and is only ever called from effects/handlers below.
  const sendPing = useCallback(() => {
    if (stopReconnectingRef.current || socket.readyState !== 1 /* OPEN */) {
      return;
    }
    socket.send(HEARTBEAT_PING);
    const pingSentAt = Date.now();
    pingSentAtRef.current = pingSentAt;
    const timeoutId = setTimeout(() => {
      pongCheckTimeoutsRef.current.delete(timeoutId);
      if (stopReconnectingRef.current) {
        return;
      }
      if (
        isPongOverdue({
          pingSentAt,
          lastHeardAt: lastHeardAtRef.current,
          now: Date.now(),
          pongTimeoutMs: HEARTBEAT_TIMING.pongTimeoutMs,
        })
      ) {
        socket.reconnect();
      }
    }, HEARTBEAT_TIMING.pongTimeoutMs);
    pongCheckTimeoutsRef.current.add(timeoutId);
  }, [socket]);

  useEffect(() => {
    // A fresh room code (or unmount) means this connection attempt is
    // starting over — reset the "stop reconnecting" latch so a later,
    // different room can reconnect normally.
    stopReconnectingRef.current = false;
  }, [code]);

  useEffect(() => {
    // D-02: the heartbeat keeps running regardless of tab visibility — a
    // deliberate choice (Claude's discretion) so an alt-tabbed desktop
    // player stays "Connected" for teammates rather than flipping to
    // "disconnected" purely from being backgrounded. The server's
    // SOCKET_STALE_MS threshold already absorbs Chrome's ~60s hidden-tab
    // timer throttle; D-01's resume handling below is what actually matters
    // for a phone that was truly suspended.
    const intervalId = setInterval(sendPing, HEARTBEAT_TIMING.intervalMs);
    return () => clearInterval(intervalId);
  }, [sendPing]);

  useEffect(() => {
    // D-01: force-reconnect immediately on tab resume or network return,
    // rather than waiting out partysocket's own backoff (up to 30s).
    function handleResume() {
      const action = resumeAction({
        latched: stopReconnectingRef.current,
        readyState: socket.readyState,
        lastHeardAt: lastHeardAtRef.current,
        now: Date.now(),
        timing: HEARTBEAT_TIMING,
      });
      if (action === "reconnect") {
        socket.reconnect();
      } else if (action === "ping") {
        sendPing();
      }
    }

    function handleVisibilityChange() {
      if (typeof document === "undefined" || document.visibilityState !== "visible") {
        return;
      }
      handleResume();
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleResume);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleResume);
      }
    };
  }, [socket, sendPing]);

  useEffect(() => {
    const pending = pongCheckTimeoutsRef.current;
    return () => {
      for (const id of pending) {
        clearTimeout(id);
      }
      pending.clear();
    };
  }, []);

  const reclaimSeat = useCallback(() => {
    // D-11: the ONLY place outside the `[code]` reset effect that clears
    // the latch. The seat token is replayed by the unchanged onOpen join.
    stopReconnectingRef.current = false;
    setStatus(useRoomStore.getState().view !== null ? "reconnecting" : "connecting");
    socket.reconnect();
  }, [socket, setStatus]);

  return { socket, reclaimSeat };
}
