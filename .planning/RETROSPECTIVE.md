# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Hanabi

**Shipped:** 2026-09-19 (archived 2026-09-22)
**Phases:** 9 (7 planned + 2 inserted) | **Plans:** 92 | **Sessions:** not tracked

### What Was Built
- An always-warm, free-tier realtime backend: one Cloudflare Durable Object per room behind a Next.js front end on Vercel.
- Structural hidden-information safety: one per-seat projection chokepoint, a fail-closed wire schema, and three leak-test layers.
- A pure, property-tested, variant-parametrised Hanabi engine (base, Rainbow, house-rules Black).
- Reconnect and session durability that survives refresh, dropped wifi, sleeping tabs and duplicate tabs.
- A designed table, taken through seven rounds of owner visual review.

### What Worked
- **Horizontal layers, riskiest first.** Transport and redaction were proven on a toy game before any Hanabi rules existed. Neither had to be retrofitted later.
- **Structural invariants over conventions.** Single call sites for send, view projection, game registration and alarms were enforced by source-scan tests. The v1.0 integration check found zero wiring gaps.
- **Property tests for the rules engine.** Conservation, redaction and termination properties caught edge cases that hand-written examples missed. For example, a blind spot in the leak checker was fixed before Phase 3 closed.
- **Pure logic modules beside the UI.** Most of the web layer's behaviour lives in `apps/web/lib/*-logic.ts` with unit tests, so visual churn rarely broke logic.

### What Was Inefficient
- **Green tests, rejected visuals.** The full gate passed while the owner rejected the board seven times (tiny, reflowing geometry, yellow highlights, an opaque tint). Two whole phases (6.1 and 6.2) were inserted after owner reviews.
- **Stale dev servers poisoning e2e.** Playwright's `reuseExistingServer` adopted leftover servers started without the E2E timing variables. That produced false reconnect failures five or more times before a kill-by-PID routine became standard.
- **Stale e2e locators after UI removals.** Deleting or renaming a component left dead test ids that a later plan tripped over, three or more times.
- **Unlicensed or unsuitable images.** Owner-supplied stock previews carried watermarks, and a "no people" photo still showed a person at its edge. Each needed a replacement cycle.
- **Paperwork drift.** Two phases closed on owner UAT without a VERIFICATION.md, and several status fields went stale. The milestone audit had to reconstruct them.

### Patterns Established
- Record the owner's words verbatim in HUMAN-UAT files, number each gap, and fix the real cause rather than applying offsets or retries.
- Screenshot and check visuals before reporting done. The owner's review is the real gate for anything visual.
- Source images only from Wikimedia Commons or other verified licences, show the credit on screen, and look at every image before shipping it.
- Update every consumer (e2e specs, `lib/*.test.ts`) in the same commit that changes a behaviour.
- Before any Playwright run, kill the full process trees on 3100/8787 by PID.
- Deploy the worker first whenever the wire schema changes, since both sides use strict zod validation.

### Key Lessons
1. For anything visual, plan the owner review loop in from the start. Mockups and screenshots before building save whole inserted phases.
2. A "game-agnostic" seam is only proven by a second game. v1.0's `GameAdapter` held, but a single `activeGame`, a Hanabi-only `Variant` schema and global seat limits slipped in. Build the multi-game room layer first next time.
3. Close each phase with its verification artifact, even when the owner's sign-off is the real gate, so milestone audits don't have to reconstruct evidence.

### Cost Observations
- Model mix: not tracked for v1.0.
- Sessions: not tracked for v1.0.
- Notable: ~10–25 Vercel invocations per game night. Gameplay runs entirely on the Cloudflare Workers Free plan.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | not tracked | 9 | Horizontal layers proven on a toy game first; owner visual review became the gate for UI |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 1029 unit/property + 72 e2e | not measured | `packages/rules`, `packages/schema` (zero runtime deps) |

### Top Lessons (Verified Across Milestones)

1. *(Needs a second milestone to cross-validate.)*
