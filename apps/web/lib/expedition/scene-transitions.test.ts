import { describe, expect, it } from "vitest";
import type { ExpeditionCampPreviewView, ExpeditionStageView, ExpeditionView } from "@games/rules";
import { TRANSITION_TIMING, boardTops, fadeInBlack, fadeStep, signLines, signPose, swapAt, transitionFor, type SceneTransition } from "./scene-transitions";

function preview(overrides: Partial<ExpeditionCampPreviewView> = {}): ExpeditionCampPreviewView {
  return { index: 2, location: "clifftop", weather: "thunderstorm", pairing: null, slotKinds: [], bossId: null, shop: false, survey: null, ...overrides };
}

function camp(index: number, attemptNumber = 1, overrides: Partial<ExpeditionCampPreviewView> = {}): ExpeditionStageView {
  return {
    tag: "camp",
    camp: preview({ index, ...overrides }),
    mods: [],
    attempt: {
      attemptNumber,
      window: "between-tricks",
      pendingSeatIds: [],
      rescue: null,
      effects: [],
      reveals: [],
      log: [],
      yourWhisper: null,
      camp: {
        playerCount: 3,
        expeditionLeaderSeatId: "s1",
        totalTricks: 17,
        removedCards: [],
        goals: [],
        discards: [],
        voidedTricks: [],
        objectives: [],
        yourHand: [],
        yourLegalCardIds: [],
        handSizes: [],
        completedTricks: [],
        currentTrick: { index: 0, leaderSeatId: "s1", plays: [] },
        campPhase: "playing",
        currentActorSeatId: "s1",
      },
    },
  };
}

function loadout(index: number, overrides: Partial<ExpeditionCampPreviewView> = {}): ExpeditionStageView {
  return { tag: "loadout", camp: preview({ index, ...overrides }), mods: [], readySeatIds: [] };
}

function shop(next: number, camp: ExpeditionCampPreviewView | null = null): ExpeditionStageView {
  return { tag: "shop", next, camp, shop: { stock: [], yourUpgrades: [] }, readySeatIds: [] };
}

function view(stage: ExpeditionStageView, overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "s1",
    runStatus: "in_progress",
    length: "standard",
    campCount: 6,
    purse: 0,
    supplies: { count: 3, max: 4 },
    plan: [
      { at: 3, tier: "animal", bossId: "tiger" },
      { at: 6, tier: "temple", bossId: null },
    ],
    seats: [],
    kicked: [],
    yourAbilities: [],
    yourItemSlots: 2,
    history: [],
    lastVote: null,
    stage,
    ...overrides,
  };
}

const muster: ExpeditionStageView = { tag: "muster", ballots: [], lockedSeatIds: [] };
const route: ExpeditionStageView = { tag: "route", options: [], ballots: [] };
const draft: ExpeditionStageView = { tag: "draft", next: 3, cleared: 2, payout: 7, yourOffer: null, pendingSeatIds: [] };
const event: ExpeditionStageView = { tag: "event", event: "event", next: 2, readySeatIds: [] };
const cleared = (camp: number, coins: number) => ({ history: [{ camp, attempt: 1, location: "clifftop", weather: "fair", status: "cleared" as const, coins }] });

function copyOf(shown: ExpeditionView, next: ExpeditionView): { caseId: string; title: string; sub: string | null } | null {
  const found = transitionFor(shown, next);
  return found === null ? null : { caseId: found.caseId, ...found.copy };
}

