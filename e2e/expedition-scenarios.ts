import type { Page } from "@playwright/test";

/**
 * Rewritten room views for the moments scripted play rarely reaches: one
 * per target kind, the rescue window, the draft and the muster. Each takes
 * the view the server sent and returns it with the ability, window or offer
 * in place, built from the real seats and cards. The server never sees the
 * rewrite, so a click sends a real request the test can read
 * (`captureActions`), and the server may refuse it.
 */

type Json = Record<string, unknown>;
interface Identity { kind: "standard" | "joker"; suit?: string; rank?: number; joker?: string }
interface Card { id: string; identity: Identity; effectiveRank?: number | null }
interface Play { seatId: string; hidden?: false; card: Card; effectiveRank: number | null; countsAs: Identity | null }
interface Objective { id: string; kind: string; ownerSeatId: string | null; status: string; target?: Identity }
interface Camp extends Json {
  objectives: Objective[];
  yourHand: Card[];
  yourLegalCardIds: string[];
  completedTricks: { index: number; leaderSeatId: string; plays: (Play & { burned: boolean })[]; winnerSeatId: string }[];
  currentTrick: { index: number; leaderSeatId: string; plays: Play[] };
  campPhase: string;
  currentActorSeatId: string | null;
  handSizes: { seatId: string; size: number }[];
}
interface Item { uid: string; itemId: string; remaining: Json | null }
interface Seat {
  seatId: string;
  characterId: string | null;
  upgradeId: string | null;
  items: { equipped: Item[]; backpack: Item[] | null; concealed: boolean };
  usage: { sourceKey: string; remaining: Json }[];
  pool: Json | null;
}
type Attempt = Json & { camp: Camp; log: Json[]; reveals: Json[]; window: string | null; pendingSeatIds: string[]; rescue: Json | null };
export interface Game extends Json {
  yourSeatId: string;
  seats: Seat[];
  yourAbilities: Json[];
  stage: Json & { tag: string; attempt?: Attempt };
}

export type Rewrite = (game: Game) => Game;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The dealt attempt of a camp-stage view; the rewrites only run in a camp. */
function attempt(game: Game): Attempt {
  if (game.stage.attempt === undefined) throw new Error(`expected a camp view, got stage ${game.stage.tag}`);
  return game.stage.attempt;
}

function others(game: Game): string[] {
  return game.seats.map((s) => s.seatId).filter((id) => id !== game.yourSeatId);
}

/** The instance uid a rewritten view gives the item under test. */
export const ITEM_UID = "it90";

/** The key a scenario's source is used through: an item's instance, else its id. */
export function scenarioKey(sourceId: string): string {
  return ITEM_SOURCES.has(sourceId) ? ITEM_UID : sourceId;
}

const ITEM_SOURCES = new Set(["puffball", "bait", "pack-mule"]);

/** Your seat holds `sourceId` with `remaining` uses: as its character for a
 * character id, its upgrade for an upgrade id, else an equipped item. */
function holding(game: Game, sourceId: string, characterId: string, remaining: Json): Game {
  const next = clone(game);
  const key = scenarioKey(sourceId);
  next.seats = next.seats.map((s) => {
    if (s.seatId !== game.yourSeatId) return s;
    const upgradeId = sourceId.includes(".") ? sourceId : s.upgradeId;
    const equipped = key === ITEM_UID ? [...s.items.equipped.filter((i) => i.uid !== ITEM_UID), { uid: ITEM_UID, itemId: sourceId, remaining }] : s.items.equipped;
    return { ...s, characterId, upgradeId, items: { ...s.items, equipped }, usage: [{ sourceKey: key, remaining }] };
  });
  return next;
}

function withAbility(game: Game, sourceId: string, steps: { kind: string; prompt: string; choices: string[] }[]): Game {
  return { ...game, yourAbilities: [{ sourceKey: scenarioKey(sourceId), usableNow: true, reason: null, steps }] };
}

/** A camp mid-play with plays on the table and tricks behind it, the next
 * play yours. Uses the real hand and seats; plays are drawn from removed
 * identities so no card is duplicated in your hand. */
