"use client";

import { useState } from "react";
import type { KickPanelModel, KickVoteRow } from "../../lib/expedition/kick-model";

/**
 * The kick vote, in the strip under the corner buttons that no scene draws
 * in: one button per dropped teammate the crew can vote out, with its
 * tally, and the details (what a kick does) on hover, focus or the "?"
 * toggle. A player the crew kicked sees where they come back in over the
 * empty hand row instead, clear of the dev toolbar along the bottom edge.
 */
export function KickPanel({ model, onKickVote }: { model: KickPanelModel; onKickVote: (seatId: string, kick: boolean) => void }) {
  return (
    <>
      {(model.votes.length > 0 || model.returning.length > 0) && (
        <div
          data-testid="kick-panel"
          className="fixed z-30 flex flex-col items-end gap-[length:var(--space-xs)]"
          style={{ top: "calc(var(--space-sm) + 48px)", right: "var(--space-sm)", width: "clamp(10rem, 14vw, 16rem)" }}
        >
          {model.votes.map((row) => (
            <KickVote key={row.seatId} row={row} consequence={model.consequence} onKickVote={onKickVote} />
          ))}
          {model.returning.map((name) => (
            <p key={name} className="w-full rounded-md border px-2 py-1 text-xs shadow-lg min-[1600px]:text-sm" style={surface} data-testid="kick-returning">
              {name} is back and rejoins at the next loadout.
            </p>
          ))}
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

const surface = { backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" } as const;
// Under the 44px corner buttons and above the trail map, which starts 88px
// down at 1280x720, a pill has 32px.
const PILL_H = "32px";

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
          style={{ ...surface, color: "var(--color-text)", minHeight: PILL_H, borderColor: row.youVoted ? "var(--color-destructive)" : "var(--color-border)" }}
        >
          <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "var(--color-status-disconnected)" }} />
          <span className="truncate">{row.youVoted ? `Undo kick ${row.name}` : `Kick ${row.name}?`}</span>
          <span className="ml-auto shrink-0 tabular-nums" style={{ color: "var(--color-text-muted)" }} data-testid={`kick-tally-${row.seatId}`}>
            {tally}
          </span>
        </button>
      ) : (
        <p className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 text-xs shadow-lg min-[1600px]:text-sm" style={{ ...surface, color: "var(--color-text)", minHeight: PILL_H }}>
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
        style={{ ...surface, color: "var(--color-text-muted)", minHeight: PILL_H, minWidth: PILL_H }}
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
