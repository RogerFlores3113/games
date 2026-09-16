# Phase 5: Reconnect & Session Durability Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-16
**Phase:** 05-reconnect-session-durability-hardening
**Mode:** `--auto --chain` (all areas auto-selected; recommended option chosen for each)
**Areas discussed:** Dead-connection detection, Reconnecting-player UX, Absent-player indicator & pause, Two tabs one seat, Proof strategy

---

## Dead-connection detection

| Option | Description | Selected |
|--------|-------------|----------|
| Visibility/online-triggered reconnect + client heartbeat + DO auto-response + server zombie sweep | Fast resume, catches half-open sockets both sides, hibernation-safe | ✓ |
| Rely on partysocket backoff alone | No new code; up to 30s wait, half-open sockets undetected | |
| Server-driven pings via `#send` | Wakes the DO on every ping and breaks the single-chokepoint counts | |

**User's choice:** [auto] Option 1 (recommended default)

## Reconnecting-player UX

| Option | Description | Selected |
|--------|-------------|----------|
| Keep last view with a "Reconnecting…" banner, controls disabled, no action replay | Table stays readable; the server stays the authority | ✓ |
| Fall back to the full-screen "Connecting…" page | Simple, but blanks the board on every blip | |
| Queue and replay actions after reconnect | Risks applying a stale intent to a changed table | |

**User's choice:** [auto] Option 1 (recommended default)

## Absent-player indicator & pause

| Option | Description | Selected |
|--------|-------------|----------|
| Per-seat status on the board, explicit "waiting for X — disconnected", no rule changes | Matches RT-06 "pauses in place"; honours the no-auto-release rule | ✓ |
| Skip a disconnected player's turn after a timeout | Changes game rules; new capability | |
| Allow others to act for the absent seat | Out of scope, breaks hidden information | |

**User's choice:** [auto] Option 1 (recommended default)

## Two tabs, one seat

| Option | Description | Selected |
|--------|-------------|----------|
| Keep newest-wins, add a "Use this tab" reclaim button, prove no corruption | Covers the phone/laptop handoff; user-driven so no ping-pong | ✓ |
| Oldest tab wins, refuse the new tab | Strands a user whose old tab is a dead phone | |
| Allow both tabs bound to one seat | Complicates the chokepoint and dedup; no user value | |

**User's choice:** [auto] Option 1 (recommended default)

## Proof strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Playwright (offline + lifecycle freeze) + socket harness + documented manual phone check | Automated where fakeable, manual for real OS suspension (Phase 1 precedent) | ✓ |
| Automated only | Cannot faithfully reproduce 10+ min mobile suspension | |
| Manual only | Regressions would go unnoticed | |

**User's choice:** [auto] Option 1 (recommended default)

## Claude's Discretion

- Heartbeat, timeout and staleness constants; ping literal strings; store shape and banner wording; reclaim mechanics; Playwright backgrounding mechanism.

## Deferred Ideas

- Vote to skip or remove a player who never returns
- Styled board connection indicators (Phase 6)
- Turn notifications while backgrounded
