"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { ExpeditionView } from "@games/rules";
import { buildRulesReference } from "../../lib/expedition/rules-reference";

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

  if (!open) return null;

  const sections = buildRulesReference(game);

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
        <div className="flex items-center justify-between gap-[length:var(--space-md)]">
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
          <button
            type="button"
            data-testid="expedition-rules-close"
            aria-label="Close rules"
            onClick={onClose}
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
          className="flex flex-col gap-[length:var(--space-lg)] overflow-y-auto pr-[length:var(--space-xs)]"
          style={{
            color: "var(--color-text)",
            fontSize: "var(--text-body)",
            lineHeight: "var(--text-body--line-height)",
          }}
        >
          {sections.map((section) => (
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
        </div>
      </div>
    </div>
  );
}
