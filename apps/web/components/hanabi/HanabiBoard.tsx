"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomView } from "@games/schema";
import { HanabiViewSchema } from "@games/schema/games/hanabi";
import type { Clue, HanabiView } from "@games/rules";
import {
  clueTouchIdsForTarget,
  isSeatConnected,
  turnIndicatorText,
} from "../../lib/hanabi-board-logic";
import {
  CLUE_HIGHLIGHT_MS,
  teammatesInTurnOrder,
  touchedCardIdsFromLatestClue,
  type ActionContext,
} from "../../lib/hanabi-visual-logic";
import { OwnHand, TeammateHand } from "./Hand";
import { Table } from "./Table";
import { CardActions } from "./CardActions";
import { CluePicker } from "./CluePicker";
import { EndOverlay } from "./EndOverlay";
import { ReconnectingBanner } from "../ReconnectingBanner";

export type HanabiActionRequest =
  | { type: "play"; cardId: string }
  | { type: "discard"; cardId: string }
  | { type: "clue"; targetSeatId: string; clue: Clue };

export interface HanabiBoardProps {
  view: RoomView;
  onAction: (request: HanabiActionRequest) => void;
  /** D-05: while true, the store's own socket is degraded and this last-
   * known view is display-only — every action control is disabled and the
   * `act()` wrapper below no-ops, so nothing is sent against a stale view. */
  reconnecting?: boolean;
}


/**
 * D-01/D-02/D-14/D-16/D-17/D-20: the designed board orchestrator — a thin
 * layer that owns select-then-act state, the clue preview, the transient
 * just-clued highlight, and lays out the three bands (teammates / tableau /
 * own hand + controls), rendering EndOverlay over the still-visible board at
 * game end.
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

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [clueTarget, setClueTarget] = useState<string | null>(null);
  const [clueValue, setClueValue] = useState<Clue | null>(null);
  const [previewClue, setPreviewClue] = useState<Clue | null>(null);
  const [justCluedIds, setJustCluedIds] = useState<ReadonlySet<string>>(new Set());
  const prevHistoryLengthRef = useRef<number | null>(null);
  const clueClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Selection hygiene: drop a stale selection once the card leaves the hand
  // (played/discarded), so a disabled action never fires against a dead id.
  useEffect(() => {
    if (!game) return;
    if (selectedCardId && !game.yourHand.some((card) => card.id === selectedCardId)) {
      setSelectedCardId(null);
    }
  }, [game, selectedCardId]);

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

  const ctx: ActionContext = { reconnecting, ended, labelFor };
  const controlsDisabled = reconnecting || ended;
  const teammates = teammatesInTurnOrder(
    game.otherHands,
    view.seats.map((s) => s.seatId),
    game.yourSeatId,
  );
  const activeClueValue = previewClue ?? clueValue;
  const previewIds = new Set<string>(
    clueTarget && activeClueValue ? clueTouchIdsForTarget(game, clueTarget, activeClueValue) : [],
  );

  function handleGiveClue() {
    if (!clueTarget || !clueValue) return;
    act({ type: "clue", targetSeatId: clueTarget, clue: clueValue });
    setClueValue(null);
    setPreviewClue(null);
  }

  return (
    <main
      className="flex min-h-screen flex-col gap-[3px] overflow-y-auto px-[length:var(--space-md)] py-[3px]"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {reconnecting && <ReconnectingBanner />}

      <div data-testid="teammates-band" className="flex flex-none flex-wrap justify-center gap-[length:var(--space-xs)]">
        {teammates.map((hand) => (
          <TeammateHand
            key={hand.seatId}
            hand={hand}
            label={labelFor(hand.seatId)}
            connected={isSeatConnected(view.seats, hand.seatId)}
            variant={game.variant}
            isActive={hand.seatId === game.activeSeatId}
            isTarget={clueTarget === hand.seatId}
            previewIds={previewIds}
            justCluedIds={justCluedIds}
            disabled={controlsDisabled}
            onSelectTarget={() => setClueTarget(hand.seatId)}
          />
        ))}
      </div>

      <div className="flex min-h-0 flex-1 justify-center">
        <Table game={game} />
      </div>

      <div className="flex flex-none flex-wrap items-start justify-center gap-[length:var(--space-md)]">
        <OwnHand
          cards={game.yourHand}
          variant={game.variant}
          youSeatId={view.youSeatId}
          connected={view.youSeatId !== null ? isSeatConnected(view.seats, view.youSeatId) : true}
          isYourTurn={game.isYourTurn && !ended}
          turnText={turnIndicatorText(game, view.seats, labelFor, ended)}
          selectedCardId={selectedCardId}
          justCluedIds={justCluedIds}
          disabled={controlsDisabled}
          onSelectCard={(cardId) => setSelectedCardId(cardId)}
        />

        <CardActions
          game={game}
          selectedCardId={selectedCardId}
          ctx={ctx}
          onPlay={() => selectedCardId && act({ type: "play", cardId: selectedCardId })}
          onDiscard={() => selectedCardId && act({ type: "discard", cardId: selectedCardId })}
        />

        <CluePicker
          game={game}
          targets={teammates.map((hand) => ({ seatId: hand.seatId, label: labelFor(hand.seatId) }))}
          clueTarget={clueTarget}
          clueValue={clueValue}
          ctx={ctx}
          onSelectTarget={(seatId) => setClueTarget(seatId)}
          onSelectValue={(clue) => setClueValue(clue)}
          onPreview={(clue) => setPreviewClue(clue)}
          onGive={handleGiveClue}
        />
      </div>

      {ended && <EndOverlay game={game} />}
    </main>
  );
}