describe("transitionFor", () => {
  it("a cleared camp says Camp won! with the payout, on its way to the draft or the shop", () => {
    expect(copyOf(view(camp(1)), view(draft, cleared(1, 7)))).toEqual({ caseId: "camp-won", title: "Camp won!", sub: "+7 coins" });
    expect(copyOf(view(camp(2)), view(shop(3), cleared(2, 6)))).toEqual({ caseId: "camp-won", title: "Camp won!", sub: "+6 coins" });
  });

  it("a failed camp says Camp lost and what it cost", () => {
    const failed = view(loadout(2), { supplies: { count: 2, max: 4 }, history: [{ camp: 2, attempt: 1, location: "clifftop", weather: "fair", status: "failed", coins: 0 }] });
    expect(copyOf(view(camp(2)), failed)).toEqual({ caseId: "camp-lost", title: "Camp lost", sub: "-1 supply. 2 left" });
    const throughShop = view(shop(3, preview({ index: 3 })), { supplies: { count: 2, max: 4 }, history: [{ camp: 3, attempt: 1, location: "clifftop", weather: "fair", status: "failed", coins: 0 }] });
    expect(copyOf(view(camp(3)), throughShop)?.caseId).toBe("camp-lost");
  });

  it("a camp restarted by a kick says so", () => {
    const restarted = view(loadout(2), { history: [{ camp: 2, attempt: 1, location: "clifftop", weather: "fair", status: "restarted", coins: 0 }] });
    expect(copyOf(view(camp(2)), restarted)?.caseId).toBe("camp-restarted");
  });

  it("the length vote names the run and its camps, and the coin flip that settled a tie", () => {
    const first = { ...draft, next: 1, cleared: 0, payout: 0 };
    const started = view(first, { lastVote: { topic: "length", tally: [], tied: null, winner: "standard" } });
    expect(copyOf(view(muster, { length: null, campCount: null }), started)).toEqual({ caseId: "run-start", title: "Standard run", sub: "6 camps" });
    const flipped = view(first, { length: "long", campCount: 8, lastVote: { topic: "length", tally: [], tied: ["short", "long"], winner: "long" } });
    expect(copyOf(view(muster), flipped)).toEqual({ caseId: "run-start", title: "Long run", sub: "8 camps\nA coin flip decided it" });
  });

  it("the route vote names where the crew heads and the weather there", () => {
    expect(copyOf(view(route), view(loadout(3, { location: "clifftop", weather: "thunderstorm" })))).toEqual({
      caseId: "route-decided",
      title: "Heading to the Clifftop",
      sub: "Thunderstorm",
    });
    const flipped = view(loadout(3, { location: "magma", weather: "fair" }), { lastVote: { topic: "route", tally: [], tied: ["a", "b"], winner: "b" } });
    expect(copyOf(view(route), flipped)).toEqual({ caseId: "route-decided", title: "Heading to the Magma pool", sub: "Fair weather\nA coin flip decided it" });
  });


  it("setting out deals the table: a plain camp, a boss camp, the temple, and a replay's try", () => {
    expect(copyOf(view(loadout(2)), view(camp(2, 1, { location: "cave", weather: "rain", pairing: "flooding" })))).toEqual({
      caseId: "table",
      title: "Camp 2",
      sub: "Cave, Rain, Flooding",
    });
    expect(copyOf(view(loadout(2)), view(camp(2, 2)))?.title).toBe("Camp 2, try 2");
    expect(copyOf(view(loadout(3)), view(camp(3, 1, { bossId: "tiger" })))).toEqual({ caseId: "boss", title: "Boss: the Tiger", sub: "Camp 3" });
    expect(copyOf(view(loadout(6)), view(camp(6, 2)))).toEqual({ caseId: "temple", title: "The Temple", sub: "Press every plate in order\nTry 2" });
  });

  it("the run's end says how it went", () => {
    expect(copyOf(view(camp(6)), view({ tag: "ended", result: "won" }, { runStatus: "won" }))?.title).toBe("Expedition won!");
    expect(copyOf(view(camp(2)), view({ tag: "ended", result: "lost" }, { runStatus: "lost", supplies: { count: 0, max: 4 } }))).toEqual({
      caseId: "run-lost",
      title: "Expedition lost",
      sub: "Out of supplies",
    });
  });

  it("no sign within a stage, between the stages before a camp, or between two run-end views", () => {
    expect(transitionFor(view(camp(2)), view(camp(2)))).toBeNull();
    expect(transitionFor(view(shop(3)), view(draft))).toBeNull();
    expect(transitionFor(view(draft), view(event))).toBeNull();
    expect(transitionFor(view(event), view(route))).toBeNull();
    expect(transitionFor(view(draft), view(route))).toBeNull();
    expect(transitionFor(view({ tag: "ended", result: "won" }), view({ tag: "ended", result: "won" }))).toBeNull();
  });
});

const won: SceneTransition = { caseId: "camp-won", tone: "good", copy: { title: "Camp won!", sub: null }, hold: null };

describe("the sequence", () => {
  it("swaps the scene in once the sign has dropped, hung and faded to black", () => {
    expect(swapAt(TRANSITION_TIMING.full, won)).toBe(650 + 2500 + 450 + 150);
    expect(swapAt(TRANSITION_TIMING.full, { ...won, hold: 2000 })).toBe(650 + 2000 + 450 + 150);
    expect(swapAt(TRANSITION_TIMING.fast, { ...won, hold: 2000 })).toBe(80 + 100 + 60 + 20);
  });

  it("drops the sign from above, lands it, lets the swing settle, then fades to black", () => {
    const full = TRANSITION_TIMING.full;
    expect(signPose(full, won, 0)).toMatchObject({ fall: 0, alpha: 1, black: 0 });
    expect(signPose(full, won, 200).fall).toBeGreaterThan(0);
    expect(signPose(full, won, 200).fall).toBeLessThan(1);
    const landed = signPose(full, won, 650 * 0.55 + 300);
    expect(landed.fall).toBe(1);
    expect(Math.abs(landed.angle)).toBeGreaterThan(0.5);
    const hanging = signPose(full, won, 3000);
    expect(Math.abs(hanging.angle)).toBeLessThan(0.3);
    expect(Math.abs(hanging.bounce)).toBeLessThan(0.1);
    expect(hanging.black).toBe(0);
    expect(signPose(full, won, 650 + 2500 + 225).black).toBeCloseTo(0.5);
    expect(signPose(full, won, 650 + 2500 + 450).black).toBe(1);
  });

  it("under reduced motion the sign fades in where it hangs and never moves", () => {
    const reduced = TRANSITION_TIMING.reduced;
    for (const t of [0, 100, 400, 1500, 2300]) {
      const pose = signPose(reduced, won, t);
      expect([pose.fall, pose.bounce, pose.angle]).toEqual([1, 0, 0]);
    }
    expect(signPose(reduced, won, 100).alpha).toBeCloseTo(0.5);
    expect(signPose(reduced, won, 200 + 2000 + 200).black).toBe(1);
  });

  it("fades the new scene in from black", () => {
    expect(fadeInBlack(TRANSITION_TIMING.full.fadeIn, 0)).toBe(1);
    expect(fadeInBlack(TRANSITION_TIMING.full.fadeIn, 225)).toBeCloseTo(0.5);
    expect(fadeInBlack(TRANSITION_TIMING.full.fadeIn, 450)).toBe(0);
  });
});

