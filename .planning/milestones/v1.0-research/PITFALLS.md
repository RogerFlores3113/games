# Pitfalls Research

**Domain:** Real-time hidden-information cooperative card game (Hanabi) on free-tier serverless hosting, link-based rooms, no accounts
**Researched:** 2026-09-01
**Confidence:** HIGH (rules verified against Hanab Live and hanabi.github.io rules docs; free-tier claims verified against official docs/changelogs, dated 2026; leak/realtime patterns MEDIUM — synthesized from established multiplayer-game and websocket engineering practice rather than a single citable source)

## Critical Pitfalls

### Pitfall 1: Own-hand information leaks via server payload

**What goes wrong:**
This is the single highest-severity failure mode for this project — worse than a crash, because it silently destroys the game for the humans playing it and they may not even realize it happened. The concrete leak vectors, roughly ordered by how easy they are to accidentally build:

1. **Full-state-with-UI-hiding.** The server computes the true game state (every card, face up, for every seat) and sends the *entire* object to every client, relying on the client's React/Vue components to simply not render the current player's own hand. The card identities are sitting in `window.__NEXT_DATA__`, a Redux store, a WebSocket frame, or a React Query cache — visible in devtools Network/Application tabs in under 10 seconds. This is the single most common Hanabi-implementation bug in hobby projects, because it is the easy way to write a "shared game state" reducer.
2. **Network payload inspection.** Even without full-state-with-UI-hiding, a naive per-seat filter that runs *client-side* (client receives full state, then a client-side function redacts its own hand for rendering) has the identical problem: the wire payload already contained the secret.
3. **Asset preloading/animation leaks.** If card front images are named or requested by rank/suit (e.g., `/cards/red-3.png`) and the client prefetches or preloads the *actual* image for a card in its own hand (for a "flip" or "draw" animation), the browser's Network panel or even the `<img>` `src` attribute reveals the identity before the card is played. This also happens with CSS sprite offsets computed client-side from real card data.
4. **Timing/payload-size side channels.** If the server's per-seat filtering logic takes a different code path or produces a different-sized payload depending on the true identity of a hidden card (e.g., only including extra clue-history data for cards that happen to match some board state), payload size or response latency can, in principle, leak bits. Low likelihood to matter at 5 players in a friend game, but trivially avoided by always serializing hidden cards as a fixed-shape opaque object (e.g., `{ id, position, clued: [...] }` with no suit/rank fields at all) rather than a real card object with fields nulled out. A nulled-out field is a schema tell; an absent field is not.
5. **Error messages leaking state.** A validation error like `"Cannot play red 4 — stack is on red 2"` sent to the acting player when they attempt to play their own card leaks the exact identity of the card they just tried to play, defeating the entire game. Error responses to an action on a player's own hidden card must never echo back the concrete card identity — only the slot/position and a generic reason ("that card cannot be played right now").
6. **Spectator/reconnect code path skipping redaction.** The single most likely place this bug actually ships: the primary "live game state" path is filtered correctly, but a *second* code path — a reconnect handler that replays state, a spectator view, a debug endpoint, an admin/God-mode view used during development, or a "game over" reveal screen that fires before all final actions are resolved — reuses the raw state object because it was written later, under time pressure, and nobody re-ran the redaction logic through it. Reconnect is especially dangerous here because this project's reconnect-and-resume requirement (PROJECT.md) means there will be a distinct "rehydrate this seat's view after reconnect" code path built separately from the "push incremental update on each action" code path — two implementations of "what does seat N see" is exactly the situation that produces drift.
7. **Server-side logs.** `console.log(gameState)` or an error-tracking breadcrumb (Sentry, etc.) that captures the full authoritative state on an exception will contain every hand. Not a leak to the *player* directly, but a leak to anyone with log access (in a two-person side project this is usually just you, but if logs are ever screen-shared for debugging while a game is live, or shipped to a third-party log aggregator, it's live exposure) and — more importantly — a sign the codebase has a "full state" object floating around that could leak by a different path tomorrow.

**Why it happens:**
It is architecturally easier to have one `GameState` type, one reducer, and one "current state" object than to maintain per-seat projections. Every one of the above bugs is a shortcut back toward that easier shape. React/Redux tutorials for turn-based games near-universally assume "broadcast full state, render conditionally" because almost no other game genre has this constraint — chess, Tetris-battle, trivia games all have all-public state. Hanabi's core mechanic is the *exception* to how most multiplayer web tutorials are written, so copying patterns from generic realtime-game examples imports the leak by default.

**How to avoid (structural, not disciplinary):**
- **Never construct a "full state" object that contains other-than-the-viewer's hand identities anywhere in server code that has a path to a network response.** The server's internal authoritative state can and should exist, but the *only* function allowed to touch it is a single `projectForSeat(state, seatId) -> SeatView` function. Every single outbound payload — initial join, incremental update, reconnect rehydrate, spectator (if ever added), error response — must be constructed by calling `projectForSeat`, with no other code path permitted to serialize `state` directly. Enforce this at the type level: give the authoritative internal type and the wire type genuinely different TypeScript types (e.g., the internal `Card` has `{suit, rank}`, the wire `HiddenCard` has neither field, only `{id, clued}`), so that accidentally sending the internal type is a type error, not just a code-review miss, and accidentally `JSON.stringify`-ing the wrong object is visible in a diff/PR because the types don't match.
- **Route reconnect and initial-join through the exact same `projectForSeat` function as live updates** — do not write a second "get current state for a rejoining player" code path. Reconnect should call the same projection the live-update push calls; the only thing that differs is transport (a full snapshot vs. a delta).
- **Server-only card asset serving, or content-addressed-but-unguessable identifiers for hidden cards.** Simplest correct approach: never let the client know which asset to preload for a card it doesn't know the identity of. Render other players' (visible) cards with real asset URLs; render the viewer's own hand as a generic card-back asset client-side, and only swap in the real asset after the server confirms (post hoc, e.g. after the card is played and revealed) what it was.
- **Redact before serialization, test the redaction directly.** Write a unit test that takes an authoritative state with all hands populated, projects it for seat 2, and asserts that `JSON.stringify(view)` does not contain any of seat 2's own true suit/rank values anywhere in the string (a substring `.includes()` check across the whole serialized payload, not just checking named fields — this also catches accidental leaks in a debug/trace field). This is a cheap, high-value automated guard.
- **No debug/admin endpoint that returns raw state, ever, once real games are being played.** If one is needed during development, gate it behind an environment variable that is not set in the deployed environment, and delete it before the first real game with friends.

**Warning signs:**
- Any function or React component prop named `gameState`, `fullState`, `room.state` etc. that is available in client-side code and contains a `hand` with suit/rank fields for the viewing player.
- A network request in DevTools whose response body, searched (Ctrl+F) for the viewer's own drawn card's actual suit/rank, produces a match anywhere in the payload — even in a field you don't render.
- Two or more places in the server codebase that build a "what does this player see" object.
- Card image URLs in the DOM/Network tab for the player's own hand that resolve to a specific rank/suit before that card has been played or discarded.

**Phase to address:**
Foundational — must be decided in the phase that establishes the realtime transport and state model, before any UI is built on top of it. This is architecture, not a late "security pass." Should be the first thing validated with an automated test in the project (the "redaction leak" unit test above), and re-run as a check on every subsequent phase that touches state serialization (reconnect, spectator-if-ever-added, end-game reveal).

---

### Pitfall 2: Final-round end condition implemented wrong

**What goes wrong (verified rule):**
The trigger is: *the game ends when the last card is drawn from the deck.* At that point, every player — **including the player who just drew that last card** — gets exactly one more turn, in normal turn order, and **no new cards are drawn during those final turns** (the deck is empty; draws are simply skipped). Once every player has taken that one final turn, the game ends immediately and scoring happens off the final board state. Sources: Hanab Live rules (`hanabi-live/docs/rules.md`) and the community rules reference (`hanabi.github.io/misc/rules.md`) both state this identically: "everybody gets one more turn (including the player who drew the last card)."

The specific ways this gets implemented wrong:
1. **Off-by-one on whether the drawer gets a final turn.** Some implementations mistakenly treat "drew the last card" as that player's last turn already happening, and only give the *remaining* players one more turn each, ending the game one turn early. The correct behavior includes the drawer in the "one more turn each" count — their draw and the start of the final round are two separate things, and their *own upcoming turn* still counts as one of the "each player gets one more" turns.
2. **Off-by-one on when to start counting.** The final round must start counting from the turn immediately after the last card is drawn, tracked as "N more turns remain, where N = number of players," decrementing once per turn regardless of what action is taken (play, discard, or clue). A common bug: only decrementing the counter on certain action types, or restarting the counter if a clue is given during the final round (clues do not draw a card, but they are still a "turn" for final-round purposes).
3. **Drawing on the "last" turn when the deck has exactly 0 cards left but the code still calls the normal "draw after play/discard" step**, which either crashes (drawing from empty) or, worse, silently reuses/duplicates a card if the deck array isn't properly guarded. The draw step must be conditional on `deck.length > 0`, and entering the final-round state must be a first-class transition, not inferred implicitly from `deck.length === 0` scattered across multiple call sites.
4. **Mid-draw deck exhaustion is not actually a distinct case to special-case** — this is worth calling out because it's often over-thought. A play or discard action always draws exactly one replacement card (if any remain) as an atomic part of resolving that action; there is no scenario where a "draw" is interrupted partway. The only correctly-modeled event is: after resolving an action, check whether the deck is now empty; if it just became empty (and wasn't already), start the final-round countdown starting with the *next* player's turn. This should be modeled as a single state transition function, not scattered conditionals.
5. **Interaction with game-ending conditions during the final round.** If the third fuse is lost, or the fifth stack of the last color is completed, *during* the final round, the game ends immediately at that point — it does not wait for the final-round countdown to finish. Get the precedence right: check fuse-loss and all-stacks-complete after every single action (including final-round actions), and only check "was that the last final-round turn" if the game hasn't already ended via one of those two conditions.

