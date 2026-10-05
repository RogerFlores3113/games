import { describe, expect, it } from "vitest";
import type { ExpeditionAbilityView, ExpeditionAttemptView, ExpeditionCampPreviewView, ExpeditionCampView, ExpeditionCardIdentityView, ExpeditionStageView, ExpeditionView } from "@games/rules";
import { buildPrompt, buildTrailPrompt, describeChoice, PROMPT_MAX_CHARS, type Prompt, type PromptSeat } from "./build-prompt";
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
    discards: [], voidedTricks: [],
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

const PREVIEW: ExpeditionCampPreviewView = { index: 1, location: "jungle", weather: "fair", pairing: null, event: null, slotKinds: [], bossId: null, shop: false, survey: null };

function withAttempt(v: ExpeditionView, patch: Partial<ExpeditionAttemptView>): ExpeditionView {
  if (v.stage.tag !== "camp") throw new Error("fixture is not in a camp");
  return { ...v, stage: { ...v.stage, attempt: { ...v.stage.attempt, ...patch } } };
}

function view(campView: ExpeditionCampView, overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "me",
    runStatus: "in_progress",
    length: "standard",
    campCount: 6,
    purse: 0,
    supplies: { count: 3, max: 5 },
    plan: [],
    seats: SEATS.map((s) => ({ seatId: s.seatId, characterId: "explorer", upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, usage: [] })),
    kicked: [],
    yourAbilities: [],
    history: [],
    lastVote: null,
    stage: {
      tag: "camp",
      camp: PREVIEW,
      mods: [],
      attempt: {
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
    },
    ...overrides,
  };
}

const FREE_SPIRIT: ExpeditionAbilityView = { sourceKey: "jd.free-spirit", usableNow: true, reason: null, steps: [] };
const GLANCE: ExpeditionAbilityView = {
  sourceKey: "explorer",
  usableNow: true,
  reason: null,
  steps: [{ kind: "hand", prompt: "Pick a teammate's hand", choices: ["hand:ana", "hand:bo"] }],
};
const MONKEY: ExpeditionAbilityView = {
  sourceKey: "trained-monkey",
  usableNow: true,
  reason: null,
  steps: [
    { kind: "card", prompt: "Pick one of your cards", choices: ["card:h7", "card:s9"] },
    { kind: "player", prompt: "Pick a teammate", choices: ["seat:ana", "seat:bo"] },
  ],
};

const COMPASS: ExpeditionAbilityView = {
  sourceKey: "explorer",
  usableNow: true,
  reason: null,
  steps: [{ kind: "card-value", prompt: "Pick a card in your hand to recount", choices: ["value:h7:6", "value:h7:8"] }],
};
const LONG_STEP: ExpeditionAbilityView = {
  sourceKey: "trained-monkey",
  usableNow: true,
  reason: null,
  steps: [{ kind: "card", prompt: "Pick one of your cards to swap with a teammate now", choices: ["card:h7"] }],
};

function rescue(pending: string[], abilities: ExpeditionAbilityView[] = [FREE_SPIRIT]): ExpeditionView {
  const base = view(camp({ campPhase: "ended", currentActorSeatId: null }), { yourAbilities: abilities });
  return withAttempt(base, { window: "rescue", pendingSeatIds: pending, rescue: { failedObjectiveIds: ["o1"] } });
}

function ui(overrides: Partial<LocalUiState> = {}): LocalUiState {
  return { ...initialLocalUi(), ...overrides };
}

const playing = { reconnecting: false, whisperAvailable: false };
const canWhisper = { reconnecting: false, whisperAvailable: true };

