"use client";

import { useState, type CSSProperties } from "react";
import type { KickPanelModel, KickVoteRow } from "../../lib/expedition/kick-model";
import { KICK_POCKET } from "./phaser/layout";
import { useStageBox, type StageBox } from "./use-stage-box";

/**
 * The kick vote, in the stage's pocket under the corner buttons that no
 * scene draws in (`KICK_POCKET`), one pill high at any zoom: the vote on a
 * dropped teammate the crew can vote out, with its tally and the details
 * (what a kick does) on hover, focus or the "?" toggle. Two or more things
 * to show fold into one pill that opens the list. A player the crew kicked
 * sees where they come back in over the empty hand row instead.
 */
export function KickPanel({ model, onKickVote }: { model: KickPanelModel; onKickVote: (seatId: string, kick: boolean) => void }) {
  const box = useStageBox();
  const count = model.votes.length + model.returning.length;
  return (
    <>
      {count > 0 && box !== null && (
        <div data-testid="kick-panel" className="fixed z-30 flex" style={pocketStyle(box)}>
          {count === 1 && model.votes[0] !== undefined && <KickVote row={model.votes[0]} consequence={model.consequence} onKickVote={onKickVote} />}
          {count === 1 && model.returning[0] !== undefined && <Returning name={model.returning[0]} pill />}
          {count > 1 && <KickList model={model} onKickVote={onKickVote} />}
        </div>
      )}
      {model.yours !== null && (
        <div
          role="status"
          data-testid="kick-yours-panel"
          className="fixed left-1/2 z-30 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border p-[length:var(--space-sm)] shadow-lg min-[1600px]:w-[44rem]"
          style={{ ...surface, bottom: "48px" }}
        >
          <p className="text-sm font-semibold min-[1600px]:text-lg" style={{ color: "var(--color-text)" }} data-testid="kick-yours-title">
            {model.yours.title}
          </p>
          <p className="text-sm min-[1600px]:text-base" style={{ color: "var(--color-text-muted)" }} data-testid="kick-yours">
            {model.yours.text}
          </p>
        </div>
      )}
    </>
  );
}

function pocketStyle(box: StageBox): CSSProperties {
  return {
    left: box.left + KICK_POCKET.x * box.zoom,
    top: box.top + KICK_POCKET.y * box.zoom,
    width: KICK_POCKET.w * box.zoom,
    height: Math.min(KICK_POCKET.h * box.zoom, MAX_PILL_H),
  };
}

function Returning({ name, pill = false }: { name: string; pill?: boolean }) {
  const line = `${name} is back and rejoins at the next loadout.`;
  return (
    <p
      title={line}
      className={`flex min-w-0 items-center rounded-md border px-2 text-xs shadow-lg min-[1600px]:text-sm ${pill ? "w-full truncate" : "py-1"}`}
      style={surface}
      data-testid="kick-returning"
    >
      <span className="truncate">{line}</span>
    </p>
  );
}

/** One pill for several dropped teammates and returns; it opens the list
 * under the pocket. */
function KickList({ model, onKickVote }: { model: KickPanelModel; onKickVote: (seatId: string, kick: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const label = model.votes.length > 0 ? `${model.votes.length} offline: kick?` : `${model.returning.length} coming back`;
  return (
    <div className="relative flex w-full">
      <button
        type="button"
        data-testid="kick-list-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold shadow-lg min-[1600px]:text-sm hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        style={{ ...surface, color: "var(--color-text)" }}
      >
        <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "var(--color-status-disconnected)" }} />
        <span className="truncate">{label}</span>
        <span aria-hidden="true" className="ml-auto shrink-0" style={{ color: "var(--color-text-muted)" }}>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 flex w-64 flex-col gap-1 min-[1600px]:w-80" data-testid="kick-list">
          {model.votes.map((row) => (
            <div key={row.seatId} className="flex" style={{ height: PILL_H }}>
              <KickVote row={row} consequence={model.consequence} onKickVote={onKickVote} />
            </div>
          ))}
          {model.returning.map((name) => (
            <Returning key={name} name={name} />
          ))}
        </div>
      )}
    </div>
  );
}

const surface = { backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" } as const;
const PILL_H = "32px";
const MAX_PILL_H = 44;

function KickVote({ row, consequence, onKickVote }: { row: KickVoteRow; consequence: string; onKickVote: (seatId: string, kick: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const detailsId = `kick-details-${row.seatId}`;
  const tally = `${row.votes}/${row.needed}`;
  return (
    <div className="group relative flex w-full items-stretch gap-1" data-testid={`kick-row-${row.seatId}`}>
      {row.canVote ? (
        <button
          type="button"
          data-testid={`kick-vote-${row.seatId}`}
          aria-pressed={row.youVoted}
          aria-describedby={detailsId}
          onClick={() => onKickVote(row.seatId, !row.youVoted)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold shadow-lg min-[1600px]:text-sm transition-colors hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          style={{ ...surface, color: "var(--color-text)", borderColor: row.youVoted ? "var(--color-destructive)" : "var(--color-border)" }}
        >
          <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "var(--color-status-disconnected)" }} />
          <span className="truncate">{row.youVoted ? `Undo kick ${row.name}` : `Kick ${row.name}?`}</span>
          <span className="ml-auto shrink-0 tabular-nums" style={{ color: "var(--color-text-muted)" }} data-testid={`kick-tally-${row.seatId}`}>
            {tally}
          </span>
        </button>
      ) : (
        <p className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 text-xs shadow-lg min-[1600px]:text-sm" style={{ ...surface, color: "var(--color-text)" }}>
          <span className="truncate">{row.name} is offline</span>
          <span className="ml-auto shrink-0 tabular-nums" style={{ color: "var(--color-text-muted)" }} data-testid={`kick-tally-${row.seatId}`}>
            {tally}
          </span>
        </p>
      )}
      <button
        type="button"
        aria-label={`What kicking ${row.name} does`}
        aria-expanded={open}
        data-testid={`kick-info-${row.seatId}`}
        onClick={() => setOpen((v) => !v)}
        className="shrink-0 rounded-md border px-2 text-xs font-semibold shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        style={{ ...surface, color: "var(--color-text-muted)", minWidth: PILL_H }}
      >
        ?
      </button>
      <div
        id={detailsId}
        role="tooltip"
        data-testid={`kick-details-${row.seatId}`}
        className={`absolute right-0 top-full z-40 mt-1 w-64 rounded-md border p-2 text-xs shadow-lg min-[1600px]:w-80 min-[1600px]:text-sm group-hover:block group-focus-within:block ${open ? "block" : "hidden"}`}
        style={{ ...surface, color: "var(--color-text-muted)" }}
      >
        <p className="font-semibold" style={{ color: "var(--color-text)" }}>
          {row.name} is disconnected
        </p>
        <p>
          {row.votes} of {row.needed} votes to kick. {consequence}
        </p>
      </div>
    </div>
  );
}
