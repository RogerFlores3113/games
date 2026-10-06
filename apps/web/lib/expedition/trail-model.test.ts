import { describe, expect, it } from "vitest";
import type { ExpeditionCampPreviewView, ExpeditionStageView, ExpeditionView } from "@games/rules";
import { CHARACTER_DISPLAY } from "@games/rules";
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
  return { index, location: "jungle", weather: "fair", pairing: null, slotKinds: ["win-card", "win-card"], bossId: null, shop: false, survey: null, ...over };
}

const STANDARD_PLAN: ExpeditionView["plan"] = [
  { at: 3, tier: "animal", bossId: null },
  { at: 6, tier: "temple", bossId: null },
];

const CLEARED_1 = { camp: 1, attempt: 1, location: "jungle", weather: "fair", status: "cleared" as const, coins: 8 };

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
  return {
    yourSeatId: "s2",
    runStatus: "in_progress",
    length: "standard",
    campCount: 6,
    purse: 12,
    supplies: { count: 3, max: 5 },
    plan: STANDARD_PLAN,
    seats: [
      { seatId: "s1", characterId: "explorer", upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, usage: [] },
      { seatId: "s2", characterId: "leader", ...kitOf(["trained-monkey"]), usage: [] },
      { seatId: "s3", characterId: "jd", ...kitOf(["bait"]), usage: [] },
    ],
    kicked: [],
    yourAbilities: [],
    yourItemSlots: 2,
    history: [CLEARED_1],
    lastVote: null,
    stage: { tag: "loadout", camp: preview(2), mods: [], readySeatIds: [] },
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
  next: 2,
  cleared: 1,
  payout: 8,
  yourOffer: null,
  pendingSeatIds: [],
  ...over,
});

describe("topBar", () => {
  it("shows supplies against their cap, the purse, and the camp the crew heads to", () => {
    expect(model(makeView()).topBar).toEqual({ stores: true, supplies: 3, suppliesMax: 5, purse: 12, camp: "Camp 2 of 6", map: true, suppliesPick: null });
  });

  it("labels a boss camp and the temple by their tier", () => {
    const loadout = (index: number) => at({ tag: "loadout", camp: preview(index), mods: [], readySeatIds: [] });
    expect(model(loadout(3)).topBar.camp).toBe("Camp 3 of 6 - Animal boss");
    expect(model(loadout(6)).topBar.camp).toBe("Camp 6 of 6 - The Temple");
  });

  it("reads Choosing the run at muster, with no supplies or coins shown", () => {
    const view = at({ tag: "muster", ballots: [], lockedSeatIds: [] }, { length: null, campCount: null, plan: [], history: [] });
    expect(model(view).topBar.camp).toBe("Choosing the run");
    expect(model(view).topBar.map).toBe(false);
    expect(model(view).topBar.stores).toBe(false);
  });
});

describe("trail", () => {
  it("marks cleared camps, the camp ahead, and the boss and temple stops of a standard run", () => {
    const view = at(
      { tag: "loadout", camp: preview(3), mods: [], readySeatIds: [] },
      {
        history: [
          CLEARED_1,
          { camp: 2, attempt: 1, location: "jungle", weather: "fair", status: "failed", coins: 0 },
          { camp: 2, attempt: 2, location: "jungle", weather: "fair", status: "cleared", coins: 8 },
        ],
      },
    );
    expect(model(view).trail).toEqual([
      { index: 1, state: "cleared", kind: "camp", caption: "cleared" },
      { index: 2, state: "cleared", kind: "camp", caption: "cleared" },
      { index: 3, state: "here", kind: "animal", caption: "next" },
      { index: 4, state: "ahead", kind: "camp", caption: "" },
      { index: 5, state: "ahead", kind: "camp", caption: "" },
      { index: 6, state: "ahead", kind: "temple", caption: "temple" },
    ]);
  });

  it("keeps a failed camp as the stop you are at and counts the retry", () => {
    const view = at({ tag: "loadout", camp: preview(2), mods: [], readySeatIds: [] }, { history: [CLEARED_1, { camp: 2, attempt: 1, location: "jungle", weather: "fair", status: "failed", coins: 0 }] });
    expect(model(view).trail![1]).toEqual({ index: 2, state: "here", kind: "camp", caption: "try 2" });
  });

  it("puts you at the camp after the one just cleared during the draft", () => {
    const stops = model(at(draftStage())).trail!;
    expect(stops.map((s) => [s.index, s.state])).toEqual([[1, "cleared"], [2, "here"], [3, "ahead"], [4, "ahead"], [5, "ahead"], [6, "ahead"]]);
  });

  it("is null at muster, before the length is chosen", () => {
    const view = at({ tag: "muster", ballots: [], lockedSeatIds: [] }, { length: null, campCount: null, plan: [], history: [] });
    expect(model(view).trail).toBeNull();
  });
});

