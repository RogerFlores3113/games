# Phase 1: Room & Transport Skeleton - Context

**Gathered:** 2026-09-01
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the room, seating, and realtime transport layer — room creation with a shareable link, joining by display name, seat assignment and reclaim, a lobby, and a host-triggered game start — running on Cloudflare Durable Objects + `partyserver` behind a Next.js frontend on Vercel at games.rogerflores.dev.

**No Hanabi rules exist in this phase.** Game-agnosticism (FDN-01) is proven by routing a trivial placeholder game through the same game-adapter interface the real engine will later use. Per-seat redaction is Phase 2's job; the rules engine is Phase 3's.

</domain>

<decisions>
## Implementation Decisions

### Room link & lifecycle
- **D-01:** Room links are `games.rogerflores.dev/room/ABC123` — a 6-character nanoid over an uppercase-safe alphabet. Rationale: players are on a voice call together, so the code must be readable aloud, not just pasteable.
- **D-02:** Abandoned rooms are garbage collected by a Durable Object alarm on an **idle** timer, not a fixed TTL from creation. Two thresholds: roughly 12 hours idle for a room with a game in progress (survives a meal, a break, a long gap), roughly 1 hour idle for a lobby that never started. Exact values are the planner's call within that intent.
- **D-03:** Room creation is a single screen: display name field + variant picker (base / Rainbow / Black) + "Create room". The host lands directly in the lobby, already seated, with the link ready to copy. No intermediate share screen.
- **D-04:** RT-02 (cold link click after a week of inactivity) is verified by a **documented manual cold-start check** — deploy, wait, click a fresh link, confirm connection within seconds — not by an automated latency test. Real elapsed idle time cannot be faked in CI.

### Seat identity & host role
- **D-05:** Seat reclaim uses a server-minted seat token stored in `localStorage`, keyed by room ID, replayed by the client on every connect. A different browser or profile is treated as a different person — that is the intended semantics, not a limitation.
- **D-06:** When every seat is claimed, a new arrival is refused with a clear "this room is full" message. No waiting list, no observer state. (Consistent with the no-spectators decision in PROJECT.md.)
- **D-07:** The room creator is the host and holds the start control. If the host's seat stays disconnected past a short grace period **while in the lobby**, host auto-transfers to the next connected seat, so a host with bad wifi cannot strand the table.
- **D-08:** A second tab presenting a valid seat token rebinds the seat to the newest socket; the stale tab is told the room was opened elsewhere. Phase 1 only needs this to not corrupt seat state — RT-08 / multi-tab hardening is Phase 5's scope.

### Lobby behavior
- **D-09:** Duplicate display names are auto-suffixed on join ("Roger" → "Roger (2)"). Seats are identified internally by seat ID, so this is purely a display concern (satisfies ROOM-03).
- **D-10:** **There is no ready state.** The host starts the game whenever they choose, gated only by 2–5 seated players. Readiness is judged on the voice call, not in the app.
- **D-11:** Following D-10, ROOM-04 and Phase 1 success criteria #2 and #3 were **amended in `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md`** on 2026-09-01. ROOM-04 now reads as seat list + per-seat *connection status*. Do not build a ready toggle.
- **D-12:** Leaving the lobby (or closing the tab) frees the seat for someone else. Seat order is join order and is not rearrangeable — no seat-swapping UI.
- **D-13:** The host can change the variant in the lobby at any time up to game start; it locks at start (ROOM-05).

### In-progress arrival & placeholder game
- **D-14:** A visitor with no seat token arriving at an in-progress room gets a blocking message that names the room state ("this game is already in progress") — no board, no partial state, no auto-join-on-vacancy (ROOM-07). Mid-game seat reclaim for *new* people is explicitly not in Phase 1.
- **D-15:** The FDN-01 placeholder game is a **shared counter**: turn passes around the table and the active player clicks to increment a shared number. It exercises turn order, action submission, and broadcast with essentially no rules, and it makes Phase 2's swap to a secret-holding toy a small, visible diff.
- **D-16:** Phase 1 **establishes the dark "fireworks night" theme now** — palette and CSS variables (Tailwind v4 `@theme`) set up in this phase so the lobby and every later screen share one visual language. Phase 6 builds the game board on top of it rather than restyling. Phase 1 does not need finished visual design, but it should not ship light-mode defaults.
- **D-17:** Persisted Durable Object room state carries a schema version field. On version mismatch after a deploy, the room **resets to an empty lobby** rather than deserializing state it does not understand. No migration functions in v1 — a friend group can re-click a link; a corrupted mid-game state is worse.

