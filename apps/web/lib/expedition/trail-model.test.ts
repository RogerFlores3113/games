import { describe, expect, it } from "vitest";
import type { ExpeditionCampPreviewView, ExpeditionStageView, ExpeditionView } from "@games/rules";
import type { RoomSeatInfo, SceneServerInput } from "./build-scene-model";
import { buildTrailModel } from "./trail-model";
import { initialLocalUi, type LocalUiState } from "./local-ui";

function roomSeats(): RoomSeatInfo[] {
  return [
    { seatId: "s1", displayLabel: "Alice", connected: true },
    { seatId: "s2", displayLabel: "Bob", connected: true },
    { seatId: "s3", displayLabel: "Cara", connected: false },
  ];
}

function preview(index: number, over: Partial<ExpeditionCampPreviewView> = {}): ExpeditionCampPreviewView {
  return { index, location: "jungle", weather: "fair", event: null, slotKinds: ["win-card", "win-card"], bossId: null, ...over };
}

const STANDARD_PLAN: ExpeditionView["plan"] = [
  { at: 3, tier: "animal", bossId: null },
  { at: 6, tier: "temple", bossId: null },
];

const CLEARED_1 = { camp: 1, attempt: 1, status: "cleared" as const, coins: 8 };

function makeView(overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return {
    yourSeatId: "s2",
    runStatus: "in_progress",
    length: "standard",
    campCount: 6,
    purse: 12,
    supplies: { count: 3, max: 5 },
    plan: STANDARD_PLAN,
    seats: [
      { seatId: "s1", characterId: "scout", kit: [], pool: null, usage: [] },
      { seatId: "s2", characterId: "guide", kit: ["trained-monkey"], pool: null, usage: [] },
      { seatId: "s3", characterId: "medic", kit: ["bait"], pool: null, usage: [] },
    ],
    yourAbilities: [],
    history: [CLEARED_1],
    lastVote: null,
    stage: { tag: "loadout", camp: preview(2), readySeatIds: [] },
    ...overrides,
  };
}

function at(stage: ExpeditionStageView, overrides: Partial<ExpeditionView> = {}): ExpeditionView {
  return makeView({ stage, ...overrides });
}

function server(view: ExpeditionView): SceneServerInput {
  return { game: view, roomSeats: roomSeats(), hostSeatId: "s1" };
}

function ui(overrides: Partial<LocalUiState> = {}): LocalUiState {
  return { ...initialLocalUi(), ...overrides };
}

const model = (view: ExpeditionView, local: LocalUiState = ui()) => buildTrailModel(server(view), local);

function seatsWith(you: Partial<ExpeditionView["seats"][number]>): ExpeditionView["seats"] {
  return makeView().seats.map((s) => (s.seatId === "s2" ? { ...s, ...you } : s));
}

const draftStage = (over: Partial<Extract<ExpeditionStageView, { tag: "draft" }>> = {}): ExpeditionStageView => ({
  tag: "draft",
  cleared: 1,
  payout: 8,
  yourOffer: null,
  pendingSeatIds: [],
  ...over,
});

describe("topBar", () => {
  it("shows supplies against their cap, the purse, and the camp the crew heads to", () => {
    expect(model(makeView()).topBar).toEqual({ supplies: 3, suppliesMax: 5, purse: 12, camp: "Camp 2 of 6", suppliesPick: null });
  });

  it("labels a boss camp and the temple by their tier", () => {
    const loadout = (index: number) => at({ tag: "loadout", camp: preview(index), readySeatIds: [] });
    expect(model(loadout(3)).topBar.camp).toBe("Camp 3 of 6 - Animal boss");
    expect(model(loadout(6)).topBar.camp).toBe("Camp 6 of 6 - The Temple");
  });

  it("reads Choosing the run at muster", () => {
    const view = at({ tag: "muster", ballots: [] }, { length: null, campCount: null, plan: [], history: [] });
    expect(model(view).topBar.camp).toBe("Choosing the run");
  });
});

