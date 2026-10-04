import { describe, expect, it } from "vitest";
import type { ExpeditionAbilityView, ExpeditionCampView, ExpeditionCardIdentityView, ExpeditionView } from "@games/rules";
import { buildFiresidePrompt, buildPrompt, describeChoice, PROMPT_MAX_CHARS, type Prompt, type PromptSeat } from "./build-prompt";
import { initialLocalUi, type LocalUiState } from "./local-ui";

const H7: ExpeditionCardIdentityView = { kind: "standard", suit: "hearts", rank: 7 };
const H2: ExpeditionCardIdentityView = { kind: "standard", suit: "hearts", rank: 2 };
const S9: ExpeditionCardIdentityView = { kind: "standard", suit: "spades", rank: 9 };
const C4: ExpeditionCardIdentityView = { kind: "standard", suit: "clubs", rank: 4 };

const SEATS: PromptSeat[] = [
  { seatId: "me", displayLabel: "Roger" },
  { seatId: "ana", displayLabel: "Ana" },
  { seatId: "bo", displayLabel: "Bo" },
];

function camp(overrides: Partial<ExpeditionCampView> = {}): ExpeditionCampView {
  return {
    playerCount: 3,
    expeditionLeaderSeatId: "me",
    totalTricks: 1,
    removedCards: [],
    goals: [],
    discards: [],
    objectives: [],
    yourHand: [
      { id: "h7", identity: H7, effectiveRank: null, countsAs: null },
      { id: "s9", identity: S9, effectiveRank: null, countsAs: null },
    ],
    yourLegalCardIds: ["h7", "s9"],
    handSizes: [],
    completedTricks: [],
    currentTrick: { index: 0, leaderSeatId: "me", plays: [] },
    campPhase: "playing",
    currentActorSeatId: "me",
    ...overrides,
  };
}

function view(campView: ExpeditionCampView | null, overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "me",
    runPhase: "camp",
    runStatus: "in_progress",
    campNumber: 1,
    supplies: 3,
    seats: SEATS.map((s) => ({ seatId: s.seatId, characterId: "scout", kit: [], ready: true, draftPending: false, pool: null, usage: [] })),
    yourDraftOffer: null,
    yourAbilities: [],
    history: [],
    attempt:
      campView === null
        ? null
        : {
            attemptNumber: 1,
            window: null,
            pendingSeatIds: [],
            rescue: null,
            effects: [],
            reveals: [],
            log: [],
            yourWhisper: { allowed: true, left: 1 },
            camp: campView,
          },
    ...overrides,
  };
}

const MEDIC: ExpeditionAbilityView = { sourceId: "medic", usableNow: true, reason: null, steps: [] };
const SCOUT: ExpeditionAbilityView = {
  sourceId: "scout",
  usableNow: true,
  reason: null,
  steps: [{ kind: "hand", prompt: "Pick a teammate's hand", choices: ["hand:ana", "hand:bo"] }],
};
const MONKEY: ExpeditionAbilityView = {
  sourceId: "trained-monkey",
  usableNow: true,
  reason: null,
  steps: [
    { kind: "card", prompt: "Pick one of your cards", choices: ["card:h7", "card:s9"] },
    { kind: "player", prompt: "Pick a teammate", choices: ["seat:ana", "seat:bo"] },
  ],
};

const TONIC: ExpeditionAbilityView = {
  sourceId: "botanist",
  usableNow: true,
  reason: null,
  steps: [{ kind: "card-value", prompt: "Pick a card in your hand to recount", choices: ["value:h7:6", "value:h7:8"] }],
};
const LONG_STEP: ExpeditionAbilityView = {
  sourceId: "trained-monkey",
  usableNow: true,
  reason: null,
  steps: [{ kind: "card", prompt: "Pick one of your cards to swap with a teammate now", choices: ["card:h7"] }],
};

