# Phase 6: Game Interface - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-16
**Phase:** 06-game-interface
**Mode:** `--auto --chain` — all gray areas auto-selected; recommended option chosen for each, no user prompts.
**Areas discussed:** Table layout, Suit identity system, Luminosity as signal, Own-hand clue memory, Action interaction, End of game, Animation & dependencies

---

## Table layout

| Option | Description | Selected |
|--------|-------------|----------|
| Three-band (teammates top, tableau middle, own hand bottom) | Everything visible at once on desktop | ✓ |
| Circular seating around a central table | Physical-table feel, harder at 5 players | |
| Sidebar tableau + hands column | Denser, tableau less central | |

**User's choice:** [auto] Three-band layout (recommended default)

## Suit identity system

| Option | Description | Selected |
|--------|-------------|----------|
| Unique glyph shape + hue on every suit reference, all 7 suits defined now | Always-on colourblind safety; Phase 7 only tests | ✓ |
| Letter abbreviations | Simpler, less legible at a glance | |
| Pattern fills | Competes with luminosity channel | |

**User's choice:** [auto] Glyph + hue, inline SVG, all suits now (recommended default)

## Luminosity as signal

| Option | Description | Selected |
|--------|-------------|----------|
| Three discrete steps (unclued / touched / fully known) via frame glow | Glanceable, hue-independent | ✓ |
| Continuous brightness by candidate count | More information, less legible | |
| Luminosity on own hand only | Loses "what teammates know" signal | |

**User's choice:** [auto] Three discrete steps on all hands (recommended default)

## Own-hand clue memory

| Option | Description | Selected |
|--------|-------------|----------|
| Positive marks prominent + compact candidate strip with ruled-out values struck | Uses possibleSuits/possibleRanks; shows both positive and negative | ✓ |
| Raw clue lists only (Phase 4 interim) | Doesn't narrow candidates | |
| Hover-only detail | Violates always-visible memory aid | |

**User's choice:** [auto] Candidate strip + positive marks, also on teammates' cards, transient highlight on new clues (recommended default)

## Action interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Select-then-act, clue preview highlights touched cards, disabled with reasons | Low friction, visible legality | ✓ |
| Confirmation dialog for every action | Safer, slower | |
| Drag-and-drop to stacks/discard | Heavier, poor keyboard access | |

**User's choice:** [auto] Select-then-act without confirm (recommended default)

## End of game

| Option | Description | Selected |
|--------|-------------|----------|
| Overlay over final board with score, band, stacks, "New game" link | Keeps final table visible | ✓ |
| Separate end page | Loses board context | |
| Overlay with in-room rematch | New capability — deferred | |

**User's choice:** [auto] Overlay, new-room link only (recommended default)

## Animation & dependencies

| Option | Description | Selected |
|--------|-------------|----------|
| CSS transitions by default, `motion` optional | No required new dependency | ✓ |
| Adopt `motion` for all card movement | Richer, more scope | |

**User's choice:** [auto] CSS-first (recommended default)

## Claude's Discretion

Glyph shapes, hue values, glow styling, component split, copy wording, highlight timing, discard pile grouping, whether to run `/gsd-ui-phase 6` before planning.

## Deferred Ideas

In-room rematch; clue log panel (QOL-01); card-flight animation; mobile table (MOB-01/02); sound cues (QOL-02).
