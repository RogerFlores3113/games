---
status: complete
phase: 04-wire-engine-into-room-actor
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md, 04-06-SUMMARY.md, 04-07-SUMMARY.md, 04-08-SUMMARY.md]
started: 2026-09-16T12:00:00Z
updated: 2026-09-16T12:50:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Stop any running web/worker dev servers. Start the worker (wrangler dev) and the web app (next dev) from scratch. Both boot without errors, and loading the homepage lets you create a room that opens the lobby.
result: pass

### 2. Start a Hanabi Game From the Lobby
expected: With two browsers (one normal, one private) seated in the same room, the host picks a variant and starts the game. Both browsers switch from the lobby to the Hanabi board (not the old forehead-card toy), showing clue tokens, fuses, deck count, played stacks, discard pile, and a turn indicator.
result: pass

### 3. Own Hand Hidden, Other Hands Face Up
expected: Each player sees the other player's hand with suit and rank visible, but their own hand shows only card slots (with any clue facts), never the card identities.
result: pass

### 4. Give a Clue — Live Propagation
expected: On the active player's turn, giving a color or rank clue updates the OTHER browser without a reload: clue tokens drop by one, the turn indicator moves to the other player, and the clued cards show the clue fact in the receiver's own hand.
result: pass

### 5. Play and Discard
expected: Playing a card moves it to the matching played stack (or costs a fuse and goes to the discard pile if unplayable); discarding moves it to the discard pile and restores a clue token. Deck count drops and a replacement card appears. Both browsers update live.
result: pass

### 6. Disabled Controls
expected: When it's not your turn, play/discard/clue controls are disabled. With 0 clue tokens, giving a clue is disabled; with all 8 tokens, discard is disabled. Rainbow is not offered as a nameable clue color in the Rainbow variant.
result: pass

### 7. Mid-Game Reload Keeps the Seat
expected: Reloading either browser mid-game returns to the same seat and the same board — own-hand slots, clue tokens, deck count, and turn indicator identical to before — with no refusal card or lobby shown.
result: pass

### 8. No Own-Card Identity in Raw WebSocket Frames
expected: In DevTools → Network → WS, the frames a player receives list their own hand's cards with only id/hidden/facts — no suit or rank keys — while other players' cards do carry suit and rank.
result: skipped
reason: "User did not inspect raw frames (\"dont care\"); covered by automated redaction-wire tests and the 04-08 manual frame check"

### 9. Game End Shows Score and Band
expected: When the game ends (3 fuses lost, deck runs out and the final round completes, or all stacks complete), both browsers show the end-of-game state with the final score and its score band, and action controls are no longer usable.
result: pass

### 10. Fuse Counter Direction (found during Test 3)
expected: The fuse counter reads as fuses remaining — it starts at 3 and counts down, and the game ends when it reaches 0.
result: issue
reported: "\"fuses left\" starts a 0 and counts up - at 3 it's game over. It should be reversed - start at 3, at 0 it's game over"
severity: minor

## Summary

total: 10
passed: 8
issues: 1
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "The fuse counter reads as fuses remaining — starts at 3, counts down, game over at 0"
  status: failed
  reason: "User reported: \"fuses left\" starts a 0 and counts up - at 3 it's game over. It should be reversed - start at 3, at 0 it's game over"
  severity: minor
  test: 10
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
