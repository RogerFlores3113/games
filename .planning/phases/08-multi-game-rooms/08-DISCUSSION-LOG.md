# Phase 8: Multi-Game Rooms - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-22
**Phase:** 08-multi-game-rooms
**Mode:** `--auto --chain`. The recommended option was selected for every area without prompting the owner.
**Areas discussed:** How the game reaches the room · Envelope and error shape · Proving the registry · Seat limits in the lobby · Persisted-state change · Create-room reliability

---

## How the game reaches the room

| Option | Description | Selected |
|--------|-------------|----------|
| Optional `gameId` on the host's first `join` | Recorded only on the room's first join (like `hostSeatId`); later joins can't change it; no new message | ✓ |
| `/api/room` pre-creates the room in the Worker | Adds a server-to-server Vercel → Worker call that v1.0 deliberately avoided | |
| New host-only `select_game` message | An extra wire message and a nullable-`gameId` window | |

**Choice:** `[auto]` recommended (ARCHITECTURE.md §1.3).

## Envelope and error shape

| Option | Description | Selected |
|--------|-------------|----------|
| `gameId` + opaque `config` (replacing `variant`); `set_variant` → `set_config`; errors namespaced `{ gameId, code }` | Truly generic; a third game adds nothing to shared enums | ✓ |
| `gameId` + keep `variant` as a nullable Hanabi field | Leaves Hanabi vocabulary in the shared envelope | |
| Flat merged error enum | Simplest, but grows with every game (Pitfall 17) | |

**Choice:** `[auto]` recommended. This resolves the research's open question on error namespacing.

## Proving the registry

| Option | Description | Selected |
|--------|-------------|----------|
| A test-only toy second game via a test-only injection point; production registry is Hanabi only | Proves genericity without shipping a dead option | ✓ |
| Register an Expedition stub in production now | Would expose an unplayable game (the owner rejected this at roadmap approval) | |

**Choice:** `[auto]` recommended. This is consistent with the owner's roadmap adjustment of 2026-09-22.

## Seat limits in the lobby

| Option | Description | Selected |
|--------|-------------|----------|
| `RoomView` carries the game's `{ min, max }` from the registry | The web app never duplicates registry data; fixes the hard-coded "Hanabi needs 2 to 5" copy | ✓ |
| A web-side copy of the registry | Two sources of truth | |

**Choice:** `[auto]` recommended. This came from the codebase scout (`Lobby.tsx` imports the global constants).

## Persisted-state change

| Option | Description | Selected |
|--------|-------------|----------|
| Bump the schema version to 5, reset old rooms, add a test that a v4 blob resets cleanly | Matches the owner's reset-on-deploy decision | ✓ |
| A rehydrate-old-rooms fixture test (research Pitfall 16 as written) | Assumes migration, which the owner rejected | |

**Choice:** `[auto]` recommended; the test was adapted to the owner's decision.

## Create-room reliability

| Option | Description | Selected |
|--------|-------------|----------|
| Progressive enhancement: a native form submit to a server endpoint that redirects; JS stays an enhancement; the share link stays clean | Removes the hydration wait at its cause | ✓ |
| Keep the hydration gate and speed up hydration | Treats the symptom; still slow on a slow phone | |
| Add retries or longer timeouts in e2e | Explicitly ruled out (fix at the cause) | |

**Choice:** `[auto]` recommended. The name/game carrier (a cookie, or a parameter stripped with `replaceState`) is left to the planner.

## Claude's Discretion

- Naming of the registry file and generics, the shape of the test-only toy game, where the global seat constants end up, and plan granularity.

## Deferred Ideas

- Expedition registry entry and `GameIdSchema` member: Phase 11. Picker enabled: Phase 12.
- Saved-room migration: rejected for this milestone.
