import { describe, expect, it } from "vitest";
import type { RoomCode, RoomState } from "@games/schema";
import { EXPEDITION_GAME_ID } from "@games/schema/games/expedition";
import { applyDevCommand, devStateFrame, type DevInput } from "./dev-room";
import { createEmptyRoom, joinRoom, startGame, toSeatView } from "./room-state";
import { computeRoomTimers } from "./scheduler";
import { mintSeatToken } from "./seat-identity";

const SEED = "11112222333344445555666677778888";

function devInput(): DevInput {
  let seat = 0;
  let action = 0;
  return {
    now: 5000,
    mintSeatId: () => `bot-${++seat}`,
    mintSeatToken,
    mintActionId: () => `dev-action-${++action}`,
  };
}

function lobbyWithHost(gameId: "expedition" | "hanabi" = EXPEDITION_GAME_ID): RoomState {
  const joined = joinRoom(createEmptyRoom("ABCDEF" as RoomCode, 0), {
    displayName: "Roger",
    gameId,
    now: 1,
    mintSeatId: () => "host",
    mintSeatToken,
  });
  if (!joined.ok) throw new Error("fixture join failed");
  return joined.state;
}

function startedWithBots(bots: number): RoomState {
  const input = devInput();
  let room = lobbyWithHost();
  for (let i = 0; i < bots; i++) {
    const outcome = applyDevCommand(room, "host", { kind: "add-bot" }, input);
    if (!outcome.reply.ok) throw new Error(outcome.reply.message);
    room = outcome.state;
  }
  const started = startGame(room, "host", 2000, SEED);
  if (!started.ok) throw new Error(started.reason);
  return started.state;
}

describe("dev-room: bots", () => {
  it("add-bot seats a disconnected bot that the lobby release timer leaves alone", () => {
    const outcome = applyDevCommand(lobbyWithHost(), "host", { kind: "add-bot" }, devInput());
    expect(outcome.reply).toEqual({ ok: true, message: "Bot 1 joined." });
    const bot = outcome.state.seats[1]!;
    expect([bot.seatId, bot.displayLabel, bot.connected, bot.disconnectedAt, bot.bot]).toEqual(["bot-1", "Bot 1", false, null, true]);
    expect(computeRoomTimers(outcome.state, 5000).filter((timer) => timer.type === "seat_release")).toEqual([]);
  });

  it("refuses add-bot once the game has started", () => {
    const room = startedWithBots(2);
    expect(applyDevCommand(room, "host", { kind: "add-bot" }, devInput())).toEqual({
      state: room,
      reply: { ok: false, message: "Bots can only join in the lobby." },
    });
  });

  it("refuses add-bot past the game's seat limit", () => {
    const input = devInput();
    let room = lobbyWithHost();
    for (let i = 0; i < 4; i++) room = applyDevCommand(room, "host", { kind: "add-bot" }, input).state;
    expect(room.seats).toHaveLength(5);
    expect(applyDevCommand(room, "host", { kind: "add-bot" }, input).reply).toEqual({ ok: false, message: "The room is full." });
  });
});

describe("dev-room: autoplay", () => {
  it("bots play until the run waits on the human's own decision", () => {
    const room = startedWithBots(2);
    const outcome = applyDevCommand(room, "host", { kind: "autoplay", scope: "bots", maxSteps: 50, stopAtMilestone: false }, devInput());
    expect(outcome.reply).toEqual({ ok: true, message: "Autoplay: 4 steps, stopped because waiting on a seat autoplay does not control." });
    expect(outcome.state.status).toBe("in_progress");
  });

  it("everyone-scope autoplay from the final camp plays the run to its end", () => {
    const input = devInput();
    const room = applyDevCommand(startedWithBots(2), "host", { kind: "shortcut", id: "jump-to-final-camp", params: {} }, input).state;
    expect(devStateFrame(room)!.milestone).toBe("6:0:in_progress");
    const outcome = applyDevCommand(room, "host", { kind: "autoplay", scope: "everyone", maxSteps: 5000, stopAtMilestone: false }, input);
    expect(outcome.reply.message).toMatch(/^Autoplay: \d+ steps, stopped because the game is over\.$/);
    expect(outcome.state.status).toBe("ended");
  });

  it("others-scope autoplay stops at the requester's own turn in the camp", () => {
    const input = devInput();
    const room = applyDevCommand(startedWithBots(2), "host", { kind: "shortcut", id: "jump-to-camp", params: { camp: 1 } }, input).state;
    const outcome = applyDevCommand(room, "host", { kind: "autoplay", scope: "others", maxSteps: 5000, stopAtMilestone: false }, input);
    expect(outcome.reply.message).toMatch(/stopped because waiting on a seat autoplay does not control\.$/);
    expect(devStateFrame(outcome.state)!.inspect.find((section) => section.title === "Trick")!.lines).toContain("current actor: host");
  });

  it("stopAtMilestone stops as soon as the camp settles", () => {
    const room = startedWithBots(2);
    const input = devInput();
    let current = room;
    let reply = { ok: true, message: "" };
    for (let i = 0; i < 1000 && !reply.message.includes("the camp ended"); i++) {
      current = applyDevCommand(current, "host", { kind: "autoplay", scope: "others", maxSteps: 2000, stopAtMilestone: true }, input).state;
      const mine = applyDevCommand(current, "bot-1", { kind: "autoplay", scope: "others", maxSteps: 2000, stopAtMilestone: true }, input);
      current = mine.state;
      reply = mine.reply;
    }
    expect(reply.message).toMatch(/stopped because the camp ended\.$/);
    expect(devStateFrame(current)!.milestone).not.toBe(devStateFrame(room)!.milestone);
  });

  it("refuses scope bots in a room without bots", () => {
    const input = devInput();
    let room = lobbyWithHost();
    for (const name of ["Ann", "Ben"]) {
      const joined = joinRoom(room, { displayName: name, now: 2, mintSeatId: () => name, mintSeatToken });
      if (!joined.ok) throw new Error("join");
      room = joined.state;
    }
    const started = startGame(room, "host", 3, SEED);
    if (!started.ok) throw new Error(started.reason);
    expect(applyDevCommand(started.state, "host", { kind: "autoplay", scope: "bots", maxSteps: 5, stopAtMilestone: false }, input).reply).toEqual({
      ok: false,
      message: "This room has no bot seats.",
    });
  });
});

