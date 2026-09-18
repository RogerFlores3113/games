"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Settings } from "lucide-react";
import type { RoomView } from "@games/schema";
import { HanabiViewSchema } from "@games/schema/games/hanabi";
import type { Clue, HanabiView } from "@games/rules";
import { isSeatConnected, turnIndicatorText } from "../../lib/hanabi-board-logic";
import { clearNotesForRoom, pruneNotesForSeat } from "../../lib/hanabi-notes";
import { hintsVisibleForCard } from "../../lib/hanabi-hint-logic";
import { readKeepHintsPref, writeKeepHintsPref } from "../../lib/keep-hints-pref";
import {
  TILE_COLOR_PRESETS,
  readTileColorPref,
  writeTileColorPref,
  type TileColorId,
} from "../../lib/tile-color-pref";
import {
  CLUE_HIGHLIGHT_MS,
  teammatesInTurnOrder,
  touchedCardIdsFromLatestClue,
  type ActionContext,
} from "../../lib/hanabi-visual-logic";
import { applyPendingOrder, dropZoneStatus } from "../../lib/hanabi-drag-logic";
import { groupedBySuitOrder } from "../../lib/hanabi-discard-drag-logic";
import { OwnHand, TeammateHand } from "./Hand";
import { Table } from "./Table";
import { CardActions } from "./CardActions";
import { EndOverlay } from "./EndOverlay";
import { FlyToLayer } from "./FlyToLayer";
import { ReconnectingBanner } from "../ReconnectingBanner";
import { SettingsModal } from "./SettingsModal";
import { useHanabiAudio } from "./useHanabiAudio";
import { useHandDrag } from "./useHandDrag";
import { useDiscardDrag } from "./useDiscardDrag";
import { useBoardZoom } from "./useBoardZoom";

export type HanabiActionRequest =
  | { type: "play"; cardId: string }
  | { type: "discard"; cardId: string }
  | { type: "clue"; targetSeatId: string; clue: Clue }
  | { type: "reorder"; cardIds: string[] }
  | { type: "reorderDiscard"; cardIds: string[] };

export interface HanabiBoardProps {
  view: RoomView;
  onAction: (request: HanabiActionRequest) => void;
  /** D-05: while true, the store's own socket is degraded and this last-
   * known view is display-only — every action control is disabled and the
   * `act()` wrapper below no-ops, so nothing is sent against a stale view. */
  reconnecting?: boolean;
}


/**
 * D-01/D-02/D-14/D-20, UAT gap 16: the designed board orchestrator — a thin
 * layer that owns select-then-act state, which opponent tile's quick-clue
 * popover is open, the transient just-clued highlight, and lays out the
 * three bands (teammates / tableau / own hand + controls), rendering
 * EndOverlay over the still-visible board at game end.
 *
 * The one load-bearing rule this file must never violate (carried from the
 * interim board, D-15): a card in the viewer's own hand renders NO identity
 * signal. `OwnHandCard` (via `OwnHand` below) receives only `card.facts` —
 * never the card itself — so this orchestrator cannot pass along a suit or
 * rank for its own seat even by accident.
 */
