---
phase: 12-phaser-shell
plan: 06
subsystem: expedition-phaser-drawing-primitives
tags: [expedition, phaser-shell, pixel-font, card-packs, tdd]

# Dependency graph
requires:
  - phase: 12-phaser-shell (plan 02)
    provides: "card-pack-ids.ts CardPackId/CARD_PACK_LABELS, expedition-ids.ts cardLabel/rankLabel/SUIT_GLYPH"
  - phase: 12-phaser-shell (plan 03)
    provides: "layout.ts CARD_W/H/MINI_W/H, palette.ts PALETTE, font/font-keys.ts WORLD_LABEL_FONT/WORLD_SIGN_FONT/LABEL_CELL/SIGN_CELL"
  - phase: 12-phaser-shell (plan 04)
    provides: "phaser@3.90.0 installed; phaser-import-confinement.test.ts guard"
provides:
  - "font/glyphs-5x7.ts + font/glyph-atlas.ts: hand-authored bitmap pixel font data and runtime canvas atlas builders (D-12)"
  - "font/pixel-font.ts: ensurePixelFonts(scene) registering WORLD_LABEL_FONT/WORLD_SIGN_FONT as real Phaser bitmap fonts"
  - "card-packs/*: CardPackDef contract, pips.ts pixel masks, big-index.ts and classic.ts packs, registry.ts CARD_PACK_REGISTRY, card-textures.ts ensureCardTextures(scene, packId, glyphs)"
affects: [12-07, 12-08, 12-09, 12-10]

tech-stack:
  added: []
  patterns:
    - "Registry-per-entry with satisfies Readonly<Record<CardPackId, CardPackDef>> (ENG-01 discipline extended to apps/web card packs)"
    - "Drawing primitives (font data, pips, card faces) as pure functions over an injected CanvasRenderingContext2D, unit-testable in Node via a recording mock context — no phaser import in the drawing-logic files themselves"
    - "Phaser glue (pixel-font.ts, card-textures.ts) confined to the two files that actually need scene/texture/cache APIs; idempotent per scene.game (T-12-13)"

key-files:
  created:
    - apps/web/components/expedition/phaser/font/glyphs-5x7.ts
    - apps/web/components/expedition/phaser/font/glyphs-5x7.test.ts
    - apps/web/components/expedition/phaser/font/glyph-atlas.ts
    - apps/web/components/expedition/phaser/font/pixel-font.ts
    - apps/web/components/expedition/phaser/card-packs/pips.ts
    - apps/web/components/expedition/phaser/card-packs/card-pack-def.ts
    - apps/web/components/expedition/phaser/card-packs/big-index.ts
    - apps/web/components/expedition/phaser/card-packs/classic.ts
    - apps/web/components/expedition/phaser/card-packs/registry.ts
    - apps/web/components/expedition/phaser/card-packs/card-packs.contract.test.ts
    - apps/web/components/expedition/phaser/card-packs/card-textures.ts
  modified: []

key-decisions:
  - "GLYPHS_5X7 is a hand-authored literal object (not procedurally generated) covering ASCII 32..126 plus a trailing ellipsis fallback glyph, self-authored placeholder tier per D-13 — no CREDITS.md entry needed, Phase 14 replaces the asset, not the mechanism"
  - "truncateLabel maps every character through GLYPHS_5X7 first (unknown -> '?'), then truncates — so an out-of-table character is normalized before the length/ellipsis decision, matching the plan's literal example (truncateLabel('é', 10) === '?')"
  - "Card body drawing (both packs) uses two nested integer fillRect calls (full-size cardEdge fill, then an inset cardFace/cardBack fill) to render a 1px border, rather than strokeRect, keeping every draw call inside the fillRect/drawImage/clearRect integer-argument contract the contract test enforces"
  - "Big Index's suit pip is drawn 4px below the corner-rank text (full size only) so the large centred pip and the sign-font rank never visually collide; Classic's pip sits directly below its smaller label-font rank at a fixed offset — both are this plan's own placeholder-tier layout choices"
  - "pixel-font.ts confirmed Phaser 3.90.0's actual API before writing code: RetroFont.Parse(scene, config) reads an already-added texture key (never a raw canvas), so ensurePixelFonts always calls scene.textures.addCanvas(...) first, then Parse, then scene.cache.bitmapFont.add(key, parsed)"
  - "BLITTER_CACHE and per-scene idempotency keyed on scene.game (not scene) so hot-reloading/re-creating a scene within the same running Phaser.Game never re-registers a font or regenerates an atlas (T-12-13)"

