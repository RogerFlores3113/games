# Phase 4: Wire Engine Into Room Actor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-16
**Phase:** 04-wire-engine-into-room-actor
**Areas discussed:** Toy deletion and leak-coverage continuity, Engine wiring and wire schema, Exactly-once actions, Refusal reporting, The interim table, Proving it

Invoked as `/gsd-discuss-phase 4 --auto --chain`.
`[--auto] Selected all gray areas: Toy deletion and leak-coverage continuity, Engine wiring and wire schema, Exactly-once actions, Refusal reporting, The interim table, Proving it.`

---

## Toy deletion and leak-coverage continuity

| Option | Description | Selected |
|--------|-------------|----------|
| Delete the toy, repointing the wire-level leak tests to Hanabi in the same change | Keeps HIDE-01 evidence on the wire continuous; honours the deletion promised in Phases 2 and 3 | ✓ |
| Delete the toy and its leak tests, relying on the engine's own property tests | Would remove the only wire-level (encoded-frame and live-socket) redaction proof | |
| Keep the toy beside the engine | Two adapters, two schemas, dead code the roadmap already scheduled for removal | |

**User's choice:** [auto] Delete with repointed coverage (recommended default)
**Notes:** The structural chokepoint test stays as-is, with only its game-naming check repointed.

---

## Engine wiring and wire schema

| Option | Description | Selected |
|--------|-------------|----------|
| Swap `game-registration.ts` only; new strict `games/hanabi.ts` schema with subpath wiring; bump schema version | Uses the seam exactly as Phase 2 designed it; reset-on-mismatch for in-flight toy rooms | ✓ |
| Teach `room-state.ts`/`room-do.ts` about Hanabi directly | Erodes the game-agnostic seam FDN-01 exists to protect | |
| Reuse the generic `RoomViewSchema` without a game-specific schema | `game` is `z.unknown()`; a hidden card could regain a `suit` key unnoticed | |

**User's choice:** [auto] Registration-only swap (recommended default)
**Notes:** Subpath alias must precede the bare `@games/schema` alias in all four Vitest projects (prefix matching).

---

## Exactly-once actions (RT-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Client-minted opaque `actionId`; server records the last applied id per seat in persisted state; a repeat re-sends the current view | Survives hibernation; a retry after a dropped response looks like success | ✓ |
| Client sends an expected turn/state version | Turns the action into a state assertion — the HIDE-05 boundary this project deliberately holds | |
| Rely on the engine rejecting the repeat | Works for play/discard (card has left the hand) but a repeated clue is legal and spends a second token | |

**User's choice:** [auto] Idempotency key (recommended default)
**Notes:** `actionId` never reaches the adapter and carries no state. The test must double-send a **clue**, since that is the action naive idempotency misses.

---

## Refusal reporting

| Option | Description | Selected |
|--------|-------------|----------|
| Widen `ErrorDetailSchema` to a closed enum of rule-refusal reasons; map the adapter's typed errors onto it | Players learn why an action failed; error frames still carry no state and no free text | ✓ |
| Leave every refusal as `bad_request` | Player sees a dead control and no explanation | |
| Free-text detail from the engine | Reopens the state-bearing channel D-08 closed in Phase 2 | |

**User's choice:** [auto] Closed refusal enum (recommended default)

---

## The interim table

| Option | Description | Selected |
|--------|-------------|----------|
| Plain, throwaway playable board at toy fidelity; disable only what the view makes unambiguous | Phase 6 replaces it wholesale; cheap to discard | ✓ |
| Build toward the real Phase 6 design now | Duplicates design work before the contract exists, and invites attachment to it | |
| No UI; prove playability through tests only | Success criterion 1 is explicitly about players seeing each other's actions on screen | |

**User's choice:** [auto] Throwaway board (recommended default)
**Notes:** Engine legality predicates need full `HanabiState` and cannot run client-side; full RULES-11 treatment is Phase 6.

---

## Proving it

| Option | Description | Selected |
|--------|-------------|----------|
| Extend the existing Playwright specs against the real worker; double-send at socket level for RT-09; full suite + e2e as the phase gate | Matches the Phase 2/3 gate; RT-01 and RT-03 are inherently browser-level | ✓ |
| Unit/integration tests only | Cannot show an action appearing on another player's screen without a refresh | |
| New separate e2e harness | A second harness to maintain for no gain | |

**User's choice:** [auto] Extend existing specs (recommended default)

---

## Claude's Discretion

- Interim board component split and where action controls live
- `actionId` length/alphabet; whether more than one id per seat is retained
- Naming of the refusal-reason enum members
- Hand-written vs derived Hanabi view schema, provided it stays strict
- How e2e specs cope with a secret server-minted seed (assert relative change, not absolute identities)

## Deferred Ideas

- Mobile backgrounding, multi-tab, disconnected indicator (Phase 5)
- The designed board and RULES-11 (Phase 6)
- Rainbow/Black proven end to end (Phase 7)
- Turn-history UI (v2, QOL-01)
- Leak checker's self-derived baseline, Phase 3 review WR-01 (unscheduled)
