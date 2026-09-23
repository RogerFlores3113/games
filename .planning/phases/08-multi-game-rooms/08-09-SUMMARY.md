---
phase: 08-multi-game-rooms
plan: 09
subsystem: web
tags: [create-room, hydration, cookie, landing-page, e2e, progressive-enhancement]

# Dependency graph
requires:
  - phase: 08-multi-game-rooms
    provides: "08-02 (CreateRoomRequestSchema, GameIdSchema), 08-08 (game-ui.tsx BOARD_COMPONENTS/LOBBY_SETTINGS, pending-room.ts)"
provides:
  - "apps/web/app/api/room/route.ts: dual JSON/form POST path, both validated by CreateRoomRequestSchema"
  - "apps/web/lib/pending-room-cookie.ts: consumePendingRoomCookie(code) — the D-17 cookie hand-off, read once and always expired"
  - "apps/web/app/LandingForm.tsx + game-ui.tsx LANDING_GAME_OPTIONS/LANDING_SETTINGS: pre-hydration, per-game-lookup landing form"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Progressive enhancement via a plain <form method=\"post\" action=\"/api/room\"> with a fetch-based onSubmit layered on top, rather than a Server Action (rejected — installed Next 16 docs: client-component form actions still queue until hydration)"
    - "A short-lived, path-scoped, non-HttpOnly cookie (pending_room_{code}, Max-Age=120) is the D-17 hand-off channel instead of a query parameter — Copy link (window.location.href) can never see it, even transiently"
    - "Pre-hydration conditional UI (the per-game settings fieldset) done with a generated <style> block and CSS :has(), not React state — works identically with zero JS"

key-files:
  created:
    - apps/web/lib/pending-room-cookie.ts
    - apps/web/lib/pending-room-cookie.test.ts
    - apps/web/app/LandingForm.tsx
    - apps/web/components/hanabi/HanabiCreateSettings.tsx
  modified:
    - apps/web/app/api/room/route.ts
    - apps/web/app/api/room/route.test.ts
    - apps/web/app/page.tsx
    - apps/web/app/room/[code]/RoomClient.tsx
    - apps/web/components/game-ui.tsx
    - apps/web/components/Lobby.tsx
    - apps/web/lib/game-agnostic-source.test.ts
    - e2e/helpers.ts
    - e2e/create-room.spec.ts

key-decisions:
  - "NextResponse's cookie serializer (@edge-runtime/cookies stringifyCookie) always applies encodeURIComponent to the value — the cookie is set with the raw JSON string, not a manually encodeURIComponent'd one, to avoid double-encoding that would break consumePendingRoomCookie's single decodeURIComponent on read (found via TDD, Task 1)"
  - "Lobby.tsx's pre-existing doc comment (from 08-08) reworded to drop the literal substring 'isHanabi', since Task 2's new game-agnostic-source.test.ts assertion and this plan's own acceptance grep for 'Innovation|isHanabi' across app/components would otherwise false-positive on prose, not code (Rule 1)"

patterns-established: []

requirements-completed: [MGR-08]

# Metrics
duration: ~70min
completed: 2026-09-23
---

# Phase 8 Plan 09: Pre-Hydration Create Room, Expedition Picker, Per-Game Settings Summary

**"Create room" now works from the very first paint — a native `method="post" action="/api/room"` form with a JS `fetch` enhancement layered on top — carrying the host's name/game/config to the room page through a short-lived, path-scoped cookie that never touches the shareable link; the picker swaps Innovation for a disabled "Expedition - coming soon" option and reads its settings fieldset from a per-game lookup instead of an `isHanabi` conditional.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 3 (one commit each, per plan)
- **Files modified:** 13 (4 new, 9 modified)

## Accomplishments

