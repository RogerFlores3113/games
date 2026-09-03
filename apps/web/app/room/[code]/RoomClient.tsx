"use client";

import { useEffect, useState } from "react";
import type { ClientMessage, Variant } from "@games/schema";
import { useRoomSocket } from "../../../lib/room-socket";
import { useRoomStore } from "../../../lib/room-store";
import { readSeatToken, seatTokenKey } from "../../../lib/seat-token";
import { RefusalCard, type RefusalCardReason } from "../../../components/RefusalCard";
import { JoinForm } from "../../../components/JoinForm";
import { Lobby } from "../../../components/Lobby";
import { CounterGame } from "../../../components/CounterGame";

export interface RoomClientProps {
  code: string;
}

/** A saved seat token has no display name attached — the server reuses the
 * seat's already-persisted display name on reclaim and ignores whatever the
 * client sends here, so this placeholder only needs to satisfy
 * `DisplayNameSchema`'s non-empty requirement (see `room-state.ts`
 * `joinRoom`: a matching `seatToken` is ALWAYS a reclaim). */
const RECONNECT_PLACEHOLDER_NAME = "Player";

function readStoredDisplayName(code: string): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window.sessionStorage.getItem(`${seatTokenKey(code)}:displayName`) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Owns the room flow: reads a saved seat token / stored display name on
 * mount, connects immediately when either exists (D-03, D-05 — no name
 * re-entry on reattach), otherwise shows `JoinForm` first. Then switches on
 * the store's connection status and the server-pushed `RoomView.status`.
 */
export function RoomClient({ code }: RoomClientProps) {
  const [displayName, setDisplayName] = useState<string | undefined>(undefined);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    const storedName = readStoredDisplayName(code);
    const hasSeatToken = Boolean(readSeatToken(code));
    if (storedName || hasSeatToken) {
      setDisplayName(storedName ?? RECONNECT_PLACEHOLDER_NAME);
    }
    setCheckedStorage(true);
  }, [code]);

  if (!checkedStorage) {
    // Avoid a flash of the join form while we check for a saved seat token.
    return null;
  }

  if (displayName === undefined) {
    return <JoinForm code={code} onJoin={setDisplayName} />;
  }

  return <ConnectedRoom code={code} displayName={displayName} />;
}

function ConnectedRoom({ code, displayName }: { code: string; displayName: string }) {
  const socket = useRoomSocket({ code, displayName });
  const status = useRoomStore((state) => state.status);
  const refusalReason = useRoomStore((state) => state.refusalReason);
  const view = useRoomStore((state) => state.view);

  function send(message: ClientMessage) {
    socket.send(JSON.stringify(message));
  }

  if (status === "refused" && refusalReason) {
    const reason: RefusalCardReason = refusalReason === "full" ? "full" : "in_progress";
    return <RefusalCard reason={reason} />;
  }

  if (status === "superseded") {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-[length:var(--space-md)]"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <p
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }}
        >
          This room was opened in another tab.
        </p>
      </main>
    );
  }

  if (!view) {
    // "connecting" / "joining" — the socket hasn't produced a server view
    // yet. Still no board and no partial state (ROOM-07/D-14 applies
    // structurally here too), but this MUST render something visible: an
    // empty <main> made every connection failure indistinguishable from a
    // broken app. A rejected handshake (wrong origin, worker down) left a
    // permanently blank page with no signal to the player or to us.
    return (
      <main
        className="flex min-h-screen items-center justify-center px-[length:var(--space-md)]"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <p
          role="status"
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }}
        >
          Connecting to room {code}…
        </p>
      </main>
    );
  }

  if (view.status === "lobby") {
    return (
      <Lobby
        view={view}
        onSetVariant={(variant: Variant) => send({ type: "set_variant", variant })}
        onStartGame={() => send({ type: "start_game" })}
      />
    );
  }

  return (
    <CounterGame
      view={view}
      onIncrement={() => send({ type: "game_action", request: { type: "increment" } })}
    />
  );
}