export function playing(game: Game, opts: { plays: number; window: "between-tricks" | "in-trick" }): Game {
  const next = clone(game);
  const camp = attempt(next).camp;
  const mates = others(game);
  const fake = (i: number): Card => ({ id: `fake-${i}`, identity: { kind: "standard", suit: ["spades", "hearts", "clubs", "diamonds"][i % 4]!, rank: 2 + (i % 13) } });
  const play = (seatId: string, i: number): Play => ({ seatId, hidden: false, card: fake(i), effectiveRank: null, countsAs: null });
  camp.campPhase = "playing";
  camp.completedTricks = [0, 1].map((index) => ({
    index,
    leaderSeatId: mates[0]!,
    plays: [mates[0]!, ...mates.slice(1), game.yourSeatId].map((seat, j) => ({ seatId: seat, card: fake(20 + index * 5 + j), effectiveRank: null, countsAs: null, burned: false })),
    winnerSeatId: game.yourSeatId,
  }));
  const leaders = opts.window === "in-trick" ? mates.slice(0, opts.plays) : [];
  camp.currentTrick = { index: 2, leaderSeatId: leaders[0] ?? game.yourSeatId, plays: leaders.map((seat, j) => play(seat, 40 + j)) };
  camp.currentActorSeatId = game.yourSeatId;
  camp.yourLegalCardIds = camp.yourHand.map((c) => c.id);
  for (const o of camp.objectives) if (o.ownerSeatId === null) o.ownerSeatId = game.yourSeatId;
  attempt(next).window = opts.window;
  return next;
}

const STD = (c: Card): c is Card & { identity: { kind: "standard"; rank: number } } => c.identity.kind === "standard";

/** One rewrite per target kind: the ability, its steps and the state that
 * makes them choosable. The test uses it through `scenarioKey(sourceId)`. */
export const PICKER_SCENARIOS: Record<string, { sourceId: string; rewrite: Rewrite }> = {
  self: {
    sourceId: "puffball",
    rewrite: (g) => withAbility(holding(playing(g, { plays: 0, window: "between-tricks" }), "puffball", "guide", { kind: "uses", left: 1, of: 1 }), "puffball", [
      { kind: "self", prompt: "Use it on yourself", choices: [`seat:${g.yourSeatId}`] },
    ]),
  },
  player: {
    sourceId: "guide",
    rewrite: (g) => withAbility(holding(playing(g, { plays: 0, window: "between-tricks" }), "guide", "guide", { kind: "uses", left: 1, of: 1 }), "guide", [
      { kind: "player", prompt: "Pick a player", choices: g.seats.map((s) => `seat:${s.seatId}`) },
    ]),
  },
  hand: {
    sourceId: "scout",
    rewrite: (g) => withAbility(holding(playing(g, { plays: 0, window: "between-tricks" }), "scout", "scout", { kind: "uses", left: 1, of: 1 }), "scout", [
      { kind: "hand", prompt: "Pick a teammate's hand", choices: others(g).map((id) => `hand:${id}`) },
    ]),
  },
  card: {
    sourceId: "bait",
    rewrite: (g) => {
      const next = holding(playing(g, { plays: 2, window: "in-trick" }), "bait", "guide", { kind: "uses", left: 1, of: 1 });
      return withAbility(next, "bait", [{ kind: "card", prompt: "Pick a card on the table", choices: attempt(next).camp.currentTrick.plays.map((p) => `card:${p.card.id}`) }]);
    },
  },
  objective: {
    sourceId: "cartographer",
    rewrite: (g) => {
      const next = holding(g, "cartographer", "cartographer", { kind: "uses", left: 1, of: 1 });
      const open = attempt(next).camp.objectives.filter((o) => o.ownerSeatId === null);
      return withAbility(next, "cartographer", [{ kind: "objective", prompt: "Pick a face-up objective", choices: open.map((o) => `objective:${o.id}`) }]);
    },
  },
  "completed-objective": {
    sourceId: "cartographer.landmark",
    rewrite: (g) => {
      const next = holding(playing(g, { plays: 0, window: "between-tricks" }), "cartographer.landmark", "cartographer", { kind: "uses", left: 1, of: 1 });
      const done = attempt(next).camp.objectives[0]!;
      done.status = "done";
      return withAbility(next, "cartographer.landmark", [{ kind: "completed-objective", prompt: "Pick a completed objective", choices: [`objective:${done.id}`] }]);
    },
  },
  "failed-objective": {
    sourceId: "medic",
    rewrite: (g) => rescue(g),
  },
  whisper: {
    sourceId: "scout.eavesdrop",
    rewrite: (g) => {
      const next = holding(playing(g, { plays: 0, window: "between-tricks" }), "scout.eavesdrop", "scout", { kind: "uses", left: 1, of: 1 });
      const [a, b] = others(g);
      attempt(next).log = [{ event: "whisper", actorSeatId: a, subjectSeatIds: [b], sourceId: null, private: false }];
      return withAbility(next, "scout.eavesdrop", [{ kind: "whisper", prompt: "Pick a whisper between two teammates", choices: ["whisper:0"] }]);
    },
  },
  "won-trick": {
    sourceId: "pack-mule",
    rewrite: (g) => {
      const next = holding(playing(g, { plays: 0, window: "between-tricks" }), "pack-mule", "guide", { kind: "uses", left: 1, of: 1 });
      return withAbility(next, "pack-mule", [
        { kind: "won-trick", prompt: "Pick a trick you won", choices: ["trick:0", "trick:1"] },
        { kind: "player", prompt: "Pick a teammate", choices: others(g).map((id) => `seat:${id}`) },
      ]);
    },
  },
  "card-value": {
    sourceId: "botanist",
    rewrite: (g) => {
      const next = holding(playing(g, { plays: 0, window: "between-tricks" }), "botanist", "botanist", { kind: "pool", balance: 2, max: 3, cost: 1 });
      const choices = attempt(next).camp.yourHand.filter(STD).flatMap((c) => [c.identity.rank - 1, c.identity.rank + 1].filter((r) => r >= 2 && r <= 14).map((r) => `value:${c.id}:${r}`));
      return withAbility(next, "botanist", [{ kind: "card-value", prompt: "Pick a card in your hand to recount", choices }]);
    },
  },
  board: {
    sourceId: "guide.howler-call",
    rewrite: (g) => withAbility(holding(playing(g, { plays: 2, window: "in-trick" }), "guide.howler-call", "guide", { kind: "uses", left: 1, of: 1 }), "guide.howler-call", [
      { kind: "board", prompt: "Pick the trick on the table", choices: ["board"] },
    ]),
  },
  supplies: {
    sourceId: "medic.field-kit",
    rewrite: (g) => {
      const next = withAbility(holding(playing(g, { plays: 0, window: "between-tricks" }), "medic.field-kit", "medic", { kind: "uses", left: 1, of: 1 }), "medic.field-kit", [
        { kind: "supplies", prompt: "Pick the crew's supplies", choices: ["supplies"] },
      ]);
      return { ...next, supplies: { count: 2, max: 4 } };
    },
  },
};