describe("muster", () => {
  const musterView = (ballots: { seatId: string; choice: string | null }[], over: Partial<ExpeditionView> = {}, lockedSeatIds: string[] = []): ExpeditionView =>
    at({ tag: "muster", ballots, lockedSeatIds }, { length: null, campCount: null, plan: [], history: [], ...over });
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
        stops: ["camp", "camp", "animal", "camp", "camp", "temple"],
        summary: "1 boss, then temple",
        voters: ["You", "Cara"],
        yours: true,
        votable: true,
      },
      {
        id: "long",
        objectId: "length:long",
        name: "Long",
        camps: "8 camps",
        stops: ["camp", "camp", "animal", "camp", "camp", "disaster", "camp", "temple"],
        summary: "2 bosses, then temple",
        voters: [],
        yours: false,
        votable: true,
      },
    ]);
  });

  it("does not let a spectator vote", () => {
    expect(panel(musterView([], { yourSeatId: null })).lengths.map((l) => l.votable)).toEqual([false, false, false]);
  });

  it("does not let you vote once you have locked in", () => {
    expect(panel(musterView([{ seatId: "s2", choice: "long" }], {}, ["s2"])).lengths.map((l) => l.votable)).toEqual([false, false, false]);
  });

  it("counts the seats locked in against the crew", () => {
    expect(panel(musterView([{ seatId: "s1", choice: "short" }])).locked).toBe("0 of 3 locked in");
    expect(panel(musterView([{ seatId: "s1", choice: "short" }, { seatId: "s3", choice: "long" }], {}, ["s1", "s3"])).locked).toBe("2 of 3 locked in");
  });

  it("lists the crew you first: choosing until both an explorer and a length are chosen, ready to lock in, then locked", () => {
    const seat = (seatId: string, characterId: string | null) => ({ seatId, characterId, upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, usage: [] });
    const view = musterView([{ seatId: "s2", choice: "short" }, { seatId: "s1", choice: null }, { seatId: "s3", choice: "long" }], { seats: [seat("s1", null), seat("s2", "leader"), seat("s3", "jd")] }, ["s3"]);
    expect(panel(view).crew).toEqual([
      { seatId: "s2", name: "Bob", isYou: true, connected: true, status: "ready" },
      { seatId: "s3", name: "Cara", isYou: false, connected: false, status: "locked" },
      { seatId: "s1", name: "Alice", isYou: false, connected: true, status: "choosing" },
    ]);
  });

  describe("characters", () => {
    const mustering = (you: Partial<ExpeditionView["seats"][number]>): ExpeditionView => musterView([], { seats: seatsWith({ upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, ...you }) });

    it("shows every character, marking the ones teammates took, the free ones pickable for you", () => {
      const cards = panel(mustering({ characterId: null })).characters;
      expect(cards.map((c) => c.characterId)).toEqual(Object.keys(CHARACTER_DISPLAY));
      const ids = ["jd", "leader", "explorer", "cartographer"];
      expect(cards.filter((c) => ids.includes(c.characterId)).map((c) => [c.characterId, c.takenBy, c.pickable]).sort()).toEqual([
        ["cartographer", null, true],
        ["explorer", "Alice", false],
        ["jd", "Cara", false],
        ["leader", null, true],
      ]);
    });

    it("describes a character by name, theme, base power and further powers", () => {
      const leader = panel(mustering({ characterId: null })).characters.find((c) => c.characterId === "leader");
      expect(leader).toEqual({
        characterId: "leader",
        objectId: "draft:leader",
        name: "The Leader",
        theme: "Communicates",
        power: { sourceId: "leader", name: "Megaphone", text: "Whisper twice each camp.", badges: ["Always on"] },
        more: [],
        takenBy: null,
        yours: false,
        pickable: true,
      });
    });

    it("marks your pick as yours and leaves the free ones pickable, to switch to", () => {
      const cards = panel(mustering({ characterId: "leader" })).characters;
      expect(cards.find((c) => c.characterId === "leader")).toMatchObject({ takenBy: "You", yours: true, pickable: false });
      expect(cards.find((c) => c.characterId === "cartographer")).toMatchObject({ takenBy: null, pickable: true });
    });

    it("leaves nothing pickable once you have locked in", () => {
      const locked = musterView([{ seatId: "s2", choice: "long" }], { seats: seatsWith({ upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, characterId: "leader" }) }, ["s2"]);
      expect(panel(locked).characters.filter((c) => c.pickable)).toEqual([]);
    });
  });
});