patterns-established:
  - "card-packs/*.ts (pips, card-pack-def, big-index, classic, registry) are phaser-free pure drawing/data modules; only font/pixel-font.ts and card-packs/card-textures.ts touch the Phaser scene/texture/cache APIs — later plans building actual scenes should keep following this split"

requirements-completed: [SCENE-08, SCENE-10]

# Metrics
duration: ~45min
completed: 2026-09-28
---

# Phase 12 Plan 06: Bitmap Pixel Font and Card Packs Summary

**A hand-authored 5x7 bitmap pixel font (two atlas sizes, D-12) and two switchable, contract-tested, integer-crisp card packs (Big Index default, Classic) — plus the Phaser glue (`ensurePixelFonts`, `ensureCardTextures`) that turns both into real Phaser bitmap fonts and canvas textures, all test-first.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 3 (Tasks 1-2 each RED-then-GREEN; Task 3 non-TDD, verified via typecheck + the full test suite)
- **Files modified:** 11 (all created)

## Accomplishments

- `GLYPHS_5X7` covers every printable ASCII character (32..126) plus a fallback ellipsis glyph, each exactly 7 rows of 5 `#`/`.` characters; `truncateLabel` normalizes unknown characters to `?` before truncating to a fixed per-slot width with a trailing ellipsis — 9 tests, all passing
- `glyph-atlas.ts` builds the `world-label` (6x8 cell) and `world-sign` (8x12 cell, alpha-thresholded rasterized text) atlases with `imageSmoothingEnabled = false` throughout and integer-coordinate blitting via `source-in` tinting — no `phaser` import, verified by the confinement test
- Two registered card packs (`big-index`, `classic`) draw all 54 identities (52 standard + Sun + Moon) at both `full`/`mini` sizes using only integer `fillRect` calls, never `fillText`/`strokeText`; Big Index uses four distinct pip colours and the sign font for its large corner rank, Classic uses two colours and the label font — 17 contract tests, all passing, iterating `Object.entries(CARD_PACK_REGISTRY)` so a third pack is covered automatically
- `pixel-font.ts`'s `ensurePixelFonts(scene)` and `card-textures.ts`'s `ensureCardTextures(scene, packId, glyphs)` are the only two files in this plan that import/use Phaser's runtime APIs, both idempotent per `scene.game`, confirmed against the installed Phaser 3.90.0 type declarations before implementation
- `npm run typecheck` exits 0 and all three named test suites (`glyphs-5x7`, `card-packs.contract`, `phaser-import-confinement`) pass together — 29 tests total

## Task Commits

Each TDD task was committed as a strict RED-then-GREEN cycle; Task 3 (non-TDD) was committed once its verification passed.

1. **Task 1: Hand-authored 5x7 glyph table, label truncation and glyph atlases (D-12)**
   - RED: `afc0482` (test) — 9 tests written against a temporarily-removed implementation, confirmed failing (`Cannot find module`)
   - GREEN: `3b6451e` (feat) — `glyphs-5x7.ts` restored + `glyph-atlas.ts` added, all 9 tests passing
2. **Task 2: Card pack registry — Big Index and Classic (SCENE-08, spec 7.3)**
   - RED: `e206d3d` (test) — 17 contract tests written against a not-yet-existing `registry.ts`, confirmed failing (`Cannot find module`)
   - GREEN: `74fcf26` (feat) — `pips.ts`, `card-pack-def.ts`, `big-index.ts`, `classic.ts`, `registry.ts` added, all 17 tests passing on the first real run
