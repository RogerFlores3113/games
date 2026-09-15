import { describe, expect, it } from "vitest";
import {
  mintCardId,
  nextRandom,
  seedToRngState,
  shuffleWithSeed,
} from "./shuffle";

describe("seedToRngState", () => {
  it("is deterministic for the same seed and stream", () => {
    const a = seedToRngState("abc", "deck");
    const b = seedToRngState("abc", "deck");
    expect(a).toEqual(b);
  });

  it("differs across independent streams for the same seed", () => {
    const deck = seedToRngState("abc", "deck");
    const cardIds = seedToRngState("abc", "card-ids");
    expect(deck).not.toEqual(cardIds);
  });
});

describe("nextRandom", () => {
  it("returns an unsigned 32-bit integer and a new state, without mutating the input", () => {
    const state = seedToRngState("seed-1", "stream-1");
    const snapshot = structuredClone(state);
    const { value, state: nextState } = nextRandom(state);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(2 ** 32);
    expect(state).toEqual(snapshot);
    expect(nextState).not.toBe(state);
  });
});

describe("shuffleWithSeed", () => {
  const items = Array.from({ length: 16 }, (_, i) => `item-${i}`);

  it("returns a permutation of the input without mutating it", () => {
    const snapshot = structuredClone(items);
    const shuffled = shuffleWithSeed(items, "seed-a", "deck");
    expect([...shuffled].sort()).toEqual([...items].sort());
    expect(items).toEqual(snapshot);
  });

  it("is identical for the same seed and stream", () => {
    const a = shuffleWithSeed(items, "seed-a", "deck");
    const b = shuffleWithSeed(items, "seed-a", "deck");
    expect(a).toEqual(b);
  });

  it("produces at least two distinct orders across 20 distinct seeds", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const seed = `0123456789abcdef0123456789abcd${i.toString(16)}`;
      orders.add(JSON.stringify(shuffleWithSeed(items, seed, "deck")));
    }
    expect(orders.size).toBeGreaterThanOrEqual(2);
  });
});

describe("mintCardId", () => {
  it("returns an 8-lowercase-letter id not present in taken", () => {
    const rng = seedToRngState("seed-x", "card-ids");
    const taken = new Set<string>();
    const { id, rng: nextRng } = mintCardId(rng, taken);
    expect(id).toMatch(/^[a-z]{8}$/);
    expect(taken.has(id)).toBe(false);
    expect(nextRng).not.toBe(rng);
  });

  it("mints 16 unique ids in sequence", () => {
    let rng = seedToRngState("seed-y", "card-ids");
    const taken = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const result = mintCardId(rng, taken);
      expect(taken.has(result.id)).toBe(false);
      taken.add(result.id);
      rng = result.rng;
    }
    expect(taken.size).toBe(16);
  });
});
