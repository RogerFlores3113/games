import { describe, expect, it } from "vitest";
import type { ExpeditionAbilityView, ExpeditionAttemptView, ExpeditionView } from "@games/rules";
import {
  beginAbilityTargeting,
  beginWhisper,
  cancelTargeting,
  choiceFor,
  confirmTargeting,
  currentStep,
  initialLocalUi,
  isPicked,
  nextTargetKind,
  reconcileLocalUi,
  selectTarget,
  setHoveredCard,
  setLastTrickOpen,
  setTooltipMateSource,
  setTooltipObjective,
  setTooltipSource,
  valueChoices,
  repickLast,
  type LocalUiState,
} from "./local-ui";

const EXPLORER: ExpeditionAbilityView = {
  sourceKey: "explorer",
  usableNow: true,
  reason: null,
  steps: [{ kind: "hand", prompt: "Pick a teammate's hand", choices: ["hand:p1", "hand:p2"] }],
};
const MONKEY: ExpeditionAbilityView = {
  sourceKey: "trained-monkey",
  usableNow: true,
  reason: null,
  steps: [
    { kind: "card", prompt: "Pick one of your cards", choices: ["card:c1", "card:c2"] },
    { kind: "player", prompt: "Pick a teammate", choices: ["seat:p1"] },
  ],
};
const BAIT: ExpeditionAbilityView = { sourceKey: "bait", usableNow: true, reason: null, steps: [] };
const PARROT: ExpeditionAbilityView = {
  sourceKey: "parrot",
  usableNow: true,
  reason: null,
  steps: [{ kind: "objective", prompt: "Pick an objective", choices: ["objective:o1"] }],
};

/** Old-style kit ids as a seat's upgrade and equipped items; an item's uid
 * here is its item id, so ability keys in these fixtures read by name. */
function kitOf(kit: readonly string[]): Pick<ExpeditionView["seats"][number], "upgradeId" | "items"> {
  const items = kit.filter((id) => !id.includes("."));
  return {
    upgradeId: kit.find((id) => id.includes(".")) ?? null,
    items: { equipped: items.map((id) => ({ uid: id, itemId: id, remaining: null })), backpack: [], concealed: false },
  };
}

function makeView(overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  const base: ExpeditionView = {
    yourSeatId: "p0",
    runStatus: "in_progress",
    length: "standard",
    campCount: 6,
    purse: 0,
    supplies: { count: 3, max: 5 },
    plan: [],
    seats: [
      { seatId: "p0", characterId: "explorer", ...kitOf(["trained-monkey", "bait"]), usage: [] },
      { seatId: "p1", characterId: "leader", upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, usage: [] },
      { seatId: "p2", characterId: "jd", upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, usage: [] },
    ],
    kicked: [],
    yourAbilities: [EXPLORER, MONKEY, BAIT, PARROT],
    yourItemSlots: 2,
    history: [],
    lastVote: null,
    stage: {
      tag: "camp",
      camp: { index: 1, location: "jungle", weather: "fair", pairing: null, slotKinds: [], bossId: null, shop: false, survey: null },
      mods: [],
      attempt: {
      attemptNumber: 1,
      window: "between-tricks",
      pendingSeatIds: [],
      rescue: null,
      effects: [],
      reveals: [],
      log: [],
      yourWhisper: { allowed: true, left: 1 },
      camp: {
        playerCount: 3,
        expeditionLeaderSeatId: "p0",
        totalTricks: 5,
        removedCards: [],
        goals: [],
        discards: [], voidedTricks: [],
        objectives: [
          { id: "o1", kind: "no-tricks", ownerSeatId: null, status: "pending" },
          { id: "o2", kind: "no-tricks", ownerSeatId: "p0", status: "pending" },
          { id: "o3", kind: "no-tricks", ownerSeatId: "p0", status: "done" },
        ],
        yourHand: [
          { id: "c1", identity: { kind: "standard", suit: "hearts", rank: 12 }, effectiveRank: null, countsAs: null },
          { id: "c2", identity: { kind: "standard", suit: "spades", rank: 10 }, effectiveRank: null, countsAs: null },
        ],
        yourLegalCardIds: ["c1", "c2"],
        handSizes: [
          { seatId: "p0", size: 2 },
          { seatId: "p1", size: 2 },
          { seatId: "p2", size: 2 },
        ],
        completedTricks: [],
        currentTrick: { index: 0, leaderSeatId: "p0", plays: [] },
        campPhase: "playing",
        currentActorSeatId: "p0",
      },
      },
    },
  };
  return deepFreeze({ ...base, ...overrides });
}

