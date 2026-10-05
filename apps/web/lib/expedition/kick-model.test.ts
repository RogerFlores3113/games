import { describe, expect, it } from "vitest";
import type { ExpeditionView } from "@games/rules";
import type { RoomView } from "@games/schema";
import { buildKickPanel } from "./kick-model";

const PREVIEW = { index: 2, location: "jungle", weather: "fair", pairing: null, event: null, slotKinds: [], bossId: null, shop: false, survey: null };
const ROOM_SEATS: RoomView["seats"] = [
  { seatId: "ana", displayLabel: "Ana", connected: true, isHost: true },
  { seatId: "ben", displayLabel: "Ben", connected: true, isHost: false },
  { seatId: "cy", displayLabel: "Cy", connected: true, isHost: false },
  { seatId: "dee", displayLabel: "Dee", connected: false, isHost: false },
];

function game(stage: ExpeditionView["stage"], kicked: ExpeditionView["kicked"] = [], runStatus: ExpeditionView["runStatus"] = "in_progress"): ExpeditionView {
  return { yourSeatId: null, runStatus, length: "standard", campCount: 6, purse: 0, supplies: { count: 3, max: 4 }, plan: [], seats: [], kicked, yourAbilities: [], history: [], lastVote: null, stage };
}

const campStage = { tag: "camp", camp: PREVIEW, mods: [], attempt: {} } as unknown as ExpeditionView["stage"];

describe("buildKickPanel", () => {
  it("is nothing while nobody can be kicked or is waiting to rejoin", () => {
    expect(buildKickPanel({ youSeatId: "ana", seats: ROOM_SEATS, kickVotes: [] }, game(campStage))).toBeNull();
    expect(buildKickPanel({ youSeatId: "ana", seats: ROOM_SEATS }, game(campStage))).toBeNull();
  });

  it("shows the vote on a dropped teammate, the tally, and that a kick restarts the camp", () => {
    const room = { youSeatId: "ben", seats: ROOM_SEATS, kickVotes: [{ targetSeatId: "dee", voterSeatIds: ["ana"], needed: 2, youCanVote: true }] };
    expect(buildKickPanel(room, game(campStage))).toEqual({
      votes: [{ seatId: "dee", name: "Dee", votes: 1, needed: 2, youVoted: false, canVote: true }],
      consequence: "Kicking restarts camp 2 without them, at no cost. If they come back, they rejoin at the next loadout.",
      returning: [],
      yours: null,
    });
    expect(buildKickPanel({ ...room, youSeatId: "ana" }, game(campStage))?.votes[0]?.youVoted).toBe(true);
  });

  it("says what a kick does outside a camp", () => {
    const room = { youSeatId: "ana", seats: ROOM_SEATS, kickVotes: [{ targetSeatId: "dee", voterSeatIds: [], needed: 2, youCanVote: true }] };
    const loadout = { tag: "loadout", camp: PREVIEW, mods: [], yourSlots: 2, shop: null, readySeatIds: [] } as ExpeditionView["stage"];
    expect(buildKickPanel(room, game(loadout))?.consequence).toBe("Kicking sets out for camp 2 without them. If they come back, they rejoin at the next loadout.");
    expect(buildKickPanel(room, game({ tag: "muster", ballots: [] }))?.consequence).toBe("Kicking starts the run without them. If they come back, they rejoin at the next loadout.");
    expect(buildKickPanel(room, game({ tag: "draft", cleared: 1, payout: 5, yourOffer: null, pendingSeatIds: [] }))?.consequence).toBe(
      "Kicking goes on without them. If they come back, they rejoin at the next loadout.",
    );
  });

  it("tells a kicked player who is back where they rejoin, as their character", () => {
    const kicked = [{ seatId: "dee", characterId: "hermit", upgradeId: null, back: true }];
    const room = { youSeatId: "dee", seats: ROOM_SEATS, kickVotes: [] };
    expect(buildKickPanel(room, game(campStage, kicked))).toEqual({
      votes: [],
      consequence: "Kicking restarts camp 2 without them, at no cost. If they come back, they rejoin at the next loadout.",
      returning: [],
      yours: { title: "You're out of the crew for now", text: "The crew went on while you were away. You rejoin as The Hermit, with your items and upgrade, at the next loadout, once camp 2 ends." },
    });
    const event = { tag: "event", event: "event", next: { ...PREVIEW, index: 4 }, readySeatIds: [] } as ExpeditionView["stage"];
    expect(buildKickPanel(room, game(event, kicked))?.yours?.text).toBe("The crew went on while you were away. You rejoin as The Hermit, with your items and upgrade, at the loadout before camp 4.");
    expect(buildKickPanel(room, game({ tag: "ended", result: "won" }, kicked, "won"))?.yours).toEqual({ title: "The run is over", text: "The crew finished the run without you." });
  });

  it("tells the crew who is back and waiting", () => {
    const kicked = [
      { seatId: "dee", characterId: "hermit", upgradeId: null, back: true },
      { seatId: "cy", characterId: "leader", upgradeId: null, back: false },
    ];
    expect(buildKickPanel({ youSeatId: "ana", seats: ROOM_SEATS, kickVotes: [] }, game(campStage, kicked))?.returning).toEqual(["Dee"]);
  });
});
