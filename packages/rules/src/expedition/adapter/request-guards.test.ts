// Tests for parseRunAction (Phase 11, Plan 03, T-11-07/T-11-08). Every assertion targets the exact-own-key
// discipline mirrored from hanabi/actions.ts's isPlayRequest.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseRunAction, MAX_REQUEST_LIST_LENGTH } from "./request-guards";
import type { RunAction } from "../run/types";

const WELL_FORMED: readonly RunAction[] = [
  { type: "pick-character", characterId: "scout" },
  { type: "vote", choice: "short" },
  { type: "vote", choice: null },
  { type: "equip", itemUids: ["it0", "it3"] },
  { type: "equip", itemUids: [] },
  { type: "buy", stockId: "upgrade:scout.keen-eye" },
  { type: "pick-bundle", bundle: 2 },
  { type: "ready" },
  { type: "use-ability", sourceKey: "it4", targets: ["seat-a", "seat-b"] },
  { type: "skip-window" },
  { type: "whisper", targetSeatId: "seat-a", cardId: "card-1" },
  { type: "pick-objective", objectiveId: "obj-1" },
  { type: "play-card", cardId: "card-2" },
];

describe("parseRunAction: well-formed shapes", () => {
  for (const action of WELL_FORMED) {
    it(`parses ${JSON.stringify(action)}`, () => {
      const parsed = parseRunAction(action);
      expect(parsed).toEqual(action);
      expect(parsed).not.toBe(action);
    });
  }

  it("returns a fresh object for use-ability targets array", () => {
    const request = { type: "use-ability", sourceKey: "scout", targets: ["a", "b"] };
    const parsed = parseRunAction(request) as { type: "use-ability"; sourceKey: string; targets: string[] };
    expect(parsed).not.toBe(request);
    expect(parsed.targets).not.toBe(request.targets);
    expect(parsed.targets).toEqual(["a", "b"]);
  });

  it("parses a vote to the literal action, a string choice or an abstention", () => {
    expect(parseRunAction({ type: "vote", choice: "short" })).toEqual({ type: "vote", choice: "short" });
    expect(parseRunAction({ type: "vote", choice: null })).toEqual({ type: "vote", choice: null });
  });

  it("accepts a target-free use-ability", () => {
    expect(parseRunAction({ type: "use-ability", sourceKey: "x", targets: [] })).toEqual({ type: "use-ability", sourceKey: "x", targets: [] });
  });

  it("returns a fresh array for equip's item uids", () => {
    const request = { type: "equip", itemUids: ["it1"] };
    const parsed = parseRunAction(request) as { type: "equip"; itemUids: string[] };
    expect(parsed.itemUids).not.toBe(request.itemUids);
    expect(parsed.itemUids).toEqual(["it1"]);
  });
});

describe("parseRunAction: rejects malformed input", () => {
  const malformed: unknown[] = [
    null,
    undefined,
    42,
    "ready",
    [],
    {},
    { type: "undo" },
    { type: "play" },
    { type: "play-card", cardId: "card-2", resultingState: {} },
    { type: "ready", seatId: "seat-a" },
    { type: "pick-draft", sourceId: "compass" },
    { type: "pick-bundle" },
    { type: "pick-bundle", bundle: "1" },
    { type: "pick-bundle", bundle: -1 },
    { type: "pick-bundle", bundle: 1.5 },
    { type: "pick-bundle", bundle: 1, extra: true },
    { type: "equip" },
    { type: "equip", itemUids: "it0" },
    { type: "equip", itemUids: [0] },
    { type: "equip", itemUids: Array.from({ length: MAX_REQUEST_LIST_LENGTH + 1 }, (_, i) => `it${i}`) },
    { type: "buy" },
    { type: "buy", stockId: 3 },
    { type: "buy", stockId: "supplies", seatId: "p0" },
    { type: "pick-character" },
    { type: "pick-character", characterId: 42 },
    { type: "pick-character", characterId: "scout", extra: true },
    { type: "vote" },
    { type: "vote", choice: 42 },
    { type: "vote", choice: ["short"] },
    { type: "vote", choice: undefined },
    { type: "vote", choice: "short", extra: true },
    { type: "set-loadout", gearIds: ["a"] },
    { type: "use-gear", gearId: "spyglass", targets: [] },
    { type: "use-ability", sourceKey: "scout" },
    { type: "use-ability", targets: [] },
    { type: "use-ability", sourceId: "scout", targets: [] },
    { type: "use-ability", sourceKey: 42, targets: [] },
    { type: "use-ability", sourceKey: "scout", targets: "not-an-array" },
    { type: "use-ability", sourceKey: "scout", targets: [42] },
    { type: "use-ability", sourceKey: "scout", targets: [], extra: 1 },
    { type: "use-ability", sourceKey: "scout", targets: Array.from({ length: MAX_REQUEST_LIST_LENGTH + 1 }, (_, i) => `t${i}`) },
    { type: "whisper", targetSeatId: "seat-a" },
    { type: "whisper", targetSeatId: 42, cardId: "card-1" },
    { type: "pick-objective", objectiveId: 42 },
    { type: "play-card", cardId: 42 },
    { type: 42 },
    { type: { toString: () => "ready" } },
  ];

  for (const request of malformed) {
    it(`rejects ${JSON.stringify(request)}`, () => {
      expect(parseRunAction(request)).toBeNull();
    });
  }
});

describe("parseRunAction: property — never throws, exact key set on success", () => {
  const EXPECTED_KEYS: Readonly<Record<RunAction["type"], string[]>> = {
    "pick-character": ["type", "characterId"],
    vote: ["type", "choice"],
    equip: ["type", "itemUids"],
    buy: ["type", "stockId"],
    "pick-bundle": ["type", "bundle"],
    ready: ["type"],
    "use-ability": ["type", "sourceKey", "targets"],
    "skip-window": ["type"],
    whisper: ["type", "targetSeatId", "cardId"],
    "pick-objective": ["type", "objectiveId"],
    "play-card": ["type", "cardId"],
  };

  it("holds for arbitrary JSON values", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (payload) => {
        let parsed: RunAction | null = null;
        expect(() => {
          parsed = parseRunAction(payload);
        }).not.toThrow();
        if (parsed !== null) {
          const keys = Object.keys(parsed).sort();
          const expected = EXPECTED_KEYS[(parsed as RunAction).type].slice().sort();
          expect(keys).toEqual(expected);
        }
      }),
    );
  });
});
