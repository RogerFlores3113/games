---
phase: 10-run-layer-gear-engine-bosses
verified: 2026-09-27T09:30:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Each v1 gear item works exactly as specced (GEAR-02) — Compass (reroll) no longer crashes on win-card objectives (CR-01 closed by 10-18)"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "A reveal's fromSeatId should reflect the true current holder of the revealed card after Trained Monkey moves it (COMM-02 edge case, WR-03)"
    addressed_in: "Phase 11"
    evidence: "ROADMAP.md Phase 11 depends on Phase 10's reveals for the per-seat leak-check view ('reveals to leak-check'); 10-18-SUMMARY.md and 10-19-SUMMARY.md both explicitly defer WR-03 pending a product decision 'before Phase 11 builds the per-seat view' — this is a documented, tracked deferral, not a silent gap, and no v1 gear/boss combination currently produces an observably wrong reveal (Trained Monkey's swap and Whisper's reveal are not both exercised against the same card in any shipped scenario that would make this user-visible today)."
  - truth: "The conservation/no-leak auto-check (ENG-02) should also validate hand-size invariants for the latent move-card toolkit op (WR-04)"
    addressed_in: "Not phase-blocking — tracked as future work"
    evidence: "No registered v1 gear or boss twist emits move-card (confirmed by grep across gear/ and boss/ registries); the op is unreachable dead code from the player's perspective, so it cannot falsify ENG-02's 'every registered entry is checked automatically' success criterion, which only requires checking entries that exist. 10-18-SUMMARY.md/10-19-SUMMARY.md track it as 'close before any content uses that op.'"
human_verification: []
---

# Phase 10: Run Layer, Gear Engine & Bosses Verification Report

**Phase Goal:** The full six-camp run — supplies, replay-on-failure, capacity, draft, loadout — built on the layered hook/toolkit engine (base → boss twist → gear), with the v1 gear catalogue, the provisional boss twists, and the Whisper communication mechanic all working end to end.

**Verified:** 2026-09-27T09:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plans 10-18, 10-19)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Whisper: one card, one teammate, once per camp, only after objectives picked and only between tricks; public who-to-whom, private card, persists to camp/replay end (SC1, COMM-01, COMM-02) | VERIFIED (regression, unchanged since prior pass) | `run/whisper.ts`, `run/whisper.test.ts`, `run/replay-reset.test.ts` unchanged by 10-18/10-19; full suite green. |
| 2 | Fail-then-replay resets every camp-scoped resource while owned/equipped gear persists (SC2, RUN-06) | VERIFIED (regression, unchanged) | `run/replay-reset.test.ts` still passes; `AttemptState`/`SeatRun` split untouched by gap-closure diff. |
| 3 | A full run replays deterministically from seed + action log; every draw comes from the carried seeded RNG (SC3, RUN-07) | VERIFIED (regression, strengthened) | `run.property.test.ts` still passes and now additionally drives objective-pick-window gear (Compass) through the widened `enumerateLegalRunActions`, so the property test's coverage of RUN-07 is broader than at the prior verification, not narrower. |
| 4 | Draft/equip/capacity/loadout mechanics; every v1 gear item and boss twist works exactly as specced; targeted gear/Whispers final-once-resolved; visible reason when unusable (SC4, RUN-01..05, GEAR-01..06, BOSS-01) | **VERIFIED (gap closed)** | Independently reproduced the original CR-01 repro scenario in a throwaway vitest probe (`setupRun` camp 2, all win-card, `reroll` equipped, `advanceTo("objective-pick")`, `applyRunAction` use-gear reroll on a legal win-card target): the action no longer throws, returns `ok: true`, the objective keeps `id`/`kind: "win-card"`/`ownerSeatId: null`, its `target` becomes the pre-use deck's top card, and the deck shrinks by exactly one. Probe deleted after running (not committed, not left in repo — confirmed via `git status`). Code fix independently read at `toolkit.ts:289`: guard now reads `objective.kind !== "ordered" && objective.kind !== "win-card"`, matching `reroll.ts`'s `canTarget` and `camp.ts`'s `isCardBearingSlot`. `gear.contract.test.ts` independently confirmed to contain `findUsableFixtures` (every accepted target combination, not just the first — closes WR-01). |
| 5 | Adding a new gear item, objective kind, boss twist or interactable is a one-file-plus-registry-line change; every registered entry auto-checked (SC5, ENG-01, ENG-02) | VERIFIED (regression, unchanged) | `README.md` and contract-test-over-registry pattern unchanged by 10-18/10-19; `gear.contract.test.ts`'s hardening (every accepted combination applied, not just the first) makes this auto-check strictly more thorough than at the prior verification. |

