# games.rogerflores.dev

## What This Is

A games subdomain on Roger Flores' personal domain hosting real-time multiplayer board games, playable by sharing a link — no accounts, no downloads. The first game is Hanabi (base game plus the box variants: Rainbow and Black); Innovation follows in a later milestone.

It is built for the author and their friends: a small group who want to sit on a voice call and play a good co-op card game together without the setup friction of existing options.

## Core Value

A friend clicks a link and is playing Hanabi within seconds — and the game does not break, stall, or lose their seat for the next 25 minutes.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Players join by opening the link and picking a display name — no account, no email — *Validated in Phase 1: Room & Transport Skeleton (live at games.rogerflores.dev)*
- ✓ Room and realtime layer are built game-agnostic so Innovation can be added without rewriting the foundation — *Validated in Phase 1: `GameAdapter` seam, counter game as the stand-in*
- ✓ Server sends each player a per-seat filtered view — a player never receives the identity of cards in their own hand — *Validated in Phase 2: whitelist-serialize projection proven against a toy secret-holding game, with a hidden card structurally lacking its value field, one enforced send chokepoint, and three automated leak-test layers*
- ✓ A correct, variant-parametrized Hanabi rules engine exists as a pure package — *Validated in Phase 3: deck/hand sizes, clue legality, token and fuse economy, the explicit final round and all three end conditions, deterministic seeded shuffles and public-only turn history, proven by unit tests plus conservation, redaction and termination property tests across base, Rainbow and Black. Not yet wired to the transport — that is Phase 4.*
- ✓ A live base-game Hanabi table is playable end to end — *Validated in Phase 4: the engine runs behind the game-adapter seam (only `game-registration.ts` names the game), actions appear on every screen without a refresh, a mid-game reload rejoins the same seat, and a double-sent action applies exactly once even across a forced worker eviction. The forehead-card toy is deleted. The board is a deliberately plain interim screen; Phase 6 replaces it.*
- ✓ A player who drops connection, sleeps their tab, or opens a second tab keeps their seat, and teammates see a clear disconnected indicator while the game pauses in place — *Validated in Phase 5: hibernation-safe heartbeat auto-response, server zombie sweep (including orphaned connected seats), client resume-on-visible/online, "Reconnecting…" banner, per-seat status and "Use this tab" reclaim, proven by socket-level and Playwright tests. The real-phone 10+ minute check is owner-waived until the UI is finalized.*

### Active

<!-- Current scope. Building toward these. -->

- [ ] Host can create a Hanabi room and get a shareable link
- [ ] Room supports 2–5 players, matching Hanabi's player count rules
- [ ] Host can configure variant at room creation: base, Rainbow (6th suit touched by every color clue), or Black (one copy of each rank)
- [ ] Server is authoritative over game state and sends each player a per-seat filtered view — a player never receives the identity of cards in their own hand
- [ ] Player can take the three Hanabi actions on their turn: give a clue, play a card, discard a card
- [ ] Clue giving enforces the real rules: costs a clue token, must touch at least one card, must name a color or a rank, and highlights every matching card in the target's hand
- [ ] Game tracks and displays the 8 clue tokens, 3 fuse tokens, deck count, discard pile, and the played firework stacks
- [ ] Game correctly detects all three endings: three fuses lost, all five stacks complete, and the final round after the deck empties
- [ ] Final score is calculated and shown at game end
- [ ] Players see each other's moves in near real time without manual refresh
- [ ] Interface uses a dark "fireworks night" visual direction where card luminosity carries real signal about what has been clued

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Innovation — deliberately deferred to a later milestone; proving the multiplayer foundation on one game first is cheaper than building two rule engines against an unvalidated architecture
- User accounts, sign-in, and persistent profiles — audience is a known friend group sharing a link; auth is pure friction with no payoff at this scale
- Public lobby, matchmaking, or game browser — nobody is looking for strangers to play with
- In-app chat — players are already on Discord or FaceTime; a chat surface adds scope, message volume, and moderation questions for zero gain
- Hanab Live's extended variant catalogue (Pink, White, Brown, Omni, Null, Prism, Up or Down, Throw It in a Hole, Color Blind, Duck, Clue Starved, etc.) — that is a rules engine as an entire project; box variants only
- Spectators, replays, and saved game history — not asked for; revisit only if the group wants it
- Native or installable mobile apps — the web link is the whole distribution model
- Ranked play, ELO, stats, or leaderboards — Hanabi is cooperative and this is a friend group

## Context

**Domain and deployment.** This is a new standalone repository with its own Vercel project; the `games.rogerflores.dev` subdomain points at it. It deploys independently of the main personal site and shares no code with it.

**Greenfield.** The working directory is empty. No framework, library, or infrastructure decision has been made yet — everything is open to research, subject to deploying on Vercel's free tier.

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
- **Scope**: Hanabi box variants only for v1 — base, Rainbow, Black
- **Extensibility**: Room, seating, and realtime layers must be game-agnostic so Innovation can be added later without a rewrite

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Standalone repo and Vercel project, not part of the main site | Independent deploys; the games app has different infrastructure needs than a personal site | ✓ Good — Vercel project `games-web` deploys independently |
| Hanabi first, Innovation as a later milestone | Prove the multiplayer foundation on one game before committing to a second, much heavier rules engine | — Pending |
| Link-based rooms with display names, no accounts | Known friend group; auth is friction with no payoff at this scale | ✓ Good — shipped in Phase 1 |
| Box variants only (base, Rainbow, Black) | Hanab Live's catalogue would make the rules engine the entire project | — Pending |
| No in-app chat | Players are already on a voice call; chat adds scope and message volume for no gain | — Pending |
| Server-authoritative with per-seat filtered views | Forced by Hanabi's hidden-information design — you cannot see your own hand | ✓ Good — shipped in Phase 2: one projection chokepoint, strict fail-closed view schema, structural no-bypass test, three leak-test layers |
| Reconnect-and-resume required; ephemeral games rejected | Losing a 25-minute co-op game to a wifi blip is unacceptable | ✓ Good — shipped in Phase 5 (real-phone check deferred) |
| Supabase free tier rejected as primary backend | Projects pause after ~1 week idle; a paused backend breaks the core "click a link and play" promise | ✓ Good — Cloudflare Workers Free + Durable Objects live; no payment method, no pause notice (FDN-03) |
| Invocation efficiency as a principle, not a hard budget | At one-table scale the free tier ceiling is ~100x away from binding; availability is the real constraint | — Pending |
| Dark "fireworks night" visual direction | Fits the theme, and card luminosity can carry genuine signal about clue state rather than being decoration | — Pending |
| Room and realtime layer built game-agnostic from the start | Innovation is a known future milestone; retrofitting a second game onto a Hanabi-shaped foundation would be costly | ✓ Good — `GameAdapter` seam held through Phase 1 |
| RT-02 7-day idle cold-start check waived at Phase 1 close | DO hibernation + SQLite persistence and within-seconds production connects judged sufficient; re-run `docs/manual-checks/cold-start.md` if cold starts ever feel slow | ✓ Accepted (owner, 2026-09-15) |
| Vercel installs only `apps/web`'s own dependencies | Workspace build tools must be declared in `apps/web`; production type-check excludes tests via `tsconfig.build.json` | ✓ Adopted in Phase 1 |

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
*Last updated: 2026-09-17 after Phase 5 (Reconnect & Session Durability Hardening)*
