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

  it("black variant, positive black color clue narrows to exactly black", () => {
    const config = variantConfig("black");
    const facts = initialClueFacts(config);

    const next = applyClueToSlotFacts(config, facts, { type: "color", value: "black" }, true);

    expect(next.possibleSuits).toEqual(["black"]);
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

  it("applyClueToSlotFacts never mutates the facts argument", () => {
    const config = variantConfig("base");
    const facts = initialClueFacts(config);
    const snapshot: ClueFacts = JSON.parse(JSON.stringify(facts));

    applyClueToSlotFacts(config, facts, { type: "color", value: "red" }, true);

    expect(facts).toEqual(snapshot);
  });
});