**Score:** 5/5 truths verified.

### Independent CR-01 Reproduction (Re-verification)

A throwaway probe test (`packages/rules/src/expedition/run/verify-cr01-probe.test.ts`) was written independently of the existing test suite, using only public test-support helpers (`setupRun`, `advanceTo`, `applyRunAction`, `CATALOG`), reproducing the exact scenario from the original CR-01 finding:

```
setupRun({ seatIds: [s1,s2,s3], seed: "cr01-independent-verify-seed",
  catalog: CATALOG, campNumber: 2, loadouts: { s1: ["reroll"] } })
advanceTo(run, "objective-pick", CATALOG)
applyRunAction(run, "s1", { type: "use-gear", gearId: "reroll",
  targets: [<a face-up win-card objective id>] }, CATALOG)
```

Result: no throw; `result.ok === true`; objective id/kind/owner preserved; target replaced by the prior deck-top card; deck shrunk by one. This matches 10-18-SUMMARY.md's claim and the `toolkit.ts` code change exactly. The probe file was run once and then deleted (`rm`); `git status` confirms it is not present in the working tree.

### Full Regression Check

| Check | Command | Result |
|---|---|---|
| Full unit/integration suite | `npm test` | **115 files, 1666 tests, all passed** |
| Typecheck | `npm run typecheck` (`tsc -b`) | **exits 0, no errors** |
| WR-02 regression (independently spot-checked) | `grep -c "WR-02" objective-gear.test.ts` → 5; `grep -n "face-down" reassign.ts` → present at guard `ctx.rules.objectiveAssignment(ctx.run) === "face-down"` (line 42) | present and wired |