export function HanabiBoard({ view, onAction, reconnecting = false }: HanabiBoardProps) {
  // Parsed against the same strict wire schema the server's fail-closed gate
  // uses, so there is exactly one definition of "a valid HanabiView".
  // WR-04: a present-but-invalid game (e.g. worker/web deploy drift) is
  // surfaced — logged and shown as an error — never silently rendered as an
  // endless "Loading game…".
  const parsed = useMemo(
    () => (view.game == null ? null : HanabiViewSchema.safeParse(view.game)),
    [view.game],
  );
  const game: HanabiView | null = parsed?.success ? (view.game as HanabiView) : null;
  const schemaMismatch = parsed !== null && !parsed.success;
  useEffect(() => {
    if (parsed && !parsed.success) {
      console.error("HanabiView schema mismatch", parsed.error.issues);
    }
  }, [parsed]);

  const audio = useHanabiAudio(game, reconnecting);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  // UAT gap 16: the id of the one opponent tile whose quick-clue popover is
  // open, or null — replaces the deleted CluePicker's clueTarget/clueValue/
  // previewClue selection state entirely (a tile click IS the target+value).
  const [clueOpenCardId, setClueOpenCardId] = useState<string | null>(null);
  const [justCluedIds, setJustCluedIds] = useState<ReadonlySet<string>>(new Set());
  const prevHistoryLengthRef = useRef<number | null>(null);
  const clueClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // HINT-03/D-05, TILE-03/D-13: personal, client-side-only preferences.
  // Loaded in a mount effect (never the state initializer) so SSR and first
  // client render both show the documented defaults (keepHints off, slate
  // tile) before the real stored value is readable.
  const [keepHints, setKeepHints] = useState(false);
  const [tileColorId, setTileColorId] = useState<TileColorId>("slate");
  // 06.2-13: gear-triggered settings modal open state — the modal is a
  // pure overlay, never an unmount of the board underneath it.
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    setKeepHints(readKeepHintsPref());
    setTileColorId(readTileColorPref());
  }, []);

  function handleToggleKeepHints() {
    setKeepHints((prev) => {
      const next = !prev;
      writeKeepHintsPref(next);
      return next;
    });
  }

  function handleTileColorChange(id: TileColorId) {
    setTileColorId(id);
    writeTileColorPref(id);
  }
  const tileColorCss = TILE_COLOR_PRESETS.find((preset) => preset.id === tileColorId)?.cssValue;

  // Unmount-only cleanup for the highlight-clear timer.
  useEffect(
    () => () => {
      if (clueClearTimerRef.current !== null) clearTimeout(clueClearTimerRef.current);
    },
    [],
  );

  // D-14: highlight the cards touched by a clue that landed after mount —
  // never on mount/refresh (ref starts null, first run only records length).
  // CR-01: the clear timer lives in a ref and is NOT this effect's cleanup —
  // `game` is a new object on every server frame, so returning the timer as
  // cleanup let any frame inside the highlight window cancel the clear and
  // leave the highlight stuck on stale cards.
  useEffect(() => {
    const historyLength = game?.history.length ?? null;
    const prev = prevHistoryLengthRef.current;
    prevHistoryLengthRef.current = historyLength;
    if (prev === null || historyLength === null || !game || historyLength <= prev) return;
    const ids = touchedCardIdsFromLatestClue(game.history, prev);
    if (ids.length === 0) return;
    setJustCluedIds(new Set(ids));
    if (clueClearTimerRef.current !== null) clearTimeout(clueClearTimerRef.current);
    clueClearTimerRef.current = setTimeout(() => {
      clueClearTimerRef.current = null;
      setJustCluedIds(new Set());
    }, CLUE_HIGHLIGHT_MS);
  }, [game]);

  // UAT gap 16: the quick-clue popover closes on Escape, and on any pointer
  // click outside both the open tile and its own popover buttons — matched
  // via the shared `data-clue-tile` wrapper TeammateCard renders around
  // both, rather than this effect needing its own ref plumbing. A click ON
  // the still-open tile itself is deliberately left alone here (it hits this
  // same "inside" branch) — TeammateCard's own onClick handles the
  // close-on-second-click toggle.
  useEffect(() => {
    if (clueOpenCardId === null) return;
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Element | null;
      if (target?.closest(`[data-clue-tile="${clueOpenCardId}"]`)) return;
      setClueOpenCardId(null);
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setClueOpenCardId(null);
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [clueOpenCardId]);

  // Selection hygiene: drop a stale selection once the card leaves the hand
  // (played/discarded), so a disabled action never fires against a dead id.
  useEffect(() => {
    if (!game) return;
    if (selectedCardId && !game.yourHand.some((card) => card.id === selectedCardId)) {
      setSelectedCardId(null);
    }
  }, [game, selectedCardId]);

  // D-04: private note lifecycle. An ended game clears every note for the
  // room; otherwise, prune notes for own-hand cards that have left the hand
  // (played/discarded) so a stale note never silently reappears on a
  // different card that later lands in the same slot — this also runs on
  // reconnect after a tab was closed mid-game, not just live transitions.
  const ownHandIds = game?.yourHand.map((card) => card.id).join(",") ?? "";
  useEffect(() => {
    if (view.status === "ended") {
      clearNotesForRoom(view.code);
      return;
    }
    if (view.youSeatId === null || ownHandIds === "") return;
    pruneNotesForSeat(view.code, view.youSeatId, ownHandIds.split(","));
  }, [ownHandIds, view.youSeatId, view.status, view.code]);

  function labelFor(seatId: string): string {
    return view.seats.find((seat) => seat.seatId === seatId)?.displayLabel ?? "…";
  }

  const ended = view.status === "ended";

  // D-06: defense in depth — a click that slips past a disabled control
  // still never reaches onAction while the view is stale or the game ended.
  function act(request: HanabiActionRequest): void {
    if (reconnecting || ended) return;
    onAction(request);
  }

  // Constructed above the early return (and `useHandDrag` called
  // unconditionally right after it) so the hook order never changes between
  // a null and a present `game` render.
  const ctx: ActionContext = { reconnecting, ended, labelFor };
  // UAT gap 11: 1280x720 is the minimum supported size, not the design
  // target — see useBoardZoom's own header comment. Read before the drag
  // hooks below (UAT gaps 27/28) so both can convert their screen-pixel
  // pointer measurements through the current zoom factor from their very
  // first render.
  const boardZoom = useBoardZoom();
  const drag = useHandDrag({ game, ctx, onDropRequest: act, zoom: boardZoom });
  const discardDrag = useDiscardDrag({ game, ctx, onDropRequest: act, zoom: boardZoom });

  if (!game) {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-[length:var(--space-md)]"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        {schemaMismatch ? (
          <p
            role="alert"
            data-testid="game-view-error"
            className="text-[length:var(--text-body)]"
            style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
          >
            This game couldn&apos;t be displayed — try refreshing.
          </p>
        ) : (
          <p
            role="status"
            className="text-[length:var(--text-body)]"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-body--line-height)" }}
          >
            Loading game…
          </p>
        )}
      </main>
    );
  }

  const controlsDisabled = reconnecting || ended;
  const teammates = teammatesInTurnOrder(
    game.otherHands,
    view.seats.map((s) => s.seatId),
    game.yourSeatId,
  );
  // HINT-03/D-05: every card's hint visibility, derived synchronously from
  // `game.history` alone — no timer, no mutable cell (see
  // hanabi-hint-logic.ts's header comment on why this must stay pure).
  // Covers own hand and every teammate hand so both `OwnHand` and
  // `TeammateHand` read from the one set.
  const hintsVisibleIds = new Set<string>();
  for (const card of game.yourHand) {
    if (hintsVisibleForCard(game.history, card.id, { keepVisible: keepHints })) {
      hintsVisibleIds.add(card.id);
    }
  }
  for (const hand of game.otherHands) {
    for (const card of hand.cards) {
      if (hintsVisibleForCard(game.history, card.id, { keepVisible: keepHints })) {
        hintsVisibleIds.add(card.id);
      }
    }
  }

  // D-16: only computed while a drag is in flight, so Table never carries
  // drop-zone highlight/reason styling outside an active drag.
  const dropStatus =
    drag.dragState !== null
      ? {
          play: dropZoneStatus(game, "play", drag.dragState.cardId, ctx),
          discard: dropZoneStatus(game, "discard", drag.dragState.cardId, ctx),
          hovered: drag.dragState.target.kind,
        }
      : null;

  // UAT gap 16: fired by a tile's own quick-clue popover — the target seat
  // and the clue are both already fully determined by which tile was
  // clicked, so this sends immediately and closes the popover, with no
  // separate "give clue" confirmation step.
  function handleGiveClue(targetSeatId: string, clue: Clue) {
    act({ type: "clue", targetSeatId, clue });
    setClueOpenCardId(null);
  }

  function handleToggleClueCard(cardId: string) {
    setClueOpenCardId((prev) => (prev === cardId ? null : cardId));
  }

  // UAT gap 10/DISC-01: re-sorts the shared discardOrder by suit for every
  // player, through the same act()/reorderDiscard chokepoint a drag uses —
  // not a new action, not a local view toggle (see groupedBySuitOrder's
  // header comment). game.stacks' own order is the canonical suit order, so
  // Rainbow/Black variants sort correctly without a hardcoded suit list.
  function handleGroupDiscardBySuit() {
    if (!game) return;
    const cardIds = groupedBySuitOrder(
      game.discard,
      game.stacks.map((stack) => stack.suit),
    );
    act({ type: "reorderDiscard", cardIds });
  }

  return (
    <main
      className="table-backdrop relative flex min-h-screen flex-col gap-[3px] overflow-y-auto px-[length:var(--space-md)] py-0"
    >
      {/* 06.2-13: the gear trigger is absolutely positioned relative to this
          `<main>` (now `position: relative`), so it adds ZERO flow height
          to any band — UI-11's 1280x720 fit has no slack. */}
      <span
        className="absolute z-10"
        style={{
          top: "var(--space-sm)",
          right: "var(--space-sm)",
          height: 44,
          width: 44,
        }}
      >
        <button
          type="button"
          data-testid="settings-toggle"
          aria-label="Open settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(true)}
          className="relative inline-flex cursor-pointer items-center justify-center rounded-md border border-[var(--color-border)] bg-transparent text-[var(--color-text)] transition-colors hover:border-[var(--color-text-muted)] hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          style={{ width: 28, height: 28 }}
        >
          <Settings size={20} aria-hidden="true" color="var(--color-text)" />
          {/* fix(06.2-10) pattern, preserved: the enlarged touch-target span
              must be a DESCENDANT of the button, not a sibling. */}
          <span aria-hidden="true" className="absolute" style={{ inset: "-8px" }} />
        </button>
      </span>

      {reconnecting && <ReconnectingBanner />}

      {/* UAT gap 11: the whole board+hands region scales uniformly above the
          1280x720 floor via CSS `zoom` (see useBoardZoom/computeBoardZoom) —
          `zoom` is 1 at/under the floor, so this wrapper is a no-op at the
          fit-tested viewport and every existing layout-budget measurement
          still holds byte-for-byte. */}
      <div className="flex min-h-0 flex-1 flex-col gap-[2px]" style={{ zoom: boardZoom }}>
        <div data-testid="teammates-band" className="flex flex-none flex-wrap justify-center gap-[length:var(--space-xs)]">
          {teammates.map((hand) => (
            <TeammateHand
              key={hand.seatId}
              hand={hand}
              label={labelFor(hand.seatId)}
              connected={isSeatConnected(view.seats, hand.seatId)}
              variant={game.variant}
              isActive={hand.seatId === game.activeSeatId}
              justCluedIds={justCluedIds}
              game={game}
              ctx={ctx}
              openCardId={clueOpenCardId}
              onToggleCard={handleToggleClueCard}
              onGiveClue={handleGiveClue}
              hintsVisible={hintsVisibleIds}
              tileColor={tileColorCss}
            />
          ))}
        </div>

        <div className="flex min-h-0 flex-1 justify-center">
          <Table
            game={game}
            playZoneRef={drag.playZoneRef}
            discardZoneRef={drag.discardZoneRef}
            dropStatus={dropStatus}
            discardDragState={discardDrag.dragState}
            discardPendingOrder={discardDrag.pendingOrder}
            registerDiscardTile={discardDrag.registerTile}
            onDiscardTilePointerDown={discardDrag.onTilePointerDown}
            onGroupDiscardBySuit={controlsDisabled ? undefined : handleGroupDiscardBySuit}
          />
        </div>

        {/* fix(06.2-10): testid added purely as a measurement hook — the
            OWN_BAND_PX layout-budget constant covers this ENTIRE row. 06.2-13
            stripped it to only OwnHand + CardActions (play controls); every
            non-play preference control now lives inside SettingsModal,
            opened by the gear trigger above.
            UAT gaps 13/14 (second owner review): Play/Discard now sit ABOVE
            the own hand rather than beside it, and the own hand row is
            wrapped in a full-width `justify-center` band so it is always
            horizontally centred, whatever the seat count or window width.
            UAT gap 16: the deleted `CluePicker` (the large clue-target/
            clue-value menu that used to sit below the hand here) is gone —
            clue-giving now happens via each opponent tile's own quick-clue
            popover (TeammateCard/CluePopover), so this row is down to two
            lines (CardActions, OwnHand) instead of three. */}
        <div data-testid="bottom-controls-row" className="flex flex-none w-full flex-col items-center">
          <CardActions
            game={game}
            selectedCardId={selectedCardId}
            ctx={ctx}
            onPlay={() => selectedCardId && act({ type: "play", cardId: selectedCardId })}
            onDiscard={() => selectedCardId && act({ type: "discard", cardId: selectedCardId })}
          />

          <div className="flex w-full justify-center">
            <OwnHand
              cards={applyPendingOrder(game.yourHand, drag.pendingOrder)}
              variant={game.variant}
              roomCode={view.code}
              youSeatId={view.youSeatId}
              connected={view.youSeatId !== null ? isSeatConnected(view.seats, view.youSeatId) : true}
              isYourTurn={game.isYourTurn && !ended}
              turnText={turnIndicatorText(game, view.seats, labelFor, ended)}
              selectedCardId={selectedCardId}
              justCluedIds={justCluedIds}
              disabled={controlsDisabled}
              onSelectCard={(cardId) => setSelectedCardId(cardId)}
              draggingCardId={drag.dragState?.cardId ?? null}
              dragOffset={drag.dragState?.offset ?? null}
              dropIndex={drag.dragState?.dropIndex ?? null}
              slotPitchPx={drag.dragState?.slotPitchPx ?? null}
              onCardPointerDown={drag.onCardPointerDown}
              registerSlot={drag.registerSlot}
              consumeClickSuppression={drag.consumeClickSuppression}
              hintsVisible={hintsVisibleIds}
              tileColor={tileColorCss}
            />
          </div>
        </div>
      </div>

      <FlyToLayer game={game} reconnecting={reconnecting} suppressedCardIds={drag.droppedCardIdsRef} />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        muted={audio.muted}
        volume={audio.volume}
        onToggleMute={() => audio.setMuted(!audio.muted)}
        onVolumeChange={audio.setVolume}
        keepHints={keepHints}
        onToggleKeepHints={handleToggleKeepHints}
        tileColorId={tileColorId}
        onTileColorChange={handleTileColorChange}
      />

      {ended && <EndOverlay game={game} />}
    </main>
  );
}
