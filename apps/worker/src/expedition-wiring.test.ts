// Phase 11, Plan 07: end-to-end Expedition wiring through the real room
// layer (COMM-03/ENG-03). An Expedition room goes lobby -> in_progress ->
// ended through room-state.ts's real functions (createEmptyRoom, joinRoom,
// startGame, applyGameAction) — the SAME path the Durable Object uses. Bots
// decide ONLY from their own projected view (never from room.game), mirroring
// what a browser client can know; every candidate action is filtered through
// the real `applyGameAction` (a rejected candidate returns ok:false and
// changes nothing), the same discipline as
// packages/rules/src/expedition/run/run-test-support.ts's
// enumerateLegalRunActions. No non-seeded randomness — every run is driven by
// a fixed seed and a deterministic, priority-ordered candidate search.
//
// At every step, every seat's (and an unseated "spectator"'s) projected view
// is asserted to pass the registry's strict ExpeditionViewSchema
// (projectSeatView is never null for a seat), and the view encoded as a real
// wire frame is leak-checked by @games/rules's checkExpeditionViewForLeaks
// with secrets derived independently from RunState (never from the
// projection under test) — including the raw seed-substring scan, since the
// seed is passed through to secretsForExpeditionSeat.

import { describe, expect, it } from "vitest";
import { checkExpeditionViewForLeaks, secretsForExpeditionSeat } from "@games/rules";
import type { ExpeditionEndResult, RunAction, RunState } from "@games/rules";
import type { RoomCode, RoomState } from "@games/schema";
import { encodeServerMessage } from "@games/schema";
import { EXPEDITION_GAME_ID } from "@games/schema/games/expedition";
import type { ExpeditionViewWire } from "@games/schema/games/expedition";
import { applyGameAction, createEmptyRoom, joinRoom, startGame } from "./room-state";
import type { JoinInput } from "./room-state";
import { GAME_REGISTRY } from "./game-registration";
import { mintSeatToken } from "./seat-identity";
import { projectSeatView } from "./seat-projection";

const ROOM_CODE = "ABCDEF" as RoomCode;

// Two fixed 32-char lowercase hex seeds (T-11-03's raw substring scan stays
// live throughout every run since these are passed to
// secretsForExpeditionSeat's optional `seed` parameter).
const SEEDS = ["11112222333344445555666677778888", "89abcdef89abcdef89abcdef89abcdef"] as const;
const PLAYER_COUNTS = [3, 4, 5] as const;
const STEP_BOUND = 20000;

/** Joins `seatCount` seats into a fresh room, locking it to Expedition on the
 * first join. Deterministic seat ids/tokens, mirroring
 * redaction-wire.test.ts's buildStartedRoom fixture-building style. */
function joinSeats(seatCount: number): { state: RoomState; seatIds: string[] } {
  let state = createEmptyRoom(ROOM_CODE, 0);
  const seatIds: string[] = [];
  let now = 1;
  for (let i = 0; i < seatCount; i++) {
    const input: JoinInput = {
      displayName: `Player${i}`,
      gameId: EXPEDITION_GAME_ID,
      now: now++,
      mintSeatId: () => `seat-${i}`,
      mintSeatToken,
    };
    const result = joinRoom(state, input);
    if (!result.ok) throw new Error("unreachable: join failed building fixture");
    state = result.state;
    seatIds.push(result.seatId);
  }
  return { state, seatIds };
}

/** Every candidate action for `seatId`, built ONLY from `view` (the seat's
 * own projected view — bots never read room.game to decide). Priority order
 * per Plan 11-07's <action> spec: pick-draft, set-loadout (at most once per
 * seat per fireside visit, tracked via `setLoadoutDone`), ready, use-gear (in
 * every window a candidate could be usable), whisper, skip-window,
 * pick-objective, play-card. `applyGameAction` (called by the caller) is the
 * sole arbiter of legality — a candidate here is a GUESS, not a re-derived
 * rule. */