**Why it happens:**
The end condition depends on three separate pieces of mutable state (deck count, final-round countdown, whose turn it is) that are easy to model as independent booleans/counters updated in slightly different places instead of a single authoritative turn-resolution state machine. Developers often write and test the "normal" turn loop first, get it working, and then bolt the final-round logic on as an afterthought/special case rather than folding it into the same transition function from the start — which is exactly when off-by-one turn-counting bugs get introduced, because the special case duplicates logic the main loop already had (advancing turn order) instead of reusing it.

**How to avoid:**
- Model turn resolution as a single explicit state machine with states at minimum: `normal`, `finalRound(turnsRemaining)`, `ended(reason)`. Every action (play/discard/clue) goes through one `resolveAction` function that: (a) applies the action's effect, (b) draws a replacement card if the deck is non-empty and the action was play/discard, (c) checks end conditions (3 fuses, all 5 stacks per variant suit count — 6 for Rainbow/Black) and transitions to `ended` if met, (d) if still not ended and the deck just became empty (transition from non-empty to empty on this exact action), transitions to `finalRound(playerCount)`, (e) if already in `finalRound(n)`, decrements to `finalRound(n-1)` or to `ended('final-round-complete')` if `n-1 === 0`, (f) advances to the next player's turn if the game hasn't ended.
- Write this as one of the first automated tests in the project, not a manual playtest: simulate a full deck down to the last card with a known deterministic script and assert (i) the drawer of the last card gets exactly one more turn, (ii) every other player gets exactly one turn each, (iii) no card is drawn during any final-round turn, (iv) the game ends immediately if fuses/stacks complete mid-final-round rather than running out the countdown.
- Special-case variant suit counts: with Rainbow or Black in play there are 6 suits, so "all stacks complete" means 6 completed stacks of 5, not 5. A hardcoded `=== 5` stack-completion check anywhere is a variant bug waiting to happen; derive the win condition from `variant.suits.length`.