function rescue(pending: string[], abilities: ExpeditionAbilityView[] = [MEDIC]): ExpeditionView {
  const base = view(camp({ campPhase: "ended", currentActorSeatId: null }), { yourAbilities: abilities });
  return { ...base, attempt: { ...base.attempt!, window: "rescue", pendingSeatIds: pending, rescue: { failedObjectiveIds: ["o1"] } } };
}

function ui(overrides: Partial<LocalUiState> = {}): LocalUiState {
  return { ...initialLocalUi(), ...overrides };
}

const playing = { reconnecting: false, whisperAvailable: false };
const canWhisper = { reconnecting: false, whisperAvailable: true };

const ROWS: [string, ExpeditionView, LocalUiState, typeof playing, Prompt][] = [
  ["reconnecting beats everything", view(camp()), ui(), { reconnecting: true, whisperAvailable: true }, { text: "Reconnecting…", tone: "alert" }],
  ["rescue, you are pending", rescue(["me"]), ui(), playing, { text: "An objective failed: rescue it with Triage, or pass", tone: "your-move" }],
  ["rescue, waiting on a teammate", rescue(["bo"]), ui(), playing, { text: "An objective failed: waiting for Bo", tone: "waiting" }],
  [
    "objective pick, your pick",
    view(camp({ campPhase: "objective-pick" })),
    ui(),
    playing,
    { text: "Your pick: click an objective on the table", tone: "your-move" },
  ],
  [
    "objective pick, waiting",
    view(camp({ campPhase: "objective-pick", currentActorSeatId: "ana" })),
    ui(),
    playing,
    { text: "Ana is picking an objective", tone: "waiting" },
  ],
  ["your lead with the Whisper open", view(camp()), ui(), canWhisper, { text: "Your lead: play any card, or Whisper first", tone: "your-move" }],
  ["your lead, Whisper spent", view(camp()), ui(), playing, { text: "Your lead: play any card", tone: "your-move" }],
  [
    "your lead, only some cards legal",
    view(camp({ yourLegalCardIds: ["s9"] })),
    ui(),
    playing,
    { text: "Your lead: play a highlighted card", tone: "your-move" },
  ],
  [
    "your turn, must follow",
    view(camp({ yourLegalCardIds: ["h7"], currentTrick: { index: 0, leaderSeatId: "ana", plays: [{ seatId: "ana", card: { id: "h2", identity: H2 }, effectiveRank: null }] } })),
    ui(),
    playing,
    { text: "Your turn: follow ♥ (highlighted cards)", tone: "your-move" },
  ],
  [
    "your turn, cannot follow",
    view(
      camp({
        yourHand: [{ id: "s9", identity: S9, effectiveRank: null, countsAs: null }],
        yourLegalCardIds: ["s9"],
        currentTrick: { index: 0, leaderSeatId: "ana", plays: [{ seatId: "ana", card: { id: "h2", identity: H2 }, effectiveRank: null }] },
      }),
    ),
    ui(),
    playing,
    { text: "Your turn: you have no ♥, play any card", tone: "your-move" },
  ],
  [
    "a teammate is playing",
    view(camp({ currentActorSeatId: "ana", currentTrick: { index: 0, leaderSeatId: "bo", plays: [{ seatId: "bo", card: { id: "c4", identity: C4 }, effectiveRank: null }] } })),
    ui(),
    playing,
    { text: "Ana is playing", tone: "waiting" },
  ],
  [
    "a teammate leads while your Whisper is open",
    view(camp({ currentActorSeatId: "ana", currentTrick: { index: 1, leaderSeatId: "ana", plays: [] } })),
    ui(),
    canWhisper,
    { text: "Ana leads next. You can Whisper now", tone: "waiting" },
  ],
  [
    "Whisper, choose a card",
    view(camp()),
    ui({ targeting: { mode: "whisper", selected: [] } }),
    canWhisper,
    { text: "Whisper: choose a card to share", tone: "your-move" },
  ],
  [
    "Whisper, choose a teammate",
    view(camp()),
    ui({ targeting: { mode: "whisper", selected: ["card:h7"] } }),
    canWhisper,
    { text: "Whisper 7♥: choose a teammate", tone: "your-move" },
  ],
  [
    "Whisper, ready to confirm",
    view(camp()),
    ui({ targeting: { mode: "whisper", selected: ["card:h7", "seat:ana"] } }),
    canWhisper,
    { text: "Whisper 7♥ to Ana? Confirm or Cancel", tone: "your-move" },
  ],
  [
    "ability, first step",
    view(camp(), { yourAbilities: [SCOUT] }),
    ui({ targeting: { mode: "ability", sourceId: "scout", selected: [], valueCardId: null } }),
    playing,
    { text: "Spyglass: Pick a teammate's hand", tone: "your-move" },
  ],
  [
    "ability with no steps, ready to confirm",
    view(camp(), { yourAbilities: [{ sourceId: "bait", usableNow: true, reason: null, steps: [] }] }),
    ui({ targeting: { mode: "ability", sourceId: "bait", selected: [], valueCardId: null } }),
    playing,
    { text: "Use Bait? Confirm or Cancel", tone: "your-move" },
  ],
  [
    "Trained Monkey, second step",
    view(camp(), { yourAbilities: [MONKEY] }),
    ui({ targeting: { mode: "ability", sourceId: "trained-monkey", selected: ["card:h7"], valueCardId: null } }),
    playing,
    { text: "Trained Monkey: Pick a teammate", tone: "your-move" },
  ],
  [
    "Trained Monkey, ready to confirm",
    view(camp(), { yourAbilities: [MONKEY] }),
    ui({ targeting: { mode: "ability", sourceId: "trained-monkey", selected: ["card:h7", "seat:bo"], valueCardId: null } }),
    playing,
    { text: "Use Trained Monkey on your 7♥ and Bo? Confirm or Cancel", tone: "your-move" },
  ],
  [
    "Herb Tonic, a held card waits for its rank",
    view(camp(), { yourAbilities: [TONIC] }),
    ui({ targeting: { mode: "ability", sourceId: "botanist", selected: [], valueCardId: "h7" } }),
    playing,
    { text: "Herb Tonic: pick the rank 7♥ counts as", tone: "your-move" },
  ],
  [
    "a step prompt too long for the line drops the source name",
    view(camp(), { yourAbilities: [LONG_STEP] }),
    ui({ targeting: { mode: "ability", sourceId: "trained-monkey", selected: [], valueCardId: null } }),
    playing,
    { text: "Pick one of your cards to swap with a teammate now", tone: "your-move" },
  ],
  [
    "your turn to follow with Bait usable",
    view(
      camp({ currentTrick: { index: 0, leaderSeatId: "ana", plays: [{ seatId: "ana", card: { id: "h2", identity: H2 }, effectiveRank: null }] } }),
      { yourAbilities: [{ sourceId: "bait", usableNow: true, reason: null, steps: [] }] },
    ),
    ui(),
    playing,
    { text: "Your turn: play any card, or use Bait first", tone: "your-move" },
  ],
  [
    "your turn to follow with Bait usable, too long to keep the hint",
    view(
      camp({ yourLegalCardIds: ["h7"], currentTrick: { index: 0, leaderSeatId: "ana", plays: [{ seatId: "ana", card: { id: "h2", identity: H2 }, effectiveRank: null }] } }),
      { yourAbilities: [{ sourceId: "bait", usableNow: true, reason: null, steps: [] }] },
    ),
    ui(),
    playing,
    { text: "Your turn: play, or use Bait first", tone: "your-move" },
  ],
  [
    "camp cleared",
    view(camp({ campPhase: "ended", currentActorSeatId: null, objectives: [{ id: "o1", kind: "win-card", target: H7, ownerSeatId: "me", status: "done" }] })),
    ui(),
    playing,
    { text: "Camp cleared!", tone: "info" },
  ],
  [
    "camp failed on a card won by the wrong player",
    view(
      camp({
        campPhase: "ended",
        currentActorSeatId: null,
        objectives: [{ id: "o1", kind: "win-card", target: H7, ownerSeatId: "me", status: "failed" }],
        completedTricks: [
          {
            index: 0,
            leaderSeatId: "bo",
            winnerSeatId: "bo",
            plays: [
              { seatId: "bo", card: { id: "s9", identity: S9 }, effectiveRank: null, countsAs: null, burned: false },
              { seatId: "me", card: { id: "h7", identity: H7 }, effectiveRank: null, countsAs: null, burned: false },
            ],
          },
        ],
      }),
    ),
    ui(),
    playing,
    { text: "Camp failed: 7♥ was won by Bo", tone: "alert" },
  ],
  [
    "camp failed on a broken guard with every objective done",
    view(
      camp({
        campPhase: "ended",
        currentActorSeatId: null,
        objectives: [{ id: "o1", kind: "win-card", target: H7, ownerSeatId: "me", status: "done" }],
        goals: [{ id: "camouflage:me", status: "failed" }],
      }),
    ),
    ui(),
    playing,
    { text: "Camp failed: Camouflage broke", tone: "alert" },
  ],
  [
    "a burned card does not count as winning its objective",
    view(
      camp({
        campPhase: "ended",
        currentActorSeatId: null,
        objectives: [{ id: "o1", kind: "win-card", target: H7, ownerSeatId: "me", status: "failed" }],
        completedTricks: [
          {
            index: 0,
            leaderSeatId: "bo",
            winnerSeatId: "bo",
            plays: [
              { seatId: "bo", card: { id: "s9", identity: S9 }, effectiveRank: null, countsAs: null, burned: false },
              { seatId: "me", card: { id: "h7", identity: H7 }, effectiveRank: null, countsAs: null, burned: true },
            ],
          },
        ],
      }),
    ),
    ui(),
    playing,
    { text: "Camp failed: 7♥ objective broke", tone: "alert" },
  ],
];

