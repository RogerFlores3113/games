import { describe, expect, it } from "vitest";
import { attemptOf } from "../run/attempt";
import { CATALOG } from "../run/catalog";
import { rulesFor } from "../run/compose";
import { createRun } from "../run/lifecycle";
import { campStack, modCtx } from "../run/stack";
import { applyRunAction } from "../run/stages/registry";
import type { RunState } from "../run/types";
import { botMove } from "./autoplay";
import { checkRunState } from "./check";
import { expeditionDevHooks as hooks } from "./hooks";

const SEATS = ["a", "b", "c"];

function shortcut(state: RunState, id: string, params: Record<string, string | number> = {}): RunState {
  const result = hooks.runShortcut(state, id, params);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** A dealt camp with `boss` planned at it. */
function bossCamp(length: "standard" | "long", at: number, boss: string): RunState {
  const loadout = shortcut(createRun({ seatIds: SEATS, seed: "triggers" }), "jump-to-camp", { length, camp: at, stage: "loadout" });
  return shortcut(shortcut(loadout, "set-plan-boss", { camp: String(at), boss }), "jump-to-camp", { length, camp: at, stage: "camp" });
}

/** Every seat moves as autoplay would until `done` holds. */
function playUntil(state: RunState, done: (state: RunState) => boolean): RunState {
  let current = state;
  while (!done(current)) {
    const move = botMove(current, SEATS, CATALOG)!;
    const result = applyRunAction(current, move.seatId, move.request, CATALOG);
    if (!result.ok) throw new Error(result.error);
    current = result.state;
  }
  return current;
}

const picked = (state: RunState) => (attemptOf(state)?.camp.objectives ?? []).every((o) => o.ownerSeatId !== null);
const handIds = (state: RunState, seatId: string) => attemptOf(state)!.camp.hands.find((h) => h.seatId === seatId)!.cards.map((c) => c.id);
function statusOf(state: RunState, modId: string) {
  if (state.stage.tag !== "camp") throw new Error(`expected a camp, at ${state.stage.tag}`);
  const layer = campStack(state, CATALOG).find((l) => l.def.id === modId)!;
  return layer.body.status!(modCtx(state, state.stage.camp, layer, CATALOG));
}

describe("boss and weather triggers", () => {
  it("the Tornado's gust blows three cards from every hand to the player on the right, at once", () => {
    const camp = bossCamp("long", 6, "tornado");
    const gusted = shortcut(camp, "trigger-tornado", { mod: "tornado" });
    const attempt = attemptOf(gusted)!;
    expect(attempt.log.map((l) => [l.event, l.sourceId])).toEqual([["gust", "tornado"]]);
    // Right of a is c, right of b is a, right of c is b.
    for (const [from, to] of [["a", "c"], ["b", "a"], ["c", "b"]] as const) {
      const sent = handIds(camp, from).filter((id) => !handIds(gusted, from).includes(id));
      expect(sent).toHaveLength(3);
      expect(sent.every((id) => handIds(gusted, to).includes(id))).toBe(true);
    }
    expect(SEATS.map((s) => handIds(gusted, s).length)).toEqual(SEATS.map((s) => handIds(camp, s).length));
    expect(checkRunState(gusted, CATALOG)).toEqual([]);
  });

  it("a second gust draws other cards", () => {
    const camp = bossCamp("long", 6, "tornado");
    const once = shortcut(camp, "trigger-tornado", { mod: "tornado" });
    const twice = shortcut(once, "trigger-tornado", { mod: "tornado" });
    expect(attemptOf(twice)!.log.map((l) => l.event)).toEqual(["gust", "gust"]);
    expect(handIds(twice, "a")).not.toEqual(handIds(once, "a"));
  });

  it("the Earthquake deals the open objectives out again, and each seat keeps its count", () => {
    const camp = playUntil(bossCamp("long", 6, "earthquake"), picked);
    const quaked = shortcut(camp, "trigger-earthquake", { mod: "earthquake" });
    const count = (state: RunState) => SEATS.map((s) => attemptOf(state)!.camp.objectives.filter((o) => o.ownerSeatId === s).length);
    expect(attemptOf(quaked)!.log.map((l) => l.event)).toEqual(["quake"]);
    expect(count(quaked)).toEqual(count(camp));
    expect(checkRunState(quaked, CATALOG)).toEqual([]);
  });

  it("lightning strikes the trick in play, once", () => {
    const plain = shortcut(createRun({ seatIds: SEATS, seed: "triggers" }), "jump-to-camp", { length: "standard", camp: 2, stage: "camp" });
    const camp = shortcut(plain, "set-spec", { location: "clearing", weather: "thunderstorm" });
    const struck = shortcut(camp, "trigger-thunderstorm", { mod: "thunderstorm" });
    expect(attemptOf(struck)!.effects).toEqual([
      { origin: { kind: "mod", modId: "thunderstorm", strength: "full" }, atTrick: 0, lasts: "trick", deferIfFatal: true, params: { strike: true }, audience: "public" },
    ]);
    expect(statusOf(struck, "thunderstorm")).toContainEqual({ kind: "strike" });
    expect(hooks.runShortcut(struck, "trigger-thunderstorm", { mod: "thunderstorm" })).toEqual({ ok: false, error: "the Thunderstorm has nothing to do right now" });
  });

  it("the Snake bites the chosen seat for the next two tricks", () => {
    const camp = playUntil(bossCamp("standard", 3, "snake"), picked);
    const bitten = shortcut(camp, "trigger-snake", { mod: "snake", seat: "b" });
    expect(attemptOf(bitten)!.effects.map((e) => [e.origin, e.params])).toEqual([[{ kind: "mod", modId: "snake", strength: "full" }, { seatId: "b", from: 0, through: 1 }]]);
    expect(statusOf(bitten, "snake")).toEqual([{ kind: "bitten", seatId: "b", tricksLeft: 2 }]);
  });

  it("the Crocodile turns to watch the chosen seat this trick", () => {
    const camp = bossCamp("standard", 3, "crocodile");
    for (const seat of SEATS) {
      expect(statusOf(shortcut(camp, "trigger-crocodile", { mod: "crocodile", seat }), "crocodile")).toEqual([{ kind: "facing", seatId: seat }]);
    }
  });

  it("the Crocodile refuses to turn onto a seat that already won a trick it would have watched", () => {
    const camp = playUntil(bossCamp("standard", 3, "crocodile"), (s) => (attemptOf(s)?.camp.completedTricks.length ?? 0) === 1);
    const winner = attemptOf(camp)!.camp.completedTricks[0]!.winnerSeatId;
    // Facing the winner on trick 0 means facing the seat after the winner on trick 1.
    const next = SEATS[(SEATS.indexOf(winner) + 1) % SEATS.length]!;
    expect(hooks.runShortcut(camp, "trigger-crocodile", { mod: "crocodile", seat: next })).toEqual({ ok: false, error: "the Crocodile would then have lost the camp on a trick already played" });
  });

  it("the Beaver dams the chosen suit this trick, and hearts leave the legal plays", () => {
    const camp = playUntil(bossCamp("standard", 3, "beaver"), picked);
    const dammed = shortcut(camp, "trigger-beaver", { mod: "beaver", suit: "hearts" });
    expect(statusOf(dammed, "beaver")).toEqual([{ kind: "dam", suit: "hearts" }]);
    const leader = attemptOf(dammed)!.camp.currentTrick.leaderSeatId;
    const legal = rulesFor(dammed, CATALOG).legalPlays(attemptOf(dammed)!.camp, leader);
    expect(legal.some((c) => c.identity.kind === "standard" && c.identity.suit === "hearts")).toBe(false);
  });

  it("the Locusts eat an equipped item", () => {
    const camp = shortcut(bossCamp("long", 6, "locusts"), "give-item", { seat: "a", item: "bait" });
    const eaten = shortcut(camp, "trigger-locusts", { mod: "locusts" });
    expect(attemptOf(eaten)!.log.map((l) => [l.event, l.subjectSeatIds])).toEqual([["ate-item:bait", ["a"]]]);
    expect(eaten.seats[0]!.items.map((i) => i.itemId)).not.toContain("bait");
  });

  it("refuses a modifier that is not at this camp", () => {
    expect(hooks.runShortcut(bossCamp("standard", 3, "tiger"), "trigger-tornado", { mod: "tornado" })).toEqual({ ok: false, error: "the Tornado is not at this camp" });
  });
});
