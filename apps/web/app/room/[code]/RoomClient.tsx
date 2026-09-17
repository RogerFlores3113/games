"use client";

import { useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { ClientMessage, Variant } from "@games/schema";
import { useRoomSocket } from "../../../lib/room-socket";
import { useRoomStore } from "../../../lib/room-store";
import { clearPendingVariant, readPendingVariant, variantToApply } from "../../../lib/pending-variant";
import {
  clearDisplayName,
  readDisplayName,
  readSeatToken,
  seatTokenKey,
  writeDisplayName,
} from "../../../lib/seat-token";
import { RefusalCard, type RefusalCardReason } from "../../../components/RefusalCard";
import { JoinForm } from "../../../components/JoinForm";
import { Lobby } from "../../../components/Lobby";
import { HanabiBoard } from "../../../components/hanabi/HanabiBoard";
import { Button } from "../../../components/Button";

export interface RoomClientProps {
  code: string;
}

/** A saved seat token has no display name attached — the server reuses the
 * seat's already-persisted display name on reclaim and ignores whatever the
 * client sends here, so this placeholder only needs to satisfy
 * `DisplayNameSchema`'s non-empty requirement (see `room-state.ts`
 * `joinRoom`: a matching `seatToken` is ALWAYS a reclaim). */
const RECONNECT_PLACEHOLDER_NAME = "Player";

/** Legacy per-tab location of the host's name, written by builds before
 * WR-06 moved it to localStorage (`readDisplayName`). Read-only fallback so
 * a tab opened before the deploy still auto-joins under its real name. */
function readLegacySessionDisplayName(code: string): string | undefined {
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
  const [joinFailed, setJoinFailed] = useState(false);

  useEffect(() => {
    // WR-06: the name lives in localStorage next to the seat token, so a new
    // tab or a released lobby seat rejoins under the player's real name.
    const storedName = readDisplayName(code) ?? readLegacySessionDisplayName(code);
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
    return (
      <JoinForm
        code={code}
        error={joinFailed ? "Couldn't join with that name — try another." : undefined}
        onJoin={(name) => {
          writeDisplayName(code, name);
          setJoinFailed(false);
          setDisplayName(name);
        }}
      />
    );
  }

  return (
    <ConnectedRoom
      code={code}
      displayName={displayName}
      onJoinFailed={() => {
        setJoinFailed(true);
        setDisplayName(undefined);
      }}
    />
  );
}

function ConnectedRoom({
  code,
  displayName,
  onJoinFailed,
}: {
  code: string;
  displayName: string;
  onJoinFailed: () => void;
}) {
  const { socket, reclaimSeat } = useRoomSocket({ code, displayName });
  const status = useRoomStore((state) => state.status);
  const refusalReason = useRoomStore((state) => state.refusalReason);
  const view = useRoomStore((state) => state.view);
  // D-11: guards against double-firing reclaimSeat on a double-click — reset
  // whenever we leave "superseded" so a tab superseded AGAIN later still has
  // a live button, never a permanently-disabled one.
  const [reclaiming, setReclaiming] = useState(false);

  useEffect(() => {
    if (status !== "superseded") {
      setReclaiming(false);
    }
  }, [status]);

  useEffect(() => {
    if (status !== "join_failed") return;
    // WR-05: the server rejected the join frame. The seat token was already
    // validated before sending (`readJoinSeatToken`), so the stored name is
    // what gets discarded — the token is kept, so re-entering a name still
    // reclaims the seat. Unmounting this component closes the socket.
    clearDisplayName(code);
    useRoomStore.getState().reset();
    onJoinFailed();
  }, [status, code, onJoinFailed]);

  useEffect(() => {
    if (!view) return;
    // D-06: a reconnecting socket's last view is stale — never auto-send
    // against it. The next fresh `joined`/`state` frame re-runs this effect.
    if (status === "reconnecting") return;
    // WR-04: apply the variant picked on the create screen, once, through
    // the ordinary host-only `set_variant` message. Cleared on the first
    // seated view either way, so it can never fire later or for a joiner.
    const target = variantToApply(view, readPendingVariant(code));
    clearPendingVariant(code);
    if (target !== null) {
      socket.send(JSON.stringify({ type: "set_variant", variant: target } satisfies ClientMessage));
    }
  }, [view, code, socket, status]);

  function send(message: ClientMessage) {
    // D-06: controls are already disabled while reconnecting, but this is
    // the single dispatch chokepoint for both Lobby and HanabiBoard, so it
    // guards here too rather than trusting every caller.
    if (status === "reconnecting") return;
    socket.send(JSON.stringify(message));
  }

  if (status === "refused" && refusalReason) {
    const reason: RefusalCardReason = refusalReason === "full" ? "full" : "in_progress";
    return <RefusalCard reason={reason} />;
  }

  if (status === "superseded") {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center gap-[length:var(--space-md)] px-[length:var(--space-md)]"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <p
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }}
        >
          This room was opened in another tab.
        </p>
        {/* D-11: user action only — this button is the ONLY way a superseded
            tab reconnects. It never fires automatically, so two tabs can
            never ping-pong each other into an auto-supersede loop. No
            confirmation dialog: reclaiming ends the OTHER tab's session,
            which is this player's own other device, not another player's
            (UI-SPEC Destructive actions). */}
        <Button
          variant="primary"
          data-testid="use-this-tab-button"
          disabled={reclaiming}
          onClick={() => {
            setReclaiming(true);
            reclaimSeat();
          }}
        >
          Use this tab
        </Button>
      </main>
    );
  }

  if (status === "abandoned") {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-[length:var(--space-md)]"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <p
          className="text-[length:var(--text-body)]"
          style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }}
        >
          This room closed after sitting idle.
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
        reconnecting={status === "reconnecting"}
      />
    );
  }

  return (
    <HanabiBoard
      view={view}
      onAction={(request) =>
        // D-07: actionId is minted once per user intent (one click). If a
        // retry path is ever added it MUST reuse the same id verbatim rather
        // than minting a new one, or server-side dedup is defeated.
        send({ type: "game_action", actionId: nanoid(), request })
      }
      reconnecting={status === "reconnecting"}
    />
  );
}
