# games.rogerflores.dev

## What This Is

A games subdomain on Roger Flores' personal domain hosting real-time multiplayer board games, playable by sharing a link — no accounts, no downloads. The first game, Hanabi (base game plus the box variants: Rainbow and Black), shipped in v1.0 and is live. The next game is Expedition, an original roguelite co-op trick-taking game in the spirit of The Crew (spec: `docs/superpowers/specs/2026-09-22-expedition-design.md`). Innovation was researched and then dropped.

It is built for the author and their friends: a small group who want to sit on a voice call and play a good co-op card game together without the setup friction of existing options.

## Current Milestone: v2.0 Expedition

**Goal:** Ship Expedition, an original roguelite co-op trick-taking game in the spirit of The Crew, as the site's second link-playable game. Make the room layer genuinely multi-game along the way.

**Source of truth:** `docs/superpowers/specs/2026-09-22-expedition-design.md` (owner-approved 2026-09-22).

**Target features:**
- Multi-game rooms: a room carries its game id, and each game brings its own config, seat limits, view schema and end result. Hanabi is unchanged.
- The Expedition rules: a standard 54-card deck with the Sun and Moon jokers as the only trumps, 3–5 players, objectives, the Whisper, and failure the moment an objective becomes impossible.
- A six-camp roguelite run: supplies, a failed camp is replayed, capacity equals the camp number, one gear drafted at the start and after each cleared camp, public loadouts, and boss camps.
- A hook-based rules engine with content catalogues (gear, objective kinds, boss twists, interactables), toolkit-only state changes, declarative targeting, and reveals with audiences for all private information.
- A pixel-art Phaser front end in the style of rogerflores.dev: a jungle expedition camp at night, seats around an oval stump table, a between-camps fireside scene with minimal text, clickable interactables, and swappable per-player card packs (Big Index default, Classic).
- An art pass (PixelLab plus verified CC0 packs) and a balance pass, both gated on owner review.

## Core Value

A friend clicks a link and is playing within seconds — and the game does not break, stall, or lose their seat for the rest of the session.

*(Reviewed at v1.0 close: unchanged in substance, generalised from "Hanabi" and "25 minutes" now that a second game with ~35–45 minute runs is next.)*

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Players join by opening the link and picking a display name — no account, no email — *Validated in Phase 1: Room & Transport Skeleton (live at games.rogerflores.dev)*
- ✓ Room and realtime layer are built game-agnostic so Innovation can be added without rewriting the foundation — *Validated in Phase 1: `GameAdapter` seam, counter game as the stand-in*
- ✓ Server sends each player a per-seat filtered view — a player never receives the identity of cards in their own hand — *Validated in Phase 2: whitelist-serialize projection proven against a toy secret-holding game, with a hidden card structurally lacking its value field, one enforced send chokepoint, and three automated leak-test layers*
- ✓ A correct, variant-parametrized Hanabi rules engine exists as a pure package — *Validated in Phase 3: deck/hand sizes, clue legality, token and fuse economy, the explicit final round and all three end conditions, deterministic seeded shuffles and public-only turn history, proven by unit tests plus conservation, redaction and termination property tests across base, Rainbow and Black. Not yet wired to the transport — that is Phase 4.*
- ✓ A live base-game Hanabi table is playable end to end — *Validated in Phase 4: the engine runs behind the game-adapter seam (only `game-registration.ts` names the game), actions appear on every screen without a refresh, a mid-game reload rejoins the same seat, and a double-sent action applies exactly once even across a forced worker eviction. The forehead-card toy is deleted. The board is a deliberately plain interim screen; Phase 6 replaces it.*
- ✓ A player who drops connection, sleeps their tab, or opens a second tab keeps their seat, and teammates see a clear disconnected indicator while the game pauses in place — *Validated in Phase 5: hibernation-safe heartbeat auto-response, server zombie sweep (including orphaned connected seats), client resume-on-visible/online, "Reconnecting…" banner, per-seat status and "Use this tab" reclaim, proven by socket-level and Playwright tests. The real-phone 10+ minute check is owner-waived until the UI is finalized.*
- ✓ The table is a designed dark "fireworks night" board — always-visible tableau, unmistakable active player, face-down own hand with accumulating clue memory, always-on suit glyphs, card luminosity as a hue-independent clue signal, visibly disabled illegal actions, and a designed end screen — *Validated in Phase 6: Game Interface, owner-approved as a first pass (verbatim sign-off in 06-HUMAN-UAT.md); follow-up polish scoped into Phase 6.1*

