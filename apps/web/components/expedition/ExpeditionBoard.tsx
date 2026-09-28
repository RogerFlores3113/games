"use client";

/**
 * SCENE-01: the client-only Phaser mount boundary. `ExpeditionPhaserMount`
 * (and every `phaser` import it pulls in) is reached ONLY through a
 * client-only, no-server-prerender `next/dynamic` import here — this is the
 * one and only static import site for it, keeping Phaser out of the landing
 * page's and Hanabi's bundles (RESEARCH.md Pitfall 4,
 * `phaser-import-confinement.test.ts`).
 *
 * `BoardProps`-compatible: `game-ui.tsx`'s `BOARD_COMPONENTS` needs zero
 * edits. `view.game` is parsed against the same strict wire schema the
 * worker's fail-closed gate uses (`HanabiBoard.tsx`'s precedent) — a failed
 * parse renders no scene rather than trusting an unvalidated shape (T-12-16).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { RoomView } from "@games/schema";
import { ExpeditionViewSchema } from "@games/schema/games/expedition";
import type { ExpeditionView } from "@games/rules";
import { createExpeditionSceneStore } from "../../lib/expedition/expedition-scene-store";
import { readCardPackPref } from "../../lib/expedition/expedition-card-pack-pref";
import { ReconnectingBanner } from "../ReconnectingBanner";

const ExpeditionPhaserMount = dynamic(() => import("./phaser/ExpeditionPhaserMount"), { ssr: false });

export interface ExpeditionBoardProps {
  view: RoomView;
  onAction: (request: unknown) => void;
  reconnecting?: boolean;
  onDeleteRoom?: () => void;
  onRestartLobby?: () => void;
}

export function ExpeditionBoard({
  view,
  onAction,
  reconnecting = false,
  onDeleteRoom: _onDeleteRoom,
  onRestartLobby: _onRestartLobby,
}: ExpeditionBoardProps) {
  // Accepted, unused: Plan 12-11 wires these into the settings modal (D-05).
  const onActionRef = useRef(onAction);
  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  const parsed = useMemo(
    () => (view.game == null ? null : ExpeditionViewSchema.safeParse(view.game)),
    [view.game],
  );
  const game: ExpeditionView | null = parsed?.success ? (view.game as ExpeditionView) : null;
  useEffect(() => {
    if (parsed && !parsed.success) {
      console.error("ExpeditionView schema mismatch", parsed.error.issues);
    }
  }, [parsed]);

  const [store] = useState(() =>
    createExpeditionSceneStore({
      onAction: (request) => onActionRef.current(request),
      cardPackId: readCardPackPref(),
    }),
  );

  useEffect(() => {
    if (game === null) return;
    store.getState().setServer({
      game,
      roomSeats: view.seats.map(({ seatId, displayLabel, connected }) => ({ seatId, displayLabel, connected })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, game, view.seats]);

  useEffect(() => {
    store.getState().setReconnecting(reconnecting);
  }, [store, reconnecting]);

  return (
    <>
      {reconnecting && <ReconnectingBanner />}
      <ExpeditionPhaserMount store={store} />
    </>
  );
}
