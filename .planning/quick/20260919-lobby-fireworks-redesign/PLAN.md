---
quick_id: 20260919
slug: lobby-fireworks-redesign
status: in-progress
created: 2026-09-19
---

# Quick task: Hanabi lobby — fireworks backdrop + UI redesign

**Owner request (2026-09-19):** "Hanabi's loading zone is super ai-looking. Give it a
hanabi-esque background (fireworks), plus a better ui."

The pre-game lobby (`/room/[code]` while `view.status === "lobby"`) is a flat
`--color-bg` page with two unstyled `--color-surface` slabs, browser-default radio
buttons, and a single seat row floating in a large empty panel. Everything else in the
app (landing page, table) has a photographic backdrop; the lobby was never given one.

## Scope

1. **Backdrop.** New `.lobby-backdrop` rule in `globals.css` reusing the already
   licence-verified `city-fireworks.webp` (the table's photo, so the lobby reads as the
   room you are about to play in), with its own scrim + vignette so panel text keeps
   WCAG AA. Renders `<PhotoCredit theme="dark" credit={TABLE_IMAGE_CREDIT} />` — the
   CC BY credit is required wherever the photo is shown.
2. **Lobby UI.** One composed panel instead of two bare slabs:
   - room code as the hero, with an eyebrow label and the Copy link button;
   - seat list showing all `MAX_PLAYERS` slots — filled seats plus dashed "Open seat"
     placeholders, so 2-5 is legible at a glance;
   - variant picker as a segmented control (real radios kept, visually restyled);
   - Start game with a live "N of 2-5 players" helper.

## Constraints

- Keep `data-testid`: `room-code`, `seat-list`, `seat-row`, `variant-picker`,
  `start-game`, `photo-credit`.
- Keep real `<input type="radio">` with accessible names Base/Rainbow/Black —
  `e2e/start-game.spec.ts` and `create-room.spec.ts` use `getByRole("radio", {name})`.
- No readiness toggle or ready column (D-10/D-11 — deliberately cut).
- Zero new `--color-accent` references inside `globals.css`
  (`lib/theme-tokens.test.ts` pins the count).
- Host-only controls stay host-only (ROOM-05): joiners never see the variant picker.
- Empty-seat placeholders are presentational only — `seat-row` testid belongs to real
  seats, so placeholders must NOT carry it (`expectSeatCount` counts seat rows).

## Tasks

1. `lib/lobby-seats.ts` + unit test: pure `lobbySlots(seats, max)` returning filled and
   open slots.
2. `globals.css`: `.lobby-backdrop`.
3. `components/Lobby.tsx`: redesign against the above.
4. Gate: vitest + `npx playwright test start-game create-room`, then screenshot for the
   owner.
