"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ExpeditionView } from "@games/rules";
import { playCue } from "../../lib/expedition/audio/cue-bus";
import { MOD_ICON_INK, MOD_ICON_SIZE } from "./phaser/art/mod-icons";
import { REFERENCE_PAGES, buildModPages, buildRulesReference, type ModEntry, type ModGroup, type ReferencePageId } from "../../lib/expedition/rules-reference";

/** A modifier's 9x9 pixel icon, drawn as SVG cells in the canvas palette. */
function PixelIcon({ rows, label, testId }: { rows: readonly string[]; label: string; testId: string }) {
  return (
    <span className="flex h-20 w-32 shrink-0 items-center justify-center rounded" style={{ backgroundColor: "var(--color-surface)" }}>
      <svg role="img" aria-label={label} data-testid={testId} viewBox={`0 0 ${MOD_ICON_SIZE} ${MOD_ICON_SIZE}`} width={54} height={54} shapeRendering="crispEdges">
        {rows.flatMap((row, y) =>
          Array.from(row).flatMap((ch, x) => {
            const ink = MOD_ICON_INK[ch];
            return ink === undefined ? [] : [<rect key={`${x}:${y}`} x={x} y={y} width={1} height={1} fill={ink} />];
          }),
        )}
      </svg>
    </span>
  );
}

function ModEntryCard({ entry }: { entry: ModEntry }) {
  return (
    <li
      data-testid={`expedition-rules-entry-${entry.id}`}
      className="flex items-center gap-[length:var(--space-md)] rounded-md border p-[length:var(--space-sm)]"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg)" }}
    >
      {entry.imageUrl !== null ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.imageUrl}
          alt={entry.name}
          data-testid={`expedition-rules-image-${entry.id}`}
          className="h-20 w-32 shrink-0 rounded object-contain"
          style={{ imageRendering: "pixelated", backgroundColor: "var(--color-surface)" }}
        />
      ) : (
        <PixelIcon rows={entry.icon} label={entry.name} testId={`expedition-rules-icon-${entry.id}`} />
      )}
      <div className="min-w-0">
        <div className="font-semibold">{entry.name}</div>
        <div style={{ color: "var(--color-text-muted)" }}>{entry.text}</div>
      </div>
    </li>
  );
}

function ModGroupView({ group }: { group: ModGroup }) {
  return (
    <section data-testid={`expedition-rules-group-${group.id}`} className="flex flex-col gap-[length:var(--space-xs)]">
      <h3 className="font-semibold" style={{ fontSize: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {group.heading}
      </h3>
      {group.note !== null && <p style={{ color: "var(--color-text-muted)" }}>{group.note}</p>}
      <ul className="flex flex-col gap-[length:var(--space-sm)]">
        {group.entries.map((entry) => (
          <ModEntryCard key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

export interface ExpeditionRulesModalProps {
  open: boolean;
  onClose: () => void;
  game: ExpeditionView | null;
}

export function ExpeditionRulesModal({ open, onClose, game }: ExpeditionRulesModalProps) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const [page, setPage] = useState<ReferencePageId>("rules");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (!open) return null;

  const sections = buildRulesReference(game);
  const modPage = buildModPages().find((p) => p.id === page) ?? null;

  function onTabKey(event: React.KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const target = event.key === "Home" ? 0 : event.key === "End" ? REFERENCE_PAGES.length - 1 : step === 0 ? null : (index + step + REFERENCE_PAGES.length) % REFERENCE_PAGES.length;
    if (target === null) return;
    event.preventDefault();
    const next = REFERENCE_PAGES[target]!;
    setPage(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-[length:var(--space-md)]"
      style={{ background: "rgba(11, 15, 26, 0.7)", zIndex: 30 }}
      onClick={onClose}
    >
      <div
        data-testid="expedition-rules-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Rules"
        className="mx-auto flex max-h-full w-full max-w-2xl flex-col gap-[length:var(--space-md)] rounded-lg border-2 p-[length:var(--space-lg)]"
        style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-[length:var(--space-md)]">
          <h2
            className="font-semibold"
            style={{
              color: "var(--color-text)",
              fontSize: "var(--text-heading)",
              lineHeight: "var(--text-heading--line-height)",
            }}
          >
            Rules
          </h2>
          <div role="tablist" aria-label="Rules pages" className="flex flex-wrap gap-[length:var(--space-xs)]">
            {REFERENCE_PAGES.map((p, i) => (
              <button
                key={p.id}
                ref={(el) => {
                  tabRefs.current[p.id] = el;
                }}
                type="button"
                role="tab"
                id={`expedition-rules-tab-${p.id}`}
                aria-selected={page === p.id}
                aria-controls="expedition-rules-panel"
                tabIndex={page === p.id ? 0 : -1}
                data-testid={`expedition-rules-tab-${p.id}`}
                onClick={() => setPage(p.id)}
                onKeyDown={(event) => onTabKey(event, i)}
                className="cursor-pointer rounded-md px-[length:var(--space-sm)] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                style={{
                  minHeight: "var(--size-touch-min)",
                  color: "var(--color-text)",
                  backgroundColor: page === p.id ? "var(--color-bg)" : "transparent",
                  border: `1px solid ${page === p.id ? "var(--color-accent)" : "transparent"}`,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            data-testid="expedition-rules-close"
            aria-label="Close rules"
            onClick={() => {
              playCue("sfx-ui-click");
              onClose();
            }}
            className="inline-flex cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            style={{
              minHeight: "var(--size-touch-min)",
              minWidth: "var(--size-touch-min)",
              color: "var(--color-text)",
            }}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <div
          role="tabpanel"
          id="expedition-rules-panel"
          aria-labelledby={`expedition-rules-tab-${page}`}
          data-testid={`expedition-rules-page-${page}`}
          className="flex flex-col gap-[length:var(--space-lg)] overflow-y-auto pr-[length:var(--space-xs)]"
          style={{
            color: "var(--color-text)",
            fontSize: "var(--text-body)",
            lineHeight: "var(--text-body--line-height)",
          }}
        >
          {modPage !== null && modPage.groups.map((group) => <ModGroupView key={group.id} group={group} />)}
          {page === "rules" && sections.map((section) => (
            <section
              key={section.id}
              data-testid={`expedition-rules-section-${section.id}`}
              className="flex flex-col gap-[length:var(--space-xs)]"
            >
              <h3
                className="font-semibold"
                style={{ color: "var(--color-text)", fontSize: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.06em" }}
              >
                {section.heading}
              </h3>
              {section.paragraphs.map((text) => (
                <p key={text}>{text}</p>
              ))}
              {section.items.length > 0 && (
                <dl className="flex flex-col gap-[length:var(--space-xs)]">
                  {section.items.map((item) => (
                    <div key={item.label}>
                      <dt className="font-semibold">{item.label}</dt>
                      <dd style={{ color: "var(--color-text-muted)" }}>{item.body}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          ))}
          {page === "rules" && <p
            data-testid="expedition-audio-credits"
            style={{ color: "var(--color-text-muted)", fontSize: "var(--text-label)" }}
          >
            Audio credits. Ambience:{" "}
            <a
              href="https://opengameart.org/content/jc-sounds-nature-ambient-pack-vol-1"
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "underline" }}
            >
              &quot;Nature Ambient Pack Vol 1&quot;
            </a>{" "}
            by JC Sounds,{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
              CC BY 4.0
            </a>
            . Music: Etirwer by Kistol (CC0); effects by Kenney (CC0).
          </p>}
        </div>
      </div>
    </div>
  );
}
