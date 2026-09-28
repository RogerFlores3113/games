// Card pack catalogue contract (SCENE-08, spec 7.3). Iterates
// Object.entries(CARD_PACK_REGISTRY) ONLY — never a hand list — so a third
// pack registered later is covered automatically with zero edits here.

import { describe, expect, it } from "vitest";
import { CARD_PACK_REGISTRY } from "./registry";
import { allCardIdentities, cardBackTextureKey, cardTextureKey } from "./card-pack-def";
import type { CardSize } from "./card-pack-def";
import { CARD_PACK_IDS, CARD_PACK_LABELS } from "../../../../lib/expedition/card-pack-ids";
import { CARD_H, CARD_W, MINI_H, MINI_W } from "../layout";
import { PALETTE } from "../palette";
import { cardLabel, rankLabel } from "../../../../lib/expedition/expedition-ids";
import type { ExpeditionCardIdentityView } from "@games/rules";

interface RecordedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function makeMockCtx() {
  const fillRectCalls: RecordedRect[] = [];
  const drawImageCalls: unknown[][] = [];
  const clearRectCalls: RecordedRect[] = [];
  const fillStyleHistory: string[] = [];
  let calledFillText = false;
  let calledStrokeText = false;
  let currentFillStyle = "";

  const ctx = {
    get fillStyle(): string {
      return currentFillStyle;
    },
    set fillStyle(value: string) {
      currentFillStyle = value;
      fillStyleHistory.push(value);
    },
    fillRect(x: number, y: number, w: number, h: number) {
      fillRectCalls.push({ x, y, w, h });
    },
    drawImage(...args: unknown[]) {
      drawImageCalls.push(args);
    },
    clearRect(x: number, y: number, w: number, h: number) {
      clearRectCalls.push({ x, y, w, h });
    },
    fillText() {
      calledFillText = true;
    },
    strokeText() {
      calledStrokeText = true;
    },
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    fillRectCalls,
    drawImageCalls,
    clearRectCalls,
    fillStyleHistory,
    get calledFillText() {
      return calledFillText;
    },
    get calledStrokeText() {
      return calledStrokeText;
    },
  };
}

interface MockGlyphCall {
  text: string;
  x: number;
  y: number;
  font: "label" | "sign";
  color: string;
}

function makeMockGlyphs() {
  const calls: MockGlyphCall[] = [];
  return {
    calls,
    drawText: (
      _ctx: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      font: "label" | "sign",
      color: string,
    ) => {
      calls.push({ text, x, y, font, color });
    },
  };
}

function dimsFor(size: CardSize): { w: number; h: number } {
  return size === "full" ? { w: CARD_W, h: CARD_H } : { w: MINI_W, h: MINI_H };
}

function assertIntegerAndInBounds(rect: RecordedRect, w: number, h: number, label: string): void {
  expect(Number.isInteger(rect.x), `${label} x`).toBe(true);
  expect(Number.isInteger(rect.y), `${label} y`).toBe(true);
  expect(Number.isInteger(rect.w), `${label} w`).toBe(true);
  expect(Number.isInteger(rect.h), `${label} h`).toBe(true);
  expect(rect.x >= 0 && rect.y >= 0, `${label} non-negative origin`).toBe(true);
  expect(rect.x + rect.w <= w && rect.y + rect.h <= h, `${label} within bounds`).toBe(true);
}

describe("CARD_PACK_REGISTRY shape (SCENE-08)", () => {
  it("keys match CARD_PACK_IDS sorted, def.id equals its key, names equal CARD_PACK_LABELS", () => {
    expect(Object.keys(CARD_PACK_REGISTRY).sort()).toEqual([...CARD_PACK_IDS].sort());
    for (const [key, def] of Object.entries(CARD_PACK_REGISTRY)) {
      expect(def.id).toBe(key);
      expect(def.name).toBe(CARD_PACK_LABELS[def.id]);
    }
  });
});

describe("allCardIdentities", () => {
  it("has 54 unique cardLabel values", () => {
    const labels = allCardIdentities().map(cardLabel);
    expect(labels.length).toBe(54);
    expect(new Set(labels).size).toBe(54);
  });
});

describe("cardTextureKey / cardBackTextureKey", () => {
  it("format as documented", () => {
    expect(cardTextureKey("big-index", "Q♥", "full")).toBe("card:big-index:Q♥:full");
    expect(cardBackTextureKey("classic", "mini")).toBe("card-back:classic:mini");
  });
});

