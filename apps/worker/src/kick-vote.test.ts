// The room's kick vote, driven through room-state.ts's pure functions: the
// toy game (whose kick drops a seat from turn order) for the vote itself,
// Hanabi for a game with no kicks, and Expedition for the real hooks.

import { describe, expect, it } from "vitest";
import type { RoomCode, RoomState, SeatToken } from "@games/schema";
import type { RunState } from "@games/rules";
import { EXPEDITION_GAME_ID } from "@games/schema/games/expedition";
import { applyGameAction, castKickVote, createEmptyRoom, joinRoom, markConnected, startGame, toSeatView } from "./room-state";
import type { GameRegistry } from "./game-registration";
import { TEST_GAME_REGISTRY, TOY_GAME_ID } from "../test/toy-game";

const ROOM_CODE = "ABCDEF" as RoomCode;

function startedRoom(seatCount: number, gameId: string | undefined, games: GameRegistry = TEST_GAME_REGISTRY): RoomState {
  let state = createEmptyRoom(ROOM_CODE, 0, games);
  for (let i = 1; i <= seatCount; i++) {
    const joined = joinRoom(
      state,
      {
        displayName: `Player ${i}`,
        now: i,
        mintSeatId: () => `s${i}`,
        mintSeatToken: () => `token-${i}-${"x".repeat(16)}`.slice(0, 24) as unknown as SeatToken,
        ...(i === 1 && gameId !== undefined ? { gameId: gameId as RoomState["gameId"] } : {}),
      },
      games,
    );
    if (!joined.ok) throw new Error(`join ${i}: ${joined.reason}`);
    state = joined.state;
  }
  const started = startGame(state, "s1", 10, "seed-1", games);
  if (!started.ok) throw new Error(`start: ${started.reason}`);
  return started.state;
}

const toyRoom = () => startedRoom(4, TOY_GAME_ID);
const toySeats = (state: RoomState) => (state.game as { seatIds: string[] }).seatIds;
const kickView = (state: RoomState, viewer: string) => toSeatView(state, viewer, TEST_GAME_REGISTRY).kickVotes;

function vote(state: RoomState, voter: string, target: string, kick = true, games: GameRegistry = TEST_GAME_REGISTRY): RoomState {
  const result = castKickVote(state, voter, target, kick, 100, games);
  if (!result.ok) throw new Error(`${voter} vote on ${target}: ${result.reason}`);
  return result.state;
}