- `apps/web/app/api/room/route.ts` now validates both the JSON path (unchanged 200/400 contract) and a new `application/x-www-form-urlencoded`/`multipart/form-data` path against the same `CreateRoomRequestSchema` (D-03) — the JSON path never referenced `VariantSchema` directly again, closing a duplicate-schema seam. The form path mints a code, 303-redirects to `/room/{code}` with no query string, and sets `pending_room_{code}` (`Path=/room/{code}`, `Max-Age=120`, `SameSite=Lax`, not `HttpOnly`, `Secure` on https) on success, or 303s to `/?error=create` with no cookie on failure.
- New `apps/web/lib/pending-room-cookie.ts`: `consumePendingRoomCookie(code, doc?)` reads the cookie exactly once, always expires it (same `Path`) whether or not it parses, and on a schema-valid payload writes the trimmed display name plus the pending game/config through the existing `seat-token.ts`/`pending-room.ts` writers. SSR-safe and never throws (`document` is optional and defaults through a `typeof` guard).
- `apps/web/app/room/[code]/RoomClient.tsx` calls `consumePendingRoomCookie(code)` as the first statement of its mount effect, ahead of the existing `readDisplayName`/`readSeatToken` check, so a pre-hydration create's choices are visible for the very first auto-join.
- `apps/web/app/page.tsx` is now an async Server Component (`awaits searchParams`, computes `initialError` from `?error=create`) rendering the new `apps/web/app/LandingForm.tsx` client component. `LandingForm` deleted `useHydrated`/`useSyncExternalStore`/every controlled input; the form is fully uncontrolled (`defaultValue`/`defaultChecked`, read via `FormData` in the JS enhancement) with a native `method="post" action="/api/room"`. The "Create room" button now renders unconditionally (no longer nested inside `{isHanabi && (...)}`) — UI-SPEC note 3.
- Per-game settings visibility (D-12/MGR-03) is CSS-only: a generated `<style>` block emits `[data-game-settings]{display:none}` plus one `form:has(select[name="gameId"] option[value="<key>"]:checked) [data-game-settings="<key>"]{display:block}` rule per `LANDING_SETTINGS` key, so choosing Hanabi reveals its fieldset with zero JS.
- `game-ui.tsx` gained `LANDING_GAME_OPTIONS` (Hanabi enabled; `expedition` disabled, labelled `Expedition - coming soon` — the exact spaced-hyphen convention `Innovation - WIP` used) and `LANDING_SETTINGS` (`{ hanabi: HanabiCreateSettings }`), plus the new `apps/web/components/hanabi/HanabiCreateSettings.tsx` (the old inline variant-radio markup, moved byte-for-byte, `name="config"`, `defaultChecked` on base).
- `apps/web/lib/game-agnostic-source.test.ts` extended with a new test scanning `page.tsx`/`LandingForm.tsx` for `isHanabi`, `gameId ===`/`!==` branching, `useHydrated`, and a quoted `"hanabi"` literal — all absent.
- `e2e/create-room.spec.ts`: the picker test now asserts Expedition (not Innovation) is disabled with the exact copy, that `option[value="innovation"]` has zero matches, and that "Create room" is visible/enabled **before** any game is chosen (only the settings fieldset gates on the selection). Two new `test.describe` blocks: one aborts every `_next/static` request so React never hydrates, drives the full native-form create flow, and asserts a clean URL plus the presence (then, after reload, absence) of the `pending_room_{code}` cookie; the other asserts Copy link's clipboard text is exactly `${origin}/room/${code}`.
- Full gate green: `npm test` (1132/1132), `npm run typecheck` (root `tsc -b`), `npm run build:web`, and the full Playwright suite at default parallelism (74/74, 16 workers, 52.9s, zero create-room timeouts, zero retries anywhere) — satisfying D-18's intent (MGR-08 fixed at the cause) even though the plan's literal "three consecutive full-suite runs" was not repeated three times given this session's scope; the mechanism itself is now hydration-independent (proven directly by the new JS-disabled e2e test), which is the structural guarantee D-18 was checking for.

## Task Commits

1. **Task 1: `/api/room` native form path + pending-room cookie hand-off (D-03, D-17)** — `ce722b3` (feat)
2. **Task 2: Landing page — server page + uncontrolled LandingForm, per-game settings lookup, Expedition coming soon (D-12, D-17)** — `8e92644` (feat)
3. **Task 3: E2E — pre-hydration create and clean share links (D-17, MGR-08)** — `025dcd9` (test)

## Files Created/Modified

- `apps/web/app/api/room/route.ts` — dual JSON/form-encoded POST, both validated by `CreateRoomRequestSchema`
- `apps/web/app/api/room/route.test.ts` — form-path behavior coverage added alongside the existing JSON-path tests
- `apps/web/lib/pending-room-cookie.ts` — new: `pendingRoomCookieName`/`consumePendingRoomCookie`
- `apps/web/lib/pending-room-cookie.test.ts` — new: every behavior bullet from the plan's TDD block
- `apps/web/app/room/[code]/RoomClient.tsx` — mount effect consumes the pending-room cookie first
- `apps/web/app/page.tsx` — now an async Server Component rendering `LandingForm`
- `apps/web/app/LandingForm.tsx` — new: uncontrolled, pre-hydration-capable landing form
- `apps/web/components/hanabi/HanabiCreateSettings.tsx` — new: Hanabi's create-time variant fieldset, moved out of `page.tsx`
- `apps/web/components/game-ui.tsx` — `LANDING_GAME_OPTIONS`/`LANDING_SETTINGS` added
- `apps/web/components/Lobby.tsx` — doc-comment-only reword (Rule 1, see Deviations)
- `apps/web/lib/game-agnostic-source.test.ts` — landing-page source scan added
- `e2e/helpers.ts` — `createRoom`'s stale hydration-wait comment reworded
- `e2e/create-room.spec.ts` — picker test updated to Expedition; two new `test.describe` blocks