/** The rescue window: your objective's card was won by a teammate, the
 * camp waits on you, the Medic. */
export function rescue(game: Game, opts: { youPending?: boolean } = {}): Game {
  const youPending = opts.youPending ?? true;
  const next = holding(playing(game, { plays: 0, window: "between-tricks" }), "medic", "medic", { kind: "supplies", cost: 1 });
  const camp = attempt(next).camp;
  const failed = camp.objectives[0]!;
  failed.status = "failed";
  failed.ownerSeatId = game.yourSeatId;
  camp.campPhase = "ended";
  camp.currentActorSeatId = null;
  const mates = others(game);
  next.seats = next.seats.map((s) => (s.seatId === mates[0] && !youPending ? { ...s, characterId: "medic" } : s));
  attempt(next).window = "rescue";
  attempt(next).pendingSeatIds = [youPending ? game.yourSeatId : mates[0]!];
  attempt(next).rescue = { failedObjectiveIds: [failed.id] };
  next.yourAbilities = youPending
    ? [{ sourceKey: "medic", usableNow: true, reason: null, steps: [{ kind: "failed-objective", prompt: "Pick a failed objective", choices: [`objective:${failed.id}`] }] }]
    : [];
  return next;
}

/** Rewrites every room view `page` receives through `rewrite.current`, and
 * records every action it sends. */
export async function rewriteViews(page: Page): Promise<{ current: Rewrite; sent: Json[] }> {
  const state: { current: Rewrite; sent: Json[] } = { current: (g) => g, sent: [] };
  await page.routeWebSocket(() => true, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => {
      try {
        const data = JSON.parse(String(m)) as Json;
        if (data.type === "game_action") state.sent.push(data);
      } catch {
        // not JSON
      }
      server.send(m);
    });
    server.onMessage((m) => {
      try {
        const data = JSON.parse(String(m)) as { type?: string; view?: { game?: Game } };
        if ((data.type === "state" || data.type === "joined") && data.view?.game) {
          data.view.game = state.current(data.view.game);
          ws.send(JSON.stringify(data));
          return;
        }
      } catch {
        // not a room message
      }
      ws.send(m);
    });
  });
  return state;
}