describe("fadeStep", () => {
  const fadeIn = { phase: "fade-in" as const, serial: 4, timing: { fadeIn: 450 } };

  it("holds the pointer from black until the new scene has faded all the way in, even after the store drops the transition", () => {
    let step = fadeStep({ fade: null, doneSerial: null }, fadeIn, false, 1000);
    expect([step.black, step.blocking]).toEqual([1, true]);
    step = fadeStep(step.state, fadeIn, true, 2000);
    expect([step.black, step.blocking]).toEqual([1, true]);
    step = fadeStep(step.state, null, true, 2225);
    expect(step.black).toBeCloseTo(0.5);
    expect(step.blocking).toBe(true);
    step = fadeStep(step.state, null, true, 2450);
    expect([step.black, step.blocking]).toEqual([0, false]);
    expect(step.state).toEqual({ fade: null, doneSerial: 4 });
  });

  it("does not fade a transition it already faded in, and is clear with none", () => {
    expect(fadeStep({ fade: null, doneSerial: 4 }, fadeIn, true, 5000)).toEqual({ state: { fade: null, doneSerial: 4 }, black: 0, blocking: false });
    expect(fadeStep({ fade: null, doneSerial: null }, null, true, 5000)).toEqual({ state: { fade: null, doneSerial: null }, black: 0, blocking: false });
  });
});

describe("signLines", () => {
  const chars = (scale: number) => Math.floor(280 / (6 * scale));

  it("letters a short title at 3x and the sub line at 2x", () => {
    expect(signLines({ title: "Camp won!", sub: "+7 coins" }, chars)).toEqual([
      { text: "Camp won!", scale: 3, kind: "title" },
      { text: "+7 coins", scale: 2, kind: "sub" },
    ]);
  });

  it("wraps a long title onto two lines, and breaks the sub line where the copy says", () => {
    expect(signLines({ title: "Heading to the Magma pool", sub: "Fair weather\nA coin flip decided it" }, chars)).toEqual([
      { text: "Heading to the", scale: 3, kind: "title" },
      { text: "Magma pool", scale: 3, kind: "title" },
      { text: "Fair weather", scale: 2, kind: "sub" },
      { text: "A coin flip decided it", scale: 2, kind: "sub" },
    ]);
  });

  it("balances a two-line title rather than leaving one word alone", () => {
    expect(signLines({ title: "Heading to the Desert", sub: null }, chars).map((l) => l.text)).toEqual(["Heading to", "the Desert"]);
  });

  it("breaks a title after its colon when it must wrap", () => {
    const narrow = (scale: number) => Math.floor(264 / (6 * scale));
    expect(signLines({ title: "Boss: the Snake", sub: "Camp 3" }, narrow)).toEqual([
      { text: "Boss:", scale: 3, kind: "title" },
      { text: "the Snake", scale: 3, kind: "title" },
      { text: "Camp 3", scale: 2, kind: "sub" },
    ]);
  });

  it("drops to a smaller scale when two lines are not enough", () => {
    const lines = signLines({ title: "Boss: the Locust swarm of the long dry season", sub: null }, chars);
    expect(lines.every((l) => l.scale === 2)).toBe(true);
    expect(lines.every((l) => l.text.length <= chars(2))).toBe(true);
  });
});

describe("boardTops", () => {
  const boards = [[0, 29], [32, 61], [64, 91], [94, 125]] as const;

  it("centres each line on its own board, the block about the plank's middle", () => {
    expect(boardTops([22, 15], boards)).toEqual([36, 70]);
    expect(boardTops([22, 22, 15, 15], boards)).toEqual([4, 36, 70, 102]);
  });

  it("an odd count leans to the board nearer the middle", () => {
    expect(boardTops([22], boards)).toEqual([67]);
    expect(boardTops([22, 15, 15], boards)).toEqual([36, 70, 102]);
  });

  it("gives up when there are more lines than boards", () => {
    expect(boardTops([8, 8, 8, 8, 8], boards)).toBeNull();
  });
});