describe("trail", () => {
  it("marks cleared camps, the camp ahead, and the boss and temple stops of a standard run", () => {
    const view = at(
      { tag: "loadout", camp: preview(3), readySeatIds: [] },
      {
        history: [
          CLEARED_1,
          { camp: 2, attempt: 1, status: "failed", coins: 0 },
          { camp: 2, attempt: 2, status: "cleared", coins: 8 },
        ],
      },
    );
    expect(model(view).trail).toEqual([
      { index: 1, state: "cleared", kind: "camp", caption: "cleared" },
      { index: 2, state: "cleared", kind: "camp", caption: "cleared" },
      { index: 3, state: "here", kind: "boss", caption: "next" },
      { index: 4, state: "ahead", kind: "camp", caption: "" },
      { index: 5, state: "ahead", kind: "camp", caption: "" },
      { index: 6, state: "ahead", kind: "temple", caption: "temple" },
    ]);
  });

  it("keeps a failed camp as the stop you are at and counts the retry", () => {
    const view = at({ tag: "loadout", camp: preview(2), readySeatIds: [] }, { history: [CLEARED_1, { camp: 2, attempt: 1, status: "failed", coins: 0 }] });
    expect(model(view).trail![1]).toEqual({ index: 2, state: "here", kind: "camp", caption: "try 2" });
  });

  it("puts you at the camp after the one just cleared during the draft", () => {
    const stops = model(at(draftStage())).trail!;
    expect(stops.map((s) => [s.index, s.state])).toEqual([[1, "cleared"], [2, "here"], [3, "ahead"], [4, "ahead"], [5, "ahead"], [6, "ahead"]]);
  });

  it("is null at muster, before the length is chosen", () => {
    const view = at({ tag: "muster", ballots: [] }, { length: null, campCount: null, plan: [], history: [] });
    expect(model(view).trail).toBeNull();
  });
});

describe("muster", () => {
  const musterView = (ballots: { seatId: string; choice: string | null }[], over: Partial<ExpeditionView> = {}): ExpeditionView =>
    at({ tag: "muster", ballots }, { length: null, campCount: null, plan: [], history: [], ...over });
  const panel = (view: ExpeditionView) => {
    const p = model(view).panel;
    if (p.kind !== "muster") throw new Error(`expected the muster panel, got ${p.kind}`);
    return p;
  };

  it("lists the three lengths with their stops, summary, voters (you first) and your vote", () => {
    const view = musterView([
      { seatId: "s1", choice: "short" },
      { seatId: "s3", choice: "standard" },
      { seatId: "s2", choice: "standard" },
    ]);
    expect(panel(view).lengths).toEqual([
      {
        id: "short",
        objectId: "length:short",
        name: "Short",
        camps: "4 camps",
        stops: ["camp", "camp", "camp", "temple"],
        summary: "Temple at the end",
        voters: ["Alice"],
        yours: false,
        votable: true,
      },
      {
        id: "standard",
        objectId: "length:standard",
        name: "Standard",
        camps: "6 camps",
        stops: ["camp", "camp", "boss", "camp", "camp", "temple"],
        summary: "1 boss, then the temple",
        voters: ["You", "Cara"],
        yours: true,
        votable: true,
      },
      {
        id: "long",
        objectId: "length:long",
        name: "Long",
        camps: "8 camps",
        stops: ["camp", "camp", "boss", "camp", "camp", "boss", "camp", "temple"],
        summary: "2 bosses, then the temple",
        voters: [],
        yours: false,
        votable: true,
      },
    ]);
  });

  it("does not let a spectator vote", () => {
    expect(panel(musterView([], { yourSeatId: null })).lengths.map((l) => l.votable)).toEqual([false, false, false]);
  });

  it("counts the ballots cast against the seats", () => {
    expect(panel(musterView([{ seatId: "s1", choice: "short" }])).votes).toBe("1 of 3 voted");
    expect(panel(musterView([{ seatId: "s1", choice: "short" }, { seatId: "s2", choice: null }, { seatId: "s3", choice: "long" }])).votes).toBe("3 of 3 voted");
  });

  it("lists the crew you first: choosing until a character is picked, voting until a ballot is cast, then ready", () => {
    const view = musterView([{ seatId: "s2", choice: "short" }], {
      seats: [
        { seatId: "s1", characterId: null, kit: [], pool: null, usage: [] },
        { seatId: "s2", characterId: "guide", kit: [], pool: null, usage: [] },
        { seatId: "s3", characterId: "medic", kit: [], pool: null, usage: [] },
      ],
    });
    expect(panel(view).crew).toEqual([
      { seatId: "s2", name: "Bob", isYou: true, connected: true, status: "ready" },
      { seatId: "s3", name: "Cara", isYou: false, connected: false, status: "voting" },
      { seatId: "s1", name: "Alice", isYou: false, connected: true, status: "choosing" },
    ]);
  });

  describe("characters", () => {
    const mustering = (you: Partial<ExpeditionView["seats"][number]>): ExpeditionView => musterView([], { seats: seatsWith({ kit: [], ...you }) });

    it("shows all six characters, marking the ones teammates took, all pickable for you until you pick", () => {
      const cards = panel(mustering({ characterId: null })).characters;
      expect(cards.map((c) => [c.characterId, c.takenBy, c.pickable])).toEqual([
        ["scout", "Alice", false],
        ["guide", null, true],
        ["botanist", null, true],
        ["medic", "Cara", false],
        ["signaller", null, true],
        ["cartographer", null, true],
      ]);
    });

    it("describes a character by name, theme, base power and pool", () => {
      const botanist = panel(mustering({ characterId: null })).characters.find((c) => c.characterId === "botanist");
      expect(botanist).toEqual({
        characterId: "botanist",
        objectId: "draft:botanist",
        name: "The Botanist",
        theme: "Brews jungle herbs",
        power: { sourceId: "botanist", name: "Herb Tonic", text: "A card in your hand counts one rank higher or lower this camp.", badges: ["Between tricks", "1 herb"] },
        pool: "Herbs: start 2, max 3",
        takenBy: null,
        yours: false,
        pickable: true,
      });
    });

    it("marks your pick as yours and leaves nothing pickable after it", () => {
      const cards = panel(mustering({ characterId: "guide" })).characters;
      expect(cards.find((c) => c.characterId === "guide")).toMatchObject({ takenBy: "You", yours: true, pickable: false });
      expect(cards.filter((c) => c.pickable)).toEqual([]);
    });
  });
});