3. **Task 3: Phaser glue — register pixel fonts and generate card textures** — `2e4c0f8` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/components/expedition/phaser/font/glyphs-5x7.ts` — `GLYPHS_5X7`, `KNOWN_GLYPH_CHARS`, `truncateLabel`
- `apps/web/components/expedition/phaser/font/glyphs-5x7.test.ts` — 9 tests: full coverage, row-shape, space, A-vs-a, digit distinctness, truncation
- `apps/web/components/expedition/phaser/font/glyph-atlas.ts` — `GlyphAtlas`/`GlyphBlitter` interfaces, `buildLabelAtlas`, `buildSignAtlas`
- `apps/web/components/expedition/phaser/font/pixel-font.ts` — `ensurePixelFonts(scene)`
- `apps/web/components/expedition/phaser/card-packs/pips.ts` — `FULL_PIPS`/`MINI_PIPS` for the four suits + Sun/Moon
- `apps/web/components/expedition/phaser/card-packs/card-pack-def.ts` — `CardPackDef`, `CardSize`, `cardTextureKey`, `cardBackTextureKey`, `allCardIdentities`
- `apps/web/components/expedition/phaser/card-packs/big-index.ts` — default pack
- `apps/web/components/expedition/phaser/card-packs/classic.ts` — traditional two-colour pack
- `apps/web/components/expedition/phaser/card-packs/registry.ts` — `CARD_PACK_REGISTRY`
- `apps/web/components/expedition/phaser/card-packs/card-packs.contract.test.ts` — 17 tests: registry shape, `allCardIdentities` uniqueness, texture-key format, per-pack integer/bounds/no-text-call proofs, colour-count proofs, font-choice proofs
- `apps/web/components/expedition/phaser/card-packs/card-textures.ts` — `ensureCardTextures(scene, packId, glyphs)`

## Decisions Made

- `GLYPHS_5X7` was hand-authored directly as object-literal data rather than procedurally generated, per the plan's explicit instruction and D-13's "self-authored, throwaway placeholder" framing — every glyph was designed to satisfy the stated invariants (space blank, A≠a, digits pairwise distinct) by construction, then proven by the test file.
- `truncateLabel`'s unknown-character mapping happens before the length check, so `truncateLabel("é", 10)` returns `"?"` (length 1, under the 10-char limit) rather than passing the untranslated character through — this matches the plan's literal example and keeps every returned character always drawable by the atlas.
- Card body rendering avoids `strokeRect` entirely, using two nested `fillRect` calls (full box in `cardEdge`, inset box in `cardFace`/`cardBack`) to get a 1px border — this keeps every draw call inside the same `fillRect`/`drawImage`/`clearRect` integer-argument contract the acceptance criteria and contract test enforce uniformly.
- Confirmed Phaser 3.90.0's real `RetroFont.Parse`/`BaseCache`/`CanvasTexture` signatures directly against `node_modules/phaser/types/phaser.d.ts` before writing `pixel-font.ts`/`card-textures.ts` (per the plan's `<read_first>` instruction) — `RetroFont.Parse` requires an already-registered texture key, never a raw `HTMLCanvasElement`, which is why `ensurePixelFonts` always calls `scene.textures.addCanvas` immediately before `Parse`.

## Deviations from Plan

None — plan executed exactly as written. No auto-fixes were needed on any task; every TDD cycle passed GREEN on the first real implementation run, and Task 3's typecheck and full test-suite verification passed on the first attempt.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `ensurePixelFonts`/`ensureCardTextures` are ready for Plan 12-07+ (the actual `ExpeditionPhaserMount`/`CampScene`) to call from a real scene's `create()` — both are idempotent and require no further setup.
- `CARD_PACK_REGISTRY` (SCENE-08) and the bitmap pixel font (SCENE-10) are both fully proven at the drawing-primitive level; final crispness sign-off (D-14) still depends on a real running scene from later plans.
- No blockers for 12-07/12-08.

---
*Phase: 12-phaser-shell*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: apps/web/components/expedition/phaser/font/glyphs-5x7.ts
- FOUND: apps/web/components/expedition/phaser/font/glyphs-5x7.test.ts
- FOUND: apps/web/components/expedition/phaser/font/glyph-atlas.ts
- FOUND: apps/web/components/expedition/phaser/font/pixel-font.ts
- FOUND: apps/web/components/expedition/phaser/card-packs/pips.ts
- FOUND: apps/web/components/expedition/phaser/card-packs/card-pack-def.ts
- FOUND: apps/web/components/expedition/phaser/card-packs/big-index.ts
- FOUND: apps/web/components/expedition/phaser/card-packs/classic.ts
- FOUND: apps/web/components/expedition/phaser/card-packs/registry.ts
- FOUND: apps/web/components/expedition/phaser/card-packs/card-packs.contract.test.ts
- FOUND: apps/web/components/expedition/phaser/card-packs/card-textures.ts
- FOUND commit: afc0482 (Task 1 RED)
- FOUND commit: 3b6451e (Task 1 GREEN)
- FOUND commit: e206d3d (Task 2 RED)
- FOUND commit: 74fcf26 (Task 2 GREEN)
- FOUND commit: 2e4c0f8 (Task 3)