describe("draft", () => {
  const panel = (view: ExpeditionView) => {
    const p = model(view).panel;
    if (p.kind !== "draft") throw new Error(`expected the draft panel, got ${p.kind}`);
    return p;
  };

  it("offers each bundle as one card naming its items, with their text, uses and rarity", () => {
    expect(panel(at(draftStage({ yourOffer: { kind: "standard", bundles: [["rain-poncho", "trail-map"], ["heavy-pack"]] } }))).draft).toEqual({
      kind: "offer",
      bundles: [
        {
          bundle: 0,
          itemIds: ["rain-poncho", "trail-map"],
          sourceId: "rain-poncho",
          objectId: "bundle:0",
          name: "Rain Poncho + Trail Map",
          items: [
            { itemId: "rain-poncho", objectId: "bundle-item:0:0", name: "Rain Poncho", text: "Whisper once more this camp.", uses: "2 charges", rare: false, exclusive: false },
            { itemId: "trail-map", objectId: "bundle-item:0:1", name: "Trail Map", text: "Swap all your open objectives with a teammate's.", uses: "Single use", rare: true, exclusive: false },
          ],
        },
        {
          bundle: 1,
          itemIds: ["heavy-pack"],
          sourceId: "heavy-pack",
          objectId: "bundle:1",
          name: "Heavy Pack",
          items: [
            {
              itemId: "heavy-pack",
              objectId: "bundle-item:1:0",
              name: "Heavy Pack",
              text: "You may whisper once more each camp, but a failed camp costs 1 more supply.",
              uses: "Always on",
              rare: false,
              exclusive: false,
            },
          ],
        },
      ],
      ownPick: null,
    });
  });

  it("offers the Pack Rat's own pick as one-item cards, and says whose pick it is", () => {
    const own = at(draftStage({ yourOffer: { kind: "standard", bundles: [["pocket-glass"], ["signal-flare"], ["first-aid-kit"]] } }));
    const p = panel(own).draft;
    expect(p.kind === "offer" && [p.ownPick, p.bundles.map((b) => b.items.map((i) => [i.name, i.exclusive]))]).toEqual([
      "pack-rat",
      [[["Pocket Glass", true]], [["Signal Flare", true]], [["First Aid Kit", true]]],
    ]);
    expect(model(own).prompt).toEqual({ text: "The Pack Rat's own pick: take one item", tone: "your-move" });
  });

  it("names the bundle you just took", () => {
    const p = model(at(draftStage()), ui({ takenBundle: ["bait", "parrot"] })).panel;
    expect(p.kind === "draft" && p.draft).toEqual({
      kind: "taken",
      items: [
        { sourceId: "bait", name: "Bait" },
        { sourceId: "parrot", name: "Parrot" },
      ],
    });
  });

  it("shows the newest item once the pick is made, after a refresh forgot the bundle", () => {
    expect(panel(at(draftStage())).draft).toEqual({ kind: "taken", items: [{ sourceId: "trained-monkey", name: "Trained Monkey" }] });
  });

  it("says nothing is left when the pick is made and the kit is empty", () => {
    expect(panel(at(draftStage(), { seats: seatsWith({ upgradeId: null, items: { equipped: [], backpack: [], concealed: false } }) })).draft).toEqual({ kind: "none", text: "Nothing left to take" });
  });

  it("tells a spectator the crew is choosing", () => {
    expect(panel(at(draftStage(), { yourSeatId: null })).draft).toEqual({ kind: "none", text: "The crew is choosing" });
  });
});

