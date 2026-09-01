# Architecture Research

**Domain:** Real-time multiplayer hidden-information card games on free-tier serverless (Hanabi v1, Innovation later)
**Researched:** 2026-09-01
**Confidence:** HIGH (topology, redaction, reconnect patterns are well-established; MEDIUM on exact Cloudflare Durable Objects API surface, which moves quickly — verify against current docs at implementation time)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLIENT (Vercel-hosted static/SSR app, no authoritative state)       │
│  ┌────────────┐  ┌────────────────┐  ┌───────────────────────────┐   │
│  │ Room/Lobby │  │ Game View       │  │ Connection Manager        │   │
│  │ UI (join,  │  │ (renders redac- │  │ (WebSocket client, seat   │   │
│  │ display    │  │ ted snapshot,   │  │ token, reconnect/backoff, │   │
│  │ name)      │  │ pure render of  │  │ sequence-number gap       │   │
│  │            │  │ server truth)   │  │ detection)                │   │
│  └─────┬──────┘  └────────┬────────┘  └─────────────┬─────────────┘   │
└────────┼──────────────────┼─────────────────────────┼─────────────────┘
         │ HTTPS (create/    │ WebSocket (subscribe)   │ WebSocket (send action,
         │ join room)        │                          │ receive snapshot/events)
         ▼                  ▼                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  EDGE ENTRYPOINT (Cloudflare Worker — stateless routing layer)       │
│  - Resolves roomId → Durable Object ID (idFromName)                  │
│  - Upgrades HTTP to WebSocket, forwards to the Durable Object        │
│  - No game logic lives here                                          │
└───────────────────────────────┬────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  ROOM ACTOR — one Durable Object instance per room (authoritative)   │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────────────┐   │
│  │ Session/Seat │  │ Rules Engine    │  │ View/Redaction Layer   │   │
│  │ Manager      │  │ (game-specific, │  │ (per-seat projection,  │   │
│  │ (game-       │  │ pluggable:      │  │ game-specific, pluggable│  │
│  │ agnostic)    │  │ Hanabi today)   │  │ but shares the pattern) │   │
│  └──────┬───────┘  └────────┬────────┘  └───────────┬─────────────┘   │
│         │                   │                        │                │
│  ┌──────┴───────────────────┴────────────────────────┴──────────┐   │
│  │  Durable Object Storage (SQLite, transactional)                │   │
│  │  full authoritative GameState + event log + seat tokens         │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| Edge entrypoint (Worker) | Stateless HTTP/WS routing to the correct room actor; no state, no game logic | Cloudflare Worker `fetch()` handler, `env.ROOM.idFromName(roomId)` |
| Room Actor (Durable Object) | Single source of truth for one room: connections, seats, rules engine invocation, persistence | One DO class instantiated per room, WebSocket Hibernation API for connections |
| Session/Seat Manager | Game-agnostic: seat tokens, join/leave/reconnect, presence, turn order plumbing | Plain module inside the DO; not tied to Hanabi |
| Rules Engine | Game-specific: validates and applies actions to state, deterministic | Pure reducer function(s), game-specific package (`hanabi-engine`, later `innovation-engine`) |
| View/Redaction Layer | Builds the per-seat projection of authoritative state; the ONLY code allowed to produce what's sent to a client | Pure function `toClientView(state, seatId) -> ClientView`, game-specific but same contract |
| Durable Storage | Persists authoritative state + event log so a DO restart/eviction doesn't lose the game | DO's built-in SQLite storage (transactional, included free) |
| Client Connection Manager | WebSocket lifecycle, seat token storage, reconnect/backoff, gap detection via sequence numbers | Small hand-rolled client, no external library needed at this scale |
| Client Game View | Pure rendering of the redacted snapshot it receives; holds no secret it wasn't given (it can't leak what it never has) | React (or similar) component tree driven by one state atom |

## Recommended Project Structure

```
packages/
├── protocol/                # Shared wire contract, game-agnostic
│   ├── envelope.ts          # {seq, type, payload} message envelope
│   ├── room-events.ts       # join/leave/reconnect/presence event shapes
│   └── client-view.ts       # Generic ClientView<TPublic, TSelf> shape
├── room-server/              # Game-agnostic room actor logic
│   ├── room-actor.ts         # Durable Object class: WS lifecycle, routing to engine
│   ├── seat-manager.ts       # Seat assignment, tokens, reconnect handshake
│   ├── presence.ts           # Connected/disconnected/gone state machine
│   └── game-adapter.ts       # Interface every game engine must implement
├── hanabi-engine/             # Game-specific, pure, no I/O
│   ├── state.ts               # GameState shape (full truth)
│   ├── actions.ts             # ClueAction | PlayAction | DiscardAction
│   ├── reducer.ts              # (state, action, actorSeat) -> Result<state> | Rejection
│   ├── rules/                  # validateClue, validatePlay, validateDiscard, endgame
│   ├── view.ts                  # toClientView(state, seatId) -- whitelist-serialize
│   ├── deck.ts                   # seeded shuffle, variant deck construction
│   └── __tests__/
│       ├── reducer.property.test.ts   # property-based: no illegal transitions
│       └── view.leak.test.ts          # exhaustive: no ClientView field traces to own hand
├── innovation-engine/          # (later milestone) same contract, heavier internals
└── web/                        # Vercel app
    ├── app/room/[roomId]/       # lobby + game route
    ├── lib/connection.ts        # WebSocket client, reconnect, seat token in localStorage
    └── components/hanabi/        # pure render of ClientView, no game logic
```