**Warning signs:**
- A playtest where the game ends noticeably "too soon" (before the deck-drawer got a turn) or hangs waiting for a turn that should have ended the game.
- Any place in the codebase that checks `deck.length === 0` directly to decide whether to end the game, rather than reading from an explicit `finalRound` state — this is the tell that the countdown isn't a first-class state.
- Stack-completion win check hardcoded to a specific count (5) rather than derived from the active variant's suit list.

**Phase to address:**
Core game-engine phase (before any UI/realtime work depends on it) — write the turn-resolution state machine with the automated end-to-end simulation test described above as an explicit deliverable/acceptance criterion, separate from "the UI shows a game" being demoable. This is the second-highest-value thing to get right early, per the downstream consumer's framing, and is entirely decoupled from networking — it can and should be unit-tested as pure game logic with zero client/server/websocket code involved.

---

### Pitfall 3: Backend "free tier" that silently disappears or sleeps for too long

**What goes wrong:**
The project's core value proposition ("click a link, be playing within seconds, even after a week idle") is incompatible with a wide swath of the free-tier hosting landscape. Verified current (2026) behaviors:

| Service | Idle behavior | Verdict for this project |
|---|---|---|
| Supabase (already ruled out per PROJECT.md) | Free project pauses after 7 days of no API/DB activity; requires manual resume in dashboard, ~30s to wake once resumed manually | Disqualified — manual resume breaks "click a link and play" |
| Render (free web service) | Spins down after 15 min of no inbound traffic; auto-wakes on next request/WS connection in about 1 minute; also capped at 750 instance-hours/month account-wide | Cold start tolerable (auto-wake, no manual step) but ~1 min first-load delay every time the table has been quiet — noticeable friction on a "click and play in seconds" promise; the 750 hr/month cap is fine at this scale |
| Neon (Postgres, free plan) | Compute scales to zero after 5 min idle; auto-resumes in low hundreds of milliseconds on next query, no manual step, never fully deleted | Fine — sub-second, invisible cold start; good fit if a relational DB is wanted for persistence |
| Upstash (Redis, free plan) | Database archived after 30 days of *zero commands*, with warning emails first; data recoverable via console restore, but requires manual action to un-archive | Workable for weekly-plus play cadence but a genuine ambush if the friend group goes quiet for a month — needs either a scheduled no-op ping or accepting a manual restore step after long gaps |
| Cloudflare Workers + Durable Objects | Free plan (no paid Workers plan required as of 2026 changelog) with per-request billing, not idle-based sleep; DOs persist as long as within the ~5GB storage / request-count free allowance; no "pause" concept — a DO instance evicts from memory when unused but rehydrates from storage on next request with no wake delay of consequence | No idle-pause failure mode at all — best fit against the "always warm on a cold click" constraint |
| Vercel serverless functions themselves | Cold start on first invocation after idle (typically sub-second to low seconds for Node functions), not "sleep for days" — but functions are stateless per-invocation, so they cannot be the thing holding game state between requests regardless of cold-start behavior | Fine for stateless API routes; irrelevant to the "does state survive idle" question, which is about the *data/session store*, not the function runtime |
| Fly.io | Free allowances were removed for new accounts starting Oct 2024; new signups get a 7-day/2-VM-hour trial then require a credit card with no fallback free tier | Disqualified for a "no service should require a paid plan" constraint if this is a new account |
| Ably (free plan, realtime pub/sub) | 200 concurrent connections, 6M messages/month, 500 msg/sec — no idle-pause or deletion behavior found; account can go idle indefinitely on free tier | Good fit as a message-transport layer (not a data store) if a managed pub/sub is preferred over rolling websockets by hand |
| Pusher Channels (free plan) | ~100–200 concurrent connections, 200K messages/day — no idle-deletion found | Comparable alternative to Ably; message-transport only, same caveat |

**Why it happens:** Nearly every "generous free tier" is subsidized by the provider reclaiming idle compute, and providers differ wildly and change policy over time in exactly how aggressive that reclamation is and whether it requires a manual step to reverse (this is the axis that actually matters, more than the raw idle-duration number). A stack chosen for latency/DX without checking "what happens after N days of silence, and does resuming require a human to click something" imports a product-breaking bug that will not surface until real usage (a Tuesday-random link click after a quiet week), i.e., well after the code looks "done."

