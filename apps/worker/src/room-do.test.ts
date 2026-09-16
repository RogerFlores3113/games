// Integration test driving the REAL RoomDO over real WebSockets against a
// live `wrangler dev` instance — the pieces Wave 2's unit tests structurally
// could not reach (partyserver's own hibernation lifecycle, the real Alarm
// API, real WebSocket close codes).
//
// Approach chosen: spawn `npx wrangler dev` as a child process (not
// `@cloudflare/vitest-pool-workers`). `@cloudflare/vitest-pool-workers@0.22.0`
// installs cleanly against wrangler@4.128.0/vitest@4.1.11 (verified), but
// wiring it in as a SECOND, workerd-runtime Vitest project alongside this
// repo's existing Node-runtime `worker` project (which the other five
// apps/worker test files depend on, via the cloudflare:workers shim) is a
// materially larger harness change than this plan's glue-only scope
// warrants. A spawned `wrangler dev` child process gives an equally real
// workerd instance with a much smaller footprint, and — critically for the
// D-17 restart test below — killing that child process is an unambiguous,
// undeniable way to prove real eviction: there is no in-memory JS object
// left anywhere to accidentally answer from.
//
// D-17 (ROADMAP success criterion #5c): the restart-durability test below
// kills the spawned `wrangler dev` process and respawns it on the SAME port
// with the SAME `--persist-to` directory, then reconnects with the saved
// seat token. Closing sockets and reconnecting would NOT be sufficient
// evidence — the DO instance can survive a client disconnect entirely in
// memory, so that version of the test would pass whether or not persistence
// actually worked. Killing the process is what makes this test meaningful.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOBBY_SEAT_RELEASE_GRACE_MS } from "@games/schema";
import { checkHanabiViewForLeaks } from "@games/rules";
import type { HanabiSeatSecrets } from "@games/rules";
import { mintRoomCode } from "./seat-identity";

const PORT = 18787;
const BASE_URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;

let persistDir: string;
let child: ChildProcess;

/** `npx wrangler dev` fans out into a multi-process tree (npx -> wrangler's
 * CLI -> the `workerd` runtime binary itself, which is what actually holds
 * the port). Killing only the immediate `npx` child leaves `workerd`
 * running and bound to the port, so a killed-and-respawned test would
 * silently talk to the OLD, un-evicted process on the next connection —
 * exactly the false-positive this D-17 test exists to avoid. `detached:
 * true` puts the whole tree in its own process group; `killAndWait` below
 * signals the group (negative pid), not just the immediate child. */
function spawnWrangler(): ChildProcess {
  return spawn(
    "npx",
    [
      "wrangler",
      "dev",
      "--port",
      String(PORT),
      "--persist-to",
      persistDir,
      "--log-level",
      "error",
    ],
    {
      cwd: new URL("..", import.meta.url).pathname,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
}

async function waitForReady(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/__smoke`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("wrangler dev did not become ready in time");
}

function killAndWait(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    proc.once("exit", () => resolve());
    // Signal the whole detached process group (negative pid), not just the
    // immediate `npx` process — see the comment on `spawnWrangler`.
    try {
      if (proc.pid !== undefined) process.kill(-proc.pid, "SIGKILL");
    } catch {
      proc.kill("SIGKILL");
    }
  });
}

function roomUrl(code: string): string {
  return `${WS_URL}/parties/room/${code}`;
}

/** Opens a WebSocket and resolves once the connection is open. */
function openSocket(code: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(roomUrl(code));
    ws.addEventListener("open", () => resolve(ws), { once: true });
    ws.addEventListener("error", (e) => reject(e), { once: true });
  });
}

type Parsed = Record<string, unknown> & { type: string };

/** Collects every message received on a socket, in arrival order, as BOTH
 * the raw wire string and the parsed object. Messages can arrive in tight
 * bursts (e.g. `joined` immediately followed by a `state` push) well within
 * a single polling tick, so tests must search by PREDICATE (message type,
 * or a shape check) rather than assume "the Nth message" or "the most
 * recent message" is the one they're looking for. */
function collectMessages(ws: WebSocket): {
  raw: string[];
  parsed: Parsed[];
  waitFor: (predicate: (msg: Parsed) => boolean, timeoutMs?: number) => Promise<Parsed>;
  waitForClose: (timeoutMs?: number) => Promise<{ code: number; reason: string }>;
} {
  const raw: string[] = [];
  const parsed: Parsed[] = [];
  ws.addEventListener("message", (event) => {
    const text = String(event.data);
    raw.push(text);
    parsed.push(JSON.parse(text) as Parsed);
  });

  let closeInfo: { code: number; reason: string } | null = null;
  ws.addEventListener("close", (event) => {
    closeInfo = { code: event.code, reason: event.reason };
  });

  const waitFor = async (predicate: (msg: Parsed) => boolean, timeoutMs = 5000): Promise<Parsed> => {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const found = parsed.find(predicate);
      if (found !== undefined) return found;
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for a matching message; got: ${JSON.stringify(raw)}`);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  };

  const waitForClose = async (timeoutMs = 5000): Promise<{ code: number; reason: string }> => {
    const deadline = Date.now() + timeoutMs;
    while (closeInfo === null) {
      if (Date.now() > deadline) throw new Error("Timed out waiting for close");
      await new Promise((r) => setTimeout(r, 25));
    }
    return closeInfo;
  };

  return { raw, parsed, waitFor, waitForClose };
}