describe("draft", () => {
  const panel = (view: ExpeditionView) => {
    const p = model(view).panel;
    if (p.kind !== "draft") throw new Error(`expected the draft panel, got ${p.kind}`);
    return p;
  };

  it("headlines the cleared camp and its payout", () => {
    expect(panel(at(draftStage())).heading).toBe("Camp 1 cleared: +8 coins");
    expect(panel(at(draftStage({ cleared: 3, payout: 12 }))).heading).toBe("Camp 3 cleared: +12 coins");
  });

  it("offers an upgrade for your character and items, each with its text and badges", () => {
    expect(panel(at(draftStage({ yourOffer: ["guide.howler-call", "rain-poncho"] }))).draft).toEqual({
      kind: "offer",
      items: [
        {
          sourceId: "guide.howler-call",
          objectId: "draft:guide.howler-call",
          name: "Howler Call",
          kind: "upgrade",
          ribbon: "Machete upgrade",
          text: "The lowest card of the led suit wins this trick.",
          badges: ["On your turn", "Once per run"],
        },
        {
          sourceId: "rain-poncho",
          objectId: "draft:rain-poncho",
          name: "Rain Poncho",
          kind: "item",
          ribbon: "Item",
          text: "Whisper once more this camp.",
          badges: ["Between tricks", "2 per run"],
        },
      ],
    });
  });

  it("shows the source just taken once the pick is made", () => {
    expect(panel(at(draftStage())).draft).toEqual({ kind: "taken", sourceId: "trained-monkey", name: "Trained Monkey" });
  });

  it("says nothing is left when the pick is made and the kit is empty", () => {
    expect(panel(at(draftStage(), { seats: seatsWith({ kit: [] }) })).draft).toEqual({ kind: "none", text: "Nothing left to take" });
  });

  it("tells a spectator the crew is choosing", () => {
    expect(panel(at(draftStage(), { yourSeatId: null })).draft).toEqual({ kind: "none", text: "The crew is choosing" });
  });
});

