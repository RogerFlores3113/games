import { describe, expect, it } from "vitest";
import { foreheadCardGame } from "./forehead-card";
import { checkSeatViewForLeaks, secretsForSeat } from "./forehead-card-leak-check";

const seatIds = ["seat-a", "seat-b", "seat-c"] as const;
const seed = "0123456789abcdef0123456789abcdef";

function initial() {
  return foreheadCardGame.createInitialState({ seatIds: [...seatIds], variant: "base", seed });
}

describe("checkSeatViewForLeaks: clean baseline", () => {
  it("reports no leaks for a real toPlayerView on every seat", () => {
    const state = initial();
    for (const seatId of seatIds) {
      const view = foreheadCardGame.toPlayerView(state, seatId);
      const secrets = secretsForSeat(state, seatId, seed);
      const reasons = checkSeatViewForLeaks({ view, serialized: JSON.stringify(view), secrets });
      expect(reasons).toEqual([]);
    }
  });
});

describe("checkSeatViewForLeaks: D-13 canary suite", () => {
  const state = initial();
  const viewer = "seat-a";
  const secrets = secretsForSeat(state, viewer, seed);
  const ownValue = secrets.ownCard!.value;
  const ownId = secrets.ownCard!.id;

  it("Canary A: own value present in yourCard", () => {
    const leaky = { yourCard: { id: ownId, hidden: true, value: ownValue } };
    const reasons = checkSeatViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("structural:yourCard-has-value");
    expect(reasons).toContain("string:own-value");
  });

  it("Canary B: yourCard.value === null", () => {
    const leaky = { yourCard: { id: ownId, hidden: true, value: null } };
    const reasons = checkSeatViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("structural:yourCard-has-value");
  });

  it("Canary C: yourCard.value === undefined (structural, not string-based)", () => {
    const leaky = { yourCard: { id: ownId, hidden: true, value: undefined } };
    expect("value" in leaky.yourCard).toBe(true);
    const serialized = JSON.stringify(leaky);
    expect(serialized).not.toContain("value");
    const reasons = checkSeatViewForLeaks({ view: leaky, serialized, secrets });
    expect(reasons).toContain("structural:yourCard-has-value");
  });

  it("Canary D: own card moved into otherCards with a clean yourCard", () => {
    const leaky = {
      yourCard: { id: ownId, hidden: true },
      otherCards: [{ seatId: viewer, card: { id: ownId, hidden: false, value: ownValue } }],
    };
    const reasons = checkSeatViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("structural:own-card-id-has-value");
    expect(reasons).toContain("string:own-value");
  });

  it("Canary E: a hidden card anywhere carrying a value key", () => {
    const leaky = {
      yourCard: { id: ownId, hidden: true },
      otherCards: [{ seatId: "seat-b", card: { id: "zzzzzzzz", hidden: true, value: "x" } }],
    };
    const reasons = checkSeatViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("structural:hidden-card-has-value");
  });

  it("Canary F: deck leaked under an arbitrary key", () => {
    const leaky = { yourCard: { id: ownId, hidden: true }, debugDeck: [...state.deck] };
    const reasons = checkSeatViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    for (const token of secrets.forbiddenTokens) {
      if (state.deck.includes(token as (typeof state.deck)[number])) {
        expect(reasons).toContain(`string:forbidden-token:${token}`);
      }
    }
  });

  it("Canary G: seed leaked under an arbitrary key", () => {
    const leaky = { yourCard: { id: ownId, hidden: true }, debugSeed: seed };
    const reasons = checkSeatViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain(`string:forbidden-token:${seed}`);
  });

  it("Canary H: own value embedded in an unrelated string field", () => {
    const leaky = { yourCard: { id: ownId, hidden: true }, note: `maybe ${ownValue}` };
    const reasons = checkSeatViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toEqual(["string:own-value"]);
  });
});

describe("secretsForSeat", () => {
  it("returns ownCard equal to the seat's hand card and forbiddenTokens = deck + seed", () => {
    const state = initial();
    const secrets = secretsForSeat(state, "seat-a", seed);
    const hand = state.hands.find((h) => h.seatId === "seat-a")!;
    expect(secrets.ownCard).toEqual({ id: hand.card.id, value: hand.card.value });
    expect(secrets.forbiddenTokens).toEqual([...state.deck, seed]);
  });

  it("ownCard is null for an unknown seat", () => {
    const state = initial();
    const secrets = secretsForSeat(state, "seat-unknown", seed);
    expect(secrets.ownCard).toBeNull();
  });

  it("omits the seed from forbiddenTokens when seed is undefined", () => {
    const state = initial();
    const secrets = secretsForSeat(state, "seat-a", undefined);
    expect(secrets.forbiddenTokens).toEqual([...state.deck]);
  });
});
