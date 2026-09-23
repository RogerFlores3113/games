---
phase: 01-room-transport-skeleton
plan: 08
subsystem: ui
tags: [tailwind-v4, next-font, nextjs-app-router, zod, room-code, design-system]

# Dependency graph
requires:
  - phase: 01-room-transport-skeleton
    provides: "npm-workspaces monorepo skeleton, apps/web Next.js App Router shell (Plan 01)"
  - phase: 01-room-transport-skeleton
    provides: "Branded RoomCodeSchema/SeatTokenSchema, DisplayNameSchema, VariantSchema, RefusalReasonSchema (Plan 03)"
  - phase: 01-room-transport-skeleton
    provides: "apps/worker mintRoomCode convention this plan intentionally re-derives from the same @games/schema constants (Plan 05)"
provides:
  - "apps/web/app/globals.css: Tailwind v4 @theme block with the full D-16 'fireworks night' palette, spacing scale, and typography roles — Phase 6 inherits unchanged"
  - "apps/web/app/layout.tsx: next/font/google Geist + Geist Mono wired as CSS variables"
  - "Four shared presentational components: Button, RefusalCard, RoomCode, SeatRow"
  - "apps/web/lib/room-code.ts: mintRoomCode() for apps/web (separate deploy target from apps/worker's own minter)"
  - "POST /api/room: mints a speakable room code, returns {code, path}, no Durable Object state touched (lazy DO creation)"
  - "apps/web/app/page.tsx: D-03 single-screen create-room flow"
affects: [01-09-lobby-and-game-flow, 06-ui-polish]

