import { describe, expect, it } from "vitest";
import { applyClueToSlotFacts, initialClueFacts } from "./clue-facts";
import { RANKS, variantConfig } from "./variant";
import type { ClueFacts } from "./state";

describe("clue facts", () => {
  it("initialClueFacts starts with all suits/ranks possible and no clues", () => {
    const config = variantConfig("base");
    const facts = initialClueFacts(config);

    expect(facts.possibleSuits).toEqual(config.suits);
    expect(facts.possibleRanks).toEqual(RANKS);
    expect(facts.positiveClues).toEqual([]);
    expect(facts.negativeClues).toEqual([]);
  });

  it("base variant, positive red color clue narrows to exactly one suit", () => {
    const config = variantConfig("base");
    const facts = initialClueFacts(config);

    const next = applyClueToSlotFacts(config, facts, { type: "color", value: "red" }, true);

    expect(next.possibleSuits).toEqual(["red"]);
    expect(next.positiveClues).toEqual([{ type: "color", value: "red" }]);
    expect(next.negativeClues).toEqual([]);
  });

  it("base variant, negative red color clue removes red and keeps the other four", () => {
    const config = variantConfig("base");
    const facts = initialClueFacts(config);

    const next = applyClueToSlotFacts(config, facts, { type: "color", value: "red" }, false);

    expect(next.possibleSuits).toEqual(["yellow", "green", "blue", "white"]);
    expect(next.negativeClues).toEqual([{ type: "color", value: "red" }]);
    expect(next.positiveClues).toEqual([]);
  });

  it("positive rank clue narrows to exactly the clued rank", () => {
    const config = variantConfig("base");
    const facts = initialClueFacts(config);

    const next = applyClueToSlotFacts(config, facts, { type: "rank", value: 3 }, true);

    expect(next.possibleRanks).toEqual([3]);
  });

  it("negative rank clue removes that rank", () => {
    const config = variantConfig("base");
    const facts = initialClueFacts(config);

    const next = applyClueToSlotFacts(config, facts, { type: "rank", value: 3 }, false);

    expect(next.possibleRanks).toEqual([1, 2, 4, 5]);
  });

  it("rainbow variant, positive red color clue keeps exactly two candidates: red and rainbow", () => {
    const config = variantConfig("rainbow");
    const facts = initialClueFacts(config);

    const next = applyClueToSlotFacts(config, facts, { type: "color", value: "red" }, true);

    expect(next.possibleSuits).toEqual(["red", "rainbow"]);
  });

  it("rainbow variant, negative red color clue rules out rainbow along with red", () => {
    const config = variantConfig("rainbow");
    const facts = initialClueFacts(config);

    const next = applyClueToSlotFacts(config, facts, { type: "color", value: "red" }, false);

    expect(next.possibleSuits).not.toContain("rainbow");
    expect(next.possibleSuits).not.toContain("red");
    expect(next.possibleSuits).toEqual(["yellow", "green", "blue", "white"]);
  });

  it("black variant (owner gap closure, 2026-09-18), positive red color clue removes black from candidates and keeps red/rainbow", () => {
    const config = variantConfig("black");
    const facts = initialClueFacts(config);

    const next = applyClueToSlotFacts(config, facts, { type: "color", value: "red" }, true);

    expect(next.possibleSuits).toEqual(["red", "rainbow"]);
    expect(next.possibleSuits).not.toContain("black");
  });

  it("black variant (owner gap closure, 2026-09-18), negative red color clue rules out rainbow but leaves black in possibleSuits (black is never resolved by a colour clue)", () => {
    const config = variantConfig("black");
    const facts = initialClueFacts(config);

    const next = applyClueToSlotFacts(config, facts, { type: "color", value: "red" }, false);

    expect(next.possibleSuits).not.toContain("rainbow");
    expect(next.possibleSuits).not.toContain("red");
    expect(next.possibleSuits).toContain("black");
    expect(next.possibleSuits).toEqual(["yellow", "green", "blue", "white", "black"]);
  });

  it("applying two clues in sequence intersects: candidate sets only shrink or stay equal", () => {
    const config = variantConfig("base");
    let facts = initialClueFacts(config);

    const afterFirst = applyClueToSlotFacts(config, facts, { type: "color", value: "red" }, false);
    expect(afterFirst.possibleSuits.length).toBeLessThanOrEqual(facts.possibleSuits.length);

    const afterSecond = applyClueToSlotFacts(config, afterFirst, { type: "rank", value: 1 }, false);
    expect(afterSecond.possibleRanks.length).toBeLessThanOrEqual(afterFirst.possibleRanks.length);
    expect(afterSecond.possibleSuits).toEqual(afterFirst.possibleSuits);
  });

  // Phase 06.2's hint display relies on this: hints are a pure function of
  // current facts only because positiveClues never shrinks — the previous
  // array is always a prefix of the next, across any sequence of clues.
  it("positiveClues only ever grows: previous entries remain, in order, as a prefix of the next array, across alternating colour/rank clues and both wasTouched values", () => {
    const config = variantConfig("base");
    let facts = initialClueFacts(config);
    const previousLengths: number[] = [facts.positiveClues.length];
    const clueSequence: Array<{ clue: { type: "color" | "rank"; value: unknown }; wasTouched: boolean }> = [
      { clue: { type: "color", value: "red" }, wasTouched: true },
      { clue: { type: "rank", value: 1 }, wasTouched: false },
      { clue: { type: "rank", value: 3 }, wasTouched: true },
      { clue: { type: "color", value: "blue" }, wasTouched: false },
      { clue: { type: "color", value: "red" }, wasTouched: true },
    ];

    for (const { clue, wasTouched } of clueSequence) {
      const before = facts.positiveClues;
      const next = applyClueToSlotFacts(
        config,
        facts,
        clue as { type: "color" | "rank"; value: never },
        wasTouched,
      );
      // Every entry from before is still present, in the same order, as a
      // prefix of next.
      expect(next.positiveClues.slice(0, before.length)).toEqual(before);
      expect(next.positiveClues.length).toBeGreaterThanOrEqual(before.length);
      previousLengths.push(next.positiveClues.length);
      facts = next;
    }

    // Non-vacuousness: at least one clue in the sequence was a positive
    // (wasTouched: true) clue, so positiveClues actually grew at least once.
    expect(Math.max(...previousLengths)).toBeGreaterThan(0);
  });

  it("applyClueToSlotFacts never mutates the facts argument", () => {
    const config = variantConfig("base");
    const facts = initialClueFacts(config);
    const snapshot: ClueFacts = JSON.parse(JSON.stringify(facts));

    applyClueToSlotFacts(config, facts, { type: "color", value: "red" }, true);

    expect(facts).toEqual(snapshot);
  });
});