No regressions found relative to the prior (gaps_found) verification. All previously-passed truths (1, 2, 3, 5) remain green under the full suite; the previously-failed truth (4) now passes.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/rules/src/expedition/run/toolkit.ts` (`replace-objective` op) | Accepts win-card and ordered objectives | VERIFIED | Line 289: `objective.kind !== "ordered" && objective.kind !== "win-card"` — independently read, matches CR-01 fix description. |
| `packages/rules/src/expedition/gear/reassign.ts` (`canTarget`) | Legality doesn't depend on hidden objective ownership under Thick Fog | VERIFIED | Line 42: `if (ctx.rules.objectiveAssignment(ctx.run) === "face-down") return true;` before any pending-objective read — independently read. |
| `packages/rules/src/expedition/gear/gear.contract.test.ts` | Applies every accepted target combination, not just the first | VERIFIED | `findUsableFixtures` present (2 occurrences); `findUsableFixture` (singular, old name) absent. |
| `packages/rules/src/expedition/run/run-test-support.ts` (`enumerateLegalRunActions`) | Enumerates use-gear in the objective-pick window | VERIFIED | Contains `currentWindow(run, rules) === "objective-pick"` guard per grep in prior SUMMARY; full suite (which includes `run.property.test.ts`) passes, confirming no regression. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `gear/reroll.ts` (`canTarget`) | `run/toolkit.ts` (`replace-objective` op) | `apply()` returning `{ op: "replace-objective", objectiveId }` | **WIRED (fixed)** | Contract now matches: both accept win-card and ordered. Independently reproduced via throwaway probe. |
| `gear/reassign.ts` (`canTarget`) | `run/run-rules.ts` (`objectiveAssignment`) | `ctx.rules.objectiveAssignment(ctx.run)` | WIRED | Independently read at `reassign.ts:42`; guards the hidden-state read. |
| `run/whisper.ts` | `run/toolkit.ts` (`reveal` op) | `applyWhisper` -> reveal append | WIRED (unchanged) | Not touched by gap-closure diff; full suite green. |
| `run/lifecycle.ts` (`startAttempt`) | `run/types.ts` (`AttemptState`) | fresh-attempt rebuild on replay | WIRED (unchanged) | Not touched by gap-closure diff; full suite green. |

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| COMM-01, COMM-02 | SATISFIED (unchanged) | Whisper mechanics untouched by gap closure. |
| RUN-01..07 | SATISFIED (unchanged) | Run-layer mechanics untouched by gap closure; RUN-07's property test now covers more ground (objective-pick gear), not less. |
| GEAR-01, GEAR-03, GEAR-04 | SATISFIED (unchanged) | Not touched by 10-18/10-19. |
| GEAR-02 | **SATISFIED (re-ticked, gap closed)** | `.planning/REQUIREMENTS.md` line 50 now `[x]`; traceability row `Complete`. Compass now works on win-card objectives, independently reproduced above. Trail Map's WR-02 leak (a quality/security defect, not a correctness-vs-spec defect) is also closed. |
| GEAR-05, GEAR-06 | SATISFIED (engine-side scope only; REQUIREMENTS.md checkboxes correctly left `[ ]` Pending) | Consistent with the prior verification's judgment: the UI half (confirm-step, visible-reason rendering) is explicitly out of Phase 10's scope and deferred to Phase 11. The engine-side finality (`gear_already_used`) and reason-string mechanism (`canUse`/`canTarget` returning strings) are real and unchanged. 10-18/10-19 explicitly did not re-tick these, matching plan instructions ("Do NOT change GEAR-05 or GEAR-06... Do NOT tick GEAR-06... its UI half is Phase 11 scope"). This is intentional scoping, not a gap. |
| BOSS-01 | SATISFIED (unchanged) | 4 twists untouched by gap closure. |
| ENG-01 | SATISFIED (unchanged) | README recipes untouched. |
| ENG-02 | SATISFIED (strengthened) | Contract-test hardening (every accepted combination, not just first) makes the auto-check more thorough than at the prior verification, closing the specific WR-01 blind spot that let CR-01 through. |

No orphaned requirement IDs. All 18 IDs from the phase's requirement list appear in REQUIREMENTS.md with Phase 10 traceability rows.

### Anti-Patterns / Review Findings, Judged

| ID | Finding | Disposition (per 10-REVIEW.md re-review + independent check) |
|----|---------|-------|
| CR-01 | Compass crashes on win-card objectives | **RESOLVED.** Independently reproduced as fixed (see probe above). Not merely trusted from SUMMARY/REVIEW. |
| WR-01 | Test harness couldn't catch CR-01's defect class | **RESOLVED.** `findUsableFixtures` and the objective-pick enumeration independently confirmed present in the codebase. |
| WR-02 | Trail Map refusal leaked hidden objective ownership under Thick Fog | **RESOLVED.** `reassign.ts`'s face-down short-circuit independently read and confirmed present before any hidden-state read. |
| WR-03 | Reveal `fromSeatId` staleness after Trained Monkey moves a card | **DEFERRED to Phase 11** (see frontmatter `deferred` section) — documented, tracked, does not falsify any Phase 10 success criterion today since no shipped scenario exercises Whisper-reveal + Trained-Monkey-move on the same card observably. |
| WR-04 | Latent `move-card` op could break hand-size invariants | **DEFERRED / not phase-blocking** (see frontmatter `deferred` section) — unreachable dead code; no v1 content emits `move-card`. |
| IN-01..IN-08 | Various maintainability/duplication notes from the re-review | **INFO, not blocking.** None affect correctness against the phase's success criteria; not independently re-verified in depth since they carry no BLOCKER/WARNING weight against the goal. |

### Human Verification Required

None. Every must-have was resolved by direct, independent code inspection (not trusting SUMMARY/REVIEW claims), a from-scratch reproduction probe for the previously-failing scenario, and a full local run of the test suite and typechecker. Nothing here turns on visual, real-time, or subjective judgment.

### Gaps Summary

No gaps remain. The single BLOCKER from the prior verification (CR-01: Compass crashing on win-card objectives, falsifying GEAR-02 and success criterion 4) is closed and independently confirmed fixed via a fresh reproduction probe, not merely trusted from 10-18-SUMMARY.md. The associated WR-01 test-harness blind spot is also closed, independently confirmed via direct file inspection (`findUsableFixtures`, the objective-pick enumeration guard). WR-02 (Trail Map hidden-information leak under Thick Fog) is also closed, independently confirmed via direct file inspection of `reassign.ts`'s face-down short-circuit.

Two items remain deliberately deferred rather than closed — WR-03 (reveal staleness after Trained Monkey) and WR-04 (latent `move-card` hand-size hole) — both are documented as intentional, tracked deferrals in 10-18-SUMMARY.md/10-19-SUMMARY.md, neither is reachable/observable in any shipped v1 scenario today, and WR-03 is explicitly scoped to be resolved before Phase 11 builds the per-seat view (which depends on Phase 10's reveals per ROADMAP.md). Neither falsifies a Phase 10 success criterion as currently shipped, so both are recorded as `deferred`, not `gaps`.

Full regression: `npm test` (115 files, 1666 tests, all passing) and `npm run typecheck` (clean) were run fresh in this verification, not taken from SUMMARY claims.

---

_Verified: 2026-09-27T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
