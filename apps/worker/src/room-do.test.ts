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

    // Alice takes her turn; the resulting state still has both seats, and it
    // is now Bob's turn — the game did not lose a seat it will need.
    send(ws1, { type: "game_action", request: { type: "increment" } });
    const afterTurn = await c2.waitFor(
      (m) => m.type === "state" && (m.view as { game: { turnsTaken: number } | null }).game?.turnsTaken === 1,
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
});
