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
import { BookOpen, Settings } from "lucide-react";
import type { RoomView } from "@games/schema";
import { ExpeditionViewSchema } from "@games/schema/games/expedition";
import type { ExpeditionView } from "@games/rules";
import { createExpeditionSceneStore } from "../../lib/expedition/expedition-scene-store";
import { readCardPackPref, writeCardPackPref } from "../../lib/expedition/expedition-card-pack-pref";
import type { CardPackId } from "../../lib/expedition/card-pack-ids";
import { playCue } from "../../lib/expedition/audio/cue-bus";
import { toggleMute } from "../../lib/expedition/audio/audio-prefs";
import { ReconnectingBanner } from "../ReconnectingBanner";
import { ExpeditionRulesModal } from "./ExpeditionRulesModal";
import { ExpeditionMapModal } from "./ExpeditionMapModal";
import { ExpeditionSettingsModal } from "./ExpeditionSettingsModal";
import { KickPanel } from "./KickPanel";
import { buildKickPanel } from "../../lib/expedition/kick-model";
import { CURSOR } from "./phaser/cursors";

const ExpeditionPhaserMount = dynamic(() => import("./phaser/ExpeditionPhaserMount"), { ssr: false });

export interface ExpeditionBoardProps {
  view: RoomView;
  onAction: (request: unknown) => void;
  reconnecting?: boolean;
  onDeleteRoom?: () => void;
  onRestartLobby?: () => void;
  onKickVote?: (targetSeatId: string, kick: boolean) => void;
}

export function ExpeditionBoard({
  view,
  onAction,
  reconnecting = false,
  onDeleteRoom,
  onRestartLobby,
  onKickVote,
}: ExpeditionBoardProps) {
  const isHost = view.youSeatId !== null && view.youSeatId === view.hostSeatId;

  const onActionRef = useRef(onAction);
  const onRestartLobbyRef = useRef(onRestartLobby);
  const [mapOpen, setMapOpen] = useState(false);
  useEffect(() => {
    onActionRef.current = onAction;
    onRestartLobbyRef.current = onRestartLobby;
  }, [onAction, onRestartLobby]);

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
      onRestartLobby: () => onRestartLobbyRef.current?.(),
      onOpenMap: () => {
        playCue("sfx-ui-click");
        setMapOpen(true);
      },
      cardPackId: readCardPackPref(),
    }),
  );

  // D-05/SCENE-08: the settings modal and corner gear trigger. `cardPackId` mirrors the store's own copy so the
  // modal's radio picker re-renders on change without reading the store
  // directly (this component never subscribes to the store itself).
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [cardPackId, setCardPackId] = useState<CardPackId>(() => readCardPackPref());

  function handleCardPackChange(id: CardPackId) {
    writeCardPackPref(id);
    setCardPackId(id);
    store.getState().setCardPack(id);
  }

  useEffect(() => {
    if (game === null) return;
    store.getState().setServer({
      game,
      roomSeats: view.seats.map(({ seatId, displayLabel, connected }) => ({ seatId, displayLabel, connected })),
      hostSeatId: view.hostSeatId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, game, view.seats, view.hostSeatId]);

  // The glove cursors over the board's HTML too (globals.css reads them).
  useEffect(() => {
    const body = document.body;
    body.classList.add("expedition-gloves");
    for (const [kind, value] of Object.entries(CURSOR)) body.style.setProperty(`--glove-${kind}`, value);
    return () => {
      body.classList.remove("expedition-gloves");
      for (const kind of Object.keys(CURSOR)) body.style.removeProperty(`--glove-${kind}`);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "m" || event.ctrlKey || event.metaKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      toggleMute();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    store.getState().setReconnecting(reconnecting);
  }, [store, reconnecting]);

  const canRestart = isHost && game !== null && game.runStatus !== "in_progress";
  const kickPanel = game === null ? null : buildKickPanel(view, game);

  return (
    <>
      {reconnecting && <ReconnectingBanner />}

      <span
        className="fixed z-10"
        style={{
          top: "var(--space-sm)",
          right: "var(--space-sm)",
          height: 44,
          width: 44,
        }}
      >
        <button
          type="button"
          data-testid="expedition-settings-button"
          aria-label="Settings"
          aria-expanded={settingsOpen}
          onClick={() => {
            playCue("sfx-ui-click");
            setSettingsOpen(true);
          }}
          className="relative inline-flex cursor-pointer items-center justify-center rounded-md border border-[var(--color-border)] bg-transparent text-[var(--color-text)] transition-colors hover:border-[var(--color-text-muted)] hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          style={{ width: 44, height: 44 }}
        >
          <Settings size={20} aria-hidden="true" color="var(--color-text)" />
        </button>
      </span>

      <span
        className="fixed z-10"
        style={{
          top: "var(--space-sm)",
          right: "calc(var(--space-sm) + 44px + var(--space-xs))",
          height: 44,
          width: 44,
        }}
      >
        <button
          type="button"
          data-testid="expedition-rules-button"
          aria-label="Rules"
          aria-expanded={rulesOpen}
          onClick={() => {
            playCue("sfx-ui-click");
            setRulesOpen(true);
          }}
          className="relative inline-flex cursor-pointer items-center justify-center rounded-md border border-[var(--color-border)] bg-transparent text-[var(--color-text)] transition-colors hover:border-[var(--color-text-muted)] hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          style={{ width: 44, height: 44 }}
        >
          <BookOpen size={20} aria-hidden="true" color="var(--color-text)" />
        </button>
      </span>

      <ExpeditionPhaserMount store={store} />

      {kickPanel !== null && !reconnecting && (
        <KickPanel
          model={kickPanel}
          onKickVote={(seatId, kick) => {
            playCue("sfx-ui-click");
            onKickVote?.(seatId, kick);
          }}
        />
      )}

      <ExpeditionRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} game={game} />

      <ExpeditionMapModal open={mapOpen} onClose={() => setMapOpen(false)} game={game} />

      <ExpeditionSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        cardPackId={cardPackId}
        onCardPackChange={handleCardPackChange}
        isHost={isHost}
        onDeleteRoom={onDeleteRoom}
        canRestart={canRestart}
        onRestartLobby={onRestartLobby}
      />
    </>
  );
}