describe("buildPrompt", () => {
  it.each(ROWS)("%s", (_name, v, u, opts, expected) => {
    expect(buildPrompt(v, SEATS, u, opts)).toEqual(expected);
  });

  it("keeps every situation within the prompt zone even with very long names", () => {
    const longSeats = SEATS.map((s) => ({ ...s, displayLabel: "Maximiliano the Magnificent" }));
    const tooLong = ROWS.map(([name, v, u, opts]) => [name, buildPrompt(v, longSeats, u, opts).text] as const).filter(
      ([, text]) => text.length > PROMPT_MAX_CHARS,
    );
    expect(tooLong).toEqual([]);
    expect(buildPrompt(rescue(["ana"]), longSeats, ui(), playing).text).toBe("An objective failed: waiting for Maximilia…");
  });
});

describe("describeChoice", () => {
  const nameOf = (id: string | null): string => SEATS.find((s) => s.seatId === id)?.displayLabel ?? "Someone";
  const v = view(
    camp({
      objectives: [{ id: "o1", kind: "win-card", target: S9, ownerSeatId: "ana", status: "failed" }, { id: "o2", kind: "no-tricks", ownerSeatId: null, status: "pending" }],
      currentTrick: { index: 3, leaderSeatId: "ana", plays: [{ seatId: "ana", card: { id: "c4", identity: C4 }, effectiveRank: null }] },
    }),
  );
  const withLog: ExpeditionView = {
    ...v,
    attempt: { ...v.attempt!, log: [{ event: "whisper", actorSeatId: "ana", subjectSeatIds: ["me"], sourceId: null, private: false }] },
  };

  it.each([
    ["seat:bo", "Bo"],
    ["seat:me", "yourself"],
    ["hand:ana", "Ana's hand"],
    ["card:h7", "your 7♥"],
    ["card:c4", "the 4♣"],
    ["objective:o1", "objective 9♠"],
    ["objective:o2", "the no-tricks objective"],
    ["trick:2", "trick 3"],
    ["value:h7:9", "7♥ as 9"],
    ["value:h7:11", "7♥ as J"],
    ["board", "this trick"],
    ["supplies", "the supplies"],
  ])("%s reads as %s", (choice, expected) => {
    expect(describeChoice(v, choice, nameOf)).toBe(expected);
  });

  it("names a whisper by who sent it to whom, counting only whispers", () => {
    expect(describeChoice(withLog, "whisper:0", nameOf)).toBe("the whisper Ana to you");
    expect(describeChoice(withLog, "whisper:1", nameOf)).toBe("a whisper");
  });
});