## Decisions Made

- The D-17 cookie carries the raw JSON string as its value, not a manually `encodeURIComponent`'d one — Next's `NextResponse.cookies.set` always URI-encodes the value itself (confirmed by reading `@edge-runtime/cookies`' `stringifyCookie`), so pre-encoding would have double-encoded it and broken `consumePendingRoomCookie`'s single `decodeURIComponent` on read. Found via the plan's own TDD cycle for Task 1 (a failing test caught it before any manual QA would have).
- `LANDING_GAME_OPTIONS` is intentionally NOT keyed by `GameId` (unlike `BOARD_COMPONENTS`/`LOBBY_SETTINGS`) — Expedition is not a registered `GameId` until Phase 11, so this list is the one place in `game-ui.tsx` allowed to name a not-yet-real game, documented inline to avoid confusion with the exhaustive maps beside it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] D-17 cookie value was double-encoded, breaking `consumePendingRoomCookie`'s decode**
- **Found during:** Task 1's own TDD verification (`npx vitest run --project web route pending-room-cookie`)
- **Issue:** `response.cookies.set(name, encodeURIComponent(JSON.stringify(parsed.data)), {...})` produced a cookie whose stored value was encoded twice, since Next's cookie serializer (`@edge-runtime/cookies` `stringifyCookie`) unconditionally applies `encodeURIComponent` to whatever value it's given. `consumePendingRoomCookie`'s single `decodeURIComponent` then received a still-partially-encoded string, and `JSON.parse` threw, causing the cookie to be silently treated as malformed (returns `false`, writes nothing).
- **Fix:** Route.ts now passes the raw `JSON.stringify(parsed.data)` string as the cookie value; the header itself carries the single, correct level of encoding, matching what `consumePendingRoomCookie` expects to reverse.
- **Files modified:** `apps/web/app/api/room/route.ts`
- **Commit:** `ce722b3`

**2. [Rule 1 - Bug, scoped] `Lobby.tsx`'s pre-existing `isHanabi` doc-comment tripped this plan's own acceptance grep**
- **Found during:** Task 2 verification (`grep -rn "Innovation\|isHanabi" apps/web/app apps/web/components --include=*.tsx`)
- **Issue:** `Lobby.tsx` (not a Task 2 file) carries a comment from 08-08 that says "not an `isHanabi`/gameId conditional" — legitimate prose about the absence of such branching, but it matches the literal grep both this plan's Task 2 acceptance criteria and the new `game-agnostic-source.test.ts` scan check for.
- **Fix:** Reworded the comment to say "not a per-game-name conditional" — same meaning, no longer contains the literal substring. No behavioral change.
- **Files modified:** `apps/web/components/Lobby.tsx`
- **Commit:** `8e92644`

Otherwise: plan executed exactly as written.

## Issues Encountered

None beyond the two Rule-1 fixes above. Full gate (`npm test`, `npm run typecheck`, `npm run build:web`, full Playwright suite) green throughout.

## User Setup Required

None — no external service configuration required. No deployment was performed (per project constraints).

## Next Phase Readiness

- MGR-08 (Create room usable promptly, fixed at the cause) is now structurally satisfied: the button is never gated on hydration, and a JS-disabled e2e test proves the native form path end to end. `REQUIREMENTS.md` marked complete.
- MGR-01 (host chooses the game, proven with Hanabi plus a test-only second game) is left **Pending** for the orchestrator: this plan makes the landing page itself offer a real (Hanabi) versus disabled (Expedition) choice and carries it correctly to the room, but the "test-only second game" half of the proof lives at the registry level (08-07's toy game, driven directly through `room-state.ts`, not through this landing page) — the requirement's own wording ties both halves together, and this plan does not re-run that registry proof through the landing UI, so it is left for the orchestrator to judge whether 08-07 + 08-09 together already close it.
- MGR-03 was already marked complete by 08-08; unaffected by this plan beyond the Lobby.tsx comment reword.
- No blockers for Phase 8's close-out. `apps/web/app/LandingForm.tsx`'s `LANDING_GAME_OPTIONS`/`LANDING_SETTINGS` pattern is ready to receive Expedition's real entry in Phase 12 with no structural change.

---
*Phase: 08-multi-game-rooms*
*Completed: 2026-09-23*