function buildCandidates(view: ExpeditionViewWire, seatId: string, setLoadoutDone: Set<string>): RunAction[] {
  const candidates: RunAction[] = [];

  if (view.yourDraftOffer !== null) {
    for (const gearId of view.yourDraftOffer) {
      candidates.push({ type: "pick-draft", gearId });
    }
  }

  // Tracked by seatId + campNumber + history length (both read from the
  // VIEW, never from room.game) so set-loadout is tried at most once per
  // seat per fireside visit, letting `ready` actually get a turn afterward.
  const loadoutKey = `${seatId}:${view.campNumber}:${view.history.length}`;
  if (!setLoadoutDone.has(loadoutKey)) {
    candidates.push({ type: "set-loadout", gearIds: Array.from(view.yourOwnedGearIds) });
    for (const gearId of view.yourOwnedGearIds) {
      candidates.push({ type: "set-loadout", gearIds: [gearId] });
    }
    candidates.push({ type: "set-loadout", gearIds: [] });
    setLoadoutDone.add(loadoutKey);
  }

  candidates.push({ type: "ready" });

  const teammateIds = view.seats.map((seat) => seat.seatId).filter((id) => id !== seatId);
  const ownCardIds = view.attempt?.camp !== null && view.attempt?.camp !== undefined
    ? view.attempt.camp.yourHand.map((card) => card.id)
    : [];
  const visibleObjectiveIds =
    view.attempt?.camp !== null && view.attempt?.camp !== undefined
      ? view.attempt.camp.objectives.map((objective) => objective.id)
      : [];

  for (const gear of view.yourGear) {
    if (!gear.usableNow) continue;
    candidates.push({ type: "use-gear", gearId: gear.gearId, targets: [] });
    for (const teammateId of teammateIds) {
      candidates.push({ type: "use-gear", gearId: gear.gearId, targets: [teammateId] });
    }
    for (const cardId of ownCardIds) {
      candidates.push({ type: "use-gear", gearId: gear.gearId, targets: [cardId] });
    }
    for (const objectiveId of visibleObjectiveIds) {
      candidates.push({ type: "use-gear", gearId: gear.gearId, targets: [objectiveId] });
    }
    for (const teammateId of teammateIds) {
      for (const cardId of ownCardIds) {
        candidates.push({ type: "use-gear", gearId: gear.gearId, targets: [teammateId, cardId] });
      }
    }
    for (const cardId of ownCardIds) {
      for (const teammateId of teammateIds) {
        candidates.push({ type: "use-gear", gearId: gear.gearId, targets: [cardId, teammateId] });
      }
    }
  }

  for (const teammateId of teammateIds) {
    for (const cardId of ownCardIds) {
      candidates.push({ type: "whisper", targetSeatId: teammateId, cardId });
    }
  }

  candidates.push({ type: "skip-window" });

  const unownedObjectiveIds =
    view.attempt?.camp !== null && view.attempt?.camp !== undefined
      ? view.attempt.camp.objectives.filter((objective) => objective.ownerSeatId === null).map((o) => o.id)
      : [];
  for (const objectiveId of unownedObjectiveIds) {
    candidates.push({ type: "pick-objective", objectiveId });
  }

  const legalCardIds =
    view.attempt?.camp !== null && view.attempt?.camp !== undefined ? view.attempt.camp.yourLegalCardIds : [];
  const playCardIds = legalCardIds.length > 0 ? legalCardIds : ownCardIds;
  for (const cardId of playCardIds) {
    candidates.push({ type: "play-card", cardId });
  }

  return candidates;
}

type RunCounters = {
  phaseCounts: Record<string, number>;
  revealViews: number;
  gearSpentViews: number;
};

/** Drives a single `seatCount`-player Expedition room from `startGame`
 * through `status === "ended"` using ONLY the real room-layer functions,
 * with per-step schema + wire leak checks for every seat plus an unseated
 * "spectator" viewer, accumulating non-vacuity evidence into `counters`. */
