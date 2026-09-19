import type { ImageCredit } from "../lib/image-credits";

export type PhotoCreditTheme = "dark" | "light";

export interface PhotoCreditProps {
  credit: ImageCredit;
  theme: PhotoCreditTheme;
}

/**
 * Visible CC BY attribution (Title, Author, Source, License) for a page's
 * background photo, per the licences recorded in
 * `apps/web/public/backgrounds/CREDITS.md`. Both call sites (the landing
 * page and the in-game room view) render this from the single
 * `apps/web/lib/image-credits.ts` data module.
 *
 * `position: fixed` — never part of document flow, so it adds ZERO flow
 * height on the room page (UI-11's 1280x720 fit has no slack) and stays
 * pinned to the viewport corner rather than scrolling away with either
 * page's own overflow content. Bottom-left, opposite the room page's
 * top-right settings gear (`HanabiBoard.tsx`) and clear of the
 * bottom-center hand/controls band.
 *
 * `theme="dark"` (table backdrop) uses a translucent `--color-bg` pill —
 * same documented "hex literal outside @theme is an rgba() derived from a
 * token value" exception already used by `.table-backdrop`'s scrim in
 * `globals.css` — over `--color-text`, which is ~15.6:1 against that pill,
 * comfortably WCAG AA. `theme="light"` (landing backdrop) reuses the
 * opaque `--color-landing-panel` card colour already verified in
 * `globals.css` (`--color-landing-text` on `--color-landing-panel` is
 * 15.79:1).
 */
export function PhotoCredit({ credit, theme }: PhotoCreditProps) {
  const isDark = theme === "dark";
  return (
    <p
      data-testid="photo-credit"
      className="fixed z-10 rounded-full px-[length:var(--space-sm)] py-[length:var(--space-xs)] text-[length:var(--text-label)] leading-none"
      style={{
        bottom: "var(--space-sm)",
        left: "var(--space-sm)",
        backgroundColor: isDark ? "rgba(11, 15, 26, 0.65)" : "var(--color-landing-panel)",
        color: isDark ? "var(--color-text)" : "var(--color-landing-text)",
        border: isDark ? "1px solid var(--color-border)" : "1px solid var(--color-landing-panel-border)",
      }}
    >
      Photo:{" "}
      <a
        href={credit.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        {credit.title}
      </a>{" "}
      by {credit.author},{" "}
      <a
        href={credit.licenseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        {credit.license}
      </a>
    </p>
  );
}
