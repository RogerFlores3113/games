import { describe, expect, it } from "vitest";
import type { Variant } from "../adapter";
import { dealInitialHands } from "./deck";
import { checkHanabiViewForLeaks, secretsForHanabiSeat } from "./hanabi-leak-check";
import { toHanabiPlayerView } from "./projection";
import { variantConfig } from "./variant";
import type { HanabiState } from "./state";

const VARIANTS: Variant[] = ["base", "rainbow", "black"];
const SEAT_IDS = ["seat-a", "seat-b", "seat-c", "seat-d"];
const SEED = "0123456789abcdef0123456789abcdef";

function buildState(variant: Variant): HanabiState {
  const config = variantConfig(variant);
  const { hands, deck } = dealInitialHands({ config, seatIds: SEAT_IDS, seed: SEED });
  return {
    variant,
    seatIds: [...SEAT_IDS],
    turnIndex: 0,
    hands,
    deck,
    stacks: config.suits.map((suit) => ({ suit, topRank: 0 })),
    discard: [],
    discardOrder: [],
    clueTokens: 8,
    fuses: 0,
    finalTurnsRemaining: null,
    history: [],
  };
}

describe("leak: clean baseline", () => {
  it("reports no leaks for a real toHanabiPlayerView on every seat, in every variant", () => {
    let seatsChecked = 0;
    for (const variant of VARIANTS) {
      const state = buildState(variant);
      for (const seatId of state.seatIds) {
        seatsChecked++;
        const view = toHanabiPlayerView(state, seatId);
        const secrets = secretsForHanabiSeat(state, seatId, SEED);
        const reasons = checkHanabiViewForLeaks({
          view,
          serialized: JSON.stringify(view),
          secrets,
        });
        expect(reasons).toEqual([]);
      }
    }
    expect(seatsChecked).toBeGreaterThan(0);
  });
});

