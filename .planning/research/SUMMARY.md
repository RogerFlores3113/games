# Project Research Summary

**Project:** games.rogerflores.dev — online multiplayer Hanabi (base + Rainbow + Black)
**Domain:** Real-time multiplayer hidden-information cooperative card game, free-tier hosted, link-based rooms, no accounts
**Researched:** 2026-09-01
**Confidence:** HIGH overall (infrastructure decision independently corroborated by three of four researchers; MEDIUM on some free-tier idle-policy specifics that should be re-verified before the infrastructure phase)

## Executive Summary

This is a small, well-understood genre with one dominant open-source reference implementation (hanab.live) and one dominant-but-mediocre commercial one (Board Game Arena) — the feature landscape is narrow and settled, so the real risk in this project is not "what to build" but "getting the two structurally hard things right": server-authoritative per-seat state filtering (because Hanabi players hold their cards facing outward — you can see everyone's hand but your own) and session durability across a ~25-minute game played by people on a separate voice call, whose phones will background the tab as a matter of course, not as an edge case.

Three of the four researchers, working independently, converged on the same infrastructure recommendation: **Cloudflare Durable Objects (SQLite-backed storage, WebSocket Hibernation API), one DO per room, deployed via the `partyserver` library, with Vercel reduced to hosting the Next.js frontend and thin room-creation handlers.** This is not one option among several — it is the load-bearing decision the roadmap should be built around. It independently solves the two hardest constraints at once: it has no idle-pause/idle-archive failure mode (unlike Supabase, which pauses after ~1 week and disqualified itself; unlike Upstash, which archives after 30 days; unlike Fly.io, which no longer has a standing free tier), and per-seat filtering falls directly out of the actor model — a single process holds every connection for a room and can trivially compute and unicast a distinct filtered view to each seat, rather than requiring a separate pub/sub or channel-per-seat workaround. The named runner-up, **Neon (Postgres, scale-to-zero) + Ably (per-seat channels) with game logic in Vercel functions**, is a fully viable and genuinely free alternative, but requires three coordinated services instead of one and re-implements per-seat filtering as an application concern rather than getting it from the transport for free.

The main risks, in order of severity, are: (1) an own-hand information leak via any code path that doesn't route through a single, structurally-enforced redaction function — the most likely real-world instance of this is a reconnect/rehydrate path built separately from the live-update path; (2) the final-round end condition (deck-empty → one more turn each, including the drawer) implemented as scattered `deck.length === 0` checks instead of an explicit state machine, which is the single most commonly-botched Hanabi rule across every implementation surveyed; and (3) treating Rainbow/Black as bolt-ons rather than parametrizing suit count from day one, which silently breaks win-condition and clue-touch logic under both variants. All three are structural, not "polish," and are addressed most cheaply by building the redaction contract and the rules-engine state machine as the first two things in the project, before any UI exists to obscure a mistake.

## Key Findings

### Recommended Stack

**Primary: Cloudflare Durable Objects (SQLite storage) + `partyserver`, one DO per room, `partysocket` on the client, Next.js (App Router) on Vercel as a thin shell.** Verified against Cloudflare's own pricing docs (2026-09-01): Durable Objects with SQLite storage are available on the **Workers Free plan** (100k requests/day, 13,000 GB-s/day duration, 5GB total storage, 5M row reads/day, 100K row writes/day) — limits that support tens of thousands of moves per day against an actual usage pattern of "one table, a handful of games a week." WebSocket Hibernation lets the DO evict from memory between messages while the client's socket stays open and no duration billing accrues while idle — directly turning "players sit idle between turns on a voice call" into near-zero compute cost. The client opens a `wss://*.workers.dev` connection directly from the browser; no DNS migration of `rogerflores.dev` off Vercel is required.

**Runner-up: Neon (Postgres, scale-to-zero, auto-resume in low hundreds of ms) + Ably (per-seat channels, 6M msgs/month free) + game logic in Vercel serverless functions.** Switch to this only if the Cloudflare Free plan's daily ceilings are ever actually approached (not expected at stated scale) or if relational, queryable game history becomes a real requirement (explicitly out of scope now).

**Core technologies:**
- Cloudflare Workers + Durable Objects (SQLite) — authoritative game server, one instance per room; the load-bearing infrastructure choice
- `partyserver` — room routing + hibernation-aware WebSocket lifecycle on top of the raw DO API, removes boilerplate while staying on your own Cloudflare account/billing (not the separately-billed hosted PartyKit Cloud product)
- `partysocket` — client WebSocket wrapper with automatic reconnect/backoff, critical for the reconnect requirement
- Next.js (App Router) on Vercel — thin shell; only the landing/room-creation page benefits from SSR (fast first paint, OG tags for the shared link); `/room/[id]` is a pure client component that does nothing but open a WebSocket and render pushed state
- TypeScript (strict) — non-negotiable given the rules-engine edge-case surface (clue legality, variant touching rules, endgame triggers)
- Zod — validates every WebSocket message at the Vercel/Cloudflare runtime boundary, both directions
- Zustand — thin client cache of "the last filtered view the server sent me" plus local UI state; server is authoritative, so no real client-side reducer is needed
- Vitest + fast-check — property-based testing for the rules engine's universal invariants (redaction, token conservation, endgame turn-counting, variant touching rules) — a deliberate, evidence-based choice given how well the domain's invariants fit this testing style, not a default

**Explicitly ruled out:** Supabase (free-tier pause after ~1 week — already rejected in PROJECT.md), Vercel-native WebSockets as the primary transport (no cross-instance broadcast guarantee, reintroduces the exact fan-out problem DOs solve natively), Fly.io/Railway (no standing free tier in 2026), Render (real free tier but 30-60s cold start after 15 min idle, fails the "feels instant" requirement), Redux (unjustified ceremony for what's fundamentally a renderer of server-pushed state).

### Expected Features

The genre is narrow and settled — most of what's needed is already reflected in PROJECT.md's Active requirements. Research adds implementation-level precision on a few items that are easy to underbuild.

**Must have (table stakes):**
- Persistent, glanceable board state (clue/fuse tokens, deck count, discard pile, played stacks) — never behind a tab or menu
- Whose-turn indicator, always visible
- Server-authoritative legal-action enforcement (clue rules, discard-at-8-clues lockout)
- Clue-touch highlighting that **persists on the board, not a flash** — this is the entire mechanism by which digital play communicates what a clue meant, since there's no physical finger-pointing
- **Per-card accumulated clue state tracking both positive AND negative information, persisted after the turn passes** — this is the specific thing Board Game Arena is most criticized for lacking ("no ability to see negative clues... cumbersome to track via memory"). This is table stakes infrastructure, not a power-user feature — it's the digital replacement for what a physical table's shared memory and clue-chip placement do implicitly.
- Correct end-condition detection: 3 fuses, all stacks complete (6 for Rainbow/Black, not hardcoded to 5), or final round after deck empties — including the bonus-clue-on-completed-5/forfeit-at-8 edge case
- Score display with a legible band/label at game end
- Disconnect indicator + reconnect-to-same-seat with full state resume
- **Colorblind-safe suit identification as the only rendering, always on — not a togglable mode.** A per-user toggle is actively wrong for this product: the group is on a shared voice call describing what they see, so a mismatch between what different players' screens show breaks shared reference. Rainbow is the sharpest test of this, since a Rainbow card's identity is never resolved by any single color clue.
- Basic mobile/touch viability for a 4-5 player hand layout — flagged as real, non-trivial design work (tap-to-select rather than drag, materially different layout from desktop), not something that falls out of a responsive CSS pass

**Should have (differentiators, v1.x):**
- Player-authored card notes (hanab.live's signature feature) — valuable but genuinely optional for a casual friend group not running convention systems; add once "I forget what I inferred" becomes a recurring complaint
- Clue history/event log — cheap once turn history exists in state
- Sound/haptic "your turn" notification
- "Fireworks night" luminosity-as-signal theme — genuine differentiator (neither hanab.live nor BGA does this), and must be designed *alongside* the colorblind work since both luminosity and hue are competing for the same visual channel on a small card face; if luminosity communicates clue-accumulation via brightness/lightness steps (not saturation-of-a-hue-you-can't-perceive), it reinforces accessibility rather than fighting it

**Defer (v2+ or never):**
- Empathy/auto-inference tooling (H-Group convention assistance) — actively risks changing the character of casual play for this audience
- Extended variant catalogue beyond Rainbow/Black — that's a different, much larger project
- Replay/scrubber — explicitly deferred per PROJECT.md, but flagged as the single feature most likely to be requested after a session ends in an argument about what a clue meant; if ever added, must be pausable/scrubbable (BGA's unpausable version is worse than no replay at all) — the cost of the deferral is that turn history retention should exist cheaply from day one even though the replay UI itself is not built
- Bot/AI takeover of a disconnected seat — an anti-feature, not a differentiator: it destroys the point of a game about reasoning about known, specific teammates, and masks the failure state the group would rather just see and wait out

### Architecture Approach

One Durable Object instance per room is the single source of truth for that room: connections, seats, rules-engine invocation, and persistence all happen inside it, with the Vercel-hosted client holding no authoritative state at all — it renders whatever the server last pushed. The riskiest unknowns (does the realtime topology deliver correctly-filtered, reconnect-safe state to multiple clients) are orthogonal to Hanabi's specific rules, so the recommended build order proves transport + redaction first with a trivial fake game, then builds the real rules engine as a pure, untransported package, then wires it in, then builds UI last against an already-stable wire contract.

**Major components:**
1. **Edge entrypoint (stateless Worker)** — resolves room code to Durable Object ID, forwards the WebSocket upgrade; contains zero game logic
2. **Room Actor (Durable Object)** — owns all connections for a room, the session/seat manager (game-agnostic), and calls into the rules engine; persists state transactionally to SQLite storage before broadcasting (write-before-broadcast, so no acknowledged action can be lost to a crash between "applied" and "persisted")
3. **Rules Engine (`hanabi-engine`, pure, I/O-free package)** — `applyAction(state, action, actorSeat)` reducer, deck construction with seeded shuffle (for reproducible bug reports), endgame detection, and the `toClientView`/redaction function — this package has zero WebSocket or DO API surface, making it unit-testable in milliseconds
4. **View/Redaction Layer** — a single chokepoint function per game, whitelist-serializing a brand-new object from allowed fields only (never blacklist-stripping a full state object), used identically for every outbound payload: initial join, live update, reconnect resync, and error paths

Shared-vs-not for the later Innovation milestone: the room/seat/connection/reconnect/redaction machinery and a thin `game-adapter` interface (`applyAction`, `toClientView`, `initialState`) are genuinely game-agnostic and should be built once. The rules engines themselves are explicitly NOT shared — Innovation's dogma effects are data-driven, card-text-defined, and fundamentally different in kind from Hanabi's small closed set of three action types; forcing both into one generic interface before Innovation is even researched would either cripple Hanabi's simplicity or guess wrong about Innovation's real needs. This premature-abstraction trap is called out explicitly as an anti-pattern to avoid.

### Critical Pitfalls

1. **Own-hand information leak via server payload** — the highest-severity failure mode, and silent (players may not notice their hand was visible). The fix is structural, not disciplinary: exactly one `toClientView`/`projectForSeat` function per game is the only code allowed to touch authoritative state before it goes over the wire, used for *every* outbound path including reconnect and error responses — the most likely real-world leak is a reconnect/rehydrate path built separately from the live-update path, since this project's reconnect requirement means that second path will exist and be tempting to shortcut. Enforce at the type level: hidden cards structurally lack `suit`/`rank` fields on the wire type rather than having them nulled out (a nulled field is a schema tell; an absent field is not). Write an automated leak test that string-searches the serialized payload for any seat's own true card values.

2. **Final-round end condition implemented wrong** — the most commonly mis-implemented Hanabi rule across every reference implementation surveyed. Model it as an explicit state machine (`normal` → `finalRound(turnsRemaining)` → `ended`) set when the deck empties, not scattered `deck.length === 0` checks. The drawer of the last card still gets a final turn (a common off-by-one drops this). No draws happen during final-round turns. Fuse-loss or all-stacks-complete during the final round ends the game immediately rather than waiting out the countdown. Write an automated simulation test driving the deck to empty for 2/3/4/5 players and asserting exact turn counts.

3. **Hardcoded suit count instead of parametrizing from variant config** — Rainbow and Black both make it 6 suits, not 5; a hardcoded win-condition or clue-touch check anywhere is a variant bug waiting to happen. All three configurations ship in v1, so this must be designed variant-parametrized from day one rather than retrofitted.

4. **Backend "free tier" that silently sleeps, pauses, or archives** — the trap that disqualified Supabase is not unique to Supabase: Upstash archives after 30 days of zero commands (requiring manual console restore), and Fly.io removed its standing free tier entirely in 2024. The disqualifying question for any candidate is not "does it have a free tier" but "after a 4-6 week idle gap, does the first real request succeed with no human first visiting a dashboard?" Cloudflare Durable Objects and Neon both pass this test cleanly (auto-resume, no manual step); Render passes with a ~1-minute cold-start penalty that is real but tolerable friction, not a disqualifier.

5. **Vercel Functions cannot hold the persistent per-room WebSocket state this game needs** — Vercel's native WebSocket beta pins a connection to one function instance with no guaranteed cross-instance broadcast and a duration ceiling that a 25-minute game will exceed; this is a structural mismatch, not a configuration problem, and reintroduces the exact fan-out problem Durable Objects solve natively without adding a solution.

## Implications for Roadmap

Based on combined research, the dependency graph runs: **transport/room plumbing → redaction contract → rules engine → UI**, because the two riskiest unknowns (does the realtime topology deliver correctly-filtered, reconnect-safe state; is per-seat filtering provably leak-free) are orthogonal to Hanabi's specific rules and should be retired cheaply, in isolation, before the largest remaining unit of work (the rules engine) is written on top of them.

### Phase 1: Room & Transport Skeleton (no game logic)
**Rationale:** Proves the highest-risk, hardest-to-reverse infrastructure bet (Cloudflare Durable Objects + partyserver + Vercel split) against real deployed infrastructure, not a local mock, before any game-specific code exists to obscure a mistake.
**Delivers:** A Durable-Object-backed room a browser can join via a link; seats assigned via reconnect-safe tokens; state survives a forced eviction/restart; multiple simultaneous connections work.
**Addresses:** Room creation → shareable link → join by display name → seat assignment (FEATURES.md table stakes)
**Avoids:** Pitfall 4 (Vercel execution/WebSocket limits) and Pitfall 3 (backend idle-pause traps) by construction — these are resolved by the choice of primitive, not by later mitigation code

### Phase 2: Per-Seat Redaction Contract (trivial fake "game")
**Rationale:** Proves the single most important correctness pattern in the entire project — whitelist-serialize per-seat projection, used identically for live updates, initial join, and reconnect — against a toy secret-holding state before there's real game complexity to hide a leak inside.
**Delivers:** `toClientView`/`projectForSeat` pattern end-to-end, plus the three-layer leak-test strategy (type-level: wire type structurally lacks hidden fields; string-search: serialized payload never contains a seat's own secret; wire-boundary integration test across real WebSocket connections).
**Addresses:** "Server never receives own-hand identity" (PROJECT.md constraint)
**Avoids:** Pitfall 1 (own-hand leak) — explicitly the highest-severity, most-likely-to-ship-silently pitfall in all four research documents

### Phase 3: Hanabi Rules Engine (pure, untransported)
**Rationale:** Burns down the actual game-rules risk (fuse/clue token economy, final-round trigger, variant-parametrized suit count) in a fast unit/property-test loop with zero networking involved, once the transport and redaction risks are already retired.
**Delivers:** `hanabi-engine` package — state shape, seeded deck construction, the three actions' validate+apply logic, real `toClientView`, and endgame detection as an explicit state machine (not scattered `deck.length===0` checks).
**Addresses:** Legal-action enforcement, clue-touch rules, per-card positive/negative clue state, end-condition detection (FEATURES.md table stakes)
**Avoids:** Pitfall 2 (final-round off-by-one), Pitfall 6 (trusting client-supplied touched-card sets or turn claims), and the hardcoded-suit-count trap — all three variants (base/Rainbow/Black) should be parametrized from this phase, not bolted on later

### Phase 4: Wire the Real Engine into the Room Actor
**Rationale:** With room/seat machinery and redaction pattern already separated by construction in Phases 1-2, this step should be small — mostly deleting the toy game and calling the real engine's functions through the `game-adapter` interface.
**Delivers:** A live, playable base-game Hanabi table with correct per-seat filtering and correct rules, end to end.
**Uses:** `partyserver`'s `game-adapter` interface built in Phase 1

### Phase 5: Reconnect & Session Durability Hardening
**Rationale:** The "looks done but isn't" pitfall most likely to be under-tested — refreshing a tab is easy to verify manually, but the actual expected usage pattern (mobile tab backgrounded 10+ minutes during a voice call, two tabs open to one seat) will not surface until explicitly exercised.
**Delivers:** Explicit acceptance criteria: game survives tab close/reopen, mobile backgrounding for 10+ minutes, and two simultaneous tabs to the same seat, all resolved via full-snapshot resync through the same Phase 2 projection function (not delta-replay, not a bolted-on separate "resume" feature).
**Avoids:** Pitfall 5 (realtime/reconnect edge cases) — mobile tab suspension during a 25-minute game is the expected case here, not a corner case, given the stated play context

### Phase 6: UI — Board Render, Colorblind-Safe Rendering, "Fireworks Night" Theme
**Rationale:** Built last, against a by-then-stable `ClientView` wire contract, so UI work doesn't need to be redone as the contract evolves. Colorblind-safe suit glyphs and the luminosity theme are grouped together because they compete for the same visual channel and must be designed jointly, not sequentially.
**Delivers:** Persistent (not flash) clue-touch highlighting; per-card positive/negative clue state visible on card faces; always-on colorblind-safe suit identifiers (not a toggle); dark "fireworks night" theme with luminosity-as-signal designed around lightness/brightness steps rather than saturation-of-a-hue; mobile/touch-usable layout (tap-to-select, not drag).
**Implements:** The View/Redaction Layer's output rendered as pure UI, per the Architecture doc's "client never computes, only renders" pattern

### Phase 7: Variant Support (Rainbow, Black)
**Rationale:** Deliberately last — variants are a multiplier on an already-correct core, not a parallel track. Building them after the base game is fully correct means the suit-count parametrization from Phase 3 gets its real test rather than being guessed at.
**Delivers:** Rainbow (6th suit touched by every color clue, distinct non-reused letter/icon) and Black (single copy per rank, unforgiving fuse math) as configuration passed into deck construction and clue-validation, per FEATURES.md's explicit variant-correctness checklist.

### (Later milestone) Phase 8: Innovation Engine
**Rationale:** Reuses Phases 1-2's room/seat/reconnect/redaction machinery entirely unchanged, via the same `game-adapter` interface — the actual payoff of having kept `room-server/` game-agnostic from the start. Explicitly not started until Hanabi has validated the foundation; do not generalize the rules-engine interface in anticipation of Innovation's needs before they're researched (Innovation's dogma effects are data-driven and different in kind from Hanabi's fixed three actions).

### Phase Ordering Rationale

- Transport and redaction come before rules because they are orthogonal, cheaper to isolate, and the failure mode of getting either wrong (a leak, or a broken free-tier assumption discovered late) is expensive to retrofit into an already-built rules engine and UI.
- The rules engine comes before UI because it's pure and fast to test in isolation, and UI built against an unstable wire contract is wasted work.
- Variants come after the base game is fully correct, per both STACK.md and PITFALLS.md's explicit recommendation — treating them as a "multiplier on a correct core" rather than a parallel track avoids the technical-debt pattern of bolting variant special-cases onto base-game logic that assumed 5 suits.
- Reconnect hardening is called out as its own phase (not folded into Phase 1's happy-path connection handling) because the manual-refresh test that's easy to run during normal development does not exercise the actual expected failure mode (multi-minute mobile backgrounding), and this is explicitly flagged across two research documents as the kind of thing that "looks done but isn't."

### Research Flags

Phases likely needing deeper research during planning (`/gsd:plan-phase --research-phase <N>`):
- **Phase 1 (Room & Transport Skeleton):** Cloudflare Durable Objects + `partyserver` API surface moves quickly (architecture research explicitly flagged MEDIUM confidence here, "verify against current docs at implementation time"); re-verify exact `partyserver` version and hibernation lifecycle hooks immediately before implementation.
- **Phase 6 (UI, colorblind + luminosity):** No existing implementation combines a luminosity-as-signal theme with colorblind-safe rendering (this is a genuine differentiator, not a documented pattern) — expect to need original design work rather than adapting an established reference.
- **Free-tier re-verification (cross-cutting, before infrastructure work begins):** Several free-tier claims were sourced at MEDIUM confidence (WebSearch-aggregated rather than directly fetched primary docs) — see Confidence Assessment below. Re-check immediately before Phase 1, not assumed frozen from this research date.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 2 (Redaction contract):** Whitelist-serialize vs. blacklist-strip is a well-established pattern across the multiplayer game server literature, independent of any specific vendor.
- **Phase 3 (Rules engine):** Hanabi's rules are fully and unambiguously documented by hanab.live's own rules.md and cross-checked against the H-Group community reference; the reducer/command pattern is standard for deterministic turn-based games.
- **Phase 5 (Reconnect):** Seat-token reconnect handshakes and snapshot-resync-on-reconnect are established patterns, not novel to this project.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Critical infra decision (Cloudflare Durable Objects Free plan limits, WebSocket Hibernation billing behavior) verified directly against Cloudflare's own docs on the research date; independently corroborated by ARCHITECTURE.md and PITFALLS.md without coordination. Some supporting free-tier figures (Ably, Pusher, Fly.io/Railway/Render 2026 status) are WebSearch-sourced/aggregator-corroborated rather than directly fetched from primary docs — MEDIUM on those specific line items, called out explicitly in STACK.md's own sources section. |
| Features | MEDIUM-HIGH | hanab.live behavior verified via its own GitHub docs (HIGH); BGA's specific gaps verified via a detailed community comparison document, not BGA's own docs, which notably contain zero UI/accessibility material (MEDIUM); some hanab.live internals (exact disconnect/idle-kick timers, exact mobile CSS behavior) could not be confirmed from public docs and are explicitly flagged LOW confidence in FEATURES.md. |
| Architecture | HIGH on patterns (room-as-actor, whitelist-serialize redaction, reducer pattern, seat-token reconnect are well-established and vendor-independent); MEDIUM on the exact current Cloudflare Durable Objects API surface, which the researcher explicitly flagged as moving quickly and recommended re-verifying at implementation time. |
| Pitfalls | HIGH on rules pitfalls (verified against Hanab Live and H-Group rules docs directly) and on free-tier idle-behavior claims (verified against each provider's official docs/changelogs, dated 2026); MEDIUM on realtime/leak pattern claims, which are synthesized from established multiplayer-game and WebSocket engineering practice rather than a single citable source, and MEDIUM on mobile tab-suspension timing specifics (community-reported GitHub issues, not a formal browser spec — exact timing varies by browser version). |

**Overall confidence:** HIGH on the infrastructure decision and rules correctness (the two most consequential, hardest-to-reverse areas); MEDIUM on several free-tier numeric specifics and on exact current library/API surfaces that are known to move quickly and were explicitly flagged by researchers as needing re-verification rather than being treated as frozen.

### Gaps to Address

- **Free-tier terms should be re-verified immediately before the infrastructure phase, not assumed frozen from this research date.** PITFALLS.md explicitly notes free-tier terms in this space have changed multiple times per year across every provider checked (Fly.io's entire free tier disappeared in Oct 2024; Upstash's free-tier limits changed cap models within the last two years). Re-check Cloudflare Durable Objects pricing/limits, Neon's scale-to-zero behavior, and Ably's connection/message limits against current docs before committing infrastructure code.
- **No disagreement was found between the four research documents on the core infrastructure decision** — this is a notable point of convergence rather than a gap, and should be read as a strong signal rather than smoothed over as "obviously correct" without noting that it emerged independently three times.
- **One tension worth naming explicitly:** STACK.md frames Next.js vs. a plain Vite SPA as "a legitimate judgment call... a competent team choosing Vite instead would not be wrong" (MEDIUM confidence on this specific call), while treating the Cloudflare/DO decision as settled at HIGH confidence. The roadmap should not treat the Next.js choice with the same certainty as the transport/backend choice — it's a reasonable default, not a load-bearing one.
- **Reconnect UX specifics (exact grace-period length before a seat is marked "gone" rather than merely "disconnected") were not resolved to a specific number by research** — ARCHITECTURE.md suggests "several minutes... long enough to survive a laptop sleep/wake or wifi blip" but does not commit to an exact figure; STACK.md similarly says "generous but finite." This is a reasonable open parameter to settle during Phase 5 planning rather than a blocking gap.
- **Exact mobile layout pattern (paged view vs. compact strip vs. some other approach for 4-5 hands on a small screen) was flagged as needing real design work, not a documented reference implementation to copy** — hanab.live's own team apparently judged this hard enough to build a separate companion site (hanab.cards), which is suggestive but not a design spec. Treat Phase 6's mobile layout as needing its own design pass, not an assumed responsive-CSS afterthought.
- **Turn history retention (needed cheaply now to avoid a future data-model migration if replay is ever added) is a one-line decision that should be made explicitly during Phase 3 planning** — PITFALLS.md and FEATURES.md both flag this as cheap insurance if decided now, and costly to retrofit if not.

## Sources

### Primary (HIGH confidence)
- `developers.cloudflare.com/durable-objects/platform/pricing` — Free plan Durable Object limits, fetched 2026-09-01
- `developers.cloudflare.com/durable-objects/best-practices/websockets` and `/durable-objects/examples/websocket-hibernation-server` — WebSocket Hibernation API behavior and cost model
- `developers.cloudflare.com/workers/configuration/routing/workers-dev/` — `*.workers.dev` availability on Free plan
- `github.com/Hanabi-Live/hanabi-live` (`docs/features.md`, `docs/rules.md`) — official rules and UI feature documentation, including final-round wording
- `github.com/hanabi/hanabi.github.io/blob/main/misc/rules.md` — H-Group community rules reference, cross-confirms final-round rule
- `meeplelikeus.co.uk` — Hanabi (2010) Accessibility Teardown, dedicated accessibility review, source for the structural colorblind problem and the D-grade verdict on the physical game
- `supabase.com/docs/guides/platform/free-project-pausing`, `neon.com/docs/introduction/scale-to-zero`, `render.com/docs/free`, `developers.cloudflare.com/durable-objects/platform/limits/` — provider idle-behavior documentation, verified 2026

### Secondary (MEDIUM confidence)
- `github.com/Zamiell/hanabi-conventions/blob/master/misc/BGA.md` — community-authored but detailed catalogue of Board Game Arena's UI gaps (missing negative-clue tracking, no notes, unpausable replay)
- Ably and Pusher pricing pages — WebSearch-verified 2026 figures, consistent across multiple aggregator sources but not directly fetched from primary docs in this research session
- Fly.io/Railway/Render 2026 free-tier status — WebSearch/community-sourced, consistent across independent posts
- `github.com/cloudflare/partykit` (`packages/partyserver`) — confirmed as the current library form of the PartyKit server API; exact current version number not pinned

### Tertiary (LOW confidence)
- Exact hanab.live disconnect/idle-kick timers and mobile CSS behavior — could not be confirmed from public docs, flagged directly in FEATURES.md
- Mobile browser WebSocket background-tab suspension timing (Safari ~5 min, Chrome 5-7 min) — sourced from community-reported GitHub issues, not a formal browser spec; exact timing varies by browser version and should not be treated as a precise SLA

---
*Research completed: 2026-09-01*
*Ready for roadmap: yes*