function attemptOf(view: ExpeditionView): ExpeditionAttemptView {
  if (view.stage.tag !== "camp") throw new Error("fixture is not in a camp");
  return view.stage.attempt;
}

function withAttempt(view: ExpeditionView, patch: Partial<ExpeditionAttemptView>): ExpeditionView {
  if (view.stage.tag !== "camp") throw new Error("fixture is not in a camp");
  return deepFreeze({ ...view, stage: { ...view.stage, attempt: { ...view.stage.attempt, ...patch } } });
}

const handWithoutC1 = (view: ExpeditionView): ExpeditionView =>
  withAttempt(view, {
    camp: { ...attemptOf(view).camp, yourHand: [{ id: "c2", identity: { kind: "standard" as const, suit: "spades" as const, rank: 10 as const }, effectiveRank: null, countsAs: null }] },
  });

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function freeze(ui: LocalUiState): LocalUiState {
  return deepFreeze(ui);
}

describe("initialLocalUi", () => {
  it("starts with no targeting, hover, open last trick, or tooltip", () => {
    expect(initialLocalUi()).toEqual({
      targeting: null,
      hoveredCardId: null,
      lastTrickOpen: false,
      tooltipSourceId: null,
      tooltipObjectiveId: null,
      tooltipMateSource: null,
      tooltipModId: null,
      drag: { phase: "idle" },
      trayPage: 0,
      takenBundle: null,
      packPage: 0,
    });
  });
});

describe("beginAbilityTargeting", () => {
  it("is a no-op when the ability is not usable now", () => {
    const view = makeView({ yourAbilities: [{ sourceKey: "explorer", usableNow: false, reason: "Already used this camp", steps: [] }] });
    const ui = freeze(initialLocalUi());
    expect(beginAbilityTargeting(ui, view, "explorer")).toBe(ui);
  });

  it("is a no-op when the source is absent from yourAbilities", () => {
    const view = makeView({ yourAbilities: [] });
    const ui = freeze(initialLocalUi());
    expect(beginAbilityTargeting(ui, view, "explorer")).toBe(ui);
  });

  it("begins targeting the explorer with an empty selection; next kind is hand", () => {
    const view = makeView();
    const next = beginAbilityTargeting(freeze(initialLocalUi()), view, "explorer");
    expect(next.targeting).toEqual({ mode: "ability", sourceKey: "explorer", selected: [], heldId: null });
    expect(nextTargetKind(next, view)).toBe("hand");
    expect(currentStep(next, view)?.prompt).toBe("Pick a teammate's hand");
  });

  it("an ability with no steps has no next kind immediately", () => {
    const view = makeView();
    const next = beginAbilityTargeting(freeze(initialLocalUi()), view, "bait");
    expect(nextTargetKind(next, view)).toBeNull();
  });
});