### Structure Rationale

- **protocol/ is separate from both engines and the server:** it is the contract both Hanabi and (later) Innovation must honor, and the thing the client depends on. It should be tiny and boring — versioned envelope, not game rules.
- **room-server/ contains zero Hanabi knowledge.** If a Hanabi-specific field appears in `room-actor.ts` or `seat-manager.ts`, that is the signature of a leaky abstraction — stop and move it into `game-adapter.ts`'s implementation.
- **Each game engine is a pure, I/O-free package.** No WebSocket, no storage, no DO API surface inside `hanabi-engine`. This is what makes it unit-testable in milliseconds and reusable if the transport ever changes.
- **`view.ts` lives inside the engine, not the server**, because only the engine knows what's secret in its own state shape. The server calls `engine.toClientView(state, seatId)` through the adapter interface; it never touches `GameState` fields directly.

## Architectural Patterns

### Pattern 1: Room-as-Actor (Durable Object per room)

**What:** Each game room is a single stateful object, addressed by a deterministic ID derived from the room code (`env.ROOM_DO.idFromName(roomCode)`). All players' WebSocket connections for that room terminate in the *same* object instance. All authoritative state and all game logic execution happens inside it.

**When to use:** Any time you need strongly consistent, low-latency, multi-subscriber state with server-side broadcast, and the state fits comfortably in memory/a few MB of storage (a card game's full state is a few KB). This is exactly a game room.

**Trade-offs:**
- Pro: trivially consistent — there is no distributed-state or race-condition problem, because only one object instance ever mutates the state, and Cloudflare guarantees a single instance per unique ID globally.
- Pro: solves the "Vercel can't hold WebSockets" constraint directly — the actor lives on Cloudflare's edge network, not on Vercel.
- Pro: **actually solves the availability constraint that killed Supabase.** A Durable Object is not "always running" — it hibernates when idle — but unlike a paused Supabase project, hibernation requires no manual un-pause, no dashboard click, no cold-start failure mode visible to the user. The first WebSocket connect or HTTP request wakes it in the same request, transparently, in well under a second. This is normal serverless cold start, not the multi-minute/manual "project paused" state Supabase enters after a week of inactivity. (Confirmed: Durable Objects are included in the Workers free plan with no idle-pause behavior; SQLite-backed storage is included free — see Cloudflare docs, Sources.)
- Con: state is memory-resident between requests only while "warm"; on hibernation/eviction, in-memory state is dropped and must be reconstructed from Durable Object Storage on next wake. This means the room actor must NOT treat in-memory state as the durable copy — it must persist every state transition (see Pattern 4: hydrate-on-wake).
- Con: single point of execution for a given room means a bug that throws inside the actor can take the whole room down; must be defensive (try/catch around action handling, never let one bad message crash the object).

**Example:**
```typescript
// edge entrypoint (stateless Worker)
export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    const roomCode = url.searchParams.get("room")!;
    const id = env.ROOM.idFromName(roomCode);
    const stub = env.ROOM.get(id);
    return stub.fetch(req); // forwards the WebSocket upgrade
  }
}
```

### Pattern 2: Explicit Whitelist-Serialize View Construction (not blacklist-strip)

**What:** The per-seat client view is built by a pure function that *constructs a brand-new object* containing only fields the recipient is allowed to see, by reading from full state and copying values in — never by taking the full state object and deleting/nulling the secret fields in place.

**When to use:** Always, for any hidden-information game. This is the single most important correctness pattern in this project because a leak here is silent, and the failure mode of the alternative (blacklist-strip) is exactly "someone adds a new field to GameState and forgets to strip it," which is invisible until a player notices they can see their own hand.

**Trade-offs:**
- Whitelist-serialize: adding a new secret field to `GameState` is safe by default — the new field simply doesn't appear in any `ClientView` until someone explicitly adds it to the view builder. The failure mode is "feature doesn't show up," which is loud and caught in dev immediately.
- Blacklist-strip: adding a new secret field to `GameState` is unsafe by default — the field leaks to every client until someone remembers to add it to the strip list. The failure mode is "silently leaks the game," which is exactly what must never happen. Reject this approach outright.
- The redaction boundary must be a **single chokepoint**: exactly one function per game (`toClientView`) is the only code path allowed to produce outbound player-facing state. No other code in the server is allowed to serialize `GameState` and send it over the wire. Enforce this structurally (e.g., `GameState` is never imported by anything in `room-server/`, only `ClientView` types are; the engine package's public API only exports `applyAction` and `toClientView`, never the raw state shape needed to serialize it elsewhere).

**Example:**
```typescript
// hanabi-engine/view.ts
export function toClientView(state: HanabiState, viewerSeat: SeatId): HanabiClientView {
  return {
    clueTokens: state.clueTokens,
    fuseTokens: state.fuseTokens,
    deckCount: state.deck.length,
    discardPile: state.discardPile,          // public: fully known
    playedStacks: state.playedStacks,         // public
    currentTurn: state.currentTurn,
    hands: state.seats.map(seat => {
      if (seat.id === viewerSeat) {
        // OWN hand: identity stripped, only clue-derived knowledge kept
        return seat.hand.map(card => ({
          cardId: card.id,               // stable id for animation targeting, NOT rank/color
          knownColor: card.cluedColor ?? null,
          knownRank: card.cluedRank ?? null,
          clued: card.clueHistory,
        }));
      }
      // OTHERS' hands: full identity, as physically visible
      return seat.hand.map(card => ({
        cardId: card.id,
        color: card.color,
        rank: card.rank,
        clued: card.clueHistory,
      }));
    }),
  };
}
```

**How to prove no leak (testing strategy):**
1. **Type-level enforcement:** `HanabiClientView`'s own-hand entry type must not structurally contain `color`/`rank` fields at all (a different TypeScript type than the others'-hand entry, e.g. `OwnCard` vs `VisibleCard`) — so a leak is a compile error, not just a runtime bug to catch in a test.
2. **Exhaustive round-trip test:** for every seat in every reachable game state (generate via property-based testing / fast-check across random action sequences), call `toClientView(state, seat)`, serialize it to JSON, and assert `JSON.stringify(view)` does not contain the color/rank string of any card in that seat's own hand. This is a literal string-search leak test, cheap to run, and catches the case where a "helper" object accidentally spreads full card data before stripping.
3. **Server-boundary test:** integration test that opens N real WebSocket connections to a room actor, drives a full game via one connection, and asserts each *other* connection's raw received JSON never contains the playing seat's own hand identities. This tests the actual wire boundary, not just the pure function, and would catch a bug where someone bypasses `toClientView` and sends raw state by mistake.
4. **Never trust the client to hide anything.** Devtools / network tab inspection is trivial; if a value is on the wire, it is not secret regardless of what the UI renders. The redaction boundary is the *only* place secrecy is enforced.

### Pattern 3: Reducer/Command Pattern for the Rules Engine (snapshot-primary, event-log-assisted)

**What:** `applyAction(state, action, actorSeat) -> { ok: true, newState, event } | { ok: false, reason }`. Validation and application are the same call (validation is just the reducer's first job — reject before mutating), but validation logic is organized as small composable predicates so it's independently testable and reusable for e.g. "can this action even be attempted" UI hints.

**When to use:** Any deterministic turn-based game. This is the natural shape of Hanabi (and will be the natural shape of Innovation's per-dogma-effect resolution too, even though the effects are far more complex).

**Trade-offs:**
- Snapshot-as-primary-truth (store `GameState` directly, not derive it by replaying an event log on every read) is the right default here: game state is small (a few KB), reads must be instant (rendered every action), and there is no requirement for time-travel/audit/replay in v1 (explicitly out of scope per PROJECT.md — no replays).
- Still emit a lightweight **event log alongside the snapshot** (not instead of it) for three reasons that matter even without a replay feature: (1) it is the natural mechanism for broadcasting "what changed" to clients as an animation cue rather than clients diffing snapshots themselves, (2) it gives you a debug/bug-report artifact for free — "here's the exact action sequence that produced this broken state," which is exactly what deterministic seeded shuffling (below) makes reproducible, (3) it's the natural resume-on-reconnect payload (see Reconnect section) — a client that missed N messages can be sent the last K events instead of forcing a full resend, when the gap is small.
- Full event-sourcing (event log as the ONLY source of truth, state always derived) is overkill here — added complexity (replay logic, snapshotting-for-performance eventually) with no benefit at this state size and this lack of an audit/replay requirement. Reject it as premature.

**Example:**
```typescript
// hanabi-engine/reducer.ts
export function applyAction(
  state: HanabiState,
  action: HanabiAction,
  actorSeat: SeatId
): ActionResult {
  if (state.currentTurn !== actorSeat) {
    return { ok: false, reason: "not-your-turn" };
  }
  switch (action.type) {
    case "give-clue": {
      const validation = validateClue(state, action, actorSeat);
      if (!validation.ok) return validation;
      const newState = applyClue(state, action);
      return { ok: true, newState, event: { type: "clue-given", ...action, actorSeat } };
    }
    case "play-card": /* ... */
    case "discard-card": /* ... */
  }
}
```

**Deterministic seeded shuffling:** the deck shuffle takes an explicit seed (e.g. a `crypto.randomUUID()` generated once at room creation and stored), using a seeded PRNG (mulberry32 or similar — NOT `Math.random()`). Every test and every bug report becomes reproducible: "room seed `abc123`, action log `[...]`" fully determines the entire game, independent of wall-clock time or the actual RNG call order in `Math.random()`. This is a small amount of extra plumbing (thread a seed through deck construction) for a large reproducibility payoff, and should be done from day one — it is much more annoying to retrofit once shuffling is scattered through the codebase.

### Pattern 4: Hydrate-on-Wake with Write-Through Persistence

**What:** The room actor treats its Durable Object Storage as the durable copy and its in-memory `GameState` as a cache. On every actor "cold start" (first request after eviction/hibernation), it hydrates in-memory state from storage before handling any message. On every state-mutating action, it writes the new state (and the event) to storage *before* broadcasting to clients, inside the same transactional context the DO storage API provides.

**When to use:** Always, in the Durable Objects topology — this is not optional, it is what makes "state survives eviction/restart" true rather than aspirational.

**Trade-offs:**
- Write-before-broadcast means slightly higher latency per action (a local SQLite write, typically sub-millisecond on Cloudflare's storage) in exchange for the invariant that no acknowledged action can ever be lost to a crash between "applied in memory" and "persisted."
- Storing the full state snapshot on every write (rather than only appending events and reconstructing) keeps hydration O(1) instead of O(actions-so-far) — important as a 25-minute Hanabi game can have 100+ actions logged.

## Data Flow

### Request Flow — concrete trace: "player gives a clue"

```
1. Client (Player A, seat 0) clicks "clue red" targeting Player B (seat 1)
   → Connection Manager sends over the open WebSocket:
     { seq: 47, type: "action", action: { type: "give-clue", target: 1, colorOrRank: "red" } }
   (No optimistic UI update yet — see Client Architecture section)

2. Edge Worker already routed this WebSocket's upgrade to the correct Durable Object
   at connect time; no per-message routing needed — the message lands directly
   inside the Room Actor's WebSocket message handler.

3. Room Actor:
   a. Looks up which seat this WebSocket belongs to (Session/Seat Manager — maps
      connection → seatId, established at join/reconnect time)
   b. Calls engine.applyAction(currentState, action, seatId=0)
   c. Reducer validates: is it seat 0's turn? does room have >=1 clue token?
      does the clue touch >=1 card in seat 1's hand? Is colorOrRank a legal value
      for this variant (rejects "black" if Black variant not enabled and vice
      versa for rainbow-touches-every-color rules)?
   d. On success: reducer returns { ok: true, newState, event }.
      On failure: reducer returns { ok: false, reason }; Room Actor sends a
      private rejection message back to Player A's socket ONLY, does not touch
      state, does not broadcast. (Client should rarely hit this — client-side
      "can I even attempt this" checks mirror validation for UI affordance —
      but the server re-validates from scratch regardless of what UI allowed,
      because the server never trusts the client.)

4. On success, Room Actor:
   a. Persists newState + event to Durable Object Storage (transactional write)
   b. Increments the room's monotonic sequence counter
   c. For EACH connected seat (0..4), calls engine.toClientView(newState, seatId)
      to build that seat's own redacted projection
   d. Broadcasts to each connection: { seq: N, type: "state", view: <that seat's
      redacted ClientView>, lastEvent: {...} }
      -- Player A's own outgoing message includes a view where seat 1's hand
         (the clue target) is now shown with the matching cards highlighted,
         but Player A's OWN hand is still card-identity-stripped as always.
      -- Player B (and C, D, E) get the same underlying event but their own
         per-seat view (their own hand stripped, everyone else's shown).

5. Each Client Connection Manager receives its `state` message, checks `seq`
   against the last seq it saw (gap detection — see Reconnect section),
   updates its local state atom, and the Game View re-renders as a pure
   function of the new ClientView. No client-side game logic ran; the client
   never computed anything, it only rendered what the server sent.
```

### State Management (client side)

```
[Room Actor authoritative state]
    ↓ (redacted per-seat, pushed over WebSocket on every change)
[Client: single ClientView atom, e.g. useSyncExternalStore / zustand]
    ↓ (subscribe)
[Game View components] → render only → [User clicks an action button]
    ↓
[Connection Manager sends action message] → (round-trips through server, see above)
```
There is no client-side reducer for game rules. The client's only "state machine" is connection lifecycle (connecting / connected / reconnecting / desynced-awaiting-resync).

### Key Data Flows

1. **Action round-trip (traced above):** client action → server validate+apply → server persist → server broadcast N per-seat views → each client renders. Single direction of truth: server → client for game state, client → server for intents only.
2. **Presence/reconnect flow:** client disconnect detected server-side (WS close event) → Room Actor marks seat "disconnected" with a timestamp, broadcasts a presence-changed view update to remaining seats (this is public information — everyone can see an empty seat at the table) → client reconnects with its seat token → Room Actor validates token, reattaches the new WebSocket to the existing seatId, marks seat "connected" again, sends a full current-state resync to that client, broadcasts presence-changed to others.
3. **Room creation/join flow (HTTP, not WebSocket):** host POSTs to create a room → Worker creates/addresses a new Durable Object, DO initializes empty room state, returns a room code/link → each player GETs the room page, client generates or reads a per-browser seat token, opens a WebSocket with `?room=X&token=Y`, Room Actor's Seat Manager assigns/reattaches a seat.

## Scaling Considerations

This project scales to "a handful of small groups playing occasionally," not to arbitrary user counts — say so plainly rather than inventing scaling tiers that don't apply.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 room, 2-5 players (actual target) | Exactly the architecture above. No changes needed. |
| Dozens of concurrent rooms (friends-of-friends adopt it) | Still no changes needed — each room is an independent Durable Object; Cloudflare's free tier (100k requests/day, ~3M DO requests/month per the current free plan) is 2+ orders of magnitude above this project's actual traffic per the PROJECT.md's own reframed-priority note. |
| Thousands of concurrent rooms | Would need to revisit the free tier's request ceiling, but this is explicitly out of scope for this project's ambitions — do not design for it. |

### Scaling Priorities

1. **First real constraint is NOT compute, it's human attention:** the actual risk is a room actor bug crashing a live game for 5 friends on a Tuesday, not throughput. Prioritize correctness and defensive error handling inside the DO (never let one player's malformed action crash the actor for everyone) over any performance work.
2. **Second: Durable Object Storage row/write limits** on the free tier (per Cloudflare docs, current free tier includes millions of reads and a few million writes/month) — irrelevant at this scale (one write per game action, maybe 100-150 actions per game, a handful of games a week) but worth a one-line awareness note, not a design constraint.

## Anti-Patterns

### Anti-Pattern 1: Blacklist-strip redaction ("send everything, then delete secret fields")

**What people do:** Serialize the full `GameState`, then `delete fullState.seats[mySeat].hand` or set it to `null` before sending, reusing one object shape for both server-internal and client-facing representations.
**Why it's wrong:** Every new field added to `GameState` in the future is leaked by default until someone remembers to add it to the strip list. This is exactly backwards from safe-by-default, and the failure is silent — nothing crashes, nothing errors, a player just quietly can see their own hand (or worse, someone screenshots it and now there's a game-ruining incident with no server-side signal that anything went wrong).
**Do this instead:** Whitelist-serialize (Pattern 2) — construct the client-facing type from scratch, field by field, so an unhandled new field simply doesn't appear rather than accidentally appearing.

### Anti-Pattern 2: Client-authoritative or optimistic game logic

**What people do:** Run rules validation and even provisional state application in the client (predict the result of a clue/play/discard locally, render it immediately, reconcile with the server's authoritative message when it arrives), because it's the standard pattern for fast-twitch multiplayer games.
**Why it's wrong for this project:** Hanabi is turn-based with a ~few-second cadence between actions on a voice call — there is no latency-hiding benefit to optimism, but there is real cost: (1) any client-side rules logic is a second copy of the rules engine that can drift from the server's, (2) optimistic rendering of your OWN action is fine (you know what you clicked) but there's no way to *safely* optimistically render what a clue reveals about another player's cards, because the client doesn't have the full truth to predict correctly — it would have to wait for the server regardless to show the real result. There is no scenario in this game where optimism helps and several where it risks showing a player something incorrect for even one frame.
**Do this instead:** Wait-for-server always (see Client Architecture below); use a lightweight "action pending" UI treatment (disable the button, spinner) rather than false optimism.

### Anti-Pattern 3: Sharing the rules engine (or trying to generalize it) between Hanabi and Innovation prematurely

**What people do:** Faced with "build it game-agnostic," over-generalize and try to design one `RulesEngine<TState, TAction>` abstraction that both Hanabi's clue economy and Innovation's card-driven dogma effects, achievements, and asymmetric boards must fit into, before Innovation's requirements are even researched in depth.
**Why it's wrong:** Hanabi's engine is a small, closed set of three action types with straightforward validation. Innovation's engine is fundamentally different in kind — it needs to execute *data-driven effects defined by card text* (each of ~105 cards can have unique, sometimes card-referencing dogma logic), track asymmetric per-player board state, evaluate achievement conditions continuously, and handle effect chains/choices mid-resolution. Forcing both into one generic interface today, before Innovation's actual card effect system is designed, would either cripple Hanabi's simplicity with unneeded machinery or fail to anticipate Innovation's real needs anyway (a guess made too early, which is worse than no abstraction). PROJECT.md itself frames Innovation as deferred specifically to avoid this trap.
**Do this instead:** Share only what is genuinely identical in kind across any turn-based multiplayer card game: room lifecycle, seat/connection/reconnect management, the transport envelope, and the *interface shape* each engine must expose to the room actor (`applyAction`, `toClientView`, `initialState(seed, options)`) — not a shared implementation of what happens inside those functions. When Innovation research happens, its engine will very likely still need something like effect-stack/interrupt handling that Hanabi never needs; don't build that machinery now on spec.

## Reconnect and Session Identity — concrete design

**Identity primitive:** at join time, the client generates a random opaque `seatToken` (e.g. `crypto.randomUUID()`), stores it in `localStorage` keyed by `roomCode`, and sends it on WebSocket connect as a query param or first message. The Room Actor's Seat Manager maps `seatToken -> seatId` in its persisted state (established once at first join, immutable for the life of the room).

**First join vs. reconnect, disambiguated by the token:**
- No token in localStorage for this room → treat as a new join: prompt for display name, assign the next open seat, mint a new `seatToken`, persist the mapping, store it client-side.
- Token present and matches a seat already marked "this browser" → reconnect: reattach this WebSocket to that seatId without prompting for a name again, regardless of how long it's been.
- Token present but does not match any known seat (e.g. stale token from a different room reusing the same room code after cleanup) → fall back to new-join flow.

**Distinguishing "briefly disconnected" from "gone":** on WebSocket close, the Room Actor does NOT immediately free the seat. It marks the seat `disconnected` with a timestamp and starts (or relies on an existing) Durable Object alarm. Only after a grace window with no reconnect (recommend on the order of several minutes — long enough to survive a laptop sleep/wake or a wifi blip during a 25-minute game, short enough that an actually-abandoned room doesn't sit "occupied" forever) does the seat move to a `gone`/free state that could, in principle, allow a new player to take it. Given "no strangers, friend group with a link" (per PROJECT.md), the practical recommendation is: never auto-free a seat mid-game at all — a seat is only reassignable between games/rooms, not within one. This sidesteps most of the "stranger steals a seat" risk structurally rather than through a timing race.

**Preventing seat theft:** because the seat token is the sole credential and it's only ever handed out at first-join time (never re-displayed, never derivable from the room link alone), a stranger with just the room link cannot claim a seat that's already been claimed — they can only join as a *new*, unclaimed seat if one exists, or be told the room is full. This is deliberately NOT security against a determined attacker (there's no password) — it's "good enough for a friend group," matching the no-accounts posture in PROJECT.md. If desired, an extra soft guard is trivial to add: the Room Actor can additionally require the reconnecting WebSocket's token to match before accepting, and reject (rather than silently 404) attempts to join an already-fully-occupied room, giving a clear "room is full" client error instead of ambiguous behavior.

**Missed-message recovery — sequence numbers, not diffing:** every server→client message carries a monotonically increasing per-room `seq`. On reconnect, the client reports the last `seq` it successfully processed. The Room Actor compares this to its current seq:
- Small gap (a handful of missed events, e.g. the player was gone for one clue) → optionally replay the missed *events* from the persisted event log for a nicer "what did I miss" narration, though this is a UX nicety, not a correctness requirement.
- Any gap, or `seq` unknown/stale, or "large enough that it's not worth reconstructing" → simplest-correct fallback: send one full authoritative `toClientView(currentState, seat)` snapshot regardless of gap size. **This should be the actual default implementation for v1** — full-resync-on-reconnect is simple, always correct, and cheap (a few KB), whereas incremental replay is an optimization with more edge cases (what if an event referenced a card that's since moved) for a game this small. Only add incremental replay later if snapshot resync is observed to cause a visible flicker/janky UX, which is unlikely for a payload this size.

This means: **snapshot-resync-first is the correct default; sequence numbers exist primarily as a *gap detector* (did I miss anything at all?), not as the payload delivery mechanism.**

## Persistence and Lifecycle

**What needs durable storage:** the current `GameState` snapshot, the seat-token-to-seatId mapping, and (optionally, for the reconnect narration nicety above) a bounded recent-event tail. That's it. Nothing else in this system needs a database in the traditional sense — there are no user accounts, no cross-room data, no historical query needs (replays/history explicitly out of scope).

**What stays in-memory only:** live WebSocket connection objects themselves (these cannot be serialized/persisted — they're re-established fresh on every reconnect via the token handshake described above), and short-lived UI-only state like "is someone currently mid-typing a display name."

**Garbage collection of abandoned rooms:** a Durable Object alarm scheduled after room creation/last-activity checks whether the room has had any activity (message received) within a window (recommend: a day or so, generously longer than any real game session, since the actual cost of an idle abandoned room on this architecture is close to zero — no idle billing beyond negligible storage). On expiry with no activity, the alarm handler deletes the room's storage (`ctx.storage.deleteAll()`), freeing it. Because Durable Objects are cheap to leave hibernated indefinitely, this GC is about storage tidiness, not cost avoidance — don't over-engineer it; a generous, simple TTL is entirely sufficient at this scale.

**Restart mid-game:** covered structurally by Pattern 4 (hydrate-on-wake, write-through persistence). Because every state transition is persisted transactionally before being broadcast, a Durable Object eviction/restart mid-game is invisible to players beyond, at worst, a brief WebSocket reconnect blip that the reconnect flow above already handles as a matter of course — there is no special "the actor restarted" case distinct from "a client reconnected," which is the right invariant to design for (one reconnect path handles both causes).

## Client Architecture

**Wait-for-server, not optimistic, and here is the argument stated plainly:** Hanabi's action cadence (players are talking on a voice call, thinking, discussing) is measured in seconds, not milliseconds — the entire premise of optimistic UI (hide network latency from a user who'd otherwise perceive lag) does not apply when a round trip to a nearby edge Durable Object takes tens of milliseconds against a human decision cadence of multiple seconds. Worse, the *content* of what would need to be optimistically rendered (what a clue reveals, whether a play succeeds or triggers a fuse) is exactly the information the acting client does not fully control or, in some cases, even know (e.g., playing a card the player doesn't remember perfectly). Optimism here has zero latency-hiding upside and a real correctness-perception downside (briefly showing a wrong result). The correct pattern is: on action send, disable the relevant controls and show a lightweight pending affordance; on server response, either apply the new state (success) or re-enable controls with a rejection reason (failure, should be rare since client-side pre-validation mirrors server rules for UX only).

**Animation state is separate from authoritative state, and is derived from it:** the server sends *snapshots* (each `state` message is the full current `ClientView`), not a stream the client must animate frame-by-frame itself. The client's rendering layer diffs the previous `ClientView` against the new one purely for animation *triggering* (e.g., "this card's `clued` flag flipped from false to true → play a glow-in animation on it") — but the animation layer never owns or mutates game truth; it is a presentation-only derivation that always converges to exactly what the latest snapshot says, even if an animation is interrupted by a rapid double-update (which, given human turn cadence, will be rare). This "snapshot + diff-for-animation-cues" approach is strictly simpler than trying to replay a fine-grained event stream client-side and is entirely sufficient given the turn-based pace.

**Concretely:** one client-side state atom holds "last received ClientView." Render is a pure function of that atom. A thin animation-cue layer watches for specific field transitions (new card added to a stack, a token count decreasing, a card gaining clue info) and fires a corresponding CSS/animation trigger, without ever holding its own copy of "the real game state."

## Suggested Build Order

The dependency graph, and consequently the build order, runs roughly: **transport/room plumbing → redaction contract → rules engine → UI**, because the riskiest unknowns (does the realtime topology actually deliver correctly-filtered, reconnect-safe state to multiple clients) are orthogonal to Hanabi's specific rules and should be proven before investing in the full rules engine.

1. **Protocol + Room Actor skeleton (no game logic yet).** A Durable Object that accepts WebSocket connections, assigns seats via token, persists a trivial state (e.g. just a counter or a shared "ping" value), and broadcasts it to all connected seats. Prove: room creation, join, multiple simultaneous connections, disconnect/reconnect with seat reattachment, hydrate-on-wake after forcing eviction. This is pure transport risk, zero game risk.
2. **Per-seat redaction with a trivial fake "game."** Extend the toy state to include a "secret" per seat (e.g., each seat has a random hidden number) and implement the whitelist-serialize `toClientView` pattern end-to-end, plus the leak tests (type-level, string-search, wire-boundary integration test) against this toy state. This proves the redaction chokepoint pattern and its test strategy work, before there's real game complexity to obscure a mistake.
3. **This is the recommended "thinnest vertical slice" checkpoint** (see below) — by the end of step 2, the two riskiest architectural bets (realtime topology on free-tier serverless, and provably-correct per-seat filtering) are validated in isolation, cheaply, before the Hanabi rules engine — the largest remaining unit of work — is written.
4. **Hanabi engine, pure and untransported.** Build `hanabi-engine` as a standalone package: state shape, seeded deck/shuffle, the three actions' validate+apply logic, the real `toClientView`, and endgame detection — all covered by unit and property-based tests, with zero dependency on WebSockets or Durable Objects. This is where most of the actual game-rules risk (fuse/clue token economy, final-round-after-deck-empty trigger called out in PROJECT.md as commonly-gotten-wrong) gets burned down, cheaply, in a fast test loop.
5. **Wire the real engine into the Room Actor** via the `game-adapter.ts` interface built in step 1-2's skeleton. At this point the "room-agnostic" and "game-specific" pieces are already separated, so this step should be small — mostly deleting the toy game and calling the real engine's three functions.
6. **Client UI**, built against the by-now-stable `ClientView` shape: lobby/join flow, the game table render, action controls, animation-cue layer, reconnect UX (disconnected-player indicator). This is the least architecturally risky remaining piece and benefits from being built last, once the wire contract is no longer changing underneath it.
7. **Variant support (Rainbow, Black)** as a configuration passed into `hanabi-engine`'s deck construction and clue-validation rules, added once the base game is fully correct — variants are a multiplier on an already-correct core, not a parallel track.
8. **(Later milestone) Innovation engine**, built as a new sibling package implementing the same `game-adapter` interface, reusing steps 1-2's room/seat/reconnect/redaction-pattern machinery entirely unchanged. This is the payoff of having kept `room-server/` game-agnostic from the start, and the point at which the "was this abstraction premature" question gets its real answer.

**Explicit vertical-slice recommendation for Phase 1:** build steps 1 and 2 together as a single deployable slice — a Durable-Object-backed room that a browser can join via a link, that assigns seats with reconnect-safe tokens, survives a forced eviction/restart, and demonstrably sends each connected seat a different, correctly-redacted view of a trivial shared secret state, verified by an automated leak test. Do this before writing a single line of Hanabi rules. It is small, deployable to the real Vercel+Cloudflare topology (not a local mock), and directly retires the two risks explicitly named in the research question (realtime + per-seat filtering + reconnect) as a bundle, in the cheapest possible form.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Cloudflare Workers + Durable Objects | Free-tier Worker hosts the Room Actor DO class; deployed via `wrangler` | Free plan includes Durable Objects with SQLite-backed storage; no idle-pause behavior comparable to Supabase's — confirmed via Cloudflare docs |
| Vercel | Hosts the static/SSR client app only; makes zero authoritative-state decisions | Client's WebSocket connects cross-origin directly to the Cloudflare Worker's URL, not through a Vercel serverless function (Vercel functions cannot hold a persistent WebSocket) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Client ↔ Room Actor | WebSocket, JSON envelope with `seq` + `type` | Only boundary that crosses a network; every message here must be treated as untrusted input by the server |
| Room Actor (server logic) ↔ Rules Engine | Direct in-process function calls (`applyAction`, `toClientView`) via the `game-adapter` interface | No serialization boundary — same process, same memory; keep this interface small and stable since both current and future engines implement it |
| Rules Engine internal ↔ View layer | Direct call, same package | The engine package's only "public API surface" that matters for security is: does it export anything that lets a caller bypass `toClientView` and get raw state to a client? It must not. |

## Sources

- [Cloudflare Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) — free tier limits, SQLite-backed storage inclusion
- [Cloudflare Changelog: Durable Objects Free Tier (2025-04-07)](https://developers.cloudflare.com/changelog/2025-04-07-durable-objects-free-tier/) — confirms free plan availability
- [Cloudflare Durable Objects: SQLite Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) — transactional storage model used for write-through persistence pattern
- [Cloudflare Docs: Use WebSockets (Durable Objects best practices)](https://developers.cloudflare.com/durable-objects/best-practices/websockets) — Hibernation API, `serializeAttachment`/`deserializeAttachment`, connection lifecycle
- [Cloudflare Blog: Zero-latency SQLite storage in every Durable Object](https://blog.cloudflare.com/sqlite-in-durable-objects/) — storage model background
- Domain knowledge (HIGH confidence, standard patterns not requiring citation): reducer/command pattern for turn-based game engines, whitelist-serialize vs blacklist-strip redaction, seeded-PRNG deterministic shuffling for reproducible tests, room-as-actor topology for authoritative multiplayer state, seat-token reconnect handshakes — these are well-established patterns across the multiplayer game server literature (authoritative server architectures for turn-based games, e.g. board-game server implementations using the actor model) and are not Cloudflare-specific; they generalize to any equivalent "one durable stateful process per room" host.

---
*Architecture research for: real-time multiplayer hidden-information card games on free-tier serverless*
*Researched: 2026-09-01*
