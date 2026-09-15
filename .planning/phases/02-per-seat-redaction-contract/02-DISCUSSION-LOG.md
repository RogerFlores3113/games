# Phase 2: Per-Seat Redaction Contract - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-15
**Phase:** 02-per-seat-redaction-contract
**Areas discussed:** Toy secret game shape, Wire-level enforcement, Chokepoint for all frames, Leak test strategy

The interactive gray-area selection was declined, and the user re-ran the command as `/gsd-discuss-phase 2 --auto --chain`.
`[--auto] Selected all gray areas: Toy secret game shape, Wire-level enforcement, Chokepoint for all frames, Leak test strategy.`

---

## Toy secret game shape

| Option | Description | Selected |
|--------|-------------|----------|
| Forehead card (Hanabi-shaped) | Each seat's card visible to others, hidden from owner; hidden deck; reveal-on-guess | ✓ |
| Private secret per seat | Each seat sees only its own secret (poker-shaped) — inverse of Hanabi's visibility | |
| Keep counter + add a secret field | Minimal diff, but no hidden→public transition to test | |

**User's choice:** [auto] Forehead card (recommended default)
**Notes:** Mirrors Hanabi's three visibility classes, so the redaction pattern transfers directly to Phase 4. Counter deleted per Phase 1 D-15; minimal playable UI kept.

---

## Wire-level enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Whitelist construction + strict Zod view schema on send, fail closed | Unknown keys rejected at the send site; rules package stays zero-dep | ✓ |
| Branded TS types only | Compile-time only; no runtime guard on the wire | |
| Trust the adapter | No enforcement beyond code review | |

**User's choice:** [auto] Whitelist construction + strict Zod view schema, fail closed (recommended default)

---

## Chokepoint for all frames

| Option | Description | Selected |
|--------|-------------|----------|
| Single `#send` method + structural Vitest source test | One `connection.send` site, one `toSeatView` site, zero `broadcast` — enforced in the test suite | ✓ |
| Type brand only | Relies on types; no guard against a raw `connection.send` of an ad hoc object | |
| Lint rule | Extra tooling for a rule a grep test already covers | |

**User's choice:** [auto] Single `#send` + structural source test (recommended default); type brand left to Claude's discretion as an add-on.

---

## Leak test strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Layered: fast-check at adapter + encoded-wire level, plus wrangler-dev frame capture, plus canary | Covers pure projection, the actual serialized string, and real join/update/reconnect frames | ✓ |
| Adapter-level example tests only | Misses the send path and reconnect | |
| Playwright network capture | Slow, browser-bound; wrangler-dev capture already hits the real wire | |

**User's choice:** [auto] Layered (recommended default)
**Notes:** Checker must detect key presence (`value: null`/`undefined`), not only true values; fixtures must avoid secret/number collisions.

---

## Claude's Discretion

- Exact toy rules (value range, deck composition, scoring)
- Module location/naming for toy adapter and its view schema
- Generifying adapter typing in room-state.ts
- Optional branded projection type
- fast-check run counts
- Minimal toy UI layout

## Deferred Ideas

- Playwright network-payload capture test
- Distinguishing adapter refusal reasons on the wire