const ROWS: [string, ExpeditionView, LocalUiState, typeof playing, Prompt][] = [
  ["reconnecting beats everything", view(camp()), ui(), { reconnecting: true, whisperAvailable: true }, { text: "Reconnecting…", tone: "alert" }],
  ["rescue, you are pending", rescue(["me"]), ui(), playing, { text: "An objective failed: rescue it with Free Spirit, or pass", tone: "your-move" }],
  ["rescue, waiting on a teammate", rescue(["bo"]), ui(), playing, { text: "An objective failed: waiting for Bo", tone: "waiting" }],
  ["rescue under fog, no teammate named", rescue([]), ui(), playing, { text: "An objective failed: waiting on the crew", tone: "waiting" }],
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
    view(camp({ yourLegalCardIds: ["h7"], currentTrick: { index: 0, leaderSeatId: "ana", plays: [{ seatId: "ana", hidden: false, card: { id: "h2", identity: H2 }, effectiveRank: null, countsAs: null }] } })),
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
        currentTrick: { index: 0, leaderSeatId: "ana", plays: [{ seatId: "ana", hidden: false, card: { id: "h2", identity: H2 }, effectiveRank: null, countsAs: null }] },
      }),
    ),
    ui(),
    playing,
    { text: "Your turn: you have no ♥, play any card", tone: "your-move" },
  ],
  [
    "a teammate is playing",
    view(camp({ currentActorSeatId: "ana", currentTrick: { index: 0, leaderSeatId: "bo", plays: [{ seatId: "bo", hidden: false, card: { id: "c4", identity: C4 }, effectiveRank: null, countsAs: null }] } })),
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
    view(camp(), { yourAbilities: [GLANCE] }),
    ui({ targeting: { mode: "ability", sourceKey: "explorer", selected: [], heldId: null } }),
    playing,
    { text: "Compass: Pick a teammate's hand", tone: "your-move" },
  ],
  [
    "ability with no steps, ready to confirm",
    view(camp(), { yourAbilities: [{ sourceKey: "bait", usableNow: true, reason: null, steps: [] }] }),
    ui({ targeting: { mode: "ability", sourceKey: "bait", selected: [], heldId: null } }),
    playing,
    { text: "Use Bait? Confirm or Cancel", tone: "your-move" },
  ],
  [
    "Trained Monkey, second step",
    view(camp(), { yourAbilities: [MONKEY] }),
    ui({ targeting: { mode: "ability", sourceKey: "trained-monkey", selected: ["card:h7"], heldId: null } }),
    playing,
    { text: "Trained Monkey: Pick a teammate", tone: "your-move" },
  ],
  [
    "Trained Monkey, ready to confirm",
    view(camp(), { yourAbilities: [MONKEY] }),
    ui({ targeting: { mode: "ability", sourceKey: "trained-monkey", selected: ["card:h7", "seat:bo"], heldId: null } }),
    playing,
    { text: "Use Trained Monkey on your 7♥ and Bo? Confirm or Cancel", tone: "your-move" },
  ],
  [
    "Compass, a held card waits for its rank",
    view(camp(), { yourAbilities: [COMPASS] }),
    ui({ targeting: { mode: "ability", sourceKey: "explorer", selected: [], heldId: "h7" } }),
    playing,
    { text: "Compass: pick the rank 7♥ counts as", tone: "your-move" },
  ],
  [
    "a step prompt too long for the line drops the source name",
    view(camp(), { yourAbilities: [LONG_STEP] }),
    ui({ targeting: { mode: "ability", sourceKey: "trained-monkey", selected: [], heldId: null } }),
    playing,
    { text: "Pick one of your cards to swap with a teammate now", tone: "your-move" },
  ],
  [
    "your turn to follow with Bait usable",
    view(
      camp({ currentTrick: { index: 0, leaderSeatId: "ana", plays: [{ seatId: "ana", hidden: false, card: { id: "h2", identity: H2 }, effectiveRank: null, countsAs: null }] } }),
      { yourAbilities: [{ sourceKey: "bait", usableNow: true, reason: null, steps: [] }] },
    ),
    ui(),
    playing,
    { text: "Your turn: play any card, or use Bait first", tone: "your-move" },
  ],
  [
    "your turn to follow with Bait usable, too long to keep the hint",
    view(
      camp({ yourLegalCardIds: ["h7"], currentTrick: { index: 0, leaderSeatId: "ana", plays: [{ seatId: "ana", hidden: false, card: { id: "h2", identity: H2 }, effectiveRank: null, countsAs: null }] } }),
      { yourAbilities: [{ sourceKey: "bait", usableNow: true, reason: null, steps: [] }] },
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
      currentTrick: { index: 3, leaderSeatId: "ana", plays: [{ seatId: "ana", hidden: false, card: { id: "c4", identity: C4 }, effectiveRank: null, countsAs: null }] },
    }),
  );
  const withLog = withAttempt(v, { log: [{ event: "whisper", actorSeatId: "ana", subjectSeatIds: ["me"], sourceId: null, private: false }] });

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