describe("route", () => {
  const options: Extract<ExpeditionStageView, { tag: "route" }>["options"] = [
    { id: "a", next: preview(3, { slotKinds: ["win-card", "win-card", "win-card"], bossId: "tiger", shop: false }), swapsBoss: false },
    { id: "b", next: preview(3, { location: "river-delta", weather: "storm", slotKinds: ["ordered", "ordered", "win-card", "trick-count"], shop: true }), swapsBoss: false },
  ];
  const routeView = (ballots: { seatId: string; choice: string | null }[], over: Partial<ExpeditionView> = {}): ExpeditionView =>
    at({ tag: "route", options, ballots }, over);

  it("names a route's location, weather and pairing by their display names", () => {
    const paired = at({ tag: "route", options: [{ id: "a", next: preview(3, { location: "clifftop", weather: "thunderstorm", pairing: "steam" }), swapsBoss: false }], ballots: [] });
    const p = model(paired).panel;
    if (p.kind !== "route") throw new Error("expected the route panel");
    expect(p.options[0]!.next).toMatchObject({ location: "Clifftop", weather: "Thunderstorm", locationId: "clifftop", backdrop: "clifftop", weatherId: "thunderstorm", pairing: "Steam" });
  });

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
          next: { title: "Camp 3 of 6", shop: false, location: "Jungle", weather: "Fair", locationId: "jungle", backdrop: "jungle", weatherId: "fair", pairing: null, objectives: ["3 cards to win"], boss: "Animal boss", bossId: "tiger", bossName: "Tiger", survey: null },
          voters: ["You", "Alice"],
          yours: true,
          votable: true,
          swapsBoss: null,
          reroll: null,
        },
        {
          id: "b",
          objectId: "route:b",
          label: "Route B",
          next: { title: "Camp 3 of 6", shop: true, location: "River Delta", weather: "Storm", locationId: "river-delta", backdrop: "river-delta", weatherId: "storm", pairing: null, objectives: ["1 card to win", "Win 2 in order", "A trick count"], boss: "Animal boss", bossId: null, bossName: null, survey: null },
          voters: [],
          yours: false,
          votable: true,
          swapsBoss: null,
          reroll: null,
        },
      ],
    });
  });

  it("is not votable for a spectator", () => {
    const p = model(routeView([], { yourSeatId: null })).panel;
    expect(p.kind === "route" && p.options.map((o) => o.votable)).toEqual([false, false]);
  });

  it("reads the temple as the temple, never as a boss with no portrait, and stands it in the temple", () => {
    const plan: ExpeditionView["plan"] = [{ at: 3, tier: "animal", bossId: "tiger" }, { at: 6, tier: "temple", bossId: "temple" }];
    const view = at({ tag: "route", options: [{ id: "t", next: preview(6, { location: "desert", bossId: "temple" }), swapsBoss: false }], ballots: [] }, { plan });
    const p = model(view).panel;
    expect(p.kind === "route" && p.options[0]!.next).toMatchObject({ location: "Desert", locationId: "desert", backdrop: "temple", boss: "The Temple", bossId: null, bossName: null });
  });

  it("labels a plain camp without a boss", () => {
    const view = at({ tag: "route", options: [{ id: "c", next: preview(4), swapsBoss: false }], ballots: [] });
    const p = model(view).panel;
    expect(p.kind === "route" && p.options[0]!.next.boss).toBeNull();
  });
});

describe("event and loadout panels", () => {
  it("shows the event's name and text with the camp it leads to", () => {
    const view = at({ tag: "event", event: "event", next: 4, readySeatIds: [] });
    expect(model(view).panel).toEqual({
      kind: "event",
      name: "Event",
      text: "Nothing happens here yet.",
      nextTitle: "Camp 4 of 6",
    });
  });

  it("shows the camp the crew is about to start in the loadout, with your gear and no shop", () => {
    expect(model(makeView()).panel).toEqual({
      kind: "loadout",
      title: "Camp 2 of 6",
      next: { title: "Camp 2 of 6", shop: false, location: "Jungle", weather: "Fair", locationId: "jungle", backdrop: "jungle", weatherId: "fair", pairing: null, objectives: ["2 cards to win"], boss: null, bossId: null, bossName: null, survey: null },
      gear: {
        equipped: ["trained-monkey"],
        slots: [
          {
            index: 0,
            objectId: "slot:0",
            item: { uid: "trained-monkey", itemId: "trained-monkey", objectId: "slot:0", name: "Trained Monkey", uses: "Once per camp", rare: false, targetable: false, tag: null },
          },
          { index: 1, objectId: "slot:1", item: null },
        ],
        backpack: [],
        page: 0,
        locked: false,
      },
      shop: null,
    });
  });
});