describe("route", () => {
  const options: Extract<ExpeditionStageView, { tag: "route" }>["options"] = [
    { id: "a", next: preview(3, { event: "event", slotKinds: ["win-card", "win-card", "win-card"], bossId: "jaguar" }) },
    { id: "b", next: preview(3, { location: "river-delta", weather: "storm", slotKinds: ["ordered", "ordered", "win-card", "trick-count"] }) },
  ];
  const routeView = (ballots: { seatId: string; choice: string | null }[], over: Partial<ExpeditionView> = {}): ExpeditionView =>
    at({ tag: "route", options, ballots }, over);

  it("builds a card per route with its camp preview, voters (you first) and your vote", () => {
    const view = routeView([{ seatId: "s1", choice: "a" }, { seatId: "s2", choice: "a" }]);
    const p = model(view).panel;
    expect(p).toEqual({
      kind: "route",
      options: [
        {
          id: "a",
          objectId: "route:a",
          label: "Route A",
          next: { title: "Camp 3 of 6", location: "Jungle", weather: "Fair", event: "Event", objectives: ["3 cards to win"], boss: "Animal boss" },
          voters: ["You", "Alice"],
          yours: true,
          votable: true,
        },
        {
          id: "b",
          objectId: "route:b",
          label: "Route B",
          next: { title: "Camp 3 of 6", location: "River Delta", weather: "Storm", event: null, objectives: ["1 card to win", "Win 2 in order", "A trick count"], boss: "Animal boss" },
          voters: [],
          yours: false,
          votable: true,
        },
      ],
    });
  });

  it("is not votable for a spectator", () => {
    const p = model(routeView([], { yourSeatId: null })).panel;
    expect(p.kind === "route" && p.options.map((o) => o.votable)).toEqual([false, false]);
  });

  it("labels a plain camp without a boss", () => {
    const view = at({ tag: "route", options: [{ id: "c", next: preview(4) }], ballots: [] });
    const p = model(view).panel;
    expect(p.kind === "route" && p.options[0]!.next.boss).toBeNull();
  });
});

describe("event and loadout panels", () => {
  it("shows the event's name and text with the camp it leads to", () => {
    const view = at({ tag: "event", event: "event", next: preview(4, { event: "event" }), readySeatIds: [] });
    expect(model(view).panel).toEqual({
      kind: "event",
      name: "Event",
      text: "Nothing happens here yet.",
      next: { title: "Camp 4 of 6", location: "Jungle", weather: "Fair", event: "Event", objectives: ["2 cards to win"], boss: null },
    });
  });

  it("shows the camp the crew is about to start in the loadout", () => {
    expect(model(makeView()).panel).toEqual({
      kind: "loadout",
      next: { title: "Camp 2 of 6", location: "Jungle", weather: "Fair", event: null, objectives: ["2 cards to win"], boss: null },
    });
  });
});