describe("selectTarget", () => {
  it("an id outside the current step's choices is a no-op", () => {
    const view = makeView();
    const started = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view, "explorer"));
    expect(selectTarget(started, view, "hand:p0")).toBe(started);
    expect(selectTarget(started, view, "p1")).toBe(started);
  });

  it("with nothing targeting it is a no-op", () => {
    const view = makeView();
    const ui = freeze(initialLocalUi());
    expect(selectTarget(ui, view, "hand:p1")).toBe(ui);
  });

  it("picking an offered id records it and ends the steps", () => {
    const view = makeView();
    const started = beginAbilityTargeting(freeze(initialLocalUi()), view, "explorer");
    const next = selectTarget(freeze(started), view, "hand:p1");
    expect(next.targeting).toEqual({ mode: "ability", sourceKey: "explorer", selected: ["hand:p1"], heldId: null });
    expect(nextTargetKind(next, view)).toBeNull();
  });

  it("walks a two-step ability in order and rejects a later step's id early", () => {
    const view = makeView();
    let ui = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view, "trained-monkey"));
    expect(nextTargetKind(ui, view)).toBe("card");

    expect(selectTarget(ui, view, "seat:p1")).toBe(ui);

    ui = freeze(selectTarget(ui, view, "card:c1"));
    expect(nextTargetKind(ui, view)).toBe("player");

    ui = freeze(selectTarget(ui, view, "seat:p1"));
    expect(ui.targeting).toEqual({ mode: "ability", sourceKey: "trained-monkey", selected: ["card:c1", "seat:p1"], heldId: null });
    expect(nextTargetKind(ui, view)).toBeNull();
  });
});

describe("choiceFor", () => {
  it("maps a clicked card, seat, hand or objective to the current step's choice id", () => {
    const view = makeView();
    const monkey = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view, "trained-monkey"));
    expect(choiceFor(monkey, view, "card", "c2")).toBe("card:c2");
    expect(choiceFor(monkey, view, "card", "c9")).toBeNull();
    expect(choiceFor(monkey, view, "seat", "p1")).toBeNull();

    const explorer = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view, "explorer"));
    expect(choiceFor(explorer, view, "hand", "p2")).toBe("hand:p2");
    expect(choiceFor(explorer, view, "seat", "p2")).toBeNull();

    const parrot = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view, "parrot"));
    expect(choiceFor(parrot, view, "objective", "o1")).toBe("objective:o1");
    expect(choiceFor(parrot, view, "objective", "o2")).toBeNull();
  });

  it("is null when nothing is targeting", () => {
    expect(choiceFor(freeze(initialLocalUi()), makeView(), "seat", "p1")).toBeNull();
  });

  it("maps the board and the supplies to their single ids", () => {
    const upsideDown: ExpeditionAbilityView = { sourceKey: "perfumist.upside-down", usableNow: true, reason: null, steps: [{ kind: "board", prompt: "Pick the trick on the table", choices: ["board"] }] };
    const kit: ExpeditionAbilityView = { sourceKey: "explorer.reshape", usableNow: true, reason: null, steps: [{ kind: "supplies", prompt: "Pick the crew's supplies", choices: ["supplies"] }] };
    const view = makeView({ yourAbilities: [upsideDown, kit] });
    expect(choiceFor(beginAbilityTargeting(initialLocalUi(), view, "perfumist.upside-down"), view, "board", "")).toBe("board");
    expect(choiceFor(beginAbilityTargeting(initialLocalUi(), view, "explorer.reshape"), view, "supplies", "")).toBe("supplies");
  });
});

describe("card-value steps", () => {
  const TONIC: ExpeditionAbilityView = {
    sourceKey: "explorer",
    usableNow: true,
    reason: null,
    steps: [{ kind: "card-value", prompt: "Pick a card in your hand to recount", choices: ["value:c1:4", "value:c1:6", "value:c2:9"] }],
  };

  it("a hand card holds the card, then a rank completes the step and confirms", () => {
    const view = makeView({ yourAbilities: [TONIC] });
    let ui = beginAbilityTargeting(initialLocalUi(), view, "explorer");
    expect(choiceFor(ui, view, "card", "c1")).toBe("card:c1");
    expect(choiceFor(ui, view, "card", "c3")).toBeNull();
    ui = selectTarget(ui, view, "card:c1");
    expect(valueChoices(ui, view)).toEqual(["value:c1:4", "value:c1:6"]);
    expect(isPicked(ui, "card", "c1")).toBe(true);
    ui = selectTarget(ui, view, "value:c1:6");
    expect(valueChoices(ui, view)).toEqual([]);
    expect(confirmTargeting(ui, view).request).toEqual({ type: "use-ability", sourceKey: "explorer", targets: ["value:c1:6"] });
  });

  it("a rank for another card than the held one is refused", () => {
    const view = makeView({ yourAbilities: [TONIC] });
    const ui = selectTarget(beginAbilityTargeting(initialLocalUi(), view, "explorer"), view, "card:c1");
    expect(selectTarget(ui, view, "value:c2:9").targeting).toEqual(ui.targeting);
  });
});