### Claude's Discretion
- Exact idle-timeout values within D-02's stated intent.
- Monorepo layout, workspace tooling, and tsconfig project references (PROJECT.md/CLAUDE.md already fix the package split: `packages/rules`, `packages/schema`, `apps/web`, `apps/worker`).
- Wire message envelope shapes and Zod schema design.
- Length/format of the host-transfer and second-tab grace periods.
- All visual layout of the lobby beyond D-16's "dark theme established".
- How `games.rogerflores.dev` DNS and the Vercel project are wired (FDN-04) — flag any step that requires the user to act in a dashboard.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and constraints
- `.planning/PROJECT.md` — core value, constraints (free tier, cold-click availability, session durability, game-agnostic room layer), Key Decisions table, and the reasoning that rejected Supabase.
- `.planning/REQUIREMENTS.md` — ROOM-01…ROOM-08, RT-02, RT-07, FDN-01, FDN-03, FDN-04 are this phase's requirements. **ROOM-04 was amended on 2026-09-01** per D-11.
- `.planning/ROADMAP.md` § "Phase 1: Room & Transport Skeleton" — goal, dependencies, and success criteria. **Criteria #2 and #3 were amended on 2026-09-01** per D-11.

### Stack and architecture
- `CLAUDE.md` § "Technology Stack" — the load-bearing infrastructure decision (Cloudflare Durable Objects + `partyserver` + `partysocket`, Next.js App Router on Vercel), the "What NOT to Use" table, the shared-types strategy (`packages/rules`, `packages/schema`), and the reconnect/resume semantics this phase implements.

### Research caveat
- `.planning/ROADMAP.md` § Phase 1 "Research note" — `partyserver` / Durable Objects API surface and free-tier limits were flagged MEDIUM confidence and move quickly. **Re-verify library version, hibernation lifecycle hooks, alarm API, and Workers Free plan limits against current docs before planning.**

No separate ADRs or external specs exist yet — the architecture rationale lives in `CLAUDE.md` and `.planning/PROJECT.md`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
None. The repository is greenfield — it contains only `CLAUDE.md` and the `.planning/` directory. Every file in this phase is new.

### Established Patterns
No code patterns exist yet. **Phase 1 sets them**, and later phases will follow whatever it establishes: monorepo layout, the game-adapter interface shape (`applyAction` / `toPlayerView` / `checkGameEnd`), the Zod wire-schema conventions, and the dark theme tokens.

### Integration Points
- `games.rogerflores.dev` → Vercel project (FDN-04) — DNS and domain wiring is part of this phase.
- The Cloudflare Worker deploys separately to `*.workers.dev`; the Next.js client connects to it over WebSocket via `partysocket`.
- The game-adapter interface is the seam Phase 2 (redaction) and Phase 4 (real engine) plug into. Getting its shape right here is the whole point of D-15.

</code_context>

<specifics>
## Specific Ideas

- The room code must be **speakable** — the mental model is one person reading it out over Discord while everyone else types it, not just a pasted link.
- The "room is full" refusal and the "game in progress" refusal are the same shape of screen; they can share one component.
- Phase 1's placeholder game is meant to be **deleted**, and D-15 was chosen partly to make that deletion diff small and legible in Phase 2.

</specifics>

<deferred>
## Deferred Ideas

- **Mid-game seat reclaim for a new person** (someone drops out permanently and a new arrival takes the seat) — raised while deciding D-14, deliberately excluded from Phase 1. If it is ever wanted, it belongs with Phase 5's reconnect/durability work.
- **Multiple live sockets per seat** (both tabs stay functional) — considered in D-08; Phase 5 owns multi-tab hardening (RT-08).
- **Schema migration functions for persisted room state** — rejected for v1 in D-17 in favor of reset-on-mismatch. Revisit only if games ever need to survive deploys.
- **Seat rearrangement / deliberate turn-order control in the lobby** — considered in D-12 and cut; not currently wanted.

</deferred>

---

*Phase: 1-room-transport-skeleton*
*Context gathered: 2026-09-01*