describe("buildFiresidePrompt", () => {
  function fireside(overrides: Partial<ExpeditionView> = {}, ready: Record<string, boolean> = {}): ExpeditionView {
    const base = view(null, { runPhase: "fireside", attempt: null, campNumber: 2, ...overrides });
    return { ...base, seats: base.seats.map((s) => ({ ...s, ready: ready[s.seatId] ?? false })) };
  }
  const cleared = [{ campNumber: 1, attemptNumber: 1, status: "succeeded" as const, suppliesSpent: 0 }];
  const failed = [{ campNumber: 2, attemptNumber: 1, status: "failed" as const, suppliesSpent: 1 }];
  const at = (v: ExpeditionView, reconnecting = false): Prompt => buildFiresidePrompt(v, SEATS, { reconnecting });

  const muster = (characterId: string | null, ready: Record<string, boolean> = {}): ExpeditionView => {
    const base = fireside({ runPhase: "muster" }, ready);
    return { ...base, seats: base.seats.map((s) => (s.seatId === "me" ? { ...s, characterId } : s)) };
  };

  it("asks you to pick a character at muster", () => {
    expect(at(muster(null))).toEqual({ text: "Choose your explorer", tone: "your-move" });
  });

  it("opens the run with the first draft", () => {
    expect(at(fireside({ yourDraftOffer: ["trained-monkey"] }))).toEqual({ text: "Take one to bring along", tone: "your-move" });
  });

  it("announces a cleared camp with the draft", () => {
    expect(at(fireside({ yourDraftOffer: ["trained-monkey"], history: cleared }))).toEqual({ text: "Camp 1 cleared! Take one", tone: "your-move" });
  });

  it("tells you to set out once the pick is made", () => {
    expect(at(fireside({ history: cleared }))).toEqual({ text: "The Scout, set out when Ready", tone: "your-move" });
  });

  it("announces a failed camp and its supply cost", () => {
    expect(at(fireside({ history: failed }))).toEqual({ text: "Camp 2 failed: -1 supply. Try again: Ready", tone: "alert" });
  });

  it("names who the crew is waiting for once you are ready", () => {
    expect(at(fireside({}, { me: true }))).toEqual({ text: "Waiting for Ana and Bo", tone: "waiting" });
    expect(at(fireside({}, { me: true, ana: true }))).toEqual({ text: "Waiting for Bo", tone: "waiting" });
  });

  it("counts teammates when their names overflow the line", () => {
    const long = [
      { seatId: "me", displayLabel: "Roger" },
      { seatId: "ana", displayLabel: "Anastasia" },
      { seatId: "bo", displayLabel: "Bonaventure" },
      { seatId: "cy", displayLabel: "Cyprianus" },
      { seatId: "di", displayLabel: "Dionysia" },
    ];
    const base = fireside({}, { me: true });
    const five = { ...base, seats: long.map((s) => ({ seatId: s.seatId, characterId: "scout", kit: [], ready: s.seatId === "me", draftPending: false, pool: null, usage: [] })) };
    expect(buildFiresidePrompt(five, long, { reconnecting: false })).toEqual({ text: "Waiting for 4 teammates", tone: "waiting" });
  });

  it("says Reconnecting while the socket is down", () => {
    expect(at(fireside(), true)).toEqual({ text: "Reconnecting…", tone: "alert" });
  });
});