describe("objective-value steps", () => {
  const RESHAPE: ExpeditionAbilityView = {
    sourceKey: "explorer.reshape",
    usableNow: true,
    reason: null,
    steps: [{ kind: "objective-value", prompt: "Pick an objective's card to shift", choices: ["objective-value:o1:6", "objective-value:o1:8", "objective-value:o2:3"] }],
  };

  it("an objective holds it, then a rank completes the step and confirms", () => {
    const view = makeView({ yourAbilities: [RESHAPE] });
    let ui = beginAbilityTargeting(initialLocalUi(), view, "explorer.reshape");
    expect([choiceFor(ui, view, "objective", "o1"), choiceFor(ui, view, "objective", "o3"), choiceFor(ui, view, "card", "o1")]).toEqual(["objective:o1", null, null]);
    ui = selectTarget(ui, view, "objective:o1");
    expect(valueChoices(ui, view)).toEqual(["objective-value:o1:6", "objective-value:o1:8"]);
    expect([isPicked(ui, "objective", "o1"), isPicked(ui, "objective", "o2")]).toEqual([true, false]);
    expect(selectTarget(ui, view, "objective-value:o2:3").targeting).toEqual(ui.targeting);
    ui = selectTarget(ui, view, "objective-value:o1:8");
    expect(confirmTargeting(ui, view).request).toEqual({ type: "use-ability", sourceKey: "explorer.reshape", targets: ["objective-value:o1:8"] });
  });
});

describe("self steps", () => {
  it("are picked as soon as targeting begins", () => {
    const puffball: ExpeditionAbilityView = { sourceKey: "puffball", usableNow: true, reason: null, steps: [{ kind: "self", prompt: "Use it on yourself", choices: ["seat:p0"] }] };
    const view = makeView({ yourAbilities: [puffball] });
    const ui = beginAbilityTargeting(initialLocalUi(), view, "puffball");
    expect(currentStep(ui, view)).toBeNull();
    expect(confirmTargeting(ui, view).request).toEqual({ type: "use-ability", sourceKey: "puffball", targets: ["seat:p0"] });
  });
});

describe("confirmTargeting", () => {
  it("before all steps are picked: request is null, ui is unchanged", () => {
    const view = makeView();
    const started = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view, "explorer"));
    const { ui, request } = confirmTargeting(started, view);
    expect(request).toBeNull();
    expect(ui).toBe(started);
  });

  it("after all steps are picked: emits use-ability with exactly type/sourceKey/targets, clears targeting", () => {
    const view = makeView();
    let ui = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view, "trained-monkey"));
    ui = freeze(selectTarget(ui, view, "card:c1"));
    ui = freeze(selectTarget(ui, view, "seat:p1"));
    const { ui: nextUi, request } = confirmTargeting(ui, view);
    expect(request).toEqual({ type: "use-ability", sourceKey: "trained-monkey", targets: ["card:c1", "seat:p1"] });
    expect(Object.keys(request!).sort()).toEqual(["sourceKey", "targets", "type"]);
    expect(nextUi.targeting).toBeNull();
  });

  it("an ability with no steps confirms immediately with targets: []", () => {
    const view = makeView();
    const started = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view, "bait"));
    const { ui, request } = confirmTargeting(started, view);
    expect(request).toEqual({ type: "use-ability", sourceKey: "bait", targets: [] });
    expect(ui.targeting).toBeNull();
  });

  it("whisper: emits {type, targetSeatId, cardId} with exactly those three keys", () => {
    const view = makeView();
    let ui = freeze(beginWhisper(freeze(initialLocalUi()), view));
    ui = freeze(selectTarget(ui, view, "card:c1"));
    ui = freeze(selectTarget(ui, view, "seat:p1"));
    const { ui: nextUi, request } = confirmTargeting(ui, view);
    expect(request).toEqual({ type: "whisper", targetSeatId: "p1", cardId: "c1" });
    expect(Object.keys(request!).sort()).toEqual(["cardId", "targetSeatId", "type"]);
    expect(nextUi.targeting).toBeNull();
  });
});

