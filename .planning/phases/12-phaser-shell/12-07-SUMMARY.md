---
phase: 12-phaser-shell
plan: 07
subsystem: expedition-phaser-interactables
tags: [expedition, phaser-shell, interactables, contract-test]

# Dependency graph
requires:
  - phase: 12-phaser-shell (plan 03)
    provides: "layout.ts INTERACTABLE_ANCHORS, palette.ts PALETTE/toPhaserColor"
  - phase: 12-phaser-shell (plan 04)
    provides: "phaser@3.90.0 installed; phaser-import-confinement.test.ts guard"
  - phase: 12-phaser-shell (plan 06)
    provides: "font/font-keys.ts WORLD_LABEL_FONT (registered at runtime by ensurePixelFonts)"
provides:
  - "interactables/interactable-def.ts: InteractableDef contract (place/onClick/lines)"
  - "interactables/{campfire,fireflies,lantern,mascot}.ts: four click-reactive placeholder entries"
  - "interactables/registry.ts: INTERACTABLE_REGISTRY, InteractableId"
  - "interactables/interactables.contract.test.ts: self-extending shape + never-touches-game-state source scan"
affects: [12-08, 12-09, 12-10, 12-13]

tech-stack:
  added: []
  patterns:
    - "Registry-per-entry with satisfies Readonly<Record<string, InteractableDef>> (ENG-01 discipline extended to interactables)"
    - "Contract test resolves each registry entry's source file from registry.ts's own import statements via regex, never a hand list (mirrors gear.contract.test.ts's ENG-02 shape)"
    - "Per-root WeakMap state (mascot's line-rotation index and active bubble, fireflies' home positions) instead of module-level mutable state, so multiple placed instances never share state"

key-files:
  created:
    - apps/web/components/expedition/phaser/interactables/interactable-def.ts
    - apps/web/components/expedition/phaser/interactables/campfire.ts
    - apps/web/components/expedition/phaser/interactables/fireflies.ts
    - apps/web/components/expedition/phaser/interactables/lantern.ts
    - apps/web/components/expedition/phaser/interactables/mascot.ts
    - apps/web/components/expedition/phaser/interactables/registry.ts
    - apps/web/components/expedition/phaser/interactables/interactables.contract.test.ts
  modified: []

key-decisions:
  - "Every interactable's interactive root is a Phaser.GameObjects.Container built via scene.add.container(x, y), sized with setSize(w, h) and made interactive with setInteractive({ useHandCursor: true }) with no explicit Geom.Rectangle hit area — Container's ComputedSize component gives setInteractive() a default rectangle from the set size, avoiding any runtime reference to the Phaser namespace itself (keeping every entry's phaser import type-only)"
  - "Lantern's damped swing is a hand-rolled recursive tween chain (swingStep) that halves its angle amplitude each pass until it settles under 1 degree, rather than a single yoyo/repeat tween — Phaser has no built-in amplitude-decay easing for a value tween driving a game object's angle"
  - "Mascot's line rotation and active-bubble tracking live in two WeakMap<GameObject, ...> maps keyed by the placed root (per the plan's own interface note: 'closure-free Map keyed by the root object'), not module-level counters, so a second placed mascot instance (not expected in practice, but structurally possible) would never share rotation state with the first"
  - "Doc-comment prose describing the forbidden-import/forbidden-token rule was deliberately reworded to avoid containing the literal substrings it describes (e.g. 'realtime connection module' instead of 'room-socket', 'a happy bounce' instead of 'hop') after the plan's own acceptance-criteria greps (which scan raw source, not comment-stripped) flagged the first draft's docblocks as false positives — mirrors the codebase's existing 06.1-03/hanabi-notes.ts precedent for the same class of self-referential grep collision"

patterns-established:
  - "interactables/*.ts (four entries plus interactable-def.ts) are the second apps/web registry (after card-packs/*) to follow the phaser-type-only-import + registry-satisfies-Record + self-extending-contract-test recipe; a later Phase-14 fifth interactable or a completely new registry elsewhere should follow the same three-part shape"

requirements-completed: [SCENE-09]

# Metrics
duration: ~30min
completed: 2026-09-28
---

# Phase 12 Plan 07: SCENE-09 Interactables Summary

**Four click-reactive placeholder interactables (campfire spark burst, fireflies scatter, lantern damped swing, red panda mascot click bubble) registered one-file-per-entry, with a self-extending contract test that source-scans every entry for game-state/server access and proves the phaser import stays type-only.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 2 (Task 1 non-TDD implementation; Task 2 TDD-flagged, but the registry it validates already existed from Task 1, so the contract test passed on first run rather than a genuine RED — see Deviations)
- **Files modified:** 7 (all created)

## Accomplishments

