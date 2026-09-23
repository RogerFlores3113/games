---
phase: 4
slug: wire-engine-into-room-actor
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-16
updated: 2026-09-16
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (projects: schema, rules, worker, web) + Playwright 1.62.1 (e2e) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (web dev server on port 3100) |
| **Quick run command** | `npx vitest run --project <narrowest relevant project>` |
| **Full suite command** | `npm test` then `npx playwright test` |
| **Estimated runtime** | quick ~5-40s; full ~60s + e2e ~10s |

*No framework installs needed. `zod` and `nanoid` are already exact-pinned in both `apps/web` and `apps/worker`.*

**Note on `room-do.test.ts` scope:** the `worker` project includes `src/**/*.test.ts`, so `room-do.test.ts` (which spawns a real `wrangler dev`) runs in root `npm test` as well as under `npm run test:integration`. A break in that file is a break in the default suite — which is why every test the engine swap breaks is repaired inside plan `04-03`, the plan that breaks them, rather than deferred to a later wave.

**Note on Playwright:** `npm test` is `vitest run` only; e2e is a separate `npx playwright test` gate. `e2e/start-game.spec.ts` exercises the real stack and is therefore Hanabi-dependent, but no task between waves 3 and 6 runs Playwright — the first e2e gate after the swap is **04-07 T1**, which is also the task that repoints those specs. No e2e red window is exposed to any gate.

---

## Sampling Rate

- **After every task commit:** the narrowest relevant project (`schema` while editing the Hanabi view schema, `worker` while editing registration/room-state, `web` for the board)
- **After every plan wave:** `npm test` across all four projects — unfiltered, and expected green at every wave boundary
- **Before `/gsd:verify-work`:** `npm test` + `npx playwright test` green, and `tsc -b` clean (D-16)
- **Max feedback latency:** 60 seconds

**No wave ends red.** Plan `04-03` swaps the engine and repairs all three of its test casualties in the same plan: CR-03 and `seat-projection.test.ts` in Task 2, and the layer-3 frame-capture rebuild in Task 4. Its closing gate is an unfiltered `npm test`. Within `04-03` the layer-3 test is red between Task 2 and Task 4, which is intra-plan task ordering, not a wave-boundary state — Task 2's verify is name-filtered for that reason, and Task 4's is not. An executor should never have to classify a failure as "the expected one."

---

## Per-Task Verification Map