describe("loadout gear and shop", () => {
  const gearPanel = (view: ExpeditionView, local: LocalUiState = ui()) => {
    const p = model(view, local).panel;
    if (p.kind !== "loadout") throw new Error(`expected the loadout panel, got ${p.kind}`);
    return p;
  };
  const shop: Extract<ExpeditionStageView, { tag: "shop" }>["shop"] = {
    stock: [
      { stockId: "supplies", what: { kind: "supplies" }, price: 6, soldTo: null },
      { stockId: "item0", what: { kind: "item", itemId: "smoke-signal" }, price: 5, soldTo: "s1" },
    ],
    yourUpgrades: [{ stockId: "upgrade:leader.delegate", upgradeId: "leader.delegate", price: 8 }],
  };
  const shopView = (over: Partial<ExpeditionView> = {}, readySeatIds: string[] = []) =>
    at({ tag: "shop", next: 3, camp: null, shop, readySeatIds }, over);

  it("lists the backpack with what is left of each item, and the page asked for", () => {
    const seats = seatsWith({
      items: {
        equipped: [],
        backpack: [
          { uid: "it4", itemId: "rain-poncho", remaining: { kind: "uses", left: 1, of: 2 } },
          { uid: "it5", itemId: "parrot", remaining: { kind: "uses", left: 0, of: 1 } },
        ],
        concealed: false,
      },
    });
    const gear = gearPanel(makeView({ seats }), ui({ packPage: 1 })).gear!;
    expect(gear.backpack).toEqual([
      { uid: "it4", itemId: "rain-poncho", objectId: "pack:it4", name: "Rain Poncho", uses: "1 of 2 charges", rare: false, targetable: false, tag: null },
      { uid: "it5", itemId: "parrot", objectId: "pack:it5", name: "Parrot", uses: "Used this camp", rare: false, targetable: false, tag: null },
    ]);
    expect(gear.slots.map((s) => s.item)).toEqual([null, null]);
    expect(gear.page).toBe(1);
  });

  it("locks the gear once you are ready, and has none for a spectator", () => {
    expect(gearPanel(shopView({}, ["s2"])).gear!.locked).toBe(true);
    expect(gearPanel(shopView({ yourSeatId: null })).gear).toBeNull();
  });

  it("opens the shop before a boss camp with the purse, the cap, sold items and your upgrades", () => {
    expect(gearPanel(shopView({ purse: 7 })).shop).toEqual({
      purse: 7,
      entries: [
        {
          stockId: "supplies",
          objectId: "shop:supplies",
          infoId: null,
          sourceId: null,
          name: "Supplies 3 of 5",
          detail: "One per failed camp",
          rare: false,
          price: 6,
          buy: { kind: "buy" },
        },
        {
          stockId: "item0",
          objectId: "shop:item0",
          infoId: "shop-info:item0",
          sourceId: "smoke-signal",
          name: "Smoke Signal",
          detail: "Rare item",
          rare: true,
          price: null,
          buy: { kind: "status", label: "Sold to Alice" },
        },
        {
          stockId: "upgrade:leader.delegate",
          objectId: "shop:upgrade:leader.delegate",
          infoId: "shop-info:upgrade:leader.delegate",
          sourceId: "leader.delegate",
          name: "Delegate",
          detail: "Upgrade, +1 whisper",
          rare: false,
          price: 8,
          buy: { kind: "disabled", reason: "Need 1 more" },
        },
      ],
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
  const firstLoadout: ExpeditionStageView = { tag: "loadout", camp: preview(1), mods: [], readySeatIds: [] };
  const event: ExpeditionStageView = { tag: "event", event: "event", next: 4, readySeatIds: [] };
  /** The loadout the route vote chose, before its camp is played. */
  const routeLoadout: ExpeditionStageView = { tag: "loadout", camp: preview(4), mods: [], readySeatIds: [] };

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

  it("shows a clear route majority on the loadout it chose, with no flip", () => {
    expect(model(at(routeLoadout, { lastVote: routeVote })).vote).toEqual({
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
    expect(model(at(routeLoadout, { lastVote: tied })).vote!.flip).toEqual({
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

  it("hides the route vote once its camp has been played, on the event and at the draft", () => {
    const failed = { camp: 4, attempt: 1, location: "jungle", weather: "fair", status: "failed" as const, coins: 0 };
    expect(model(at(routeLoadout, { lastVote: routeVote, history: [failed] })).vote).toBeNull();
    expect(model(at(event, { lastVote: routeVote })).vote).toBeNull();
    expect(model(at(draftStage(), { lastVote: routeVote })).vote).toBeNull();
  });

  it("is null without a vote", () => {
    expect(model(at(event)).vote).toBeNull();
  });
});

describe("ready", () => {
  it("is Set out in the loadout: open, then done once you are in readySeatIds", () => {
    expect(model(makeView()).ready).toEqual({ objectId: "ready", label: "Set out", state: "open" });
    const readied = at({ tag: "loadout", camp: preview(2), mods: [], readySeatIds: ["s1", "s2"] });
    expect(model(readied).ready).toEqual({ objectId: "ready", label: "Set out", state: "done" });
  });

  it("is Continue on an event", () => {
    const event = (readySeatIds: string[]) => at({ tag: "event", event: "event", next: 4, readySeatIds });
    expect(model(event(["s1"])).ready).toEqual({ objectId: "ready", label: "Continue", state: "open" });
    expect(model(event(["s2"])).ready).toEqual({ objectId: "ready", label: "Continue", state: "done" });
  });

  it("is null for a spectator and outside the loadout and the event", () => {
    expect(model(makeView({ yourSeatId: null })).ready).toBeNull();
    expect(model(at(draftStage())).ready).toBeNull();
    expect(model(at({ tag: "route", options: [], ballots: [] })).ready).toBeNull();
  });

  it("is Lock in at the muster: disabled until you have an explorer and a length, done once locked in", () => {
    const you = (characterId: string | null) => ({ seats: seatsWith({ upgradeId: null, items: { equipped: [], backpack: [], concealed: false }, characterId }) });
    const muster = (ballots: { seatId: string; choice: string | null }[], lockedSeatIds: string[], characterId: string | null) => at({ tag: "muster", ballots, lockedSeatIds }, you(characterId));
    expect(model(muster([], [], "leader")).ready).toEqual({ objectId: "ready", label: "Lock in", state: "disabled" });
    expect(model(muster([{ seatId: "s2", choice: "long" }], [], null)).ready).toEqual({ objectId: "ready", label: "Lock in", state: "disabled" });
    expect(model(muster([{ seatId: "s2", choice: "long" }], [], "leader")).ready).toEqual({ objectId: "ready", label: "Lock in", state: "open" });
    expect(model(muster([{ seatId: "s2", choice: "long" }], ["s2"], "leader")).ready).toEqual({ objectId: "ready", label: "Locked in", state: "done" });
    expect(model(at({ tag: "muster", ballots: [], lockedSeatIds: [] }, { yourSeatId: null })).ready).toBeNull();
  });
});

describe("status", () => {
  it("counts the route votes cast", () => {
    const view = at({ tag: "route", options: [{ id: "a", next: preview(3), swapsBoss: false }], ballots: [{ seatId: "s1", choice: "a" }, { seatId: "s3", choice: null }] });
    expect(model(view).status).toBe("2 of 3 voted");
  });

  it("counts the seats still drafting, and is null once none are", () => {
    expect(model(at(draftStage({ pendingSeatIds: ["s1", "s3"] }))).status).toBe("2 still choosing");
    expect(model(at(draftStage())).status).toBeNull();
  });

  it("is null in the loadout and the event", () => {
    expect(model(makeView()).status).toBeNull();
    expect(model(at({ tag: "event", event: "event", next: 4, readySeatIds: [] })).status).toBeNull();
  });
});

describe("kit", () => {
  it("lists your character's power, then your kit, with what is left of each", () => {
    const view = makeView({
      seats: seatsWith({
        usage: [
          { sourceKey: "leader", remaining: { kind: "whispers", left: 0 } },
          { sourceKey: "trained-monkey", remaining: { kind: "uses", left: 1, of: 1 } },
        ],
      }),
    });
    expect(model(view).kit).toEqual([
      { sourceKey: "leader", sourceId: "leader", objectId: "kit:leader", name: "Megaphone", kind: "character", charge: { full: "No whispers left", short: "Used" } },
      { sourceKey: "trained-monkey", sourceId: "trained-monkey", objectId: "kit:trained-monkey", name: "Trained Monkey", kind: "item", charge: { full: "Once per camp", short: "1 per camp" } },
    ]);
  });

  it("marks a passive-only character as always on", () => {
    const view = makeView({ seats: seatsWith({ characterId: "leader", upgradeId: null, items: { equipped: [], backpack: [], concealed: false } }) });
    expect(model(view).kit).toEqual([{ sourceKey: "leader", sourceId: "leader", objectId: "kit:leader", name: "Megaphone", kind: "character", charge: { full: "Always on", short: "Always on" } }]);
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
        objectId: "crew:s2",
        targetable: false,
        displayLabel: "Bob",
        isYou: true,
        connected: true,
        status: "waiting",
        character: "The Leader",
        sources: [
          { sourceKey: "leader", sourceId: "leader", name: "Megaphone" },
          { sourceKey: "trained-monkey", sourceId: "trained-monkey", name: "Trained Monkey" },
        ],
        itemsHidden: false,
      },
      {
        seatId: "s3",
        objectId: "crew:s3",
        targetable: false,
        displayLabel: "Cara",
        isYou: false,
        connected: false,
        status: "waiting",
        character: "J.D.",
        sources: [
          { sourceKey: "jd", sourceId: "jd", name: "Lucky Start" },
          { sourceKey: "bait", sourceId: "bait", name: "Bait" },
        ],
        itemsHidden: false,
      },
      { seatId: "s1", objectId: "crew:s1", targetable: false, displayLabel: "Alice", isYou: false, connected: true, status: "waiting", character: "The Explorer", sources: [{ sourceKey: "explorer", sourceId: "explorer", name: "Compass" }], itemsHidden: false },
    ]);
  });

  it("marks a teammate's items hidden under fog, never your own", () => {
    const fogged = (seat: ExpeditionView["seats"][number]) => ({ ...seat, items: { equipped: [], backpack: null, concealed: true } });
    const view = makeView();
    const rows = model({ ...view, seats: view.seats.map((seat) => (seat.seatId === "s2" ? seat : fogged(seat))) }).crew;
    expect(rows.map((row) => [row.seatId, row.itemsHidden, row.sources.map((s) => s.sourceKey)])).toEqual([
      ["s2", false, ["leader", "trained-monkey"]],
      ["s3", true, ["jd"]],
      ["s1", true, ["explorer"]],
    ]);
  });

  it("shows a seat with no character yet as having none", () => {
    const view = at({ tag: "muster", ballots: [], lockedSeatIds: [] }, { seats: seatsWith({ characterId: null, upgradeId: null, items: { equipped: [], backpack: [], concealed: false } }) });
    expect(model(view).crew[0]).toMatchObject({ seatId: "s2", character: null, sources: [] });
  });

  it("reads each stage's status in the order you, s3, s1", () => {
    const statuses = (stage: ExpeditionStageView) => model(at(stage)).crew.map((c) => c.status);
    expect(statuses({ tag: "loadout", camp: preview(2), mods: [], readySeatIds: ["s1", "s2"] })).toEqual(["ready", "waiting", "ready"]);
    expect(statuses({ tag: "event", event: "event", next: 4, readySeatIds: ["s3"] })).toEqual(["waiting", "ready", "waiting"]);
    expect(statuses(draftStage({ pendingSeatIds: ["s3"] }))).toEqual(["ready", "drafting", "ready"]);
    expect(statuses({ tag: "route", options: [], ballots: [{ seatId: "s1", choice: "a" }] })).toEqual(["voting", "voting", "voted"]);
    expect(statuses({ tag: "muster", ballots: [{ seatId: "s2", choice: "short" }], lockedSeatIds: ["s2"] })).toEqual(["ready", "waiting", "waiting"]);
  });
});

describe("tooltip", () => {
  it("shows the hovered source's rules, with its window and limit as badges", () => {
    const poncho = model(at(draftStage({ yourOffer: { kind: "standard", bundles: [["rain-poncho"]] } })), ui({ tooltipSourceId: "rain-poncho" })).tooltip;
    expect(poncho).toEqual({
      title: "Rain Poncho",
      text: "Whisper once more this camp.",
      badges: ["Between tricks", "2 charges"],
      reason: null,
    });
    expect(model(makeView()).tooltip).toBeNull();
  });

  it("titles a character by its power", () => {
    expect(model(makeView(), ui({ tooltipSourceId: "explorer" })).tooltip).toEqual({
      title: "Compass",
      text: "A card in your hand counts one rank higher or lower.",
      badges: ["Between tricks or on your turn", "Once per camp"],
      reason: null,
    });
  });
});

describe("prompt", () => {
  it("greets a cleared camp with the draft", () => {
    expect(model(at(draftStage({ yourOffer: { kind: "standard", bundles: [["trained-monkey"]] } }))).prompt).toEqual({ text: "Camp 1 cleared! +8 coins. Take an item", tone: "your-move" });
  });

  it("says Reconnecting while the socket is down", () => {
    expect(buildTrailModel(server(makeView()), ui(), true).prompt).toEqual({ text: "Reconnecting…", tone: "alert" });
  });
});

describe("powers between camps", () => {
  const usable = (sourceKey: string, steps: { kind: ExpeditionView["yourAbilities"][number]["steps"][number]["kind"]; prompt: string; choices: string[] }[] = []) => ({ sourceKey, usableNow: true, reason: null, steps });

  it("offers each usable power as a button, the Businessman's sale named for what it does", () => {
    const view = at(draftStage(), {
      seats: seatsWith({ characterId: "businessman" }),
      yourAbilities: [usable("businessman.cash-out"), usable("businessman", [{ kind: "item", prompt: "Pick one of your items", choices: ["item:trained-monkey"] }]), { sourceKey: "jd", usableNow: false, reason: "Already used", steps: [] }],
    });
    expect(model(view).powers).toEqual([
      { sourceKey: "businessman.cash-out", objectId: "power:businessman.cash-out", label: "Cash Out", active: false },
      { sourceKey: "businessman", objectId: "power:businessman", label: "Sell an item", active: false },
    ]);
    expect(model(at({ tag: "ended", result: "won" }, { yourAbilities: [usable("businessman.cash-out")] })).powers).toEqual([]);
  });

  it("aims a sale at your items, each tagged with what it sells for, and prompts for the pick", () => {
    const view = makeView({
      seats: seatsWith({ characterId: "businessman", ...kitOf(["trail-map", "bait"]) }),
      yourAbilities: [usable("businessman", [{ kind: "item", prompt: "Pick one of your items", choices: ["item:trail-map", "item:bait"] }])],
    });
    const aimed = model(view, ui({ targeting: { mode: "ability", sourceKey: "businessman", selected: [], heldId: null } }));
    const panel = aimed.panel;
    if (panel.kind !== "loadout" || panel.gear === null) throw new Error("expected your gear");
    expect(panel.gear.slots.map((slot) => [slot.item?.itemId, slot.item?.targetable, slot.item?.tag])).toEqual([
      ["trail-map", true, "+2"],
      ["bait", true, "+1"],
    ]);
    expect(aimed.powers[0]!.active).toBe(true);
    expect(aimed.prompt.text).toBe("Sell an item: Pick one of your items");
  });

  it("puts the Cartographer's reroll on each route card instead of the power row", () => {
    const view = at(
      { tag: "route", options: [{ id: "a", next: preview(3), swapsBoss: false }, { id: "b", next: preview(3), swapsBoss: true }], ballots: [] },
      { seats: seatsWith({ characterId: "cartographer" }), yourAbilities: [usable("cartographer", [{ kind: "route-option", prompt: "Pick a route", choices: ["route:a", "route:b"] }])] },
    );
    const panel = model(view).panel;
    if (panel.kind !== "route") throw new Error("expected the route vote");
    expect(panel.options.map((o) => [o.swapsBoss, o.reroll])).toEqual([
      [null, { objectId: "reroll:a", choiceId: "route:a", label: "Reroll, 1 supply" }],
      ["Another boss at camp 3", { objectId: "reroll:b", choiceId: "route:b", label: "Reroll, 1 supply" }],
    ]);
    expect(model(view).powers).toEqual([]);
  });

  it("names a surveyed camp's objective cards", () => {
    const surveyed = preview(3, { survey: [{ kind: "win-card", target: { kind: "standard", suit: "spades", rank: 7 } }, { kind: "ordered", target: { kind: "standard", suit: "hearts", rank: 12 }, order: 1 }, { kind: "exactly-n", n: 2 }, { kind: "no-tricks" }, { kind: "hidden" }] });
    const panel = model(at({ tag: "route", options: [{ id: "a", next: surveyed, swapsBoss: false }], ballots: [] })).panel;
    if (panel.kind !== "route") throw new Error("expected the route vote");
    expect(panel.options[0]!.next.survey).toEqual(["7♠", "#1 Q♥", "Exactly 2", "No tricks", "Hidden"]);
  });

  it("makes a teammate's crew row a pick while a gift is aimed at teammates", () => {
    const view = makeView({
      seats: seatsWith({ characterId: "pack-rat", upgradeId: "pack-rat.quartermaster" }),
      yourAbilities: [usable("pack-rat.quartermaster", [{ kind: "item", prompt: "Pick one of your items", choices: ["item:trained-monkey"] }, { kind: "player", prompt: "Pick a teammate", choices: ["seat:s1", "seat:s3"] }])],
    });
    const picked = ui({ targeting: { mode: "ability", sourceKey: "pack-rat.quartermaster", selected: ["item:trained-monkey"], heldId: null } });
    expect(model(view, picked).crew.map((row) => [row.seatId, row.targetable])).toEqual([
      ["s2", false],
      ["s3", true],
      ["s1", true],
    ]);
  });
});