- ✓ Per-suit firework-burst art, player notes, drag reorder/play/discard with slot-preserving draws, and audio cues — *Validated in Phase 6.1*
- ✓ Board redesign: clue-coloured hint rings with a keep-hints toggle, number on the tile back, tile colour picker, wooden board, labelled Play/Discard areas with token art, shared rearrangeable discard order — *Validated in Phase 6.2 (owner sign-off)*
- ✓ Rainbow and the owner's house-rules Black variant (5 colours + Rainbow + reversed Black, 70 tiles, max 35) end to end, with no variant special-casing — *Validated in Phase 7 (owner-approved 2026-09-18)*
- ✓ All v1.0 Hanabi requirements (80/80) — *v1.0, audited 2026-09-22; see `.planning/milestones/v1.0-REQUIREMENTS.md`*
- ✓ A pure, framework-free Expedition rules engine exists (XRULE-01..08) — *Validated in Phase 9: Expedition Rules Core — 54/52/50-card deal with public removed cards, Sun/Moon joker follow-suit and trick winner, Sun/A♠ leader, clockwise objective picking, all four objective kinds with instant failure detection, no undo/auto-play; proven by fast-check whole-camp and failure-timing properties with an independent ordered-objective oracle. Not yet wired to the room layer (Phase 11); hook-robustness warnings WR-03/05/06 deferred to Phase 10.*
- ✓ The six-camp Expedition run on a layered hook/toolkit engine (COMM-01/02, RUN-01..07, GEAR-01..04, BOSS-01, ENG-01/02; engine side of GEAR-05/06) — *Validated in Phase 10: Run Layer, Gear Engine & Bosses — supplies, replay-on-fail resetting camp-scoped state, capacity, private 1-of-3 draft, public loadouts, the 10-item v1 gear catalogue, 4 provisional boss twists and the Whisper, with whole-run seeded determinism and registry-driven contract tests. Gap closure fixed a Compass crash on win-card objectives and a Trail Map hidden-objective leak under Thick Fog. GEAR-05/06 UI halves are Phase 11; WR-03 (reveal source after Trained Monkey) needs a product decision before Phase 11's per-seat view.*

### Active

<!-- Current scope. Building toward these. -->

