// WR-06 (review): behavioural D-15 guard for the real identity boundary.
// `OwnHand` (Hand.tsx) is the one component that holds full card objects —
// which on the client can be VISIBLE cards carrying `suit`/`rank` — and it
// builds each `OwnHandCard`'s props. This test renders it server-side and
// requires the markup for a hand of visible cards to be byte-identical to the
// markup for the same cards with their identity removed. Any identity signal
// reaching the DOM (a glyph, a confirmed suit/rank, a label, a data attribute,
// even a colour) makes the two differ and fails the test.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HanabiCardView } from "@games/rules";
import { OwnHand, TeammateHand, type OwnHandProps } from "../components/hanabi/Hand";
import type { OwnHandCardProps } from "../components/hanabi/OwnHandCard";
import type { CardFacts } from "./hanabi-visual-logic";

type Facts = HanabiCardView["facts"];

const UNCLUED: Facts = {
  possibleSuits: ["red", "yellow", "green", "blue", "white"],
  possibleRanks: [1, 2, 3, 4, 5],
  positiveClues: [],
  negativeClues: [],
};

// A card told "not blue" and "not 5": still ambiguous, so no identity may show.
const NEGATIVELY_CLUED: Facts = {
  possibleSuits: ["red", "yellow", "green", "white"],
  possibleRanks: [1, 2, 3, 4],
  positiveClues: [],
  negativeClues: [
    { type: "color", value: "blue" },
    { type: "rank", value: 5 },
  ],
};

const VISIBLE_HAND: HanabiCardView[] = [
  { id: "c1", hidden: false, suit: "red", rank: 3, facts: UNCLUED },
  { id: "c2", hidden: false, suit: "blue", rank: 5, facts: UNCLUED },
  { id: "c3", hidden: false, suit: "white", rank: 1, facts: NEGATIVELY_CLUED },
  { id: "c4", hidden: false, suit: "green", rank: 4, facts: NEGATIVELY_CLUED },
];

function withoutIdentity(cards: HanabiCardView[]): HanabiCardView[] {
  return cards.map((card) => ({ id: card.id, hidden: true, facts: card.facts }));
}

function render(cards: HanabiCardView[]): string {
  const props: OwnHandProps = {
    cards,
    variant: "base",
    roomCode: "ABCD",
    youSeatId: "seat-me",
    connected: true,
    isYourTurn: true,
    turnText: "Your turn",
    selectedCardId: "c2",
    justCluedIds: new Set(["c3"]),
    disabled: false,
    onSelectCard: () => {},
    draggingCardId: null,
    dragOffset: null,
    onCardPointerDown: () => {},
    registerSlot: () => {},
    consumeClickSuppression: () => false,
    hintsVisible: true,
    tileColor: undefined,
  };
  return renderToStaticMarkup(createElement(OwnHand, props));
}

// Compile-time guards (enforced by `tsc -b apps/web`, which includes this
// file): neither own-hand component's props — nor the facts type itself —
// may carry a field that is, or contains, a suit/rank identity.
type HasIdentityKey<T> = "suit" extends keyof T ? true : "rank" extends keyof T ? true : false;
type PropsCarryingIdentity<T> = {
  [K in keyof T]-?: HasIdentityKey<NonNullable<T[K]>> extends true ? K : never;
}[keyof T];
type AssertNever<T extends never> = T;
export type _OwnHandCardPropsHaveNoIdentity = AssertNever<PropsCarryingIdentity<OwnHandCardProps>>;
type AssertFalse<T extends false> = T;
export type _CardFactsHasNoIdentity = AssertFalse<HasIdentityKey<CardFacts>>;
export type _OwnHandCardHasNoCardProp = AssertFalse<"card" extends keyof OwnHandCardProps ? true : false>;

describe("own-hand render guard (D-15, WR-06)", () => {
  it("renders a hand of visible cards identically to the same hand with identity removed", () => {
    const visibleMarkup = render(VISIBLE_HAND);
    expect(visibleMarkup).toBe(render(withoutIdentity(VISIBLE_HAND)));
  });

  it("emits no suit glyph marker, confirmed identity, or identity label for unconfirmed cards", () => {
    const markup = render(VISIBLE_HAND);
    expect(markup).toContain('data-testid="own-hand-slot-1"');
    expect(markup).not.toContain("data-glyph");
    expect(markup).not.toContain("card-identity");
    expect(markup).not.toContain('data-testid="confirmed-suit"');
    expect(markup).not.toContain('data-testid="confirmed-rank"');
  });

  it("the equality check is not vacuous: different facts do render differently", () => {
    // Sanity check that the equality above is not vacuous — the same hand
    // with different FACTS does render differently.
    const narrowed: HanabiCardView[] = VISIBLE_HAND.map((card, i) =>
      i === 0 ? { ...card, facts: { ...card.facts, possibleRanks: [3], positiveClues: [{ type: "rank", value: 3 }] } } : card,
    );
    expect(render(narrowed)).not.toBe(render(VISIBLE_HAND));
    // HINT-01/02/04 relocation: a positive clue now renders a hint overlay
    // on the tile itself (HintIndicator's numeral chip), not the deleted
    // automatic clue-mark pip row's confirmed-rank pip.
    expect(render(narrowed)).toContain("own-hand-slot-1-hints");
    expect(render(narrowed)).toContain('data-testid="hint-numeral"');
  });

  it("renders a note box in the first own-hand slot's note row (D-09/D-10, NOTE-03)", () => {
    expect(render(VISIBLE_HAND)).toContain("note-box-slot-1");
  });

  it("TeammateHand renders no note surface (D-03: notes are own-hand only)", () => {
    const markup = renderToStaticMarkup(
      createElement(TeammateHand, {
        hand: { seatId: "seat-2", cards: VISIBLE_HAND },
        label: "Alex",
        connected: true,
        variant: "base",
        isActive: false,
        isTarget: false,
        previewIds: new Set<string>(),
        justCluedIds: new Set<string>(),
        disabled: false,
        onSelectTarget: () => {},
      }),
    );
    expect(markup).not.toContain("note-box");
  });

  it("every own-hand card-back segment is byte-identical across slots (D-10)", () => {
    const markup = render(VISIBLE_HAND);
    const segments = markup.split('data-testid="own-hand-slot-').slice(1);
    expect(segments.length).toBeGreaterThan(1);
    const cardBackSvg = (segment: string): string => {
      const start = segment.indexOf("<svg");
      const end = segment.indexOf("</svg>", start) + "</svg>".length;
      expect(start).toBeGreaterThan(-1);
      return segment.slice(start, end);
    };
    const svgs = segments.map(cardBackSvg);
    expect(new Set(svgs).size).toBe(1);
  });
});
