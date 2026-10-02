---
phase: 12-phaser-shell
plan: 14
status: complete
outcome: changes-requested
---

# 12-14 Summary: phase gate and owner review

## Gate

Typecheck, 1,740 unit tests, 21 Expedition and create-room e2e tests, the production
build and `check:expedition-build` all passed (see the plan's Task 1).

## Owner review (2026-10-02)

Owner was not able to sign off. In their words, "the bones are there... but it's not
really clear what to do from the ui alone, which is a side effect of wanting images to
represent things but then using stub images as placeholders. Also the positions are
off - things are covered."

Gaps recorded from the review screenshot:

1. No on-screen instruction for the expected action.
2. Placeholder shapes (crates, fireflies, lantern, fire, mascot, centre "8?- A?-")
   carried meaning nobody could read.
3. "Signal …" gear labels truncated.
4. The opponent's sign drawn over its name plate.
5. Gear tooltip, gear chip and targeting box drawn over the hand.
6. An 18-card hand leaving no room for your own gear and objectives.
7. The seat card-back counter clipping its own number.

## Resolution

The owner switched the remaining work to `/poteto-mode`. The gaps were fixed outside
GSD:

- `docs/superpowers/specs/2026-10-02-expedition-camp-layout.md` set non-overlapping
  zones, an always-present prompt line and text labels on every value.
- `af5a4a9` added a tour harness (`npm run tour:expedition`) that screenshots every
  phase and audits overlaps. The baseline was 71 overlaps at 1920x1080.
- `d2e4e4d` and `f472c7e` rebuilt the camp layout. The tour reports 0 overlaps at
  1920x1080 and 1280x720 in every phase.

Owner re-review of the new layout is still pending, and happens together with the
art review.