describe("beginWhisper", () => {
  it("next kind is card then player, offering your hand then the other seats", () => {
    const view = makeView();
    let ui = freeze(beginWhisper(freeze(initialLocalUi()), view));
    expect(nextTargetKind(ui, view)).toBe("card");
    expect(currentStep(ui, view)?.choices).toEqual(["card:c1", "card:c2"]);
    ui = freeze(selectTarget(ui, view, "card:c1"));
    expect(nextTargetKind(ui, view)).toBe("player");
    expect(currentStep(ui, view)?.choices).toEqual(["seat:p1", "seat:p2"]);
  });

  it("is a no-op outside the between-tricks window", () => {
    const view = withAttempt(makeView(), { window: "objective-pick" });
    const ui = freeze(initialLocalUi());
    expect(beginWhisper(ui, view)).toBe(ui);
  });

  it("is a no-op with no seat", () => {
    const view = makeView({ yourSeatId: null });
    const ui = freeze(initialLocalUi());
    expect(beginWhisper(ui, view)).toBe(ui);
  });
});

describe("cancelTargeting", () => {
  it("clears targeting only, leaving hover/lastTrickOpen untouched", () => {
    const view = makeView();
    let ui = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view, "explorer"));
    ui = freeze(setHoveredCard(ui, "c1"));
    ui = freeze(setLastTrickOpen(ui, true));
    const next = cancelTargeting(ui);
    expect(next.targeting).toBeNull();
    expect(next.hoveredCardId).toBe("c1");
    expect(next.lastTrickOpen).toBe(true);
  });
});

