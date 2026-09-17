export interface ClueTokenArtProps {
  size: number;
}

/**
 * D-18/D-20/BOARD-02: a clue token's art — the owner's literal description
 * is the spec. A black disc (`--color-token-disc`) with a centered blue
 * question mark (`--color-suit-blue`, reusing the existing suit-hue token
 * rather than minting a new blue literal). Inline SVG in the `suit-visuals.ts`
 * style (D-20) — never an image asset.
 *
 * `aria-hidden`/`focusable="false"`: the accessible fact this token
 * contributes is the remaining COUNT, rendered as text by `TokenColumn`
 * beside the column — never this art.
 */
export function ClueTokenArt({ size }: ClueTokenArtProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} focusable="false" aria-hidden="true">
      <circle cx="12" cy="12" r="11" style={{ fill: "var(--color-token-disc)" }} />
      <path
        d="M12.4 6.6C10.6 6.6 9.3 7.9 9.3 9.6L10.9 9.5C11 8.6 11.5 8.1 12.3 8.1C13.1 8.1 13.6 8.6 13.6 9.3C13.6 10 13.2 10.4 12.4 10.9C11.4 11.5 10.8 12.2 10.8 13.6V14.1H12.6V13.7C12.6 12.9 12.9 12.5 13.8 11.9C14.7 11.3 15.4 10.6 15.4 9.4C15.4 7.8 14.1 6.6 12.4 6.6Z"
        style={{ fill: "var(--color-suit-blue)" }}
      />
      <path d="M11.5 15.4H13.4V17.3H11.5V15.4Z" style={{ fill: "var(--color-suit-blue)" }} />
    </svg>
  );
}