for (const [id, def] of Object.entries(CARD_PACK_REGISTRY)) {
  describe(`card pack contract: ${id}`, () => {
    for (const size of ["full", "mini"] as const) {
      it(`${size}: face() never draws text directly, and every rect is integer and in-bounds`, () => {
        const { w, h } = dimsFor(size);
        for (const identity of allCardIdentities()) {
          const { ctx, fillRectCalls, drawImageCalls, clearRectCalls, calledFillText, calledStrokeText } =
            makeMockCtx();
          const glyphs = makeMockGlyphs();
          def.face(ctx, identity, size, glyphs);
          expect(calledFillText, `${id}/${size}/${cardLabel(identity)} fillText`).toBe(false);
          expect(calledStrokeText, `${id}/${size}/${cardLabel(identity)} strokeText`).toBe(false);
          const label = `${id}/${size}/${cardLabel(identity)}`;
          for (const rect of fillRectCalls) assertIntegerAndInBounds(rect, w, h, `${label} fillRect`);
          for (const rect of clearRectCalls) assertIntegerAndInBounds(rect, w, h, `${label} clearRect`);
          for (const args of drawImageCalls) {
            for (const arg of args) {
              if (typeof arg === "number") {
                expect(Number.isInteger(arg), `${label} drawImage arg`).toBe(true);
              }
            }
          }
        }
      });

      it(`${size}: back() never draws text directly, and every rect is integer and in-bounds`, () => {
        const { w, h } = dimsFor(size);
        const { ctx, fillRectCalls, calledFillText, calledStrokeText } = makeMockCtx();
        def.back(ctx, size);
        expect(calledFillText).toBe(false);
        expect(calledStrokeText).toBe(false);
        for (const rect of fillRectCalls) assertIntegerAndInBounds(rect, w, h, `${id}/${size}/back fillRect`);
      });
    }

    it("full-size faces draw Sun/Moon jokers with PALETTE.sun / PALETTE.moon", () => {
      const glyphs = makeMockGlyphs();
      for (const joker of ["sun", "moon"] as const) {
        const { ctx, fillStyleHistory } = makeMockCtx();
        const identity: ExpeditionCardIdentityView = { kind: "joker", joker };
        def.face(ctx, identity, "full", glyphs);
        const expected = joker === "sun" ? PALETTE.sun : PALETTE.moon;
        expect(fillStyleHistory, `${id} ${joker} fillStyle history`).toContain(expected);
      }
    });
  });
}

describe("big-index pack", () => {
  const def = CARD_PACK_REGISTRY["big-index"];

  it("uses four distinct pip colours across the four standard suits", () => {
    const glyphs = makeMockGlyphs();
    const seen = new Set<string>();
    for (const suit of ["spades", "hearts", "diamonds", "clubs"] as const) {
      const { ctx, fillStyleHistory } = makeMockCtx();
      const identity: ExpeditionCardIdentityView = { kind: "standard", suit, rank: 5 };
      def.face(ctx, identity, "full", glyphs);
      expect(fillStyleHistory).toContain(PALETTE.suitBigIndex[suit]);
      seen.add(PALETTE.suitBigIndex[suit]);
    }
    expect(seen.size).toBe(4);
  });

  it("draws the full-size rank via glyphs.drawText with font 'sign'", () => {
    const { ctx } = makeMockCtx();
    const glyphs = makeMockGlyphs();
    const identity: ExpeditionCardIdentityView = { kind: "standard", suit: "hearts", rank: 12 };
    def.face(ctx, identity, "full", glyphs);
    expect(glyphs.calls.some((c) => c.font === "sign" && c.text === rankLabel(12))).toBe(true);
  });
});

describe("classic pack", () => {
  const def = CARD_PACK_REGISTRY.classic;

  it("uses exactly two pip colours: black for spades/clubs, red for hearts/diamonds", () => {
    const glyphs = makeMockGlyphs();
    const expectations: ReadonlyArray<["spades" | "hearts" | "diamonds" | "clubs", string]> = [
      ["spades", PALETTE.suitClassic.black],
      ["clubs", PALETTE.suitClassic.black],
      ["hearts", PALETTE.suitClassic.red],
      ["diamonds", PALETTE.suitClassic.red],
    ];
    for (const [suit, expected] of expectations) {
      const { ctx, fillStyleHistory } = makeMockCtx();
      const identity: ExpeditionCardIdentityView = { kind: "standard", suit, rank: 5 };
      def.face(ctx, identity, "full", glyphs);
      expect(fillStyleHistory, `classic ${suit}`).toContain(expected);
    }
  });

  it("draws the full-size rank via glyphs.drawText with font 'label'", () => {
    const { ctx } = makeMockCtx();
    const glyphs = makeMockGlyphs();
    const identity: ExpeditionCardIdentityView = { kind: "standard", suit: "spades", rank: 14 };
    def.face(ctx, identity, "full", glyphs);
    expect(glyphs.calls.some((c) => c.font === "label" && c.text === rankLabel(14))).toBe(true);
  });
});
