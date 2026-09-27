# Phase 12: Phaser Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-27
**Phase:** 12-phaser-shell
**Areas discussed:** Draft/loadout/Whisper before fireside, In-game chrome & host controls, Canvas fit & resolution, Placeholder art & sign-off bar

---

## Draft/loadout/Whisper before fireside

| Option | Description | Selected |
|--------|-------------|----------|
| Bare functional stub | Plain in-canvas pick-3 / toggle-into-slots / Ready; Phase 13 replaces | ✓ |
| Rough fireside now | Build real fireside structure with placeholder art | |
| HTML overlay stub | React panel over canvas | |

| Option | Description | Selected |
|--------|-------------|----------|
| Click item, highlight targets, confirm | Targets glow, Confirm/Cancel near item; Whisper same flow | ✓ |
| Confirm by clicking item again | Fewer UI pieces, less discoverable | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Glow + small in-world cue | Acting seats glow, gear pulses, wooden sign label; pre-deal Use/Skip | ✓ |
| Glow only | No labels | |
| Banner text strip | One-line status strip | |

| Option | Description | Selected |
|--------|-------------|----------|
| Face-up mini card at the owner's seat | Tagged by source, stays until camp end | ✓ |
| Brief pop, then a peek list | Hover a known-cards pile | |
| You decide | | |

---

## In-game chrome & host controls

| Option | Description | Selected |
|--------|-------------|----------|
| Small HTML gear-icon menu over canvas | Reuse Hanabi SettingsModal pattern | ✓ |
| In-world object | Pixel-art menu in scene | |
| Both: world trigger, HTML menu | Lantern opens HTML modal | |

| Option | Description | Selected |
|--------|-------------|----------|
| Hover/hold a 'last trick' pile | Fans out in place | ✓ |
| Click to toggle | Shows in centre | |
| Always visible mini-row | Permanent row | |

| Option | Description | Selected |
|--------|-------------|----------|
| No audio yet, mute control stubbed | Sound with art pass | ✓ |
| Basic SFX now | Placeholder sounds | |
| Leave audio out entirely | No toggle | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dimmed seat + small sleeping icon | In-world | ✓ |
| Reuse Hanabi-style HTML badge | | |
| You decide | | |

---

## Canvas fit & resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed 16:9 stage, integer scale, letterbox | Crisp, one layout | ✓ |
| Fixed 16:9, fractional scale | Uneven pixels | |
| Fill window, re-layout | More layout logic | |

| Option | Description | Selected |
|--------|-------------|----------|
| 640×360 stage | 2×/3×/4× at 720p/1080p/1440p | ✓ |
| 1280×720 stage, art at 2× | Not integer at 1080p | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Drop to 1× and still play | Hint to enlarge | ✓ |
| Fractional downscale below minimum | | |
| Block with 'window too small' | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Bitmap pixel font on the stage | Crisp, consistent | ✓ |
| Crisp HTML/hi-res text layered on top | Mixed look | |
| You decide | | |

---

## Placeholder art & sign-off bar

| Option | Description | Selected |
|--------|-------------|----------|
| Clean flat shapes + labels | Real code-drawn card packs | ✓ |
| Quick temp sprites from CC0 packs | Early licensing work | |
| Your red panda + shapes | Mascot sprite now | |

Sign-off criteria (multi-select):

| Option | Selected |
|--------|----------|
| Glance-readable state | ✓ |
| Played on a real 3-player table | ✓ |
| Checked at 1×, 2× and 3× | ✓ |
| Both card packs compared | |

| Option | Description | Selected |
|--------|-------------|----------|
| Simple effect now | Placeholder rain/dark-sky per twist | ✓ |
| Text marker only | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| All reactions, placeholder visuals | | |
| Click bubble only | Event reactions with art pass | ✓ |
| Use your PixelLab panda sprite now | | |

---

## Claude's Discretion

- Visible "why not" reason for unusable gear (GEAR-06 UI half) — hover-style, no panels
- Card motion/animation between scene models
- Hand sorting and fan layout
- Objective-pick interaction at the table
- Letterbox colour and enlarge-hint styling
- Test bridge internals and production compile-out mechanism

## Deferred Ideas

- Mascot game-event reactions — Phase 14
- Sound — Phase 14
- Phase 11 leak-checker hardening WR-01..04 — separate hardening task