describe("dev-room: shortcuts and states", () => {
  it("ending the run through a shortcut ends the room, and a jump brings it back", () => {
    const input = devInput();
    const ended = applyDevCommand(startedWithBots(2), "host", { kind: "shortcut", id: "end-run", params: { outcome: "won" } }, input);
    expect(ended.reply).toEqual({ ok: true, message: "End the run: done." });
    expect(ended.state.status).toBe("ended");
    const revived = applyDevCommand(ended.state, "host", { kind: "shortcut", id: "jump-to-camp", params: { camp: 2 } }, input);
    expect(revived.state.status).toBe("in_progress");
    expect(devStateFrame(revived.state)!.milestone).toBe("2:0:in_progress");
  });

  it("passes a shortcut's readable refusal through unchanged", () => {
    const room = startedWithBots(2);
    expect(applyDevCommand(room, "host", { kind: "shortcut", id: "set-supplies", params: { supplies: -1 } }, devInput())).toEqual({
      state: room,
      reply: { ok: false, message: "supplies must be a whole number from 0 to 99" },
    });
  });

  it("round-trips a snapshot through load-state and renames another room's seats", () => {
    const input = devInput();
    const source = applyDevCommand(startedWithBots(2), "host", { kind: "shortcut", id: "jump-to-camp", params: { camp: 4 } }, input).state;
    const saved = JSON.parse(JSON.stringify(devStateFrame(source)!.game)) as { seatIds: string[] };

    let other = lobbyWithHost();
    for (const name of ["x", "y"]) {
      const joined = joinRoom(other, { displayName: name, now: 2, mintSeatId: () => `seat-${name}`, mintSeatToken });
      if (!joined.ok) throw new Error("join");
      other = joined.state;
    }
    const started = startGame(other, "host", 3, SEED);
    if (!started.ok) throw new Error(started.reason);

    const loaded = applyDevCommand(started.state, "host", { kind: "load-state", state: saved }, input);
    expect(loaded.reply).toEqual({ ok: true, message: "State loaded (seats renamed to this room's)." });
    expect((loaded.state.game as { seatIds: string[] }).seatIds).toEqual(["host", "seat-x", "seat-y"]);
    expect(devStateFrame(loaded.state)!.milestone).toBe("4:0:in_progress");
    expect(toSeatView(loaded.state, "seat-x").game).not.toBeNull();
  });

  it("rejects a state that fails the schema with the path of the problem", () => {
    const room = startedWithBots(2);
    const game = { ...(devStateFrame(room)!.game as object), supplies: "lots" };
    const outcome = applyDevCommand(room, "host", { kind: "load-state", state: game }, devInput());
    expect(outcome.state).toBe(room);
    expect(outcome.reply.ok).toBe(false);
    expect(outcome.reply.message).toMatch(/^State does not match the Expedition schema:\nsupplies: /);
  });

  it("rejects a state that breaks card conservation", () => {
    const input = devInput();
    const room = applyDevCommand(startedWithBots(2), "host", { kind: "shortcut", id: "jump-to-camp", params: { camp: 1 } }, input).state;
    const game = JSON.parse(JSON.stringify(room.game)) as {
      attempt: { camp: { hands: { cards: { identity: unknown }[] }[] } };
    };
    const hands = game.attempt.camp.hands;
    hands[1]!.cards[0]!.identity = hands[0]!.cards[0]!.identity;
    const outcome = applyDevCommand(room, "host", { kind: "load-state", state: game }, input);
    expect(outcome.reply.ok).toBe(false);
    expect(outcome.reply.message).toMatch(/^State breaks the rules:\ncard conservation: .+ appears 2 times, expected 1/);
  });

  it("refuses every game command for a game without dev hooks", () => {
    let room = lobbyWithHost("hanabi");
    const joined = joinRoom(room, { displayName: "Ann", now: 2, mintSeatId: () => "ann", mintSeatToken });
    if (!joined.ok) throw new Error("join");
    const started = startGame(joined.state, "host", 3, SEED);
    if (!started.ok) throw new Error(started.reason);
    room = started.state;
    expect(applyDevCommand(room, "host", { kind: "shortcut", id: "x", params: {} }, devInput()).reply).toEqual({
      ok: false,
      message: "Hanabi has no dev mode.",
    });
    expect(devStateFrame(room)).toBeNull();
  });
});