function send(ws: WebSocket, msg: unknown): void {
  ws.send(JSON.stringify(msg));
}

beforeAll(async () => {
  persistDir = mkdtempSync(join(tmpdir(), "room-do-test-"));
  child = spawnWrangler();
  await waitForReady();
}, 60_000);

afterAll(async () => {
  if (child) await killAndWait(child);
  if (persistDir) rmSync(persistDir, { recursive: true, force: true });
}, 15_000);

describe("RoomDO integration (live wrangler dev)", () => {
  it("ROOM-04: connect two sockets, join both, seat list grows to 2 with connected flags; closing one flips its connected flag for the other", async () => {
    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    const joined1 = (await c1.waitFor((m) => m.type === "joined")) as Parsed & { seatId: string };

    const ws2 = await openSocket(code);
    const c2 = collectMessages(ws2);
    send(ws2, { type: "join", displayName: "Bob" });
    await c2.waitFor((m) => m.type === "joined");

    // ws1 should receive a "state" push reflecting Bob's arrival (2 seats).
    const afterJoin = await c1.waitFor(
      (m) => m.type === "state" && (m.view as { seats: unknown[] }).seats.length === 2,
    );
    const seatsAfterJoin = (afterJoin.view as { seats: { seatId: string; connected: boolean }[] }).seats;
    expect(seatsAfterJoin.every((s) => s.connected)).toBe(true);

    ws2.close();

    const afterClose = await c1.waitFor((m) => {
      if (m.type !== "state") return false;
      const seats = (m.view as { seats: { seatId: string; connected: boolean }[] }).seats;
      const bob = seats.find((s) => s.seatId !== joined1.seatId);
      return bob !== undefined && bob.connected === false;
    }, 8000);
    expect(afterClose.type).toBe("state");

    ws1.close();
  });

  it("per-seat projection (FDN-01 / HIDE-02 groundwork): each socket gets a distinct payload and never sees the other's seat token in raw bytes", async () => {
    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    const joined1 = (await c1.waitFor((m) => m.type === "joined")) as Parsed & {
      seatId: string;
      seatToken: string;
    };

    const ws2 = await openSocket(code);
    const c2 = collectMessages(ws2);
    send(ws2, { type: "join", displayName: "Bob" });
    const joined2 = (await c2.waitFor((m) => m.type === "joined")) as Parsed & {
      seatId: string;
      seatToken: string;
    };

    expect(joined1.seatId).not.toBe(joined2.seatId);

    // Wait for both sockets to have observed the full 2-seat room.
    const view1 = await c1.waitFor(
      (m) => m.type === "state" && (m.view as { seats: unknown[] }).seats.length === 2,
    );
    const view2 = await c2.waitFor(
      (m) => m.type === "state" && (m.view as { seats: unknown[] }).seats.length === 2,
    );

    for (const msg of c1.raw) {
      expect(msg.includes(joined2.seatToken)).toBe(false);
    }
    for (const msg of c2.raw) {
      expect(msg.includes(joined1.seatToken)).toBe(false);
    }

    expect((view1.view as { youSeatId: string }).youSeatId).not.toBe(
      (view2.view as { youSeatId: string }).youSeatId,
    );

    ws1.close();
    ws2.close();
  });

  it("RT-07 / D-08: a socket presenting an existing seat token rebinds to that seat and supersedes the prior connection with close code 4001", async () => {
    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    const joined1 = (await c1.waitFor((m) => m.type === "joined")) as Parsed & {
      seatId: string;
      seatToken: string;
    };

    // Socket 2 presents socket 1's seat token: legitimate reclaim.
    const ws2 = await openSocket(code);
    const c2 = collectMessages(ws2);
    send(ws2, { type: "join", displayName: "Alice", seatToken: joined1.seatToken });
    const joined2 = (await c2.waitFor((m) => m.type === "joined")) as Parsed & { seatId: string };
    expect(joined2.seatId).toBe(joined1.seatId);

    // Socket 1 must receive {type:"superseded"} then close with 4001.
    await c1.waitFor((m) => m.type === "superseded", 8000);
    const closeInfo = await c1.waitForClose(8000);
    expect(closeInfo.code).toBe(4001);

    ws2.close();
  });

  it("CR-01: the superseded socket's close does not mark the surviving connection's seat disconnected, and the lobby grace timer never releases it", async () => {
    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    const joined1 = (await c1.waitFor((m) => m.type === "joined")) as Parsed & {
      seatId: string;
      seatToken: string;
    };

    const ws2 = await openSocket(code);
    const c2 = collectMessages(ws2);
    send(ws2, { type: "join", displayName: "Alice", seatToken: joined1.seatToken });
    await c2.waitFor((m) => m.type === "joined");

    // Let the superseded socket's close handshake fully complete, so its
    // server-side `onClose` has run before anything is asserted.
    await c1.waitForClose(8000);
    await new Promise((r) => setTimeout(r, 1000));

    type SeatViewShape = { hostSeatId: string | null; seats: { seatId: string; connected: boolean }[] };
    const seatIn = (m: Parsed) => (m.view as SeatViewShape).seats.find((s) => s.seatId === joined1.seatId);
    for (const m of c2.parsed.filter((msg) => msg.type === "state" || msg.type === "joined")) {
      expect(seatIn(m)?.connected).toBe(true);
    }

    // Wait past the lobby seat-release grace. A seat wrongly marked
    // disconnected would be deleted by the alarm here, and the surviving
    // connection would lose host (set_variant then fails with not_host).
    await new Promise((r) => setTimeout(r, LOBBY_SEAT_RELEASE_GRACE_MS + 3000));

    const before = c2.parsed.length;
    send(ws2, { type: "set_variant", variant: "rainbow" });
    const after = await c2.waitFor(
      (m) => c2.parsed.indexOf(m) >= before && (m.type === "state" || m.type === "error"),
      5000,
    );
    expect(after.type).toBe("state");
    expect((after.view as SeatViewShape).hostSeatId).toBe(joined1.seatId);
    expect(seatIn(after)?.connected).toBe(true);

    ws2.close();
  }, LOBBY_SEAT_RELEASE_GRACE_MS + 20_000);

  it("RT-07: a fabricated seat token never reclaims an existing seat — it gets a brand NEW seat", async () => {
    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    const joined1 = (await c1.waitFor((m) => m.type === "joined")) as Parsed & { seatId: string };

    const fabricated = "x".repeat(24);
    const ws3 = await openSocket(code);
    const c3 = collectMessages(ws3);
    send(ws3, { type: "join", displayName: "Charlie", seatToken: fabricated });
    const joined3 = (await c3.waitFor((m) => m.type === "joined")) as Parsed & { seatId: string };
    expect(joined3.seatId).not.toBe(joined1.seatId);

    ws1.close();
    ws3.close();
  });

  it("ROOM-07 / D-14: a fresh socket with no seat token joining an in-progress room is refused with reason in_progress and closed, receiving no state/joined message", async () => {
    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    await c1.waitFor((m) => m.type === "joined");

    const ws2 = await openSocket(code);
    const c2 = collectMessages(ws2);
    send(ws2, { type: "join", displayName: "Bob" });
    await c2.waitFor((m) => m.type === "joined");
    await c1.waitFor((m) => m.type === "state" && (m.view as { seats: unknown[] }).seats.length === 2);

    send(ws1, { type: "start_game" });
    await c1.waitFor((m) => m.type === "state" && (m.view as { status: string }).status === "in_progress", 8000);

    const ws4 = await openSocket(code);
    const c4 = collectMessages(ws4);
    send(ws4, { type: "join", displayName: "Dave" });
    const refused = (await c4.waitFor((m) => m.type === "refused", 8000)) as Parsed & { reason: string };
    expect(refused.reason).toBe("in_progress");
    await c4.waitForClose(8000);
    expect(c4.parsed.some((m) => m.type === "joined")).toBe(false);
    expect(c4.parsed.some((m) => m.type === "state")).toBe(false);

    ws1.close();
    ws2.close();
  });

  it("WR-03: a second join on an already-seated connection is refused and mints no ghost seat", async () => {
    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    await c1.waitFor((m) => m.type === "joined");
    const joinedBefore = c1.parsed.filter((m) => m.type === "joined").length;

    send(ws1, { type: "join", displayName: "Mallory" });
    const refusal = (await c1.waitFor((m) => m.type === "error", 5000)) as Parsed & { code: string };
    expect(refusal.code).toBe("bad_request");
    expect(c1.parsed.filter((m) => m.type === "joined").length).toBe(joinedBefore);

    // A second player sees exactly two seats: Alice and themself.
    const ws2 = await openSocket(code);
    const c2 = collectMessages(ws2);
    send(ws2, { type: "join", displayName: "Bob" });
    const joined2 = (await c2.waitFor((m) => m.type === "joined")) as Parsed & {
      view: { seats: { displayLabel: string }[] };
    };
    expect(joined2.view.seats.map((s) => s.displayLabel)).toEqual(["Alice", "Bob"]);

    ws1.close();
    ws2.close();
  });

  it("CR-03: a leave sent mid-game is refused and the seat stays in turn order", async () => {
    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    await c1.waitFor((m) => m.type === "joined");

    const ws2 = await openSocket(code);
    const c2 = collectMessages(ws2);
    send(ws2, { type: "join", displayName: "Bob" });
    await c2.waitFor((m) => m.type === "joined");
    await c1.waitFor((m) => m.type === "state" && (m.view as { seats: unknown[] }).seats.length === 2);

    send(ws1, { type: "start_game" });
    await c2.waitFor((m) => m.type === "state" && (m.view as { status: string }).status === "in_progress", 8000);

    send(ws2, { type: "leave" });
    const refusal = (await c2.waitFor((m) => m.type === "error", 5000)) as Parsed & { code: string };
    expect(refusal.code).toBe("bad_request");

    // Derive Alice's action from her own latest game-bearing frame — this
    // test only ever sees wire frames, never server state. Take a rank that
    // appears on one of Bob's visible cards: guaranteed legal (a rank
    // actually present cannot be refused for touching nothing; clueTokens
    // is at its maximum at game start so it cannot be refused for lack of
    // tokens).
    type AliceView = {
      game: {
        otherHands: Array<{ seatId: string; cards: Array<{ hidden: boolean; rank?: number }> }>;
      } | null;
    };
    const aliceState = (await c1.waitFor(
      (m) => m.type === "state" && (m.view as AliceView).game !== null,
      5000,
    )) as Parsed & { view: AliceView };
    const bobHand = aliceState.view.game!.otherHands[0]!;
    const bobVisibleCard = bobHand.cards.find((c) => !c.hidden && c.rank !== undefined)!;

    // Alice takes her turn; the resulting state still has both seats, and it
    // is now Bob's turn — the game did not lose a seat it will need.
    send(ws1, {
      type: "game_action",
      actionId: "test-action-cr03",
      request: {
        type: "clue",
        targetSeatId: bobHand.seatId,
        clue: { type: "rank", value: bobVisibleCard.rank },
      },
    });
    const afterTurn = await c2.waitFor(
      (m) => m.type === "state" && (m.view as { game: { history: unknown[] } | null }).game?.history.length === 1,
      5000,
    );
    const view = afterTurn.view as { seats: unknown[]; game: { isYourTurn: boolean } };
    expect(view.seats).toHaveLength(2);
    expect(view.game.isYourTurn).toBe(true);

    ws1.close();
    ws2.close();
  });

  it("robustness: non-JSON input yields an error message and the connection stays usable for a subsequent legal message", async () => {
    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    await c1.waitFor((m) => m.type === "joined");
    const errorsBefore = c1.parsed.filter((m) => m.type === "error").length;

    ws1.send("not json");
    await c1.waitFor((m) => m.type === "error", 5000);
    expect(c1.parsed.filter((m) => m.type === "error").length).toBeGreaterThan(errorsBefore);

    send(ws1, { type: "set_variant", variant: "rainbow" });
    const afterVariant = await c1.waitFor(
      (m) => m.type === "state" && (m.view as { variant: string }).variant === "rainbow",
      5000,
    );
    expect(afterVariant.type).toBe("state");

    ws1.close();
  });

  it("robustness: a valid-JSON-but-unknown message type yields an error message and the connection stays usable", async () => {
    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    await c1.waitFor((m) => m.type === "joined");
    const errorsBefore = c1.parsed.filter((m) => m.type === "error").length;

    ws1.send(JSON.stringify({ type: "not_a_real_type" }));
    await c1.waitFor((m) => m.type === "error", 5000);
    expect(c1.parsed.filter((m) => m.type === "error").length).toBeGreaterThan(errorsBefore);

    send(ws1, { type: "set_variant", variant: "rainbow" });
    const afterVariant = await c1.waitFor(
      (m) => m.type === "state" && (m.view as { variant: string }).variant === "rainbow",
      5000,
    );
    expect(afterVariant.type).toBe("state");

    ws1.close();
  });

  it("robustness: a join carrying an extra client-asserted key (seatId) yields an error message and the connection stays usable", async () => {
    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    await c1.waitFor((m) => m.type === "joined");
    const errorsBefore = c1.parsed.filter((m) => m.type === "error").length;

    ws1.send(JSON.stringify({ type: "join", displayName: "Alice", seatId: "hax" }));
    await c1.waitFor((m) => m.type === "error", 5000);
    expect(c1.parsed.filter((m) => m.type === "error").length).toBeGreaterThan(errorsBefore);

    send(ws1, { type: "set_variant", variant: "rainbow" });
    const afterVariant = await c1.waitFor(
      (m) => m.type === "state" && (m.view as { variant: string }).variant === "rainbow",
      5000,
    );
    expect(afterVariant.type).toBe("state");

    ws1.close();
  });

  it(
    "HIDE-01 / HIDE-04 (D-11 layer 3): no seat's raw frames carry its own card, the undealt deck, across join, live update, and seat-token reconnect",
    async () => {
      type GameCardHidden = { id: string; hidden: true; facts: unknown };
      type GameCardVisible = { id: string; hidden: false; suit: string; rank: number; facts: unknown };
      type GameCard = GameCardHidden | GameCardVisible;
      type HistoryEntryShape = Record<string, unknown> & { type: string };
      type GameViewShape = {
        yourHand: GameCard[];
        otherHands: { seatId: string; cards: GameCard[] }[];
        stacks: { suit: string; topRank: number }[];
        discard: { id: string; suit: string; rank: number }[];
        clueTokens: number;
        fuses: number;
        deckCount: number;
        finalTurnsRemaining: number | null;
        activeSeatId: string;
        isYourTurn: boolean;
        score: number;
        history: HistoryEntryShape[];
      };
      type RoomViewShape = { status: string; game: GameViewShape | null };

      const code = mintRoomCode();

      const wsAlice = await openSocket(code);
      const cAlice = collectMessages(wsAlice);
      send(wsAlice, { type: "join", displayName: "Alice" });
      const joinedAlice = (await cAlice.waitFor((m) => m.type === "joined")) as Parsed & {
        seatId: string;
        seatToken: string;
        view: RoomViewShape;
      };
      expect(joinedAlice.view.game).toBeNull();

      const wsBob = await openSocket(code);
      const cBob = collectMessages(wsBob);
      send(wsBob, { type: "join", displayName: "Bob" });
      const joinedBob = (await cBob.waitFor((m) => m.type === "joined")) as Parsed & {
        seatId: string;
        seatToken: string;
        view: RoomViewShape;
      };
      expect(joinedBob.view.game).toBeNull();

      const wsCara = await openSocket(code);
      const cCara = collectMessages(wsCara);
      send(wsCara, { type: "join", displayName: "Cara" });
      const joinedCara = (await cCara.waitFor((m) => m.type === "joined")) as Parsed & {
        seatId: string;
        seatToken: string;
        view: RoomViewShape;
      };
      expect(joinedCara.view.game).toBeNull();

      // All three see the full 3-seat lobby before the host starts the game.
      for (const c of [cAlice, cBob, cCara]) {
        await c.waitFor((m) => m.type === "state" && (m.view as { seats: unknown[] }).seats.length === 3, 8000);
      }

      send(wsAlice, { type: "start_game" });
      for (const c of [cAlice, cBob, cCara]) {
        await c.waitFor((m) => m.type === "state" && (m.view as RoomViewShape).status === "in_progress", 8000);
      }

      const seats = [
        { seatId: joinedAlice.seatId, ws: wsAlice, c: cAlice },
        { seatId: joinedBob.seatId, ws: wsBob, c: cBob },
        { seatId: joinedCara.seatId, ws: wsCara, c: cCara },
      ];

      function findActiveSeat(): { seat: (typeof seats)[number]; game: GameViewShape } {
        for (const seat of seats) {
          const latestGameFrame = [...seat.c.parsed]
            .reverse()
            .find((m) => (m.type === "state" || m.type === "joined") && (m.view as RoomViewShape).game !== null);
          const view = latestGameFrame?.view as RoomViewShape | undefined;
          if (view?.game?.isYourTurn === true) return { seat, game: view.game };
        }
        throw new Error("no active seat found among the latest game-bearing frames");
      }

      /** A rank clue naming a rank actually present on a card in some other
       * seat's (visible) hand, from the ACTIVE seat's own captured view —
       * this test only ever sees wire frames. Guaranteed legal: a rank
       * actually present cannot be refused for touching nothing. */
      function legalClueFrom(game: GameViewShape): { targetSeatId: string; rank: number } {
        const target = game.otherHands.find((h) => h.cards.length > 0);
        if (target === undefined) throw new Error("no other seat holds any cards to clue");
        const card = target.cards.find((c): c is GameCardVisible => !c.hidden);
        if (card === undefined) throw new Error("no visible card found to derive a legal clue from");
        return { targetSeatId: target.seatId, rank: card.rank };
      }

      const first = findActiveSeat();
      const firstClue = legalClueFrom(first.game);
      send(first.seat.ws, {
        type: "game_action",
        actionId: "test-action-hide01-first",
        request: {
          type: "clue",
          targetSeatId: firstClue.targetSeatId,
          clue: { type: "rank", value: firstClue.rank },
        },
      });
      for (const seat of seats) {
        await seat.c.waitFor(
          (m) => m.type === "state" && (m.view as RoomViewShape).game?.history.length === 1,
          8000,
        );
      }

      const second = findActiveSeat();
      const secondClue = legalClueFrom(second.game);
      send(second.seat.ws, {
        type: "game_action",
        actionId: "test-action-hide01-second",
        request: {
          type: "clue",
          targetSeatId: secondClue.targetSeatId,
          clue: { type: "rank", value: secondClue.rank },
        },
      });
      for (const seat of seats) {
        await seat.c.waitFor(
          (m) => m.type === "state" && (m.view as RoomViewShape).game?.history.length === 2,
          8000,
        );
      }

      // Reconnect: close Bob's socket and rejoin with his saved seat token.
      // This frame — the reconnect `joined` capture — must be checked
      // explicitly (D-11 layer 3's reconnect requirement).
      wsBob.close();
      const wsBobReconnect = await openSocket(code);
      const cBobReconnect = collectMessages(wsBobReconnect);
      send(wsBobReconnect, { type: "join", displayName: "Bob", seatToken: joinedBob.seatToken });
      const reconnectJoined = (await cBobReconnect.waitFor(
        (m) => m.type === "joined" && (m.view as RoomViewShape).game !== null,
        8000,
      )) as Parsed & { view: RoomViewShape };

      type FrameEntry = { seatId: string; raw: string; parsed: Parsed };
      const frames: FrameEntry[] = [];
      function addFrames(seatId: string, raws: string[], parseds: Parsed[]): void {
        for (let i = 0; i < raws.length; i++) {
          frames.push({ seatId, raw: raws[i]!, parsed: parseds[i]! });
        }
      }
      addFrames(joinedAlice.seatId, cAlice.raw, cAlice.parsed);
      addFrames(joinedBob.seatId, cBob.raw, cBob.parsed);
      addFrames(joinedBob.seatId, cBobReconnect.raw, cBobReconnect.parsed);
      addFrames(joinedCara.seatId, cCara.raw, cCara.parsed);

      // identityById: the true {suit, rank} of every card id legitimately
      // observed with identity by SOME seat — another seat's visible hand
      // card, or a discard-pile entry — never a seat's own yourHand entry
      // (structurally hidden) or an undealt deck entry (never sent). This is
      // the cross-frame correspondence the test uses to recover "the true
      // identity of MY card" without touching server-side state: a seat's
      // own hand card ids come from its own `yourHand[].id`; their true
      // identities are observable in OTHER seats' frames under
      // `otherHands[].cards[]` where the same card id appears with
      // suit/rank.
      const identityById = new Map<string, { suit: string; rank: number }>();
      for (const frame of frames) {
        const game = (frame.parsed as { view?: RoomViewShape }).view?.game;
        if (game === null || game === undefined) continue;
        for (const hand of game.otherHands) {
          for (const card of hand.cards) {
            if (!card.hidden) identityById.set(card.id, { suit: card.suit, rank: card.rank });
          }
        }
        for (const entry of game.discard) {
          identityById.set(entry.id, { suit: entry.suit, rank: entry.rank });
        }
      }

      /** The {suit,rank} multiset legitimately visible in `game`'s own
       * fields (other hands' visible cards, the discard pile, and any
       * play/discard history entry) — the per-frame allowance a leak count
       * must not exceed. */
      function frameIdentityCounts(game: GameViewShape): Map<string, number> {
        const counts = new Map<string, number>();
        const bump = (suit: string, rank: number): void => {
          const key = `${suit}:${rank}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        };
        for (const hand of game.otherHands) {
          for (const card of hand.cards) {
            if (!card.hidden) bump(card.suit, card.rank);
          }
        }
        for (const entry of game.discard) bump(entry.suit, entry.rank);
        for (const entry of game.history) {
          if (entry.type === "play" || entry.type === "discard") {
            bump(entry.suit as string, entry.rank as number);
          }
        }
        return counts;
      }

      function ownCardsFor(seatId: string): HanabiSeatSecrets["ownCards"] {
        const ids = new Set<string>();
        for (const frame of frames) {
          if (frame.seatId !== seatId) continue;
          const game = (frame.parsed as { view?: RoomViewShape }).view?.game;
          if (game === null || game === undefined) continue;
          for (const card of game.yourHand) ids.add(card.id);
        }
        const result: HanabiSeatSecrets["ownCards"][number][] = [];
        for (const id of ids) {
          const identity = identityById.get(id);
          if (identity !== undefined) {
            result.push({ id, ...identity } as HanabiSeatSecrets["ownCards"][number]);
          }
        }
        return result;
      }

      /** Element-wise max, per identity key, across every one of `seatId`'s
       * own captured frames — the static allowance a per-frame observed
       * count is checked against. */
      function allowedIdentityCountsFor(seatId: string): Record<string, number> {
        const maxCounts = new Map<string, number>();
        for (const frame of frames) {
          if (frame.seatId !== seatId) continue;
          const game = (frame.parsed as { view?: RoomViewShape }).view?.game;
          if (game === null || game === undefined) continue;
          for (const [key, count] of frameIdentityCounts(game)) {
            maxCounts.set(key, Math.max(maxCounts.get(key) ?? 0, count));
          }
        }
        return Object.fromEntries(maxCounts);
      }

      const secretsBySeat = new Map<string, HanabiSeatSecrets>();
      for (const seatId of [joinedAlice.seatId, joinedBob.seatId, joinedCara.seatId]) {
        secretsBySeat.set(seatId, {
          ownCards: ownCardsFor(seatId),
          allowedIdentityCounts: allowedIdentityCountsFor(seatId),
          forbiddenTokens: [],
        });
      }

      const gameFrameCountBySeat = new Map<string, number>();
      let reconnectFrameChecked = false;

      for (const frame of frames) {
        const view = (frame.parsed as { view?: RoomViewShape }).view;
        const game = view?.game ?? null;

        if (game !== null) {
          gameFrameCountBySeat.set(frame.seatId, (gameFrameCountBySeat.get(frame.seatId) ?? 0) + 1);
          if (frame.parsed === reconnectJoined) reconnectFrameChecked = true;
        }

        const secrets = secretsBySeat.get(frame.seatId)!;
        const leaks = checkHanabiViewForLeaks({
          view: frame.parsed,
          serialized: frame.raw,
          secrets,
        });
        expect(leaks, `seat ${frame.seatId} leaked in raw frame: ${frame.raw}`).toEqual([]);
      }

      for (const seatId of [joinedAlice.seatId, joinedBob.seatId, joinedCara.seatId]) {
        expect(
          gameFrameCountBySeat.get(seatId) ?? 0,
          `expected at least 3 game-bearing frames checked for seat ${seatId}`,
        ).toBeGreaterThanOrEqual(3);
      }
      expect(reconnectFrameChecked, "expected the reconnect joined frame to be among the checked frames").toBe(true);

      // D-14 (the server-only seed) is not observable from the client side
      // at all and is covered by layers 1/2 (fast-check + wire-string
      // property tests directly over in-memory RoomState.seed); this layer
      // proves own value and the undealt deck are absent from genuine
      // workerd frames, including across a real reconnect.

      wsAlice.close();
      wsBob.close();
      wsCara.close();
      wsBobReconnect.close();
    },
    40_000,
  );

  it("D-17: persisted room state survives a FORCED wrangler dev restart (real eviction, not a socket reconnect) — same seatId, seat list, and variant come back", async () => {
    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    const joined1 = (await c1.waitFor((m) => m.type === "joined")) as Parsed & {
      seatId: string;
      seatToken: string;
    };

    const ws2 = await openSocket(code);
    const c2 = collectMessages(ws2);
    send(ws2, { type: "join", displayName: "Bob" });
    await c2.waitFor((m) => m.type === "joined");
    await c1.waitFor((m) => m.type === "state" && (m.view as { seats: unknown[] }).seats.length === 2);

    send(ws1, { type: "set_variant", variant: "black" });
    await c1.waitFor((m) => m.type === "state" && (m.view as { variant: string }).variant === "black", 5000);

    ws1.close();
    ws2.close();
    // Give the DO a moment to persist the close-driven mutation before the
    // process is killed out from under it.
    await new Promise((r) => setTimeout(r, 500));

    // Genuine eviction: kill the wrangler dev child process entirely (not
    // just closing the WebSocket) and respawn it on the SAME port with the
    // SAME --persist-to directory. Nothing in-memory survives this — the
    // whole workerd process, and every JS object inside it, is gone.
    await killAndWait(child);
    child = spawnWrangler();
    await waitForReady();

    const ws3 = await openSocket(code);
    const c3 = collectMessages(ws3);
    send(ws3, { type: "join", displayName: "Alice", seatToken: joined1.seatToken });
    const reclaimed = (await c3.waitFor((m) => m.type === "joined", 8000)) as Parsed & {
      seatId: string;
      view: { seats: unknown[]; variant: string };
    };
    expect(reclaimed.seatId).toBe(joined1.seatId);
    expect(reclaimed.view.seats).toHaveLength(2);
    expect(reclaimed.view.variant).toBe("black");

    ws3.close();
  }, 40_000);

  it("RT-09 / D-15: a byte-identical duplicate game_action (a clue) applies exactly once on the live wire", async () => {
    type GameCardHidden = { id: string; hidden: true; facts: unknown };
    type GameCardVisible = { id: string; hidden: false; suit: string; rank: number; facts: unknown };
    type GameCard = GameCardHidden | GameCardVisible;
    type GameViewShape = {
      otherHands: { seatId: string; cards: GameCard[] }[];
      clueTokens: number;
      deckCount: number;
      activeSeatId: string;
      isYourTurn: boolean;
      history: unknown[];
    };
    type RoomViewShape = { status: string; game: GameViewShape | null };

    const code = mintRoomCode();
    const ws1 = await openSocket(code);
    const c1 = collectMessages(ws1);
    send(ws1, { type: "join", displayName: "Alice" });
    const joined1 = (await c1.waitFor((m) => m.type === "joined")) as Parsed & { seatId: string };

    const ws2 = await openSocket(code);
    const c2 = collectMessages(ws2);
    send(ws2, { type: "join", displayName: "Bob" });
    await c2.waitFor((m) => m.type === "joined");
    await c1.waitFor((m) => m.type === "state" && (m.view as { seats: unknown[] }).seats.length === 2);

    send(ws1, { type: "start_game" });
    for (const c of [c1, c2]) {
      await c.waitFor((m) => m.type === "state" && (m.view as RoomViewShape).status === "in_progress", 8000);
    }

    const seats = [
      { seatId: joined1.seatId, ws: ws1, c: c1 },
      { seatId: (await c2.waitFor((m) => m.type === "joined")).seatId as string, ws: ws2, c: c2 },
    ];

    function findActiveSeat(): { seat: (typeof seats)[number]; game: GameViewShape } {
      for (const seat of seats) {
        const latestGameFrame = [...seat.c.parsed]
          .reverse()
          .find((m) => (m.type === "state" || m.type === "joined") && (m.view as RoomViewShape).game !== null);
        const view = latestGameFrame?.view as RoomViewShape | undefined;
        if (view?.game?.isYourTurn === true) return { seat, game: view.game };
      }
      throw new Error("no active seat found among the latest game-bearing frames");
    }

    /** A rank clue naming a rank actually present on a visible card in the
     * other seat's hand — guaranteed legal (touches something, and
     * clueTokens is at max at game start). */
    function legalClueFrom(game: GameViewShape): { targetSeatId: string; rank: number } {
      const target = game.otherHands.find((h) => h.cards.length > 0);
      if (target === undefined) throw new Error("no other seat holds any cards to clue");
      const card = target.cards.find((c): c is GameCardVisible => !c.hidden);
      if (card === undefined) throw new Error("no visible card found to derive a legal clue from");
      return { targetSeatId: target.seatId, rank: card.rank };
    }

    const active = findActiveSeat();
    const clue = legalClueFrom(active.game);

    // Built ONCE as a single object with a fixed literal actionId, so the
    // second send below is byte-identical to the first.
    const clueFrame = {
      type: "game_action",
      actionId: "test-action-rt09-dup-clue",
      request: {
        type: "clue",
        targetSeatId: clue.targetSeatId,
        clue: { type: "rank", value: clue.rank },
      },
    };

    send(active.seat.ws, clueFrame);
    const firstApplied = (await active.seat.c.waitFor(
      (m) => m.type === "state" && (m.view as RoomViewShape).game?.history.length === 1,
      8000,
    )) as Parsed & { view: RoomViewShape };
    const before = {
      clueTokens: firstApplied.view.game!.clueTokens,
      historyLength: firstApplied.view.game!.history.length,
      activeSeatId: firstApplied.view.game!.activeSeatId,
      isYourTurn: firstApplied.view.game!.isYourTurn,
      deckCount: firstApplied.view.game!.deckCount,
    };

    // TRAP: the dedup branch re-sends the actor's CURRENT (unchanged) view,
    // which is byte-identical to the view already captured above. A naive
    // `waitFor` predicate matching "a state frame with history.length === 1"
    // would therefore match the ALREADY-RECEIVED first frame and resolve
    // immediately — proving nothing about whether a second response even
    // arrived. Record the frame count now and require the matching frame to
    // be at or beyond this index, exactly like the post-grace `set_variant`
    // idiom above.
    const parsedCountBeforeDup = active.seat.c.parsed.length;
    send(active.seat.ws, clueFrame);
    const dupApplied = (await active.seat.c.waitFor(
      (m) => active.seat.c.parsed.indexOf(m) >= parsedCountBeforeDup && m.type === "state",
      8000,
    )) as Parsed & { view: RoomViewShape };

    expect(dupApplied.view.game!.clueTokens).toBe(before.clueTokens);
    expect(dupApplied.view.game!.history.length).toBe(before.historyLength);
    expect(dupApplied.view.game!.activeSeatId).toBe(before.activeSeatId);
    expect(dupApplied.view.game!.isYourTurn).toBe(before.isYourTurn);
    expect(dupApplied.view.game!.deckCount).toBe(before.deckCount);

    // Positive control: a DIFFERENT actionId carrying a legal action for the
    // now-active seat still advances the game, proving the seat is not
    // simply frozen.
    const stillActive = findActiveSeat();
    const secondClue = legalClueFrom(stillActive.game);
    send(stillActive.seat.ws, {
      type: "game_action",
      actionId: "test-action-rt09-control",
      request: {
        type: "clue",
        targetSeatId: secondClue.targetSeatId,
        clue: { type: "rank", value: secondClue.rank },
      },
    });
    await stillActive.seat.c.waitFor(
      (m) => m.type === "state" && (m.view as RoomViewShape).game?.history.length === before.historyLength + 1,
      8000,
    );

    ws1.close();
    ws2.close();
  });
});