describe("buildTrailPrompt", () => {
  const SEAT_IDS = SEATS.map((s) => s.seatId);
  const trail = (stage: ExpeditionStageView, overrides: Partial<ExpeditionView> = {}): ExpeditionView => ({
    ...view(camp(), overrides),
    stage,
  });
  const at = (v: ExpeditionView, seats: PromptSeat[] = SEATS, reconnecting = false): Prompt => buildTrailPrompt(v, seats, { reconnecting });
  const withCharacter = (characterId: string | null): Partial<ExpeditionView> => ({
    seats: SEATS.map((s) => ({ seatId: s.seatId, characterId: s.seatId === "me" ? characterId : "explorer", upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, usage: [] })),
  });
  const failedCamp3 = [{ camp: 3, attempt: 1, status: "failed" as const, coins: 0 }];

  it("at muster asks for an explorer and a length vote when both are owed", () => {
    const v = trail({ tag: "muster", ballots: [] }, withCharacter(null));
    expect(at(v)).toEqual({ text: "Pick your explorer and vote on the run length", tone: "your-move" });
  });

  it("at muster asks only for the explorer once you have voted", () => {
    const v = trail({ tag: "muster", ballots: [{ seatId: "me", choice: "short" }] }, withCharacter(null));
    expect(at(v)).toEqual({ text: "Pick your explorer", tone: "your-move" });
  });

  it("at muster asks only for the vote once you have an explorer", () => {
    const v = trail({ tag: "muster", ballots: [{ seatId: "ana", choice: "short" }] }, withCharacter("leader"));
    expect(at(v)).toEqual({ text: "Vote on how long the expedition runs", tone: "your-move" });
  });

  it("at muster names who is still choosing or voting once you are done", () => {
    const v = trail({ tag: "muster", ballots: [{ seatId: "me", choice: "short" }, { seatId: "bo", choice: null }] }, withCharacter("leader"));
    expect(at(v)).toEqual({ text: "Waiting for Ana", tone: "waiting" });
  });

  it("at muster says Setting out once every seat has a character and a ballot", () => {
    const ballots = SEAT_IDS.map((seatId) => ({ seatId, choice: "short" }));
    expect(at(trail({ tag: "muster", ballots }))).toEqual({ text: "Setting out…", tone: "waiting" });
  });

  it("at the draft announces the cleared camp, its payout and the pick", () => {
    const v = trail({ tag: "draft", cleared: 1, payout: 8, yourOffer: { kind: "standard", bundles: [["trained-monkey"]] }, pendingSeatIds: ["me", "bo"] });
    expect(at(v)).toEqual({ text: "Camp 1 cleared! +8 coins. Take a bundle", tone: "your-move" });
  });

  it("at the draft names who the crew is waiting for once you have picked", () => {
    const v = trail({ tag: "draft", cleared: 1, payout: 8, yourOffer: null, pendingSeatIds: ["ana", "bo"] });
    expect(at(v)).toEqual({ text: "Waiting for Ana and Bo", tone: "waiting" });
  });

  it("at the draft says Choosing the route once nobody is pending", () => {
    const v = trail({ tag: "draft", cleared: 1, payout: 8, yourOffer: null, pendingSeatIds: [] });
    expect(at(v)).toEqual({ text: "Choosing the route…", tone: "waiting" });
  });

  it("at the route vote asks for your vote with the camp it leads to", () => {
    const v = trail({ tag: "route", options: [{ id: "a", next: { ...PREVIEW, index: 3 }, swapsBoss: false }, { id: "b", next: { ...PREVIEW, index: 3 }, swapsBoss: false }], ballots: [{ seatId: "ana", choice: "a" }] });
    expect(at(v)).toEqual({ text: "Vote on the route to camp 3", tone: "your-move" });
  });

  it("at the route vote names who has not voted once you have", () => {
    const v = trail({ tag: "route", options: [{ id: "a", next: { ...PREVIEW, index: 3 }, swapsBoss: false }], ballots: [{ seatId: "me", choice: "a" }, { seatId: "ana", choice: "a" }] });
    expect(at(v)).toEqual({ text: "Waiting for Bo", tone: "waiting" });
  });

  it("at an event asks you to continue", () => {
    const v = trail({ tag: "event", event: "storm", next: { ...PREVIEW, index: 4 }, readySeatIds: ["ana"] });
    expect(at(v)).toEqual({ text: "Something on the trail. Continue when ready", tone: "your-move" });
  });

  it("at an event names who is not ready once you are", () => {
    const v = trail({ tag: "event", event: "storm", next: { ...PREVIEW, index: 4 }, readySeatIds: ["me", "ana"] });
    expect(at(v)).toEqual({ text: "Waiting for Bo", tone: "waiting" });
  });

  it("at the loadout tells you to set out by your character", () => {
    const v = trail({ tag: "loadout", camp: { ...PREVIEW, index: 2 }, mods: [], yourSlots: 2, shop: null, readySeatIds: [] }, { history: [{ camp: 1, attempt: 1, status: "cleared", coins: 8 }] });
    expect(at(v)).toEqual({ text: "The Explorer, set out for camp 2 when ready", tone: "your-move" });
  });

  it("at the loadout after a kick says the camp restarts without them", () => {
    const restarted = [{ camp: 3, attempt: 1, status: "restarted" as const, coins: 0 }];
    const kicked = [{ seatId: "dee", characterId: "hermit", upgradeId: null, back: false }];
    const v = trail({ tag: "loadout", camp: { ...PREVIEW, index: 3 }, mods: [], yourSlots: 2, shop: null, readySeatIds: [] }, { history: restarted, kicked });
    expect(at(v, [...SEATS, { seatId: "dee", displayLabel: "Dee" }])).toEqual({ text: "Camp 3 restarts without Dee. Set out", tone: "alert" });
  });

  it("at the loadout after a failure tells you to try the camp again", () => {
    const v = trail({ tag: "loadout", camp: { ...PREVIEW, index: 3 }, mods: [], yourSlots: 2, shop: null, readySeatIds: [] }, { history: failedCamp3 });
    expect(at(v)).toEqual({ text: "Camp 3 failed. Set out to try again", tone: "alert" });
  });

  it("at the loadout names who is not ready once you are", () => {
    const v = trail({ tag: "loadout", camp: { ...PREVIEW, index: 3 }, mods: [], yourSlots: 2, shop: null, readySeatIds: ["me"] }, { history: failedCamp3 });
    expect(at(v)).toEqual({ text: "Waiting for Ana and Bo", tone: "waiting" });
  });

  it("counts teammates when their names overflow the line", () => {
    const long = [
      { seatId: "me", displayLabel: "Roger" },
      { seatId: "ana", displayLabel: "Anastasia" },
      { seatId: "bo", displayLabel: "Bonaventure" },
      { seatId: "cy", displayLabel: "Cyprianus" },
      { seatId: "di", displayLabel: "Dionysia" },
    ];
    const base = trail({ tag: "loadout", camp: PREVIEW, mods: [], yourSlots: 2, shop: null, readySeatIds: ["me"] });
    const five = { ...base, seats: long.map((s) => ({ seatId: s.seatId, characterId: "explorer", upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, usage: [] })) };
    expect(at(five, long)).toEqual({ text: "Waiting for 4 teammates", tone: "waiting" });
  });

  it("says Reconnecting while the socket is down", () => {
    expect(at(trail({ tag: "loadout", camp: PREVIEW, mods: [], yourSlots: 2, shop: null, readySeatIds: [] }), SEATS, true)).toEqual({ text: "Reconnecting…", tone: "alert" });
  });
});