*Task IDs filled in by the planner. Executors run SEQUENTIALLY, so the wave column expresses dependency order, not concurrency.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01 T1 | 04-01 | 1 | RT-01 (D-05) | T-04-01/02/04 | Strict schema mirrors `HanabiView`; hidden card branch has no `suit`/`rank`; subpath resolves | unit + typecheck | `npx tsc -b && npx vitest run --project schema` | ❌ new | ⬜ pending |
| 04-01 T2 | 04-01 | 1 | RT-01 (D-05) | T-04-01/02/03 | Unknown keys rejected at every nesting level; `suit: undefined` on a hidden card rejected; subpath + barrel-purity extended to Hanabi | unit | `npx vitest run --project schema` | ❌ new | ⬜ pending |
| 04-02 T1 | 04-02 | 2 | RT-09 (D-07, D-10) | T-04-05/06/07 | Bounded `actionId` outside `request`; `ErrorDetail` closed 9-member enum | unit | `npx vitest run --project schema` | ❌ new | ⬜ pending |
| 04-02 T2 | 04-02 | 2 | RT-09 (D-06, D-08) | T-04-08/09 | `lastAppliedActionId` persisted-only, absent from `PublicSeatSchema`; version bumped to 3 | unit + typecheck | `npx tsc -b && npx vitest run --project schema` | ✅ extend | ⬜ pending |
| 04-02 T3 | 04-02 | 2 | RT-09 (D-06) | T-04-07/09 | Free-text detail rejected; a toy-tagged persisted room resets; all three existing `game_action` sends carry an `actionId` | unit | `npx tsc -b && npm test` | ✅ extend | ⬜ pending |
| 04-03 T1 | 04-03 | 3 | RT-01 (D-04) | T-04-10/13 | Swap confined to `game-registration.ts`; assignability assertions repointed | typecheck + structural | `npx tsc -b && npx vitest run --project worker source-structure` | ✅ modify | ⬜ pending |
| 04-03 T2 | 04-03 | 3 | RT-01 (D-02, D-07) | T-04-11/19/38 | Wire frames carry no own-hand identity, Hanabi shape; canary proves the checker fails; CR-03 repointed to a legal clue + `history.length`; `seat-projection.test.ts` own-hand keys asserted as `["facts","hidden","id"]` and its fail-closed fixtures repointed with a positive control against vacuity | property + unit + integration (filtered) | `npx vitest run --project worker redaction-wire room-state seat-projection && npx vitest run --project worker room-do -t "CR-03"` | ✅ repoint | ⬜ pending |
| 04-03 T3 | 04-03 | 3 | RT-01 (D-03) | T-04-12/14 | Chokepoint counts unchanged; `hanabiGame` confined non-vacuously; zero-occurrence check scoped to the identifier, not the word "forehead" | structural source test | `npx vitest run --project worker source-structure` | ✅ rewrite A9 | ⬜ pending |
| 04-03 T4 | 04-03 | 3 | RT-01 (D-02) | T-04-23/37 | Layer-3 live workerd frames leak-free on join, live update and reconnect; all four toy regions (import L33, type aliases, sends ~L573-588, secrets loop ~L620-660) rebuilt against `HanabiSeatSecrets`; plan closes on an unfiltered green suite | integration + full suite | `npm run test:integration --workspace apps/worker && npx tsc -b && npm test` | ✅ rebuild | ⬜ pending |
| 04-04 T1 | 04-04 | 4 | RT-09 (D-10) | T-04-18 | All 8 `AdapterError` members map 1:1 to closed `ErrorDetail`; no free text | unit + typecheck | `npx tsc -b && npx vitest run --project worker room-state` | ✅ extend | ⬜ pending |
| 04-04 T2 | 04-04 | 4 | RT-09 (D-08, D-09) | T-04-15/17/20 | Dedup runs before `adapter.applyAction` for every action type; DO stays thin | structural + typecheck | `npx tsc -b && npx vitest run --project worker source-structure` | ✅ modify | ⬜ pending |
| 04-04 T3 | 04-04 | 4 | RT-09 (D-08, D-09) | T-04-15/16/18 | Duplicate clue not re-applied; key is per-seat; survives schema round-trip | unit | `npx vitest run --project worker room-state` | ✅ extend | ⬜ pending |
| 04-05 T1 | 04-05 | 5 | RT-09 (D-15) | T-04-21/24 | Double-sent clue applies once: tokens, history, turn, deck all unchanged | integration, raw `ws` | `npm run test:integration --workspace apps/worker` | ❌ new case | ⬜ pending |
| 04-05 T2 | 04-05 | 5 | RT-09 (D-08) | T-04-22 | Dedup survives a forced `wrangler dev` kill/respawn (real eviction) | integration | `npm run test:integration --workspace apps/worker && npm test` | ❌ new case | ⬜ pending |
| 04-06 T1 | 04-06 | 6 | RT-01 (D-12, D-13) | T-04-27 | Only the four unambiguous disabling cases; band comes from the engine | unit | `npx vitest run --project web hanabi-board-logic` | ❌ new | ⬜ pending |
| 04-06 T2 | 04-06 | 6 | RT-01 (D-11) | T-04-25/26/29 | Own-hand tiles render facts and position only; hand size from the array | typecheck + unit | `npx tsc -b && npx vitest run --project web` | ❌ new | ⬜ pending |
| 04-06 T3 | 04-06 | 6 | RT-01 (D-07) | T-04-28 | Board mounted at the in-progress branch; `actionId` minted per intent | typecheck + full suite | `npx tsc -b && npm test` | ✅ modify | ⬜ pending |
| 04-07 T1 | 04-07 | 7 | RT-01 (D-14) | T-04-30 | Existing specs drive Hanabi; own-hand shows no suit/rank in the DOM | e2e | `npx playwright test e2e/start-game.spec.ts e2e/in-progress-arrival.spec.ts` | ✅ repoint | ⬜ pending |
| 04-07 T2 | 04-07 | 7 | RT-01 (D-14) | T-04-32 | Action appears on the other screen with no reload | e2e, two contexts | `npx playwright test e2e/hanabi-realtime.spec.ts` | ❌ new | ⬜ pending |
| 04-07 T3 | 04-07 | 7 | RT-03 (D-14) | T-04-31 | Mid-game reload returns the same seat, hand size, tokens, and turn | e2e, `page.reload()` | `npx playwright test e2e/hanabi-realtime.spec.ts` | ❌ new | ⬜ pending |
| 04-08 T1 | 04-08 | 8 | RT-01 (D-01) | T-04-33 | Toy deleted with no dangling reference anywhere | typecheck + full suite | `npx tsc -b && npm test` | ✅ delete | ⬜ pending |
| 04-08 T2 | 04-08 | 8 | RT-01 (D-03) | T-04-34 | Toy identifier and files provably absent | structural source test | `npx vitest run --project worker source-structure` | ✅ extend | ⬜ pending |
| 04-08 T3 | 04-08 | 8 | RT-01, RT-03, RT-09 (D-16) | T-04-35/36 | Full gate green; a real two-player game played; clean WebSocket frame | gate + human | `npx tsc -b && npm test && npx playwright test` | ✅ gate | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All previously-open Wave 0 gaps are now assigned to a specific plan and task:

- [x] `packages/schema/src/games/hanabi.ts` + test — strict Hanabi view schema and subpath wiring (D-05) → **04-01 T1/T2**
- [x] `apps/worker/src/room-do.test.ts` — RT-09 double-sent-clue case in the existing `wrangler dev` harness → **04-05 T1** (plus the eviction variant, **04-05 T2**)
- [x] `apps/worker/src/redaction-wire.test.ts` — repointed to `checkHanabiViewForLeaks` / `secretsForHanabiSeat` (D-02) → **04-03 T2**
- [x] `apps/worker/src/room-do.test.ts` CR-03 test — toy `guess` send and `revealed.length` predicate repointed to a legal Hanabi clue and `history.length`, in the same change as the swap that breaks it (D-02) → **04-03 T2**
- [x] `apps/worker/src/seat-projection.test.ts` — the `Object.keys(game.yourCard)` assertion (throws post-swap) repointed to per-entry `yourHand` key assertions, and the fail-closed leak fixtures repointed to Hanabi with a positive control (D-02, D-07/HIDE-03) → **04-03 T2**
- [x] `apps/worker/src/room-do.test.ts` frame-capture assertions — rebuilt against the Hanabi view shape, including the toy import at L33, the sends at ~L573-588 and the `revealed`-based secrets construction at ~L620-660 (D-02) → **04-03 T4**
- [x] `apps/worker/src/source-structure.test.ts` — A9 rewritten to confine `hanabiGame` non-vacuously (D-03) → **04-03 T3**, hardened in **04-08 T2**
- [x] Playwright mid-game reload coverage for RT-03 — `in-progress-arrival.spec.ts` covers only pre-game arrival, so this is new coverage in a new spec → **04-07 T3**

*Framework installs: none.*

### Toy-debt sweep (closed)

An exhaustive sweep for toy-shaped identifiers (`yourCard`, `otherCards`, `revealed`, `FOREHEAD*`, `foreheadCard*`, `ForeheadCard*`, `forehead-card`, `checkSeatViewForLeaks`, `secretsForSeat`) across all non-deleted `.ts`/`.tsx`/`.json` was run at plan time. Every hit is accounted for; recorded here so later reviews do not re-litigate it.

