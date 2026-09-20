---
quick_id: 20260919
slug: lobby-fireworks-redesign
status: complete
completed: 2026-09-19
---

# Summary: Hanabi lobby — fireworks backdrop + UI redesign

Owner request, verbatim: "Hanabi's loading zone is super ai-looking. Give it a
hanabi-esque background (fireworks), plus a better ui."

## What changed

- **`app/globals.css`** — new `.lobby-backdrop`: the table's own licence-verified
  `city-fireworks.webp` under a radial vignette + flat scrim (both rgba() derived from
  `--color-bg`). Same photo as the table on purpose, so starting the game reads as the
  panel clearing rather than a scene change.
- **`components/Lobby.tsx`** — one composed panel replacing two bare slabs:
  room code hero with an eyebrow label and share line → seat list → variant → start.
  Empty seats render as dashed "Open seat" placeholders, the section heading doubles as
  the waiting state, a `1 / 5` counter sits opposite it, and the variant picker is a
  three-up segmented control with a one-line blurb per variant. Renders `PhotoCredit`
  (CC BY attribution is required wherever the photo is shown).
- **`lib/lobby-seats.ts` + test** — pure `lobbySlots(seats, max)` padding the seat list
  to MAX_PLAYERS. Never truncates real seats.

## Deviations from the plan

- The seats heading became the waiting state ("Waiting for players" below minimum,
  "Players" otherwise) rather than a separate line. `host-room-controls.spec.ts` asserts
  a heading with that name after a host restart, and two competing headlines read badly.
- The variant radio is a transparent full-size input, not `sr-only`. A clipped 1x1
  sr-only input sits under the label's text spans, so e2e clicks hit the spans instead.
- Each radio carries an explicit `aria-label`, because the blurb otherwise joined the
  accessible name ("Rainbow + rainbow") and `getByRole("radio", { name: "Rainbow" })`
  then matched Rainbow and Black both.
- One new `--color-accent` use (the selected variant's border + label), consistent with
  SeatRow's existing accent self-ring. Zero new accent references in `globals.css`, so
  `theme-tokens.test.ts`'s pinned count is unchanged.

## Verification

- `vitest run --root apps/web`: 77 files, 1016 tests, all pass.
- `playwright test create-room join-room start-game host-room-controls in-progress-arrival`:
  24 specs, all pass. One run hit the known pre-existing "Create room stays disabled
  until hydration" flake on the landing page; it passes in isolation and is unrelated
  to this change (still open as remaining work).
- Screenshots for owner review: `lobby-1p.png` (waiting state), `lobby-2p.png` (startable).

## Not deployed

Committed locally only. Deploy needs the owner's go-ahead, per the standing rule.
