import { describe, expect, it } from "vitest";
import type { ExpeditionCampView, ExpeditionCardIdentityView, ExpeditionView } from "@games/rules";
import { buildFiresidePrompt, buildPrompt, PROMPT_MAX_CHARS, type Prompt, type PromptSeat } from "./build-prompt";
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
    objectiveAssignment: "face-up",
    objectives: [],
    yourHand: [
      { id: "h7", identity: H7 },
      { id: "s9", identity: S9 },
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
    bossTwists: { camp3: null, camp6: null },
    activeBossTwistId: null,
    seats: SEATS.map((s) => ({ seatId: s.seatId, equippedGearIds: [], ready: true, draftPending: false })),
    yourOwnedGearIds: [],
    yourDraftOffer: null,
    yourCapacity: null,
    yourGear: [],
    history: [],
    attempt: {
      attemptNumber: 1,
      bossCancelled: false,
      gearWindow: null,
      preDealPendingSeatIds: [],
      gearUses: [],
      effects: [],
      reveals: [],
      log: [],
      camp: campView,
    },
    ...overrides,
  };
}

function preDeal(pending: string[]): ExpeditionView {
  const base = view(null, { runPhase: "pre-deal", yourGear: [{ gearId: "jam", spent: false, usableNow: true, reason: null }] });
  return { ...base, attempt: { ...base.attempt!, gearWindow: "pre-deal", preDealPendingSeatIds: pending } };
}

function ui(overrides: Partial<LocalUiState> = {}): LocalUiState {
  return { ...initialLocalUi(), ...overrides };
}

const playing = { reconnecting: false, whisperAvailable: false };
const canWhisper = { reconnecting: false, whisperAvailable: true };

const ROWS: [string, ExpeditionView, LocalUiState, typeof playing, Prompt][] = [
  ["reconnecting beats everything", view(camp()), ui(), { reconnecting: true, whisperAvailable: true }, { text: "Reconnecting…", tone: "alert" }],
  ["pre-deal, your gear pending", preDeal(["me", "ana"]), ui(), playing, { text: "Before the deal: use Rain Poncho or skip", tone: "your-move" }],
  ["pre-deal, waiting on a teammate", preDeal(["ana"]), ui(), playing, { text: "Waiting for Ana to decide on pre-deal gear", tone: "waiting" }],
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
  [
    "Thick Fog, before the first card",
    view(camp({ objectiveAssignment: "face-down", currentActorSeatId: "bo", currentTrick: { index: 0, leaderSeatId: "bo", plays: [] } })),
    ui(),
    playing,
    { text: "Thick Fog: objectives were dealt face down", tone: "info" },
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
    view(camp({ yourLegalCardIds: ["h7"], currentTrick: { index: 0, leaderSeatId: "ana", plays: [{ seatId: "ana", card: { id: "h2", identity: H2 } }] } })),
    ui(),
    playing,
    { text: "Your turn: follow ♥ (highlighted cards)", tone: "your-move" },
  ],
  [
    "your turn, cannot follow",
    view(
      camp({
        yourHand: [{ id: "s9", identity: S9 }],
        yourLegalCardIds: ["s9"],
        currentTrick: { index: 0, leaderSeatId: "ana", plays: [{ seatId: "ana", card: { id: "h2", identity: H2 } }] },
      }),
    ),
    ui(),
    playing,
    { text: "Your turn: you have no ♥, play any card", tone: "your-move" },
  ],
  [
    "a teammate is playing",
    view(camp({ currentActorSeatId: "ana", currentTrick: { index: 0, leaderSeatId: "bo", plays: [{ seatId: "bo", card: { id: "c4", identity: C4 } }] } })),
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
    ui({ targeting: { mode: "whisper", cardId: null, targetSeatId: null } }),
    canWhisper,
    { text: "Whisper: choose a card to share", tone: "your-move" },
  ],
  [
    "Whisper, choose a teammate",
    view(camp()),
    ui({ targeting: { mode: "whisper", cardId: "h7", targetSeatId: null } }),
    canWhisper,
    { text: "Whisper 7♥: choose a teammate", tone: "your-move" },
  ],
  [
    "Whisper, ready to confirm",
    view(camp()),
    ui({ targeting: { mode: "whisper", cardId: "h7", targetSeatId: "ana" } }),
    canWhisper,
    { text: "Whisper 7♥ to Ana? Confirm or Cancel", tone: "your-move" },
  ],
  [
    "Spyglass, choose a teammate",
    view(camp()),
    ui({ targeting: { mode: "gear", gearId: "peek", selected: [] } }),
    playing,
    { text: "Spyglass: choose a teammate", tone: "your-move" },
  ],
  [
    "Spyglass, ready to confirm",
    view(camp()),
    ui({ targeting: { mode: "gear", gearId: "peek", selected: ["bo"] } }),
    playing,
    { text: "Use Spyglass on Bo? Confirm or Cancel", tone: "your-move" },
  ],
  [
    "Trained Monkey, second target",
    view(camp()),
    ui({ targeting: { mode: "gear", gearId: "pickpocket", selected: ["ana"] } }),
    playing,
    { text: "Trained Monkey: choose one of your cards", tone: "your-move" },
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
              { seatId: "bo", card: { id: "s9", identity: S9 } },
              { seatId: "me", card: { id: "h7", identity: H7 } },
            ],
          },
        ],
      }),
    ),
    ui(),
    playing,
    { text: "Camp failed: 7♥ was won by Bo", tone: "alert" },
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
    expect(buildPrompt(preDeal(["ana"]), longSeats, ui(), playing).text).toBe("Waiting for Maximilia… to decide on pre-deal gear");
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

  it("opens the run with the first draft", () => {
    expect(at(fireside({ yourDraftOffer: ["peek"] }))).toEqual({ text: "Pick one gear to take with you", tone: "your-move" });
  });

  it("announces a cleared camp with the draft", () => {
    expect(at(fireside({ yourDraftOffer: ["peek"], history: cleared }))).toEqual({ text: "Camp 1 cleared! Pick one gear", tone: "your-move" });
  });

  it("asks you to pack once the pick is made", () => {
    expect(at(fireside({ history: cleared }))).toEqual({ text: "Pack your backpack, then Ready", tone: "your-move" });
  });

  it("announces a failed camp and its supply cost", () => {
    expect(at(fireside({ history: failed }))).toEqual({ text: "Camp 2 failed: -1 supply. Try again: pack, then Ready", tone: "alert" });
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
    const five = { ...base, seats: long.map((s) => ({ seatId: s.seatId, equippedGearIds: [], ready: s.seatId === "me", draftPending: false })) };
    expect(buildFiresidePrompt(five, long, { reconnecting: false })).toEqual({ text: "Waiting for 4 teammates", tone: "waiting" });
  });

  it("says Reconnecting while the socket is down", () => {
    expect(at(fireside(), true)).toEqual({ text: "Reconnecting…", tone: "alert" });
  });
});