**How to avoid:**
- The disqualifying question for any candidate service is not "does it have a free tier" but **"after the longest realistic idle gap for this friend group (assume up to ~4-6 weeks — people go on vacation), does the very first request from a real user complete successfully without any human first visiting a dashboard to un-pause/un-archive something?"** Services that auto-resume on request (Neon, Cloudflare Durable Objects, Render with its ~1min penalty) pass; services that require a dashboard click or hard-delete-after-N-days without auto-recovery (Supabase pause, Upstash 30-day archive) fail or need a mitigation.
- If a service with an idle-archive policy is used anyway (e.g., Upstash for a Redis-shaped ephemeral session store, which is otherwise a good fit for short-lived game rooms), add a trivial scheduled keep-alive (a Vercel Cron Job hitting a `/api/keepalive` route that issues one no-op command) at a period safely inside the archive window — this converts a silent-failure risk into a non-issue for near-zero cost, and is cheap insurance regardless of which idle policy turns out to be current by the time this ships, since providers change these numbers without much notice.
- Prefer architectures where the durable/warm-critical piece has *no* idle-pause behavior at all (Cloudflare Durable Objects fits this) over ones that need a keep-alive workaround, since workaround-dependent reliability is one dashboard/cron misconfiguration away from silently regressing.
- Re-verify whatever is chosen against the provider's current docs immediately before each milestone that depends on it — free-tier terms in this space have changed multiple times per year across every provider checked above (Fly.io's entire free tier disappeared in Oct 2024; Upstash's free tier limits changed from a daily to monthly command cap within the last two years); a decision made in this research phase should be re-confirmed, not assumed frozen, if there's a long gap before implementation.

