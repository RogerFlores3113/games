---
status: complete
phase: 08-multi-game-rooms
source: [08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md, 08-06-SUMMARY.md, 08-07-SUMMARY.md, 08-08-SUMMARY.md, 08-09-SUMMARY.md, 08-10-SUMMARY.md]
started: 2026-09-23T18:24:01Z
updated: 2026-09-24T04:37:44Z
---

## Current Test

[testing complete]

## Tests

### 1. Landing page game picker
expected: With the app running locally (npm run dev for web + worker), open the landing page. The game picker lists Hanabi as selectable and "Expedition - coming soon" as a greyed-out, unselectable option. There is no Innovation option. The "Create room" button is visible and clickable right away, even before you pick a game.
result: pass

### 2. Game settings appear for the chosen game
expected: Selecting Hanabi in the picker reveals its variant settings (Base / Rainbow / Black radio buttons). With no game selected, no settings fieldset is shown.
result: pass

### 3. Create a Hanabi room with a non-default variant
expected: Enter a name, pick Hanabi, choose Rainbow, click "Create room". You land in the room's lobby seated under your name. The lobby names Hanabi, shows Rainbow selected in the host settings, and the player-count copy reflects Hanabi's 2–5 limit. The room URL contains only the room code (no name or variant in the link).
result: pass

### 4. Create room works without JavaScript
expected: Disable JavaScript in the browser (DevTools → Run command → "Disable JavaScript"), reload the landing page, fill in name / Hanabi / Black, and click "Create room". The browser navigates to the room; after re-enabling JS and reloading, you are seated under your name with Black selected. (Skip if impractical.)
result: skipped
reason: user skipped (impractical); during this step user requested lobby copy edits — removed "Anyone with the link can take a seat — no account needed." and trimmed "— share the code above." (applied inline, uncommitted)

### 5. A friend joins via the shared link
expected: Open the room link in a second browser/profile (or private window), enter a name, and join. Both windows show two seated players. The second player does NOT see the host's variant settings section.
result: pass

### 6. Host changes the variant in the lobby
expected: In the host window, switch the variant (e.g. Rainbow → Black). The change appears in the host's picker immediately and the game uses the new variant when started. While the host's connection is reconnecting (e.g. stop the worker briefly), the variant radios are disabled.
result: pass

### 7. Seat limit enforced
expected: Joining the same Hanabi room from a 6th browser/profile is refused as full; the first five seats are unaffected. (Skip if impractical.)
result: skipped
reason: impractical to open 6 browsers manually; seat-full refusal is covered by room-state.test.ts and registry.test.ts

### 8. Hanabi plays exactly as before
expected: Start the game with 2+ players. The Hanabi board renders; giving clues, playing, and discarding all work as they did before Phase 8, including the Rainbow/Black variant's card behavior. You never see your own cards' identities.
result: pass

### 9. Refresh mid-game keeps your seat
expected: During an in-progress game, refresh one player's tab. It reconnects to the same seat with the same hand and game state; the other player sees them briefly disconnected and then back.
result: pass

## Summary

total: 9
passed: 7
issues: 0
pending: 0
skipped: 2
blocked: 0

## Gaps

[none yet]
