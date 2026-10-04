// Dev-mode commands over a RoomState: pure functions, game-agnostic. The
// game's own knowledge arrives through the registry entry's optional
// `adapter.dev` hooks and `devStateSchema`. room-do.ts calls this module
// only when `devModeEnabled(env)`, and sends `devStateFrame` only to the
// socket that asked, so per-seat views are untouched.

import type { DevCommand, DevShortcutWire, DevInspectSectionWire, RoomState, SeatToken } from "@games/schema";
import type { DevShortcut, DevInspectSection, GameDevHooks } from "@games/rules";
import { GAME_REGISTRY, resolveGame, type GameRegistry, type GameRegistryEntry } from "./game-registration";
import { applyGameAction, joinRoom } from "./room-state";

type _AssertShortcutWire = [DevShortcut] extends [DevShortcutWire] ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertShortcutWire: _AssertShortcutWire = true;
type _AssertInspectWire = [DevInspectSection] extends [DevInspectSectionWire] ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertInspectWire: _AssertInspectWire = true;

export type DevReply = { readonly ok: boolean; readonly message: string };

/** `state` is `room` itself when nothing changed. */
export type DevOutcome = { readonly state: RoomState; readonly reply: DevReply };

export type DevInput = {
  readonly now: number;
  readonly mintSeatId: () => string;
  readonly mintSeatToken: () => SeatToken;
  readonly mintActionId: () => string;
};

export type DevStateFrame = {
  readonly type: "dev_state";
  readonly game: unknown;
  readonly shortcuts: readonly DevShortcut[];
  readonly inspect: readonly DevInspectSection[];
  readonly milestone: string;
};

type DevGame = { readonly entry: GameRegistryEntry; readonly dev: GameDevHooks<unknown>; readonly game: unknown };

function refuse(room: RoomState, message: string): DevOutcome {
  return { state: room, reply: { ok: false, message } };
}

function devGame(room: RoomState, games: GameRegistry): DevGame | string {
  const entry = resolveGame(room.gameId, games);
  if (entry === undefined) return `Unknown game ${room.gameId}.`;
  if (entry.adapter.dev === undefined) return `${entry.displayName} has no dev mode.`;
  if (room.game === null) return "No game yet: start one first.";
  return { entry, dev: entry.adapter.dev, game: room.game };
}

/** Replaces the game and re-derives the room status from it, so a dev edit
 * can end a run or bring an ended one back to life. */
function withGame(room: RoomState, entry: GameRegistryEntry, game: unknown, now: number): RoomState {
  const ended = entry.adapter.checkGameEnd(game) !== null;
  return { ...room, game, status: ended ? "ended" : "in_progress", lastActivityAt: now };
}

/** Renames every string value equal to a `from` seat id to the matching
 * `to` seat id, so a snapshot saved in another room fits this one. */
function renameSeats(value: unknown, rename: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") return rename.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => renameSeats(item, rename));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renameSeats(item, rename)]));
  }
  return value;
}

function parseState(entry: GameRegistryEntry, raw: unknown): { ok: true; state: unknown } | { ok: false; message: string } {
  const parsed = entry.devStateSchema!.safeParse(raw);
  if (parsed.success) return { ok: true, state: parsed.data };
  const issues = parsed.error.issues.slice(0, 10).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
  return { ok: false, message: `State does not match the ${entry.displayName} schema:\n${issues.join("\n")}` };
}

function loadState(room: RoomState, raw: unknown, input: DevInput, games: GameRegistry): DevOutcome {
  const found = devGame(room, games);
  if (typeof found === "string") return refuse(room, found);
  const { entry, dev } = found;
  if (entry.devStateSchema === undefined) return refuse(room, `${entry.displayName} cannot load edited states.`);

  const first = parseState(entry, raw);
  if (!first.ok) return refuse(room, first.message);

  const from = dev.seatIds(first.state);
  const to = room.seats.map((seat) => seat.seatId);
  if (from.length !== to.length) {
    return refuse(room, `That state has ${from.length} seats; this room has ${to.length}.`);
  }
  const renamed = from.every((seatId, i) => seatId === to[i])
    ? first
    : parseState(entry, renameSeats(raw, new Map(from.map((seatId, i) => [seatId, to[i]!]))));
  if (!renamed.ok) return refuse(room, renamed.message);

  const problems = dev.check(renamed.state);
  if (problems.length > 0) return refuse(room, `State breaks the rules:\n${problems.join("\n")}`);

  const renamedNote = renamed === first ? "" : " (seats renamed to this room's)";
  return { state: withGame(room, entry, renamed.state, input.now), reply: { ok: true, message: `State loaded${renamedNote}.` } };
}