Defined by the next milestone (Expedition) via `/gsd-new-milestone`. The v1.0 Active list shipped in full and moved to Validated above.

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Innovation — dropped by the owner on 2026-09-22 in favour of Expedition. The research in `.planning/research/innovation/` (rules, 3rd/4th edition card catalogue, layout, engine) stays as reference if it is ever revisited
- User accounts, sign-in, and persistent profiles — audience is a known friend group sharing a link; auth is pure friction with no payoff at this scale
- Public lobby, matchmaking, or game browser — nobody is looking for strangers to play with
- In-app chat — players are already on Discord or FaceTime; a chat surface adds scope, message volume, and moderation questions for zero gain. (Expedition's Whisper is a structured, server-verified game action, not chat.)
- Hanab Live's extended variant catalogue (Pink, White, Brown, Omni, Null, Prism, Up or Down, Throw It in a Hole, Color Blind, Duck, Clue Starved, etc.) — that is a rules engine as an entire project; box variants only
- Spectators, replays, and saved game history — not asked for; revisit only if the group wants it
- Native or installable mobile apps — the web link is the whole distribution model
- Ranked play, ELO, stats, or leaderboards — Hanabi is cooperative and this is a friend group

## Context

**Domain and deployment.** This is a new standalone repository with its own Vercel project; the `games.rogerflores.dev` subdomain points at it. It deploys independently of the main personal site and shares no code with it.

**Current state (v1.0 shipped, 2026-09-19; archived 2026-09-22).** Hanabi is live at games.rogerflores.dev. Stack: Next.js 16 on Vercel (`apps/web`), a Cloudflare Worker with one `partyserver` Durable Object per room (`apps/worker`), and shared zero-dependency packages (`packages/rules`, `packages/schema`). About 14k lines of TypeScript source and 21.5k lines of tests: 1029 unit/property tests and 72 Playwright specs. Gameplay never touches Vercel; only room creation and room-page renders do (~10–25 invocations per game night). v1.0's audit found no requirement or integration gaps; its tech debt is listed in STATE.md's Deferred Items and `.planning/milestones/v1.0-MILESTONE-AUDIT.md`. The room layer is game-agnostic behind `GameAdapter` but still wired to Hanabi in three places (a single `activeGame`, a Hanabi-only `Variant` schema, global 2–5 seat limits), which Expedition's first phase generalises.

**Greenfield origins.** The repository started empty on 2026-09-01; every framework and infrastructure choice was made by research against Vercel's free tier.

**Why Hanabi is architecturally unusual.** Hanabi is a hidden-information cooperative game in which players hold their cards facing *outward* — you can see everyone's hand but your own. This is not a UI detail. It means the server must be authoritative and must compute a distinct view per seat, and that no design which broadcasts a single shared state object to all clients can be correct. Any realtime approach must support per-recipient filtering. This constraint shapes the transport choice, the state model, and the security posture together.

**Rules surface for the chosen scope.** The base deck is 50 cards: 5 suits with three 1s, two each of 2/3/4, and a single 5. Rainbow adds a 6th suit whose cards are touched by clues of every color. Black adds a suit with a single copy of each rank, making it unforgiving. The end-game trigger — one final round after the deck empties — and the fuse/clue token economy are where rules engines most commonly get Hanabi wrong.

**The Supabase question.** Supabase was the obvious default and is attractive on latency, cost, and developer experience, but its free tier pauses a project after roughly a week of inactivity. For a site whose entire access model is "a friend clicks a link on a random Tuesday," a paused backend is an outright product failure, not a minor inconvenience. Research must find a backend that is reliably warm on a cold link click without a paid plan. Candidates worth comparing include Cloudflare Durable Objects, Neon, Upstash, and push services such as Ably or Pusher.

**Reframed priority.** The project began with an explicit goal of minimizing Vercel server actions against a 10M/month ceiling. At the actual expected scale — one table, a handful of games a week — that ceiling is roughly two orders of magnitude away from binding. The constraint that genuinely matters is availability and session durability. Invocation efficiency is retained as a design principle (it correctly favors push over polling) rather than as a budget the architecture must contort around.

**Play context.** Games are played by people already talking on a voice call. The app is the shared board, not the communication channel.

## Constraints

- **Hosting**: Must deploy on Vercel's free tier — personal project, no hosting budget
- **Cost**: Every dependency must have a workable free tier; no service is acceptable that requires a paid plan to stay reachable
- **Availability**: The backend must serve a cold link click after a week of total inactivity without manual intervention — this is what disqualified Supabase's free tier
- **Correctness**: Server-authoritative per-seat state filtering is mandatory; a client must never receive its own hand's card identities, because that leaks the game
- **Session durability**: A ~25-minute game must survive a refresh, a dropped connection, and a sleeping tab without ending
- **Scope**: Hanabi stays at its box variants — base, Rainbow, Black (shipped in v1.0)
- **Extensibility**: Room, seating, and realtime layers must be game-agnostic so new games (next: Expedition) plug in without a rewrite

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Standalone repo and Vercel project, not part of the main site | Independent deploys; the games app has different infrastructure needs than a personal site | ✓ Good — Vercel project `games-web` deploys independently |
| Hanabi first, Innovation as a later milestone | Prove the multiplayer foundation on one game before committing to a second, much heavier rules engine | ✓ Good — foundation proven by v1.0; the second game became Expedition, not Innovation (owner, 2026-09-22) |
| Link-based rooms with display names, no accounts | Known friend group; auth is friction with no payoff at this scale | ✓ Good — shipped in Phase 1 |
| Box variants only (base, Rainbow, Black) | Hanab Live's catalogue would make the rules engine the entire project | ✓ Good — shipped in v1.0; Black follows the owner's house rules |
| No in-app chat | Players are already on a voice call; chat adds scope and message volume for no gain | ✓ Good — never missed in play |
| Server-authoritative with per-seat filtered views | Forced by Hanabi's hidden-information design — you cannot see your own hand | ✓ Good — shipped in Phase 2: one projection chokepoint, strict fail-closed view schema, structural no-bypass test, three leak-test layers |
| Reconnect-and-resume required; ephemeral games rejected | Losing a 25-minute co-op game to a wifi blip is unacceptable | ✓ Good — shipped in Phase 5 (real-phone check deferred) |
| Supabase free tier rejected as primary backend | Projects pause after ~1 week idle; a paused backend breaks the core "click a link and play" promise | ✓ Good — Cloudflare Workers Free + Durable Objects live; no payment method, no pause notice (FDN-03) |
| Invocation efficiency as a principle, not a hard budget | At one-table scale the free tier ceiling is ~100x away from binding; availability is the real constraint | ✓ Good — ~10–25 Vercel invocations per game night |
| Dark "fireworks night" visual direction | Fits the theme, and card luminosity can carry genuine signal about clue state rather than being decoration | ✓ Good for the theme; ⚠️ the luminosity-as-signal idea was superseded by suit-coloured hint rings (06.2, gap 38) |
| Room and realtime layer built game-agnostic from the start | Innovation is a known future milestone; retrofitting a second game onto a Hanabi-shaped foundation would be costly | ⚠️ Revisit — the `GameAdapter` seam held, but three Hanabi-specific wirings remain (single `activeGame`, `Variant` schema, global seat limits); Expedition's first phase fixes them |
| RT-02 7-day idle cold-start check waived at Phase 1 close | DO hibernation + SQLite persistence and within-seconds production connects judged sufficient; re-run `docs/manual-checks/cold-start.md` if cold starts ever feel slow | ✓ Accepted (owner, 2026-09-15) |
| Player-authored per-card notes brought into v1 (reverses earlier exclusion) | Owner asked for them at Phase 6 sign-off; they sit alongside, not instead of, automatic clue tracking | ✓ Good — shipped in 6.1, always-visible note box in 6.2 |
| Hand order is player-controlled and server-authoritative; draws fill the vacated slot | Voice-call references like "your third card" must mean the same card on every screen | ✓ Good — shipped in 6.1 |
| Vercel installs only `apps/web`'s own dependencies | Workspace build tools must be declared in `apps/web`; production type-check excludes tests via `tsconfig.build.json` | ✓ Adopted in Phase 1 |
| Black variant uses the owner's house rules (5 colours + Rainbow + reversed Black, never clued by colour) | Owner decision 2026-09-18; direction is a per-suit property in `SUIT_RULES`, no `=== "black"` checks | ✓ Good — shipped in Phase 7 |
| Retained hints accumulate; the default mode shows only the latest clue | Owner report 2026-09-19: a new hint overwrote the prior one with keep-hints on. Gap 34's latest-only rule re-scoped to the default mode | ✓ Good — shipped 2026-09-22 |
| Innovation dropped; Expedition (original roguelite co-op trick-taker) is the next game | Owner decision 2026-09-22; design in `docs/superpowers/specs/2026-09-22-expedition-design.md` | — Pending (next milestone) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-27 after Phase 10 (Run Layer, Gear Engine & Bosses)*