describe("reconcileLocalUi", () => {
  it("clears an ability targeting whose ability is no longer usable", () => {
    const view1 = makeView();
    let ui = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view1, "explorer"));
    const view2 = makeView({ yourAbilities: [{ sourceKey: "explorer", usableNow: false, reason: "Already used this camp", steps: [] }] });
    ui = reconcileLocalUi(ui, view2);
    expect(ui.targeting).toBeNull();
  });

  it("clears a whisper targeting when the window is no longer between-tricks", () => {
    const view1 = makeView();
    let ui = freeze(beginWhisper(freeze(initialLocalUi()), view1));
    const view2 = withAttempt(view1, { window: "objective-pick" });
    ui = reconcileLocalUi(ui, view2);
    expect(ui.targeting).toBeNull();
  });

  it("drops a pick the server no longer offers, and the picks after it", () => {
    const view1 = makeView();
    let ui = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view1, "trained-monkey"));
    ui = freeze(selectTarget(ui, view1, "card:c1"));
    ui = freeze(selectTarget(ui, view1, "seat:p1"));

    const narrowed: ExpeditionAbilityView = {
      ...MONKEY,
      steps: [{ kind: "card", prompt: "Pick one of your cards", choices: ["card:c2"] }, MONKEY.steps[1]!],
    };
    const next = reconcileLocalUi(ui, makeView({ yourAbilities: [narrowed] }));
    expect(next.targeting).toEqual({ mode: "ability", sourceKey: "trained-monkey", selected: [], heldId: null });
  });

  it("keeps a still-offered first pick and drops only the later one", () => {
    const view1 = makeView();
    let ui = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view1, "trained-monkey"));
    ui = freeze(selectTarget(ui, view1, "card:c1"));
    ui = freeze(selectTarget(ui, view1, "seat:p1"));

    const narrowed: ExpeditionAbilityView = {
      ...MONKEY,
      steps: [MONKEY.steps[0]!, { kind: "player", prompt: "Pick a teammate", choices: ["seat:p2"] }],
    };
    const next = reconcileLocalUi(ui, makeView({ yourAbilities: [narrowed] }));
    expect(next.targeting).toEqual({ mode: "ability", sourceKey: "trained-monkey", selected: ["card:c1"], heldId: null });
  });

  it("drops a whisper card pick that left the hand", () => {
    const view1 = makeView();
    let ui = freeze(beginWhisper(freeze(initialLocalUi()), view1));
    ui = freeze(selectTarget(ui, view1, "card:c1"));
    const next = reconcileLocalUi(ui, handWithoutC1(view1));
    expect(next.targeting).toEqual({ mode: "whisper", selected: [] });
  });

  it("clears hoveredCardId if that card left the hand", () => {
    const view1 = makeView();
    let ui = freeze(setHoveredCard(freeze(initialLocalUi()), "c1"));
    ui = reconcileLocalUi(ui, handWithoutC1(view1));
    expect(ui.hoveredCardId).toBeNull();
  });

  it("cancels a drag whose card left the hand", () => {
    const view1 = makeView();
    const ui = freeze({ ...initialLocalUi(), drag: { phase: "dragging" as const, cardId: "c1", legal: true, reason: null } });
    const view2 = handWithoutC1(view1);
    expect(reconcileLocalUi(ui, view2).drag).toEqual({ phase: "idle" });
    expect(reconcileLocalUi(ui, view1).drag).toEqual(ui.drag);
  });

  it("leaves valid targeting/hover untouched", () => {
    const view = makeView();
    let ui = freeze(beginAbilityTargeting(freeze(initialLocalUi()), view, "explorer"));
    ui = freeze(setHoveredCard(ui, "c1"));
    const next = reconcileLocalUi(ui, view);
    expect(next.targeting).toEqual({ mode: "ability", sourceKey: "explorer", selected: [], heldId: null });
    expect(next.hoveredCardId).toBe("c1");
  });
});

describe("setHoveredCard / setLastTrickOpen / tooltip setters", () => {
  it("each sets only its own field, immutably", () => {
    const ui = freeze(initialLocalUi());
    expect(setHoveredCard(ui, "c1")).toEqual({ ...initialLocalUi(), hoveredCardId: "c1" });
    expect(setLastTrickOpen(ui, true)).toEqual({ ...initialLocalUi(), lastTrickOpen: true });
    expect(setTooltipSource(ui, "explorer")).toEqual({ ...initialLocalUi(), tooltipSourceId: "explorer" });
    expect(setTooltipObjective(ui, "o1")).toEqual({ ...initialLocalUi(), tooltipObjectiveId: "o1" });
    expect(setTooltipMateSource(ui, { seatId: "s1", sourceKey: "bait" })).toEqual({
      ...initialLocalUi(),
      tooltipMateSource: { seatId: "s1", sourceKey: "bait" },
    });
    expect(ui).toEqual(initialLocalUi());
  });
});

describe("repickLast", () => {
  it("lets a click on another choice of the last step replace the last pick, and nothing else", () => {
    const shop: ExpeditionAbilityView = { sourceKey: "businessman.pop-up-shop", usableNow: true, reason: null, steps: [{ kind: "option", prompt: "Buy", choices: ["option:buy:0:bait:4:p0", "option:refresh:1"] }] };
    const view = makeView({ yourAbilities: [shop] });
    const picked = selectTarget(beginAbilityTargeting(initialLocalUi(), view, "businessman.pop-up-shop"), view, "option:buy:0:bait:4:p0");
    const again = selectTarget(repickLast(picked, view, "option:refresh:1"), view, "option:refresh:1");
    expect(again.targeting).toEqual({ mode: "ability", sourceKey: "businessman.pop-up-shop", selected: ["option:refresh:1"], heldId: null });
    expect(repickLast(picked, view, "option:nope")).toBe(picked);
  });
});
