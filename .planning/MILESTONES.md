# Milestones

## v1.0 Hanabi (Shipped: 2026-09-19 · Archived: 2026-09-22)

**Delivered:** Online multiplayer Hanabi (base, Rainbow, and the owner's house-rules
Black) at games.rogerflores.dev, playable from a shared link with no accounts.

**Phases completed:** 9 phases (1–7, including inserted 6.1 and 6.2), 92 plans, 188 tasks
**Timeline:** 2026-09-01 → 2026-09-19
**Size at close:** ~14k lines of TypeScript source, ~21.5k lines of tests (1029 unit/property tests, 72 Playwright specs)

**Key accomplishments:**

1. **Always-warm free-tier backend.** One Cloudflare Durable Object per room (via
   `partyserver`, hibernation-enabled) behind a Next.js front end on Vercel. Gameplay
   never touches Vercel, and rooms clean themselves up after 24 hours idle.
2. **Hidden information made structural.** A single per-seat projection chokepoint and
   a strict, fail-closed wire schema mean a player's own card identities are never sent.
   This is proven by three leak-test layers, including fast-check properties.
3. **A pure, variant-parametrised Hanabi rules engine.** Deterministic seeded
   shuffles, the explicit final round and all three endings, token and fuse economy.
   Conservation, redaction and termination are proven by property tests. Black's
   reversed suit is a per-suit rule, never a special case.
4. **Seats survive real life.** Refresh, dropped wifi, sleeping tabs and duplicate tabs
   all resume the same seat, with heartbeat-driven reconnects, a disconnected
   indicator, "Use this tab" reclaim, and exactly-once action delivery across worker
   eviction.
5. **A designed table, iterated with the owner.** Per-suit firework art, player notes,
   drag reorder/play/discard with slot-preserving draws, audio cues, suit-coloured
   hint rings with a keep-hints toggle, a wooden board, and a shared rearrangeable
   discard. Every visual phase closed on the owner's own sign-off.

**Audit:** passed with tech debt: 80/80 requirements, no integration gaps, 6/6 flows
(`milestones/v1.0-MILESTONE-AUDIT.md`).

**Known deferred items at close:** 8 (see STATE.md Deferred Items). Among them: the
real-phone sleeping-tab check, a fresh cold-start check, the missing root
`tsconfig.json`, and the "Create room" hydration flake.

**Archives:** `milestones/v1.0-ROADMAP.md` · `milestones/v1.0-REQUIREMENTS.md` ·
`milestones/v1.0-phases/`

---