describe("vote", () => {
  const lengthVote: NonNullable<ExpeditionView["lastVote"]> = {
    topic: "length",
    tally: [{ choice: "short", votes: 1 }, { choice: "standard", votes: 1 }, { choice: "long", votes: 0 }],
    tied: ["short", "standard"],
    winner: "standard",
  };
  const routeVote: NonNullable<ExpeditionView["lastVote"]> = {
    topic: "route",
    tally: [{ choice: "a", votes: 1 }, { choice: "b", votes: 2 }],
    tied: null,
    winner: "b",
  };
  const firstLoadout: ExpeditionStageView = { tag: "loadout", camp: preview(1), readySeatIds: [] };
  const event: ExpeditionStageView = { tag: "event", event: "event", next: preview(4), readySeatIds: [] };

  it("shows the length vote on camp 1's first loadout, with the flip that settled a tie", () => {
    expect(model(at(firstLoadout, { lastVote: lengthVote, history: [] })).vote).toEqual({
      key: "length:1",
      title: "Run length",
      winner: "Standard",
      tally: [
        { label: "Short", votes: 1, winner: false },
        { label: "Standard", votes: 1, winner: true },
        { label: "Long", votes: 0, winner: false },
      ],
      flip: {
        faces: [
          { label: "Short", glyph: "4" },
          { label: "Standard", glyph: "6" },
        ],
        winner: { label: "Standard", glyph: "6" },
      },
    });
  });

  it("shows a clear route majority on the event with no flip", () => {
    expect(model(at(event, { lastVote: routeVote })).vote).toEqual({
      key: "route:4",
      title: "Route",
      winner: "Route B",
      tally: [
        { label: "Route A", votes: 1, winner: false },
        { label: "Route B", votes: 2, winner: true },
      ],
      flip: null,
    });
  });

  it("flips between route letters on a tied route vote", () => {
    const tied = { topic: "route" as const, tally: [{ choice: "a", votes: 1 }, { choice: "b", votes: 1 }], tied: ["a", "b"], winner: "a" };
    expect(model(at(event, { lastVote: tied })).vote!.flip).toEqual({
      faces: [
        { label: "Route A", glyph: "A" },
        { label: "Route B", glyph: "B" },
      ],
      winner: { label: "Route A", glyph: "A" },
    });
  });

  it("hides the length vote once a camp has been played, and on the event", () => {
    expect(model(at(firstLoadout, { lastVote: lengthVote, history: [CLEARED_1] })).vote).toBeNull();
    expect(model(at(event, { lastVote: lengthVote })).vote).toBeNull();
  });

  it("hides the route vote on a loadout and at the draft", () => {
    expect(model(at(firstLoadout, { lastVote: routeVote, history: [] })).vote).toBeNull();
    expect(model(at(draftStage(), { lastVote: routeVote })).vote).toBeNull();
  });

  it("is null without a vote", () => {
    expect(model(at(event)).vote).toBeNull();
  });
});

describe("ready", () => {
  it("is Set out in the loadout: open, then done once you are in readySeatIds", () => {
    expect(model(makeView()).ready).toEqual({ objectId: "ready", label: "Set out", state: "open" });
    const readied = at({ tag: "loadout", camp: preview(2), readySeatIds: ["s1", "s2"] });
    expect(model(readied).ready).toEqual({ objectId: "ready", label: "Set out", state: "done" });
  });

  it("is Continue on an event", () => {
    const event = (readySeatIds: string[]) => at({ tag: "event", event: "event", next: preview(4), readySeatIds });
    expect(model(event(["s1"])).ready).toEqual({ objectId: "ready", label: "Continue", state: "open" });
    expect(model(event(["s2"])).ready).toEqual({ objectId: "ready", label: "Continue", state: "done" });
  });

  it("is null for a spectator and outside the loadout and the event", () => {
    expect(model(makeView({ yourSeatId: null })).ready).toBeNull();
    expect(model(at(draftStage())).ready).toBeNull();
    expect(model(at({ tag: "route", options: [], ballots: [] })).ready).toBeNull();
    expect(model(at({ tag: "muster", ballots: [] })).ready).toBeNull();
  });
});

describe("status", () => {
  it("counts the route votes cast", () => {
    const view = at({ tag: "route", options: [{ id: "a", next: preview(3) }], ballots: [{ seatId: "s1", choice: "a" }, { seatId: "s3", choice: null }] });
    expect(model(view).status).toBe("2 of 3 voted");
  });

  it("counts the seats still drafting, and is null once none are", () => {
    expect(model(at(draftStage({ pendingSeatIds: ["s1", "s3"] }))).status).toBe("2 still choosing");
    expect(model(at(draftStage())).status).toBeNull();
  });

  it("is null in the loadout and the event", () => {
    expect(model(makeView()).status).toBeNull();
    expect(model(at({ tag: "event", event: "event", next: preview(4), readySeatIds: [] })).status).toBeNull();
  });
});