function driveExpeditionRoomToEnd(seatCount: number, seed: string, counters: RunCounters): void {
  const { state: initial, seatIds } = joinSeats(seatCount);
  const hostSeatId = seatIds[0]!;
  const started = startGame(initial, hostSeatId, 1000, seed);
  if (!started.ok) {
    throw new Error(`unreachable: startGame refused building fixture: ${started.reason}`);
  }
  let room = started.state;

  const viewerIds: readonly string[] = [...seatIds, "spectator"];
  const setLoadoutDone = new Set<string>();
  let step = 0;

  while (room.status === "in_progress") {
    if (step > STEP_BOUND) {
      throw new Error(`exceeded step bound ${STEP_BOUND} without reaching "ended" (${seatCount} seats, seed ${seed})`);
    }

    for (const viewerId of viewerIds) {
      const projected = projectSeatView(room, viewerId);
      if (viewerId !== "spectator") {
        expect(projected, `seat ${viewerId} projection failed strict schema at step ${step}`).not.toBeNull();
      }
      if (projected === null) continue;

      const frame = encodeServerMessage({ type: "state", view: projected });
      const secrets = secretsForExpeditionSeat(room.game as RunState, viewerId, undefined, seed);
      const reasons = checkExpeditionViewForLeaks({ view: projected.game, serialized: frame, secrets });
      expect(reasons, `leak at step ${step} for viewer "${viewerId}": ${JSON.stringify(reasons)}`).toEqual([]);

      const gameView = projected.game as ExpeditionViewWire;
      counters.phaseCounts[gameView.runPhase] = (counters.phaseCounts[gameView.runPhase] ?? 0) + 1;
      if (gameView.attempt !== null && gameView.attempt.reveals.length > 0) counters.revealViews++;
      if (gameView.yourGear.some((gear) => gear.spent)) counters.gearSpentViews++;
    }

    let committed = false;
    for (let offset = 0; offset < seatIds.length && !committed; offset++) {
      const seatId = seatIds[(step + offset) % seatIds.length]!;
      const projected = projectSeatView(room, seatId);
      if (projected === null) continue;
      const view = projected.game as ExpeditionViewWire;
      const candidates = buildCandidates(view, seatId, setLoadoutDone);

      for (const action of candidates) {
        const result = applyGameAction(room, seatId, `a${step}`, action, room.lastActivityAt + 1);
        if (result.ok) {
          room = result.state;
          committed = true;
          break;
        }
      }
    }

    if (!committed) {
      const anyView = projectSeatView(room, seatIds[0]!)?.game as ExpeditionViewWire | undefined;
      throw new Error(
        `no seat had an accepted candidate at step ${step}, runPhase ${anyView?.runPhase ?? "unknown"} (${seatCount} seats, seed ${seed})`,
      );
    }

    step++;
  }

  expect(room.status).toBe("ended");
  const endResult = GAME_REGISTRY.expedition.adapter.checkGameEnd(room.game) as ExpeditionEndResult | null;
  expect(endResult, "checkGameEnd must produce a result once the room has ended").not.toBeNull();
  if (endResult === null) throw new Error("unreachable");
  expect(["won", "lost"]).toContain(endResult.outcome);
  expect(Number.isInteger(endResult.campReached)).toBe(true);
  expect(endResult.campReached).toBeGreaterThanOrEqual(1);
  expect(endResult.campReached).toBeLessThanOrEqual(6);
  expect(endResult.suppliesLeft).toBeGreaterThanOrEqual(0);
}

describe("Expedition room lobby limits (MGR-02)", () => {
  it("locks the room to expedition with a null config on first join", () => {
    const { state } = joinSeats(1);
    expect(state.gameId).toBe(EXPEDITION_GAME_ID);
    expect(state.config).toBeNull();
  });

  it("refuses startGame with 1 or 2 seats (bad_request)", () => {
    const { state: state1, seatIds: seatIds1 } = joinSeats(1);
    const result1 = startGame(state1, seatIds1[0]!, 100, SEEDS[0]);
    expect(result1.ok).toBe(false);
    if (!result1.ok) expect(result1.reason).toBe("bad_request");

    const { state: state2, seatIds: seatIds2 } = joinSeats(2);
    const result2 = startGame(state2, seatIds2[0]!, 100, SEEDS[1]);
    expect(result2.ok).toBe(false);
    if (!result2.ok) expect(result2.reason).toBe("bad_request");
  });

  it("refuses a 6th join (full)", () => {
    const { state } = joinSeats(5);
    const input: JoinInput = {
      displayName: "Player5",
      gameId: EXPEDITION_GAME_ID,
      now: 999,
      mintSeatId: () => "seat-5",
      mintSeatToken,
    };
    const result = joinRoom(state, input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("full");
  });

  it("starts successfully with 3 seats", () => {
    const { state, seatIds } = joinSeats(3);
    const result = startGame(state, seatIds[0]!, 100, SEEDS[0]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.status).toBe("in_progress");
  });
});

describe("Expedition full room-layer runs: lobby -> in_progress -> ended (COMM-03/ENG-03/T-11-23/T-11-09/T-11-21/T-11-24)", () => {
  const counters: RunCounters = { phaseCounts: {}, revealViews: 0, gearSpentViews: 0 };

  for (const playerCount of PLAYER_COUNTS) {
    for (const seed of SEEDS) {
      it(
        `drives a ${playerCount}-seat run (seed ${seed.slice(0, 8)}...) to "ended" with every step schema-valid and leak-free`,
        () => {
          driveExpeditionRoomToEnd(playerCount, seed, counters);
        },
        120000,
      );
    }
  }

  it("non-vacuity: views were checked in fireside and camp phases, with at least one reveal and one spent gear reaching the wire across all six runs", () => {
    expect(counters.phaseCounts["fireside"] ?? 0, "expected fireside views to be checked").toBeGreaterThan(0);
    expect(counters.phaseCounts["camp"] ?? 0, "expected camp views to be checked").toBeGreaterThan(0);
    expect(counters.revealViews, "expected at least one checked view with a non-empty reveals list").toBeGreaterThan(0);
    expect(counters.gearSpentViews, "expected at least one checked view with a spent gear item").toBeGreaterThan(0);
  });
});