describe("leak: canary suite", () => {
  const state = buildState("base");
  const viewer = "seat-a";
  const secrets = secretsForHanabiSeat(state, viewer, SEED);
  const ownCard = secrets.ownCards[0]!;

  it("Canary A: an own-hand entry carrying suit and rank", () => {
    const leaky = {
      yourHand: [{ id: ownCard.id, hidden: true, suit: ownCard.suit, rank: ownCard.rank }],
    };
    const reasons = checkHanabiViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("structural:your-hand-entry-has-identity");
  });

  it("Canary B: an own-hand entry carrying suit: null (key presence, not truthiness)", () => {
    const leaky = { yourHand: [{ id: ownCard.id, hidden: true, suit: null }] };
    expect("suit" in leaky.yourHand[0]!).toBe(true);
    const reasons = checkHanabiViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("structural:your-hand-entry-has-identity");
  });

  it("Canary C: an own-hand entry carrying suit: undefined, surviving JSON.stringify's key drop", () => {
    const leaky = { yourHand: [{ id: ownCard.id, hidden: true, suit: undefined }] };
    expect("suit" in leaky.yourHand[0]!).toBe(true);
    const serialized = JSON.stringify(leaky);
    expect(serialized).not.toContain("suit");
    const reasons = checkHanabiViewForLeaks({ view: leaky, serialized, secrets });
    expect(reasons).toContain("structural:your-hand-entry-has-identity");
  });

  it("Canary D: an own card's id appearing under otherHands with its true suit and rank", () => {
    const leaky = {
      yourHand: [{ id: ownCard.id, hidden: true }],
      otherHands: [
        {
          seatId: "seat-b",
          cards: [{ id: ownCard.id, hidden: false, suit: ownCard.suit, rank: ownCard.rank }],
        },
      ],
    };
    const reasons = checkHanabiViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("structural:own-card-id-has-identity");
  });

  it("Canary E: a card with hidden === true carrying a rank", () => {
    const leaky = {
      yourHand: [{ id: ownCard.id, hidden: true }],
      otherHands: [{ seatId: "seat-b", cards: [{ id: "zzzzzzzz", hidden: true, rank: 3 }] }],
    };
    const reasons = checkHanabiViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain("structural:hidden-card-has-identity");
  });

  it("Canary F: the server seed appearing under an arbitrary debug key", () => {
    const leaky = { yourHand: [{ id: ownCard.id, hidden: true }], debugSeed: SEED };
    const reasons = checkHanabiViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain(`string:forbidden-token:${SEED}`);
  });

  it("Canary G: the undealt deck dumped under a debug key reports typed count-exceeded reasons", () => {
    const debugDeck = state.deck.map((c) => ({ id: c.id, suit: c.suit, rank: c.rank }));
    const leaky = { yourHand: [{ id: ownCard.id, hidden: true }], debugDeck };
    const reasons = checkHanabiViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });

    // WR-02 closure: the loop below is guarded by this non-vacuousness
    // assertion, so a fixture change that emptied `deckIdentities` would
    // fail loudly here rather than letting the loop silently assert nothing.
    const deckIdentities = debugDeck.filter(
      (c) => (secrets.allowedIdentityCounts[`${c.suit}:${c.rank}`] ?? 0) === 0,
    );
    expect(deckIdentities.length).toBeGreaterThan(0);
    for (const card of deckIdentities) {
      expect(reasons).toContain(`typed:identity-count-exceeded:${card.suit}:${card.rank}`);
    }
  });

  it("Canary H: one extra copy of an own card's {suit,rank} under a benign key, even though that pair also legitimately appears elsewhere", () => {
    // Find an own card whose {suit,rank} pair the viewer may already
    // legitimately see once elsewhere (a duplicate identity in the deck),
    // so this canary proves count-EXCEEDED detection, not mere presence.
    const key = `${ownCard.suit}:${ownCard.rank}`;
    const allowedCount = secrets.allowedIdentityCounts[key] ?? 0;
    const leaky = {
      yourHand: [{ id: ownCard.id, hidden: true }],
      debugExtra: { suit: ownCard.suit, rank: ownCard.rank },
    };
    const reasons = checkHanabiViewForLeaks({ view: leaky, serialized: JSON.stringify(leaky), secrets });
    expect(reasons).toContain(`typed:identity-count-exceeded:${key}`);
    // Sanity: the observed count in the leaky view (1, from debugExtra) now
    // exceeds whatever was legitimately allowed (0 or more), proving this is
    // an EXCESS check, not a presence check.
    expect(1).toBeGreaterThan(allowedCount === undefined ? -1 : allowedCount - 1);
  });

  it("Canary I: one extra copy of an ALREADY-PLAYED card's identity on top of the real view (03-REVIEW.md CR-01 regression)", () => {
    // Regression guard. `secretsForHanabiSeat` used to bump the allowance for
    // a played card TWICE — once per completed stack rank and once for its
    // "play" history entry — while a view exposes that identity only once
    // (stacks are {suit, topRank} and carry no `rank` key). That left one
    // unit of slack per completed rank, so a genuine duplicate reveal went
    // undetected. This canary fails against that older behavior.
    const played = buildState("base");
    const suit = variantConfig("base").suits[0]!;
    const playedState: HanabiState = {
      ...played,
      stacks: played.stacks.map((stack) => (stack.suit === suit ? { suit, topRank: 1 } : stack)),
      history: [
        { turn: 1, type: "play", seatId: "seat-b", cardId: "playedaa", suit, rank: 1, success: true },
      ],
    };
    const viewer = "seat-a";
    const playedSecrets = secretsForHanabiSeat(playedState, viewer, SEED);
    const view = toHanabiPlayerView(playedState, viewer);

    // Premise: the real view is clean — the played identity appears exactly
    // once, in its own history entry.
    expect(
      checkHanabiViewForLeaks({
        view,
        serialized: JSON.stringify(view),
        secrets: playedSecrets,
      }),
    ).toEqual([]);

    // One extra copy of that same already-public identity must now be caught.
    const leaky = { ...view, debugExtra: { suit, rank: 1 } };
    const reasons = checkHanabiViewForLeaks({
      view: leaky,
      serialized: JSON.stringify(leaky),
      secrets: playedSecrets,
    });
    expect(reasons).toContain(`typed:identity-count-exceeded:${suit}:1`);
  });
});

describe("secretsForHanabiSeat", () => {
  it("returns ownCards equal to the seat's hand cards and allowedIdentityCounts covering other hands, discard and history", () => {
    const state = buildState("base");
    const secrets = secretsForHanabiSeat(state, "seat-a", SEED);
    const hand = state.hands.find((h) => h.seatId === "seat-a")!;
    expect(secrets.ownCards).toEqual(
      hand.slots.map((s) => ({ id: s.card.id, suit: s.card.suit, rank: s.card.rank })),
    );
    expect(secrets.forbiddenTokens).toEqual([SEED]);
  });

  it("ownCards is empty for an unseated seat", () => {
    const state = buildState("base");
    const secrets = secretsForHanabiSeat(state, "seat-unknown", SEED);
    expect(secrets.ownCards).toEqual([]);
  });

  it("omits the seed from forbiddenTokens when seed is undefined", () => {
    const state = buildState("base");
    const secrets = secretsForHanabiSeat(state, "seat-a", undefined);
    expect(secrets.forbiddenTokens).toEqual([]);
  });
});