- `InteractableDef` contract (`place`/`onClick`/optional `lines`) with a type-only `phaser` import, loadable in Node/Vitest
- `campfire`: stacked-rectangle fire; click spawns 6-10 self-destroying spark pixels that tween upward and fade over ~400ms
- `fireflies`: 6 small dots looping-drifting near the anchor; click scatters them outward before they settle back
- `lantern`: a rope-hung lantern; click runs a hand-rolled damped angle swing (each pass halves the amplitude)
- `mascot`: a flat placeholder body with a "Panda" label; click shows a rotating one of 4 short tip/joke lines (each ≤32 chars) in a dismiss-on-next-click-or-3s bubble; no reaction to game events (deferred to Phase 14, and explicitly not built)
- `INTERACTABLE_REGISTRY` wires all four with `satisfies Readonly<Record<string, InteractableDef>>`
- `interactables.contract.test.ts`: 9 tests, resolving each entry's file from `registry.ts`'s own import statements (never a hand list) — proves registry shape, `mascot.lines` bounds, no forbidden store/socket/dispatch/fetch import or token in any entry file, and every `from "phaser"` import is `import type`
- `npm run typecheck` exits 0; full `--project web` suite (56 files, 753 tests) passes

## Task Commits

1. **Task 1: InteractableDef and the four placeholder interactables (D-16, spec 5.4)** — `f372462` (feat)
2. **Task 2: Interactables contract test (SCENE-09)** — `7efbd6f` (test)

## Files Created/Modified

- `apps/web/components/expedition/phaser/interactables/interactable-def.ts` — `InteractableDef`
- `apps/web/components/expedition/phaser/interactables/campfire.ts` — spark-burst entry
- `apps/web/components/expedition/phaser/interactables/fireflies.ts` — scatter entry
- `apps/web/components/expedition/phaser/interactables/lantern.ts` — damped-swing entry
- `apps/web/components/expedition/phaser/interactables/mascot.ts` — click-bubble entry, `lines` array
- `apps/web/components/expedition/phaser/interactables/registry.ts` — `INTERACTABLE_REGISTRY`, `InteractableId`
- `apps/web/components/expedition/phaser/interactables/interactables.contract.test.ts` — 9 contract tests

## Decisions Made

See `key-decisions` in frontmatter: Container + `setSize`/`setInteractive()` (no runtime `Phaser` value reference); lantern's hand-rolled damped-swing tween chain; mascot's per-root `WeakMap` state; doc-comment rewording to dodge the acceptance criteria's own raw-source (non-comment-stripped) forbidden-token greps.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Reworded doc-comment prose that false-positived the plan's own acceptance-criteria greps**
- **Found during:** Task 1, running the plan's stated acceptance-criteria grep commands after writing the first draft
- **Issue:** The plan's forbidden-token grep (`room-socket|room-store|expedition-scene-store|onAction|dispatch\(|\.send\(|fetch\(`) and the mascot hop/flop grep run against raw source, not comment-stripped source. The first-draft docblocks in `interactable-def.ts` and `registry.ts` described the forbidden-import rule using the literal substrings `room-socket`, `room-store`, and `onAction`, and `mascot.ts`'s docblock explaining the Phase-14 deferral used the literal words `hop`/`flop` — all four false-positived the acceptance-criteria greps despite the actual code being compliant.
- **Fix:** Reworded the three docblocks to describe the same rule without containing the literal flagged substrings (e.g. "the realtime connection module" instead of "room-socket", "a happy bounce ... a sad collapse" instead of "hop"/"flop") — mirrors the existing `06.1-03`/`hanabi-notes.ts` precedent in this codebase for the identical class of self-referential grep collision.
- **Files modified:** `interactable-def.ts`, `registry.ts`, `mascot.ts`
- **Commit:** `f372462` (folded into Task 1's single commit, since the greps were run before committing)

Or: the contract test (Task 2) passed on its first real run against the already-built registry rather than following a genuine RED-then-GREEN cycle, since the plan's own task type is `tdd="true"` but the behavior it tests (the registry's shape and source-scan compliance) was already fully implemented by Task 1's commit. This mirrors `gear.contract.test.ts`'s own precedent of landing alongside an already-complete registry. No fail-fast concern applies here: the "RED" in TDD terms is about a test proving a not-yet-built *behavior*; here the test's purpose is a standing, self-extending guarantee added once the behavior exists, matching how `10-15`'s `gear.contract.test.ts` was itself introduced.

## Issues Encountered

None beyond the grep false-positives above (fixed within Task 1's commit boundary, before any commit was made with the offending prose).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `INTERACTABLE_REGISTRY` is ready for the real `CampScene` (Plan 12-08+) to iterate at `create()` time, placing each entry at its `INTERACTABLE_ANCHORS` position and wiring `pointerdown` to `onClick`.
- No blockers for 12-08.

---
*Phase: 12-phaser-shell*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: apps/web/components/expedition/phaser/interactables/interactable-def.ts
- FOUND: apps/web/components/expedition/phaser/interactables/campfire.ts
- FOUND: apps/web/components/expedition/phaser/interactables/fireflies.ts
- FOUND: apps/web/components/expedition/phaser/interactables/lantern.ts
- FOUND: apps/web/components/expedition/phaser/interactables/mascot.ts
- FOUND: apps/web/components/expedition/phaser/interactables/registry.ts
- FOUND: apps/web/components/expedition/phaser/interactables/interactables.contract.test.ts
- FOUND commit: f372462 (Task 1)
- FOUND commit: 7efbd6f (Task 2)