describe("the kick vote", () => {
  it("offers a disconnected seat to the connected players, with the majority they need", () => {
    const room = toyRoom();
    expect(kickView(room, "s1")).toEqual([]);
    const gone = markConnected(room, "s4", false, 50, TEST_GAME_REGISTRY);
    expect(kickView(gone, "s1")).toEqual([{ targetSeatId: "s4", voterSeatIds: [], needed: 2, youCanVote: true }]);
  });

  it("kicks once a majority of the connected players vote, and not before", () => {
    const gone = markConnected(toyRoom(), "s4", false, 50, TEST_GAME_REGISTRY);
    const one = vote(gone, "s1", "s4");
    expect(kickView(one, "s2")).toEqual([{ targetSeatId: "s4", voterSeatIds: ["s1"], needed: 2, youCanVote: true }]);
    expect(toySeats(one)).toEqual(["s1", "s2", "s3", "s4"]);
    const two = vote(one, "s3", "s4");
    expect(toySeats(two)).toEqual(["s1", "s2", "s3"]);
    expect(two.kickVotes).toEqual([]);
    expect(kickView(two, "s1")).toEqual([]);
  });

  it("a vote taken back no longer counts, and casting twice counts once", () => {
    const gone = markConnected(toyRoom(), "s4", false, 50, TEST_GAME_REGISTRY);
    const twice = vote(vote(gone, "s1", "s4"), "s1", "s4");
    expect(kickView(twice, "s1")?.[0]?.voterSeatIds).toEqual(["s1"]);
    const withdrawn = vote(twice, "s1", "s4", false);
    expect(kickView(withdrawn, "s1")?.[0]?.voterSeatIds).toEqual([]);
    expect(toySeats(vote(withdrawn, "s2", "s4"))).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("a seat that reconnects takes the votes against it away", () => {
    const voted = vote(markConnected(toyRoom(), "s4", false, 50, TEST_GAME_REGISTRY), "s1", "s4");
    const back = markConnected(voted, "s4", true, 60, TEST_GAME_REGISTRY);
    expect(back.kickVotes).toEqual([]);
    const again = markConnected(back, "s4", false, 70, TEST_GAME_REGISTRY);
    expect(kickView(again, "s1")).toEqual([{ targetSeatId: "s4", voterSeatIds: [], needed: 2, youCanVote: true }]);
  });

  it("a voter who drops shrinks the majority, which can carry a vote already cast", () => {
    const voted = vote(markConnected(toyRoom(), "s4", false, 50, TEST_GAME_REGISTRY), "s1", "s4");
    const thinner = markConnected(voted, "s2", false, 60, TEST_GAME_REGISTRY);
    expect(toySeats(thinner)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(kickView(thinner, "s1")?.find((k) => k.targetSeatId === "s4")).toEqual({ targetSeatId: "s4", voterSeatIds: ["s1"], needed: 2, youCanVote: true });
    const alone = markConnected(thinner, "s3", false, 70, TEST_GAME_REGISTRY);
    expect(toySeats(alone)).toEqual(["s1", "s2", "s3"]);
  });

  it("refuses a voter who is disconnected or out of play, a connected target, and a kick the game forbids", () => {
    const gone = markConnected(markConnected(toyRoom(), "s4", false, 50, TEST_GAME_REGISTRY), "s3", false, 50, TEST_GAME_REGISTRY);
    expect(castKickVote(gone, "s3", "s4", true, 100, TEST_GAME_REGISTRY)).toEqual({ ok: false, reason: "bad_request" });
    expect(castKickVote(gone, "s1", "s2", true, 100, TEST_GAME_REGISTRY)).toEqual({ ok: false, reason: "bad_request" });
    const kicked = vote(vote(gone, "s1", "s4"), "s2", "s4");
    expect(toySeats(kicked)).toEqual(["s1", "s2", "s3"]);
    const returned = markConnected(kicked, "s4", true, 60, TEST_GAME_REGISTRY);
    expect(castKickVote(returned, "s4", "s3", true, 100, TEST_GAME_REGISTRY)).toEqual({ ok: false, reason: "bad_request" });
    const minimum = vote(vote(returned, "s1", "s3"), "s2", "s3");
    expect(toySeats(minimum)).toEqual(["s1", "s2"]);
    const last = markConnected(minimum, "s2", false, 80, TEST_GAME_REGISTRY);
    expect(kickView(last, "s1")).toEqual([]);
    expect(castKickVote(last, "s1", "s2", true, 100, TEST_GAME_REGISTRY)).toEqual({ ok: false, reason: "bad_request" });
  });

  it("never offers a dev bot, which is playerless rather than disconnected", () => {
    const room = toyRoom();
    const withBot: RoomState = { ...room, seats: room.seats.map((seat) => (seat.seatId === "s4" ? { ...seat, bot: true, connected: false, disconnectedAt: null } : seat)) };
    expect(kickView(withBot, "s1")).toEqual([]);
    expect(castKickVote(withBot, "s1", "s4", true, 100, TEST_GAME_REGISTRY)).toEqual({ ok: false, reason: "bad_request" });
  });

  it("a game with no seat hooks has no kicks at all", () => {
    const hanabi = markConnected(startedRoom(3, undefined), "s3", false, 50, TEST_GAME_REGISTRY);
    expect(toSeatView(hanabi, "s1", TEST_GAME_REGISTRY)).not.toHaveProperty("kickVotes");
    expect(castKickVote(hanabi, "s1", "s3", true, 100, TEST_GAME_REGISTRY)).toEqual({ ok: false, reason: "bad_request" });
  });
});

describe("the kick vote in Expedition", () => {
  const expeditionRoom = () => startedRoom(4, EXPEDITION_GAME_ID);
  const run = (state: RoomState) => state.game as RunState;

  function act(state: RoomState, seatId: string, request: unknown, n: number): RoomState {
    const result = applyGameAction(state, seatId, `a${n}`, request, 20 + n, TEST_GAME_REGISTRY);
    if (!result.ok) throw new Error(`${seatId}: ${result.reason} ${JSON.stringify(result.gameError)}`);
    return result.state;
  }

  it("takes the seat out of the run, and its return puts it back at an open muster", () => {
    let state = expeditionRoom();
    state = act(state, "s4", { type: "pick-character", characterId: "hermit" }, 1);
    state = markConnected(state, "s4", false, 50, TEST_GAME_REGISTRY);
    state = vote(vote(state, "s1", "s4"), "s2", "s4");
    expect(run(state).seatIds).toEqual(["s1", "s2", "s3"]);
    expect(run(state).kicked.map((k) => [k.seat.seatId, k.seat.characterId, k.back])).toEqual([["s4", "hermit", false]]);
    expect(state.status).toBe("in_progress");
    expect(kickView(state, "s1")).toEqual([]);

    const back = markConnected(state, "s4", true, 90, TEST_GAME_REGISTRY);
    expect(run(back).seatIds).toEqual(["s1", "s2", "s3", "s4"]);
    expect(run(back).kicked).toEqual([]);
  });

  it("no kick takes the crew below three", () => {
    const three = startedRoom(3, EXPEDITION_GAME_ID);
    const gone = markConnected(three, "s3", false, 50, TEST_GAME_REGISTRY);
    expect(kickView(gone, "s1")).toEqual([]);
    expect(castKickVote(gone, "s1", "s3", true, 100, TEST_GAME_REGISTRY)).toEqual({ ok: false, reason: "bad_request" });
  });
});
