import type { ReactNode } from "react";
import type { Variant } from "@games/rules";
import type { CardFacts } from "../../lib/hanabi-visual-logic";
import { candidateDisplayFor } from "../../lib/hanabi-visual-logic";
import { CandidateStrip } from "./CandidateStrip";

export interface MarksZoneProps {
  facts: CardFacts;
  variant: Variant;
  scale: "own" | "teammate";
  testId: string;
  noteSlot?: ReactNode;
}

const ZONE_WIDTH: Record<"own" | "teammate", number> = {
  own: 88,
  teammate: 64,
};

/**
 * D-07: clue marks (told suits/ranks, candidate pips with ruled-out values
 * struck) render in a fixed 28px zone directly above every card, own hand
 * and teammates alike, and no longer on the card face. This component takes
 * only `facts`/`variant` — never a card object — preserving the D-15
 * own-hand identity boundary at this call site (own-hand-source.test.ts
 * scans this file too, per 06.1-RESEARCH.md Pitfall 3).
 *
 * Deviation from UI-SPEC "note chip on the right edge of the same zone":
 * for `scale === "own"` a second fixed 20px row is stacked BELOW the 28px
 * marks band (rather than beside it) for the note slot 06.1-11 will fill —
 * an 88px-wide card cannot fit legible candidate pips and a readable note
 * side by side. Recorded for the owner's D-31 review.
 */
export function MarksZone({ facts, variant, scale, testId, noteSlot }: MarksZoneProps) {
  const display = candidateDisplayFor(facts, variant);

  return (
    <div className="flex flex-col items-center" style={{ width: ZONE_WIDTH[scale] }}>
      <div
        data-testid={testId}
        className="flex items-center justify-center"
        style={{ height: 28, overflow: "hidden" }}
      >
        <CandidateStrip display={display} scale={scale} />
      </div>
      {scale === "own" && (
        <div
          data-testid={`${testId}-note-row`}
          className="flex w-full items-center justify-end"
          style={{ height: 20 }}
        >
          {noteSlot}
        </div>
      )}
    </div>
  );
}