function runShortcut(room: RoomState, id: string, params: Readonly<Record<string, string | number>>, input: DevInput, games: GameRegistry): DevOutcome {
  const found = devGame(room, games);
  if (typeof found === "string") return refuse(room, found);
  const { entry, dev, game } = found;
  const result = dev.runShortcut(game, id, params);
  if (!result.ok) return refuse(room, result.error);
  const label = dev.shortcuts(game).find((shortcut) => shortcut.id === id)?.label ?? id;
  return { state: withGame(room, entry, result.state, input.now), reply: { ok: true, message: `${label}: done.` } };
}

function autoplay(
  room: RoomState,
  actorSeatId: string,
  command: Extract<DevCommand, { kind: "autoplay" }>,
  input: DevInput,
  games: GameRegistry,
): DevOutcome {
  const found = devGame(room, games);
  if (typeof found === "string") return refuse(room, found);
  const { dev } = found;
  const inScope = {
    bots: (seat: RoomState["seats"][number]) => seat.bot === true,
    others: (seat: RoomState["seats"][number]) => seat.seatId !== actorSeatId,
    everyone: () => true,
  }[command.scope];
  const controlled = room.seats.filter(inScope).map((seat) => seat.seatId);
  if (controlled.length === 0) return refuse(room, command.scope === "bots" ? "This room has no bot seats." : "No other seats to play for.");

  const startMilestone = dev.milestone(found.game);
  let current = room;
  let steps = 0;
  let stoppedBy = "step limit reached";
  for (;;) {
    if (current.status !== "in_progress") {
      stoppedBy = "the game is over";
      break;
    }
    if (steps >= command.maxSteps) break;
    const move = dev.botMove(current.game, controlled);
    if (move === null) {
      stoppedBy = "waiting on a seat autoplay does not control";
      break;
    }
    const result = applyGameAction(current, move.seatId, input.mintActionId(), move.request, input.now, games);
    if (!result.ok) {
      const code = result.gameError?.code ?? result.reason;
      return { state: current, reply: { ok: false, message: `Bot move for ${move.seatId} was refused (${code}) after ${steps} steps.` } };
    }
    current = result.state;
    steps++;
    if (command.stopAtMilestone && dev.milestone(current.game) !== startMilestone) {
      stoppedBy = "the camp ended";
      break;
    }
  }
  return { state: current, reply: { ok: true, message: `Autoplay: ${steps} step${steps === 1 ? "" : "s"}, stopped because ${stoppedBy}.` } };
}

function addBot(room: RoomState, input: DevInput, games: GameRegistry): DevOutcome {
  if (room.status !== "lobby") return refuse(room, "Bots can only join in the lobby.");
  const botNumber = room.seats.filter((seat) => seat.bot === true).length + 1;
  const joined = joinRoom(
    room,
    { displayName: `Bot ${botNumber}`, now: input.now, mintSeatId: input.mintSeatId, mintSeatToken: input.mintSeatToken },
    games,
  );
  if (!joined.ok) return refuse(room, joined.reason === "full" ? "The room is full." : `A bot could not join (${joined.reason}).`);
  const seats = joined.state.seats.map((seat) =>
    seat.seatId === joined.seatId ? { ...seat, connected: false, disconnectedAt: null, bot: true } : seat,
  );
  return { state: { ...joined.state, seats }, reply: { ok: true, message: `Bot ${botNumber} joined.` } };
}

export function applyDevCommand(
  room: RoomState,
  actorSeatId: string,
  command: DevCommand,
  input: DevInput,
  games: GameRegistry = GAME_REGISTRY,
): DevOutcome {
  switch (command.kind) {
    case "snapshot": {
      const found = devGame(room, games);
      return { state: room, reply: typeof found === "string" ? { ok: room.game === null, message: found } : { ok: true, message: "Snapshot sent." } };
    }
    case "load-state":
      return loadState(room, command.state, input, games);
    case "shortcut":
      return runShortcut(room, command.id, command.params, input, games);
    case "autoplay":
      return autoplay(room, actorSeatId, command, input, games);
    case "add-bot":
      return addBot(room, input, games);
    default: {
      const exhaustive: never = command;
      void exhaustive;
      return refuse(room, "Unknown dev command.");
    }
  }
}

/** The whole game state for the dev socket that asked; `null` when the
 * room has no game or its game has no dev hooks. */
export function devStateFrame(room: RoomState, games: GameRegistry = GAME_REGISTRY): DevStateFrame | null {
  const found = devGame(room, games);
  if (typeof found === "string") return null;
  const { dev, game } = found;
  return { type: "dev_state", game, shortcuts: dev.shortcuts(game), inspect: dev.inspect(game), milestone: dev.milestone(game) };
}
