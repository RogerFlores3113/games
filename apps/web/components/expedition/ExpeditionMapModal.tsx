"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { ExpeditionView } from "@games/rules";
import { playCue } from "../../lib/expedition/audio/cue-bus";
import { buildProgressMap, type MapStop } from "../../lib/expedition/progress-map";
import { MOD_ICON_INK, MOD_ICON_SIZE, modIconRows } from "./phaser/art/mod-icons";
import { ART, ART_URL_PREFIX, type ArtId } from "./phaser/art/art-registry";

type IconKind = Parameters<typeof modIconRows>[1];

/** A camp modifier's 9x9 icon as crisp SVG cells, beside its name. */
function ModGlyph({ id, kind }: { id: string | null; kind: IconKind }) {
  const rows = modIconRows(id ?? "", kind);
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${MOD_ICON_SIZE} ${MOD_ICON_SIZE}`} width={18} height={18} shapeRendering="crispEdges" className="shrink-0">
      {rows.flatMap((row, y) =>
        Array.from(row).flatMap((ch, x) => {
          const ink = MOD_ICON_INK[ch];
          return ink === undefined ? [] : [<rect key={`${x}:${y}`} x={x} y={y} width={1} height={1} fill={ink} />];
        }),
      )}
    </svg>
  );
}

const MARKER: Readonly<Record<MapStop["state"], Readonly<Record<MapStop["kind"], ArtId>>>> = {
  cleared: { camp: "marker-cleared", boss: "marker-cleared", temple: "marker-cleared" },
  here: { camp: "crew-token", boss: "crew-token", temple: "crew-token" },
  lost: { camp: "marker-camp", boss: "marker-boss", temple: "temple" },
  ahead: { camp: "marker-camp", boss: "marker-boss", temple: "temple" },
};

const NOTE_COLOR: Readonly<Record<MapStop["state"], string>> = {
  cleared: "var(--color-status-connected)",
  here: "var(--color-turn)",
  lost: "var(--color-destructive)",
  ahead: "var(--color-text-muted)",
};

function StopRow({ stop, last }: { stop: MapStop; last: boolean }) {
  const marker = ART[MARKER[stop.state][stop.kind]];
  const here = stop.state === "here";
  return (
    <li data-testid={`expedition-map-stop-${stop.index}`} className="relative flex items-stretch gap-[length:var(--space-sm)]">
      <div className="relative flex w-8 shrink-0 flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART_URL_PREFIX}${marker.file}`} alt="" width={32} height={32} className="relative z-10 shrink-0" style={{ imageRendering: "pixelated", opacity: stop.state === "ahead" ? 0.7 : 1 }} />
        {!last && <span aria-hidden="true" className="w-0 flex-1 border-l-2 border-dashed" style={{ borderColor: "var(--color-border)" }} />}
      </div>
      <div
        className="mb-[length:var(--space-xs)] flex min-w-0 flex-1 flex-wrap items-center gap-x-[length:var(--space-md)] gap-y-1 rounded-md border px-[length:var(--space-sm)] py-1"
        style={{ borderColor: here ? "var(--color-turn)" : "var(--color-border)", backgroundColor: here ? "var(--color-bg)" : "transparent", opacity: stop.state === "ahead" ? 0.8 : 1 }}
      >
        <span className="w-16 shrink-0 font-semibold">Camp {stop.index}</span>
        {stop.place === null ? (
          <span style={{ color: "var(--color-text-muted)" }}>{stop.state === "ahead" ? "Not chosen yet" : "Route not chosen yet"}</span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1">
              <ModGlyph id={stop.place.locationId} kind="location" />
              {stop.place.location}
            </span>
            <span className="inline-flex items-center gap-1">
              <ModGlyph id={stop.place.weatherId} kind="weather" />
              {stop.place.weather}
            </span>
          </>
        )}
        {stop.boss !== null && (
          <span className="inline-flex items-center gap-1" style={{ color: stop.boss.id === null ? "var(--color-text-muted)" : "var(--color-text)" }}>
            <ModGlyph id={stop.boss.id} kind={stop.boss.tier} />
            {stop.boss.name}
          </span>
        )}
        {stop.note !== "" && (
          <span className="ml-auto font-semibold" style={{ color: NOTE_COLOR[stop.state] }}>
            {stop.note}
          </span>
        )}
      </div>
    </li>
  );
}

export interface ExpeditionMapModalProps {
  open: boolean;
  onClose: () => void;
  game: ExpeditionView | null;
}

/** The map of the run so far, opened from the top bar's camp label. */
export function ExpeditionMapModal({ open, onClose, game }: ExpeditionMapModalProps) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const map = game === null ? null : buildProgressMap(game);
  if (!open || map === null) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-[length:var(--space-md)]" style={{ background: "rgba(11, 15, 26, 0.7)", zIndex: 30 }} onClick={onClose}>
      <div
        data-testid="expedition-map-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Map of the run"
        className="mx-auto flex max-h-full w-full max-w-2xl flex-col gap-[length:var(--space-md)] rounded-lg border-2 p-[length:var(--space-lg)] min-[1600px]:max-w-4xl min-[1600px]:text-lg"
        style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-[length:var(--space-md)]">
          <div>
            <h2 className="font-semibold" style={{ color: "var(--color-text)", fontSize: "var(--text-heading)", lineHeight: "var(--text-heading--line-height)" }}>
              Map of the run
            </h2>
            <p data-testid="expedition-map-heading" style={{ color: "var(--color-text-muted)" }}>
              {map.heading}
            </p>
          </div>
          <button
            type="button"
            data-testid="expedition-map-close"
            aria-label="Close the map"
            onClick={() => {
              playCue("sfx-ui-click");
              onClose();
            }}
            className="inline-flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            style={{ minHeight: "var(--size-touch-min)", minWidth: "var(--size-touch-min)", color: "var(--color-text)" }}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <ol className="flex flex-col overflow-y-auto pr-[length:var(--space-xs)] min-[1600px]:text-lg" style={{ color: "var(--color-text)" }}>
          {map.stops.map((stop, i) => (
            <StopRow key={stop.index} stop={stop} last={i === map.stops.length - 1} />
          ))}
        </ol>
      </div>
    </div>
  );
}