describe("kit", () => {
  it("lists your character's power, then your kit, with what is left of each", () => {
    const view = makeView({
      seats: seatsWith({
        usage: [
          { sourceId: "guide", remaining: { kind: "uses", left: 0, of: 1 } },
          { sourceId: "trained-monkey", remaining: { kind: "uses", left: 1, of: 1 } },
        ],
      }),
    });
    expect(model(view).kit).toEqual([
      { sourceId: "guide", objectId: "kit:guide", name: "Machete", kind: "character", charge: "used" },
      { sourceId: "trained-monkey", objectId: "kit:trained-monkey", name: "Trained Monkey", kind: "item", charge: "1 left" },
    ]);
  });

  it("marks a passive-only character as always on", () => {
    const view = makeView({ seats: seatsWith({ characterId: "signaller", kit: [] }) });
    expect(model(view).kit).toEqual([{ sourceId: "signaller", objectId: "kit:signaller", name: "Talking Drum", kind: "character", charge: "always on" }]);
  });

  it("is null for a spectator", () => {
    expect(model(makeView({ yourSeatId: null })).kit).toBeNull();
  });
});

describe("crew", () => {
  it("lists you first, then the table order, with status, character and public sources", () => {
    expect(model(makeView()).crew).toEqual([
      {
        seatId: "s2",
        displayLabel: "Bob",
        isYou: true,
        connected: true,
        status: "waiting",
        character: "The Guide",
        sources: [{ sourceId: "guide", name: "Machete" }, { sourceId: "trained-monkey", name: "Trained Monkey" }],
      },
      { seatId: "s3", displayLabel: "Cara", isYou: false, connected: false, status: "waiting", character: "The Medic", sources: [{ sourceId: "medic", name: "Triage" }, { sourceId: "bait", name: "Bait" }] },
      { seatId: "s1", displayLabel: "Alice", isYou: false, connected: true, status: "waiting", character: "The Scout", sources: [{ sourceId: "scout", name: "Spyglass" }] },
    ]);
  });

  it("shows a seat with no character yet as having none", () => {
    const view = at({ tag: "muster", ballots: [] }, { seats: seatsWith({ characterId: null, kit: [] }) });
    expect(model(view).crew[0]).toMatchObject({ seatId: "s2", character: null, sources: [] });
  });

  it("reads each stage's status in the order you, s3, s1", () => {
    const statuses = (stage: ExpeditionStageView) => model(at(stage)).crew.map((c) => c.status);
    expect(statuses({ tag: "loadout", camp: preview(2), readySeatIds: ["s1", "s2"] })).toEqual(["ready", "waiting", "ready"]);
    expect(statuses({ tag: "event", event: "event", next: preview(4), readySeatIds: ["s3"] })).toEqual(["waiting", "ready", "waiting"]);
    expect(statuses(draftStage({ pendingSeatIds: ["s3"] }))).toEqual(["ready", "drafting", "ready"]);
    expect(statuses({ tag: "route", options: [], ballots: [{ seatId: "s1", choice: "a" }] })).toEqual(["voting", "voting", "voted"]);
    expect(statuses({ tag: "muster", ballots: [{ seatId: "s2", choice: "short" }] })).toEqual(["voted", "voting", "voting"]);
  });
});

describe("tooltip", () => {
  it("shows the hovered source's rules, with its window and limit as badges", () => {
    const poncho = model(at(draftStage({ yourOffer: ["rain-poncho"] })), ui({ tooltipSourceId: "rain-poncho" })).tooltip;
    expect(poncho).toEqual({
      title: "Rain Poncho",
      text: "Whisper once more this camp.",
      badges: ["Between tricks", "2 per run"],
      reason: null,
    });
    expect(model(makeView()).tooltip).toBeNull();
  });

  it("titles a character by its power", () => {
    expect(model(makeView(), ui({ tooltipSourceId: "scout" })).tooltip).toEqual({
      title: "Spyglass",
      text: "See a random card in a teammate's hand.",
      badges: ["Between tricks", "1 per camp"],
      reason: null,
    });
  });
});

describe("prompt", () => {
  it("greets a cleared camp with the draft", () => {
    expect(model(at(draftStage({ yourOffer: ["trained-monkey"] }))).prompt).toEqual({ text: "Camp 1 cleared! +8 coins. Take one", tone: "your-move" });
  });

  it("says Reconnecting while the socket is down", () => {
    expect(buildTrailModel(server(makeView()), ui(), true).prompt).toEqual({ text: "Reconnecting…", tone: "alert" });
  });
});