# Tech tracking
tech-stack:
  added: [lucide-react@1.39.0, nanoid@6.0.1 (apps/web, exact pin matching apps/worker's convention)]
  patterns:
    - "Tailwind v4 CSS-first @theme block in globals.css — no tailwind.config.js/.ts, matching v4's documented setup"
    - "Two identifier-minting call sites (apps/web/lib/room-code.ts, apps/worker/src/seat-identity.ts) intentionally duplicate mintRoomCode logic because the two runtimes deploy separately; both import the SAME @games/schema constants (ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, RoomCodeSchema) to stay consistent without a shared source file"
    - "Client-facing components take colors exclusively via CSS custom properties (var(--color-*)) — zero hardcoded hex outside globals.css, enforced by a grep in the plan's own acceptance criteria"
    - "sessionStorage key format room:{code}:displayName carries the host's entered name from the create-room screen into the lobby, avoiding a retype (D-03); Plan 09 reads this key on mount"

key-files:
  created:
    - apps/web/app/globals.css
    - apps/web/postcss.config.mjs
    - apps/web/components/Button.tsx
    - apps/web/components/RefusalCard.tsx
    - apps/web/components/RoomCode.tsx
    - apps/web/components/SeatRow.tsx
    - apps/web/lib/room-code.ts
    - apps/web/lib/room-code.test.ts
    - apps/web/app/api/room/route.ts
    - apps/web/app/api/room/route.test.ts
  modified:
    - apps/web/app/layout.tsx
    - apps/web/app/page.tsx
    - apps/web/package.json

key-decisions:
  - "lucide-react pinned to exact 1.39.0 (was 'latest' in the Wave 0 scaffold's package.json) to match this project's exact-pin convention for every other researched dependency"
  - "nanoid added to apps/web at exact 6.0.1, matching apps/worker's already-established exact pin — both mint room codes independently but from the same alphabet/length constants"
  - "@theme hex values written in UPPERCASE to satisfy the plan's own case-sensitive acceptance-criteria grep (e.g. 'grep -c -- \"--color-bg: #0B0F1A\"'); functionally identical to lowercase, chosen purely to keep the plan's verification block passing without weakening it"
  - "POST /api/room runtime explicitly set to 'nodejs' rather than relying on Next's default, per the plan's action block"

requirements-completed: [ROOM-01, ROOM-05]

# Metrics
duration: ~25min
completed: 2026-09-02
---

# Phase 1 Plan 8: Room & Transport Skeleton — Theme, Shared Components & Create-Room Flow Summary

**Tailwind v4 `@theme` "fireworks night" dark palette (10 tokens + spacing/typography scales) that Phase 6 inherits unchanged, four token-only presentational components (Button/RefusalCard/RoomCode/SeatRow), and a D-03 single-screen create-room flow backed by a server-minted 6-character speakable room code (`POST /api/room`, no Durable Object state created).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-02T15:33:00Z (approx)
- **Completed:** 2026-09-02T15:58:02Z
- **Tasks:** 3 (all auto)
- **Files modified:** 13 (10 created, 3 modified)

## Accomplishments
- The entire D-16 "fireworks night" palette (`--color-bg`, `--color-surface`, `--color-accent`, `--color-destructive`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-status-connected`, `--color-status-disconnected`) plus the spacing scale (4px–64px) and four typographic roles now live in one `@theme` block in `apps/web/app/globals.css` — grep-verified at their exact approved hex values, no `tailwind.config.js`/`.ts` present
- `body` sets `background-color: var(--color-bg)`, `color: var(--color-text)`, and `color-scheme: dark` — confirmed live via a `next dev` HTML fetch that the root page renders with `style="background-color:var(--color-bg)"`, no light-mode default
- `next/font/google` wires `Geist` (UI text) and `Geist Mono` (room code only) as CSS variables consumed by the `@theme` block; only weights 400/600 appear anywhere in the app (grep-verified, no third weight)
- `RefusalCard` is a single component parametrized by `reason: "full" | "in_progress"` — not two components — with both refusal strings copied verbatim from the Copywriting Contract and no CTA (nothing to retry into)
- `SeatRow`'s connection-status dot is always paired with the literal text "Connected"/"Disconnected" — never color alone — matching the UI-SPEC's colorblind-forward-compatibility convention
- `Button` has exactly two variants (`primary`, `ghost`); `primary`'s label is always `--color-bg` on an `--color-accent` fill (≈10.9:1 AA pass) — `--color-text` on accent never appears anywhere in the four components (grep-verified)
- `mintRoomCode()` in `apps/web/lib/room-code.ts` mints a 6-char code from `ROOM_CODE_ALPHABET`/`ROOM_CODE_LENGTH` via `customAlphabet`, validated through `RoomCodeSchema.parse` at mint time — a 200-sample uniqueness test and a 200-successive-call API-level uniqueness test both pass with `Set.size === 200`
- `POST /api/room` validates `{displayName, variant}` with `@games/schema`'s `DisplayNameSchema`/`VariantSchema`, returns `400 {error:"bad_request"}` on any validation failure (empty name, 25-char name, unknown variant, malformed JSON), and returns `200 {code, path: "/room/{code}"}` on success — it never creates Durable Object state (lazy DO creation, per RESEARCH.md § Open Questions item 1)
- `apps/web/app/page.tsx` is the single D-03 create-room screen (name input + Base/Rainbow/Black radio picker + "Create room" primary CTA); on submit it POSTs, stores the entered name at `sessionStorage["room:{code}:displayName"]`, and navigates directly to `/room/{code}` — no intermediate share screen (grep-verified: no "share"/"copy" string in `page.tsx`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement the Tailwind v4 @theme token block and app shell** — `384b350` (feat)
2. **Task 2: Build the four shared presentational components** — `3959959` (feat)
3. **Task 3: Mint room codes server-side and build the D-03 create-room screen** — `6f44c7e` (feat)

## Files Created/Modified
- `apps/web/app/globals.css` — Tailwind v4 `@theme` block (colors, spacing, typography), dark-by-default `body`
- `apps/web/app/layout.tsx` — `Geist`/`Geist_Mono` via `next/font/google`, CSS variables, page metadata
- `apps/web/postcss.config.mjs` — `@tailwindcss/postcss` plugin, v4 CSS-first config
- `apps/web/components/Button.tsx` — `primary`/`ghost` variants, 44px min touch target, accent-fill contrast rule enforced
- `apps/web/components/RefusalCard.tsx` — single `{reason}`-parametrized refusal screen
- `apps/web/components/RoomCode.tsx` — Display-role room code + "Copy link"/"Copied!" ghost button
- `apps/web/components/SeatRow.tsx` — `{name, connected, isHost, isSelf}` seat row
- `apps/web/lib/room-code.ts` / `room-code.test.ts` — `mintRoomCode()` for the Vercel side
- `apps/web/app/api/room/route.ts` / `route.test.ts` — `POST /api/room` handler + 5 tests
- `apps/web/app/page.tsx` — D-03 single-screen create-room flow (rewritten from Plan 01's `SCHEMA_SMOKE` stub)
- `apps/web/package.json` — `lucide-react` pinned to exact `1.39.0`, `nanoid` added at exact `6.0.1`

## Response Shape Reference (for Plan 09)

```ts
// POST /api/room request body
{ displayName: string; variant: "base" | "rainbow" | "black" }

// 200 response
{ code: string; path: string }  // e.g. { code: "AB3XQ7", path: "/room/AB3XQ7" }

// 400 response
{ error: "bad_request" }
```

`sessionStorage` key format carrying the host's display name into the lobby: `room:{code}:displayName` (e.g. `room:AB3XQ7:displayName`), scoped to the tab, written once at submit time in `apps/web/app/page.tsx`. Plan 09's lobby should read this key on mount (keyed by the room code from the URL) to send its `join` client message without asking the host to retype their name.

## Decisions Made
- **`lucide-react` pinned to exact `1.39.0`.** The Wave 0 scaffold had it as `"latest"`; this plan's action block calls for installing it as the icon library, so it was pinned to match every other dependency's exact-pin convention rather than leaving a floating range.
- **`nanoid` added as an explicit `apps/web` dependency at exact `6.0.1`**, mirroring `apps/worker`'s Plan 05 decision — both runtimes mint room codes independently (they cannot import each other's source across the Vercel/Cloudflare deploy boundary) but derive from the same `@games/schema` constants, which is what keeps the two minters consistent.
- **`@theme` hex literals written in uppercase** (`#0B0F1A` etc.) rather than lowercase — purely to satisfy the plan's own case-sensitive acceptance-criteria grep pattern; no functional difference, both are valid CSS.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `--color-accent` hex value appeared twice in globals.css, tripping the plan's own uniqueness grep**
- **Found during:** Task 1 verification
- **Issue:** The `@theme` block's leading comment originally repeated `#F5B942` in prose alongside the token declaration, so `grep -c -- '--color-accent: #F5B942'`-style pattern intent (exactly one occurrence of the value) risked ambiguity; the acceptance criterion's exact grep target (`'--color-bg: #0B0F1A'` etc., anchored to the declaration line) required each hex value to appear exactly once in that anchored form.
- **Fix:** Removed the hex literal from the comment prose (kept the plain-English explanation), leaving each token's hex value declared exactly once.
- **Files modified:** `apps/web/app/globals.css`
- **Verification:** `grep -c -- '--color-accent: #F5B942' apps/web/app/globals.css` → 1 (and all nine other tokens likewise)
- **Committed in:** `384b350` (Task 1 commit)

**2. [Rule 1 - Bug] Doc-comment prose in page.tsx tripped the "no intermediate share screen" grep**
- **Found during:** Task 3 verification
- **Issue:** The acceptance criterion `grep -qiE 'share|copy' apps/web/app/page.tsx` must exit 1 (no match) to prove D-03's single-screen contract. A JSDoc comment explaining the design decision used the words "share screen" and "copying," which matched the pattern despite being explanatory prose, not UI copy.
- **Fix:** Reworded the comment to convey the same intent ("no intermediate screen in between") without the flagged words.
- **Files modified:** `apps/web/app/page.tsx`
- **Verification:** `grep -qiE 'share|copy' apps/web/app/page.tsx` → exit 1
- **Committed in:** `6f44c7e` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1, both self-inflicted by the plan's own verification-grep wording tripping on doc-comment prose, not on any UI-facing string). No scope creep — neither fix touched user-visible behavior or copy.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None — no external service configuration required. `POST /api/room` runs entirely inside `apps/web` with no Cloudflare/Worker dependency.

## Next Phase Readiness

- Plan 09 (lobby and game flow) can import `Button`, `RefusalCard`, `RoomCode`, `SeatRow` directly from `apps/web/components/` and consume the `sessionStorage["room:{code}:displayName"]` key on mount to auto-join the host into the lobby without a retyped name.
- `POST /api/room`'s `{code, path}` response shape is fixed and tested; Plan 09's `/room/[code]` page can rely on it unchanged.
- `npx vitest run --project web` is now 3 test files / 9 tests, all green; `npx vitest run` (whole repo) is 15 files / 116 tests, all green.
- `npm run build --workspace apps/web` produces a clean production build with `/` static and `/api/room` dynamic, as expected for a route handler that reads the request body.
- All four shared components are token-only (zero hardcoded hex, grep-verified) — Phase 6 can restyle intensity/animation without touching color values, since none are hardcoded per-component.

---
*Phase: 01-room-transport-skeleton*
*Completed: 2026-09-02*

## Self-Check: PASSED
All 10 created files verified present on disk. All 4 commit hashes (384b350, 3959959, 6f44c7e, efeb396) verified in git log.