**Warning signs:**
- Any dependency whose docs use the words "pause," "archive," or "suspend" in connection with the free tier without also documenting an automatic, requester-triggered un-pause path.
- A provider's pricing/free-tier page that requires digging past marketing copy into a "limits" or "FAQ" subpage to find the actual idle policy — if it's hard to find, assume it's unfavorable and verify before committing.
- Signing up for a new service and being asked for a credit card before any usage — a strong signal the "free tier" is a trial, not a durable free plan (this was Fly.io's shift).

**Phase to address:**
Stack-selection / infrastructure phase, before any application code is written against a specific backend. This is a decision that is expensive to reverse later (data model and session-durability code will be written against whatever's chosen), so it belongs at the very front of the roadmap, likely as its own small "spike" phase: stand up the minimal "create a room, write one key, read it back" path against the top 1-2 candidates and literally simulate the idle gap (or, more practically, read the current docs' explicit idle SLAs since simulating a real week-long gap isn't practical inside a research/build cycle) before committing.

---

### Pitfall 4: Vercel-specific realtime/execution traps

**What goes wrong:**
- **Vercel serverless (and Edge) functions are not a place to hold long-lived WebSocket server state across requests in the traditional Node `ws` server sense.** As of 2026, Vercel does offer native WebSocket support for Functions (public beta as of the 2026 changelog, Python functions specifically called out), but a single WebSocket connection is pinned to one function instance for the connection's lifetime, that connection is force-closed when the function hits its **max execution duration**, and a reconnect is not guaranteed to land on the same instance — meaning any in-memory game state kept in the function process is not durable across a duration-limit-triggered disconnect, and Vercel's own guidance is to keep durable state in an external store (they specifically suggest Redis from the Vercel Marketplace), not in function memory.
- **Execution duration caps** on the Hobby plan are short by default (commonly cited at 10s for standard serverless invocations, with different/longer ceilings for other function types) — a WebSocket held open for a 25-minute game will hit this ceiling and be force-closed repeatedly if implemented as a plain long-lived function-held socket, which conflicts directly with this project's "game must survive a ~25-minute session" requirement.
- **Server Actions are still function invocations** — every Server Action call counts against the same invocation/compute budget as an API route; using Server Actions as a de facto "polling" or "frequent state check" mechanism (e.g., calling one on every render, or on an interval) burns invocations exactly like hitting an API route would, just with less visible network-tab evidence, which can hide a chatty-polling anti-pattern from casual inspection during development.
- **Practical implication for this project:** because Vercel Functions cannot cheaply hold the persistent, stateful, per-room WebSocket server this game needs for its full session length, the realtime layer should be delegated to a purpose-built provider (Cloudflare Durable Objects — one DO instance per room, holding authoritative state and WebSocket connections for that room's lifetime with no execution-duration ceiling of the Vercel kind — or a managed pub/sub like Ably/Pusher fronted by short-lived Vercel API routes for the request/response side) rather than attempting to run the whole realtime layer inside Vercel Functions. This is consistent with the "reframed priority" note already in PROJECT.md that invocation-count is not actually the binding constraint — durable connection-holding is, and Vercel Functions are structurally the wrong place for a socket that must outlive a 10-60s duration cap.

**Why it happens:** "Deploy on Vercel" is easy to conflate with "everything runs inside Vercel," but Vercel's execution model (request-scoped, duration-capped functions) was not built as a persistent-connection game server, and the WebSocket support that does exist is explicitly scoped to individual connections rather than a durable shared-room server process — this is a subtle enough distinction that it's easy to discover only after building a prototype that "works" locally with a long-lived Node process and then hits duration limits in production.

**How to avoid:**
- Decide early which piece of the stack owns "the authoritative, always-on, per-room WebSocket server with in-memory or fast-persisted state" and make sure it is *not* a Vercel Function. Cloudflare Durable Objects is the strongest structural fit for this per-room ownership model (one DO = one room, naturally). If a managed pub/sub (Ably/Pusher) is used instead, Vercel Functions become thin, short request/response handlers that publish/subscribe to that external service rather than holding sockets themselves — also valid and simpler to reason about, at the cost of an added dependency and its own free-tier ceiling (see Pitfall 3's table).
- Treat "does this design keep a socket or in-memory state alive inside a Vercel Function across more than one request" as an architecture red flag to catch at design-review time, not at deploy/incident time.
- Budget Server Action / API route calls against actual per-user-action counts (one call per play/clue/discard, not per render or per poll interval) — this was already correctly deprioritized as a hard constraint in PROJECT.md, but it's worth keeping an explicit non-polling design (push via websocket/pub-sub, not client-side interval polling) since polling is the single most common way a "we don't need to worry about invocation count" assumption gets invalidated.

**Warning signs:**
- Any code path that stores per-room state in a plain in-memory JS variable/module scope inside a file under `/api` or a Vercel Function handler, expecting it to persist across requests.
- A WebSocket connection that appears to work fine in local dev (`next dev`, persistent Node process) but disconnects unpredictably after deployment to Vercel.
- A client-side `setInterval` polling an API route "just to check if anything changed" anywhere in the codebase.

**Phase to address:**
Stack-selection / infrastructure phase, same phase as Pitfall 3 — the realtime transport choice and the idle-durability choice are two faces of the same architecture decision and should be resolved together, since e.g. choosing Cloudflare Durable Objects addresses both "always warm" and "durable WebSocket ownership" in one decision.

---

### Pitfall 5: Realtime/connection edge cases specific to a 25-minute turn-based session

**What goes wrong (each is a distinct, observed-in-practice failure mode, not generic advice):**
- **Duplicate connections from the same player** (two tabs, or a refresh that doesn't cleanly close the old socket before opening a new one) can result in a seat receiving two independent connections, either of which the server might treat as "the" connection for that seat — leading to actions from a stale tab being applied, or two "disconnected" flickers as connections race. Structural fix: seat identity is keyed server-side (e.g., a seat token stored in the client, not just a raw socket), and a *new* connection for an already-connected seat token explicitly evicts/closes the prior socket server-side before accepting the new one — never let two live sockets both be "the" seat.
- **Reconnect resync gaps.** If updates are pushed as *deltas* ("card played at position 2") and a client's socket drops for even a few seconds, messages sent during the gap are lost unless explicitly handled — the client reconnects and is now silently out of sync (e.g., missing a clue that was given while disconnected), which for Hanabi is worse than a UI glitch: a player might act on stale information about what's clued. Structural fix: on reconnect, always request and apply a full authoritative snapshot for that seat (via the same `projectForSeat` function, per Pitfall 1) rather than trying to "catch up" on missed deltas; do not attempt delta-replay reconciliation for a small-room game like this — it's not worth the complexity given games have a handful of players and modest message volume.
- **Mobile tab suspension mid-game.** Verified: Chrome and Safari both aggressively suspend or drop WebSocket connections in backgrounded tabs — Safari has been observed closing idle-focus connections in as little as ~5 minutes, Chrome in the 5-7 minute range, both well within a 25-minute game where a player may switch apps to check the voice call or send a message. This is not a rare edge case for this project's stated play context (people are on a separate voice call, i.e., actively tab-switching away from the game tab during play) — it will happen in most real games. Structural fix: treat every reconnect as the expected steady-state, not an error path — the resync-via-full-snapshot approach above must be fast and unsurprising, and the UI must clearly show "reconnecting" rather than a frozen last-known state that looks live but isn't. Do not architect around "the socket generally stays open"; architect around "the socket will drop and must resume seamlessly," since that is the actual expected usage pattern here, not a corner case.
- **Zombie rooms.** A game that ends (or is simply abandoned mid-game because the friend group logs off) leaves a room's state (and, if using Durable Objects/Redis, its allocated resources) alive indefinitely unless something expires it. At this project's scale this is a cost/hygiene issue rather than a correctness one, but it compounds against free-tier storage caps (e.g., Durable Objects' 5GB free storage ceiling, Upstash's 256MB) if never cleaned up. Structural fix: attach a TTL to room state at creation (e.g., 24-48 hours of no activity expires the room) rather than relying on an explicit "end game" signal, since abandonment without a clean end is the common case, not the exception.
- **Out-of-order/replayed actions and idempotency**, covered in more depth in Pitfall 6, but the realtime-transport-level version of this: if the transport doesn't guarantee ordered delivery per room (most WebSocket setups do, per-connection, but a pub/sub fanout across multiple server instances might not without care), a "play" and a subsequent "clue" could theoretically be applied out of order. Mitigate by having the server (not the transport) be the sole sequencer — every action is applied to the authoritative per-room state one at a time in the order the server's single authoritative process/DO receives it, and the wire protocol includes a monotonic turn/sequence number so clients can detect and ignore/reconcile a stale or out-of-order push.

**Why it happens:** Most realtime-feature tutorials are built and demoed on a desktop browser with the tab in focus for the whole session, which is exactly the condition under which none of the above problems appear — the demo looks solid, and the actual usage pattern (phone in pocket, tab backgrounded during a voice call, laptop lid closed and reopened) is discovered only once real friends play a real game.

**How to avoid:** See structural fixes above. The single unifying principle: **reconnect must be a first-class, frequently-exercised path (full re-sync via the same seat-projection function), not a rare error branch** — because for this project's actual usage pattern, it is not rare.

**Warning signs:**
- The only way to test reconnect behavior during development is manually killing dev server / refreshing — if there's no code path that's been exercised for "phone backgrounded for 6 minutes then foregrounded," it hasn't been tested for the actual expected usage pattern.
- Client state that assumes a delta stream is complete/gapless (e.g., a client-side reducer that only ever applies incoming deltas and never re-requests a full snapshot).

**Phase to address:**
Realtime/session-durability phase, directly after the core game engine and transport-selection phases. Should have explicit acceptance criteria: a game survives (a) closing and reopening a tab, (b) backgrounding a mobile tab for 10+ minutes, (c) two tabs open to the same seat, without corrupting state or duplicating an action.

---

### Pitfall 6: Turn-based state race conditions and trusting the client

**What goes wrong:**
- **Simultaneous actions.** Two players' clients each believe it's their turn (e.g., due to a stale UI after a missed update) and both submit an action. Without server-side turn validation, the second action can be applied even though it wasn't that player's turn, corrupting turn order and game state.
- **Double-submit / non-idempotent actions.** A double-click, a slow network causing a client-side retry, or a client naively resubmitting on reconnect can send the same "play card at position 2" action twice. If the server just applies whatever it receives, the second application acts on an already-mutated state (e.g., plays whatever card is *now* at position 2, which drew and shifted after the first play) — a completely different, wrong action.
- **Client-side-only validation.** Disabling the "clue" button in the UI when it's not the player's turn, or when clue tokens are 0, is good UX but is not a security/correctness boundary — a stale client, a replayed request, or a modified request (trivial to send via devtools/fetch by anyone in the room, including well-meaning players just poking around) must still be rejected server-side. Every rule enforced in the UI (turn order, clue token availability, "clue must touch ≥1 card," "cannot discard at 8 clues," valid target seat, valid color/rank) must be independently re-validated server-side before the action is applied, full stop.
- **Trusting client-supplied payload content.** If a "give clue" action's payload includes anything the server should be deriving itself (e.g., a client-computed list of "which cards this clue touches"), an incorrect or malicious client could claim a clue touched different cards than it actually does, which for Hanabi is a direct information-integrity break, not just an inconvenience — trust in what's mutually known is the entire mechanic. The server must independently compute which cards a clue touches from its own authoritative hand data, using the client's payload only for "which seat, which color/rank" — never for the resulting touched-card set.

**Why it happens:** For a friend-group project it's tempting to under-invest in server-side validation on the theory that "nobody's going to cheat, it's just us" — true for malice, irrelevant for bugs: stale clients, race conditions, and double-submits happen with well-behaved players just from network conditions and browser quirks, not adversarial intent.

**How to avoid:**
- Single-writer model: all mutations for a room go through one serialized authoritative handler (naturally true if using a Cloudflare Durable Object per room, since a DO processes one request at a time by design; requires explicit care — e.g., a mutex/queue — if using any architecture with concurrent writers to the same room's state).
- Every action carries (or is checked against) an expected turn/sequence number; the server rejects (with a clear, non-leaking error) any action from a seat whose turn it isn't, and rejects an action whose sequence number doesn't match current state (this also solves double-submit: a resubmitted identical action will have a stale sequence number the second time and gets rejected as a no-op rather than double-applied).
- Re-derive all rule checks server-side regardless of what the client believes or disabled in its UI: turn order, clue token count and the "≥1 card touched" and "no rainbow-clue-as-a-color" rules, discard-at-8 restriction, valid play/discard target, and — critically — the actual set of cards a clue touches, computed from server-held hand data only.

**Warning signs:**
- Any action handler that doesn't check "is it currently this seat's turn" as literally its first line.
- A "give clue" payload shape that includes a list of affected card IDs/positions rather than just `{targetSeat, clueType: 'color'|'rank', value}`.
- No sequence/version number on room state that clients and the server can both reference to detect staleness.

**Phase to address:**
Core game-engine phase, alongside Pitfall 2 — action validation and the turn-resolution state machine are the same piece of code; there's no meaningful way to build one without the other.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Full-state broadcast with client-side hand hiding | Faster to build a first working demo | Own-hand leak (Pitfall 1) — a rewrite of the entire state/transport layer, not a patch | Never, even for a throwaway prototype, if that prototype's code is likely to be extended rather than deleted |
| Delta-only updates with no reconnect snapshot path | Slightly less code initially | Silent desync after any dropped connection, which is the expected case here, not an edge case | Never for this project, given the mobile-tab-suspension reality |
| Skipping server-side re-validation of client-disabled actions | Faster to ship the happy path | Race conditions and double-submits corrupt real games mid-session with well-behaved players | Never |
| Hardcoding "5 suits" / "stack complete at 5" logic instead of deriving from variant config | Simpler v1 if only base game existed | Every Rainbow/Black-specific bug (6-suit win condition, Rainbow clue-touch logic) becomes a special case bolted onto base-game logic instead of the natural behavior of a general system | Acceptable only if base game ships fully isolated from variant code and variants are added as a deliberate refactor, not organically — risky given all three are in v1 scope per PROJECT.md, so better to design variant-parametrized from day one |
| In-memory room state with no idle TTL/cleanup | No extra code for a first working version | Zombie rooms consume free-tier storage quota over time (Pitfall 3/5) | Acceptable to defer the cleanup *job* itself to a later phase, but the TTL/expiry field should exist in the data model from the start so it's not a schema migration later |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Cloudflare Durable Objects (if chosen) | Treating a DO as a general database rather than a per-room actor; fanning many rooms' state into one DO | One DO instance per room (natural sharding), keyed by room ID from the link |
| Ably/Pusher (if chosen as transport) | Using the realtime service as the source of truth for game state (it's a message bus, not a database) | Keep authoritative state server-side (a DO, or a small backing store); use the pub/sub service purely to fan out already-validated, already-redacted per-seat updates |
| Vercel + external realtime backend | Assuming a Vercel API route can "hold" a subscription/session across requests | Each Vercel Function invocation is request-scoped; any subscription or long-lived connection setup happens client-side (browser connects directly to Ably/Pusher/DO endpoint) or via Vercel's native WebSocket function support with awareness of its duration cap |
| Neon/Postgres (if chosen for persistence) | Querying on every websocket message for state that could live in memory/cache for the room's active lifetime | Use Postgres for durable/cold storage (completed games, if ever wanted) and keep hot in-flight room state in the realtime layer's own memory (DO storage, Redis), not round-tripping to Postgres per action |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Broadcasting a full state snapshot on every single action instead of a targeted delta | Unnecessary bandwidth, slower perceived latency per action | Send deltas for live play, full snapshot only on join/reconnect | Irrelevant at this scale (a handful of players, infrequent actions) but costs nothing to do right from the start |
| Client-side polling instead of push | Wasted invocations, laggy perceived realtime-ness | Push-based updates only (websocket/pub-sub) | Would only matter at a scale this project will never reach, but polling also just feels bad at 1 table |
| Per-action database round-trip instead of in-memory authoritative state | Latency per action noticeably higher than "instant" | Keep the authoritative state in the realtime layer (DO/in-memory), persist only for durability/cold-restore, not per-action | Not a "breaks at scale" issue here — it's a UX-feel issue even at 1 table |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Room/seat identity derivable or guessable from a short link alone with no separate seat-secret | A curious friend (or anyone who gets the room link) could open it in an incognito tab and, if seat assignment isn't sticky/secret, potentially see a different seat's view or hijack a seat | Issue a per-seat secret token on join (stored client-side, e.g. in localStorage), separate from the shareable room link; the room link alone should only let someone request to *join* an open seat, not silently assume an existing one |
| No server-side re-validation of "which seat is this socket" on every message | A stale or manipulated client message could be attributed to the wrong seat | Bind the seat identity to the connection/session server-side at connect time from the seat token, never trust a `seatId` field in the message payload for authorization (only for information, if at all) |
| Logging full game state (including hidden hands) to a third-party log aggregator or error tracker | Exposure of hand identities to anyone with log/dashboard access, plus normalized habit of a "full state" object floating through the codebase | Scrub/redact before logging, or simply never log the raw authoritative state object — log seat-scoped views or structured events (`{action: 'play', seat: 2, position: 1}`) instead |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Clue highlighting disappears once the turn passes | Players must remember what was clued from memory across many turns, which is exactly the cognitive load Hanabi's physical card-touching/rotation exists to reduce — losing this digitally makes the digital version *harder* than the physical game, a real regression | Persist all clue history per card as long-lived visual state (e.g., small color/number pips shown on every card face-down slot indicating everything ever clued about it), not just a momentary highlight animation on the turn it was given |
| Color-only signaling with no shape/pattern/text redundancy | Colorblind players (red/green confusion is common, and Hanabi's base 5 colors and Rainbow's "touched by everything" mechanic both lean entirely on color) cannot play the game as designed | Pair every color with a distinct icon/shape or text label in addition to color (already-established Hanab Live convention); make this non-optional given the domain, not a "nice to have" accessibility pass |
| Card reordering ambiguity | Hanabi conventions (chop, slot-based reasoning) depend on stable left-to-right card order within a hand; if the UI silently reorders cards (e.g., re-sorting after a draw) players lose track of which physical card is which | Preserve hand order exactly as the physical game would (new card enters at a fixed position — typically the position of the card that was played/discarded — never re-sort by suit/rank) |
| Discard pile not fully visible/organized | Players cannot deduce which copies of critical cards remain, which is core to correct late-game play (e.g., "is this the last red 2") | Show the full discard pile grouped by suit/rank at all times, not a scrolling log — this is a first-class piece of the board, not an afterthought log feed |

## "Looks Done But Isn't" Checklist

- [ ] **Own-hand redaction:** Looks done when the UI hides your own cards — verify by inspecting the raw WebSocket/network payload for your own seat's connection and confirming your own card identities are structurally absent (not just unrendered).
- [ ] **Final-round ending:** Looks done when a normal game ends correctly — verify with an automated test that specifically drives the deck down to the last card and checks the drawer gets one more turn and no one draws during the final round, for 2, 3, 4, and 5 player counts (hand size and turn-count differ).
- [ ] **Reconnect:** Looks done when refreshing the tab resumes the game — verify by backgrounding a mobile tab for 10+ minutes mid-game (not just refreshing) and confirming clean resync, and by opening two tabs to the same seat and confirming only one is authoritative.
- [ ] **Rainbow/Black variant correctness:** Looks done when the extra suit renders — verify a color clue actually highlights Rainbow cards for every color option, that there is no selectable "rainbow" clue color, that Black's stack-completion clue-token reward and misplay/discard math work with only one copy of each Black rank, and that "all stacks complete" requires all 6 suits (not 5) when either variant is active.
- [ ] **Turn/action validation:** Looks done when the UI prevents invalid actions — verify by manually crafting and sending an out-of-turn or rule-violating action directly (bypassing the UI, e.g. via browser devtools console) and confirming the server rejects it.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|------------------|
| Own-hand leak shipped and discovered after a real game | LOW (if caught immediately) / socially awkward always | Confirm and fix the specific leak path, add the redaction unit test from Pitfall 1 to prevent regression, and be upfront with the friend group that a game's outcome may be tainted if their hand was visible — replaying is easy since games are short |
| Final-round bug causing wrong score/ending | LOW | Fix the state machine, add the simulation test from Pitfall 2, no data migration needed since games are short-lived and not persisted long-term |
| Chosen backend's free tier changes terms mid-project | MEDIUM | Because room/realtime layer is meant to be game-agnostic and modular per PROJECT.md, isolate the storage/transport behind an interface so swapping providers (e.g., Upstash → another KV store) doesn't require touching game logic |
| Zombie rooms exhaust a free-tier storage cap | LOW | Add/adjust the TTL-based cleanup job; if already over a hard cap, manually purge old room keys once via the provider's console |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|----------------|
| Own-hand information leaks (Pitfall 1) | Foundational state/transport architecture phase | Automated redaction test: serialize a seat's view, assert its own hand's identity data is entirely absent from the payload string |
| Final-round end condition (Pitfall 2) | Core game-engine phase | Automated simulation test driving the deck to empty for 2/3/4/5 players, asserting exact turn counts and no draws in final round |
| Backend idle-pause/deletion traps (Pitfall 3) | Stack-selection/infrastructure phase | Explicit written check of each candidate's current idle policy against official docs before committing; keep-alive cron added if an archive-style provider is chosen |
| Vercel execution/WebSocket limits (Pitfall 4) | Stack-selection/infrastructure phase (same as above) | Architecture review confirming no per-room state or long-lived socket lives inside a Vercel Function's memory across requests |
| Realtime/reconnect edge cases (Pitfall 5) | Realtime/session-durability phase | Manual test matrix: refresh, background-tab-10min, two-tabs-same-seat, all resulting in correct single-seat state |
| Turn-based race conditions / trusting the client (Pitfall 6) | Core game-engine phase (same as Pitfall 2) | Direct devtools-crafted invalid/out-of-turn/double-submit action attempts, all rejected server-side |
| Rules edge cases (clue must touch ≥1, 8-clue discard ban, stack-of-5 clue reward, Rainbow/Black specifics) | Core game-engine phase | Unit tests per rule, enumerated directly from this document's Critical Pitfalls section |
| UX: lost clue history, color-only signaling, reordering, discard visibility | UI/board-rendering phase | Manual review against the four UX pitfalls listed above as explicit acceptance criteria, not left to visual polish discretion |
| Scope creep (variant catalogue, premature Innovation abstraction, lobby, chat) | Ongoing — enforced via PROJECT.md Out of Scope section at every phase boundary | Re-check each new "nice to have" idea against the existing Out of Scope list before adding it |

## Sources

- Hanab Live official rules: https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/rules.md
- H-Group / hanabi.github.io rules reference: https://github.com/hanabi/hanabi.github.io/blob/main/misc/rules.md
- H-Group empty-clue discussion: https://github.com/hanabi/hanabi.github.io/blob/main/misc/empty-clues.md
- Hanabi Central Wiki, variants and cards: https://hanabi.wiki/variants, https://hanabi.wiki/cards
- Supabase official docs, free project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Neon docs, scale to zero: https://neon.com/docs/introduction/scale-to-zero and https://neon.com/faqs/free-plan-limits-and-quotas
- Upstash FAQ (free tier archival policy): https://upstash.com/docs/redis/help/faq
- Render free tier docs: https://render.com/docs/free
- Cloudflare Durable Objects limits and free-tier changelog: https://developers.cloudflare.com/durable-objects/platform/limits/ and https://developers.cloudflare.com/changelog/2025-04-07-durable-objects-free-tier/
- Fly.io free-tier removal (community discussion, Oct 2024 policy change): https://community.fly.io/t/does-the-free-tier-require-a-credit-card-or-credits-to-be-added-to-the-account/5803
- Ably pricing/limits (verified Aug 2026 per source): https://ably.com/docs/platform/pricing/limits
- Vercel official WebSockets docs and changelog: https://vercel.com/docs/functions/websockets, https://vercel.com/changelog/websocket-support-is-now-in-public-beta, https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections
- Vercel Hobby plan limits, third-party 2026 summaries (MEDIUM confidence, not primary Vercel docs): https://deploywise.dev/blog/vercel-free-tier-limits-2026
- Mobile/background-tab WebSocket suspension reports: Safari socket.io issue https://github.com/socketio/socket.io/issues/2924 ; Supabase realtime-js issue on backgrounded-tab disconnects https://github.com/supabase/realtime-js/issues/121 (MEDIUM confidence — community-reported behavior, not a formal spec, and exact timing varies by browser version)

---
*Pitfalls research for: online multiplayer Hanabi on free-tier serverless hosting*
*Researched: 2026-09-01*
</content>