| File | Disposition |
|------|-------------|
| `apps/worker/src/game-registration.ts` | swapped — **04-03 T1** |
| `apps/worker/src/redaction-wire.test.ts`, `room-state.test.ts`, `seat-projection.test.ts` | repointed — **04-03 T2** |
| `apps/worker/src/room-do.test.ts` | CR-03 **04-03 T2**; layer-3 **04-03 T4** |
| `apps/worker/src/source-structure.test.ts` | **04-03 T3**, hardened **04-08 T2** |
| `apps/web/app/room/[code]/RoomClient.tsx` | `actionId` **04-02 T3**; mount swap **04-06 T3** |
| `apps/web/components/ForeheadCardGame.tsx` | read-only template for `HanabiBoard.tsx` (**04-06 T2**); deleted in **04-08 T1** |
| `e2e/start-game.spec.ts` | repointed — **04-07 T1** (no Playwright gate runs before it) |
| `packages/schema/src/games/subpath.test.ts` | Hanabi assertions added **04-01 T2**; forehead assertions dropped **04-08 T1**. Barrel-purity test is kept and repointed, never deleted |
| `packages/rules/src/index.ts`, `packages/rules/src/adapter.test.ts` | **04-08 T1** |
| `packages/rules/src/hanabi/*.ts` (state, projection, actions, legality, deck, adapter, hanabi-leak-check, both property tests), `packages/schema/src/constants.ts` | **BENIGN — comment prose only**, citing `forehead-card.ts` as the template each was modelled on. Deliberately retained (04-08 interfaces block). This is why D-03's zero-occurrence check targets the identifier `foreheadCardGame`, never the word "forehead" |
| `packages/rules/src/hanabi/projection.test.ts` | **BENIGN — false positive.** The 3 `otherCards` hits are a local counter variable `otherCardsChecked` iterating `view.otherHands`; no toy reference exists |

---

## Sampling Continuity

No three consecutive tasks lack an automated verify: every task in all eight plans carries an `<automated>` command. The only human gate is the phase-closing checkpoint (**04-08 T3**), which runs the full automated gate first and pauses only afterwards.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Result |
|----------|-------------|------------|-------------------|--------|
| A real two-player base game, plus raw WebSocket frame inspection | RT-01, RT-03, HIDE-01 | The automated layers prove redaction structurally; a human looking at an actual DevTools frame and playing a real game is the independent confirmation Phase 2 established as the closing ritual | See **04-08 T3**'s `<how-to-verify>` — 10 numbered steps | Approved by user on 2026-09-16, verbatim reply: "confirmed" |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] Every test the engine swap breaks has a named owning task, in the same plan as the swap (CR-03 → 04-03 T2; `seat-projection.test.ts` → 04-03 T2; layer-3 → 04-03 T4)
- [x] Exhaustive toy-debt sweep run and every hit dispositioned (see table above); benign prose-only hits explicitly excluded from zero-occurrence checks
- [x] Every wave boundary ends on an unfiltered green `npm test` — no documented red windows
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-filled 2026-09-16

## Human Sign-Off — 04-08 Task 3 (Phase Gate)

The automated D-16 gate (`npx tsc -b`, `npm test`, `npx playwright test`) was reported green by the executor before the checkpoint was raised. The user then ran the 10-step manual verification in `04-08-PLAN.md` Task 3 (`<how-to-verify>`) across two browser sessions and replied to the checkpoint with the single word **"confirmed"**, with no caveats and no further detail supplied.

- **Approved by:** user (rflores3113@gmail.com)
- **Date:** 2026-09-16
- **Verbatim response:** "confirmed"
- **Scope of approval:** all items in the Task 3 `<acceptance_criteria>` list — two-player base game playable end to end, live action propagation without refresh (RT-01), mid-game reload returning the same seat (RT-03), and own-hand entries in a raw WebSocket frame carrying no `suit`/`rank` keys.

No specific frame contents, card identities, or screenshots were described by the user and none are recorded here beyond what the user stated.
