"use client";

import { useEffect, useRef } from "react";
import usePartySocket from "partysocket/react";
import type { PartySocket } from "partysocket";
import { ROOM_ABANDONED_CLOSE_CODE, ServerMessageSchema, type DisplayName } from "@games/schema";
import { clearSeatToken, readJoinSeatToken, writeSeatToken } from "./seat-token";
import { isTerminalCloseCode } from "./close-codes";
import { useRoomStore } from "./room-store";

/**
 * Default matches `wrangler dev`'s local port (see `.env.example`). Plan 11
 * fills in the production `*.workers.dev` host at deploy time.
 */
const WORKER_HOST = process.env.NEXT_PUBLIC_WORKER_HOST ?? "localhost:8787";

export interface UseRoomSocketOptions {
  code: string;
  displayName: DisplayName | string;
}

/**
 * Opens the `partysocket` connection to the Worker's RoomDO and keeps
 * `room-store.ts` in sync with every inbound frame. Retry timing and
 * reconnection entirely stay inside `partysocket` itself (RESEARCH.md §
 * Don't Hand-Roll) — this hook never implements its own retry loop.
 */
export function useRoomSocket({ code, displayName }: UseRoomSocketOptions): PartySocket {
  const applyServerMessage = useRoomStore((state) => state.applyServerMessage);
  const setStatus = useRoomStore((state) => state.setStatus);
  // Flipped true on `refused`/`superseded` so partysocket's own
  // reconnection logic stops trying — otherwise it would keep retrying
  // against a newer tab (D-08) or a room that has already refused us.
  const stopReconnectingRef = useRef(false);

  const socket = usePartySocket({
    host: WORKER_HOST,
    party: "room",
    room: code,
    minReconnectionDelay: 1000,
    maxReconnectionDelay: 30000,
    reconnectionDelayGrowFactor: 1.5,
    shouldReconnectOnClose: (event) => !stopReconnectingRef.current && !isTerminalCloseCode(event.code),
    onClose: (event) => {
      if (event.code === ROOM_ABANDONED_CLOSE_CODE) {
        // WR-01: the room was garbage-collected. Its seat token is dead, and
        // reconnecting would only create a fresh empty lobby.
        stopReconnectingRef.current = true;
        clearSeatToken(code);
        setStatus("abandoned");
      }
    },
    onOpen: () => {
      // One code path for first join AND every automatic reconnect — the
      // seat token is re-read and replayed on every `open`, never only on
      // mount (D-05, RT-03 groundwork).
      setStatus("joining");
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
      if (message.type === "error" && useRoomStore.getState().status === "joining") {
        // WR-05: the server rejected our `join` itself. Replaying the same
        // frame on every reconnect can never succeed — the room flow falls
        // back to the join form instead (see RoomClient).
        stopReconnectingRef.current = true;
      }

      applyServerMessage(message);
    },
  });

  useEffect(() => {
    // A fresh room code (or unmount) means this connection attempt is
    // starting over — reset the "stop reconnecting" latch so a later,
    // different room can reconnect normally.
    stopReconnectingRef.current = false;
  }, [code]);

  return socket;
}
