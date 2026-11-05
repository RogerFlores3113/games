---
quick_id: 20261105a
slug: expedition-round1-fixes
status: complete
created: 2026-11-05
---

# Quick task: Expedition round 1 playtest fixes

**Owner ask (2026-11-05):** run an agent review and playtests of Expedition in dev mode, then
"send in the fixers"; no new art (no PixelLab yet), so placeholders only.

## Source

An 11-agent playtest (6 personas, a 4-player group, 1 solo) against the real dev worker, plus an
18-run all-bot baseline. Results doc: "Expedition: Review and Playtest Results" (Claude Doc).

## Changes (one fixer per unit, merged on claude/project-thread-w9cy21)

- Difficulty: +1 seat objective per camp at 4 players, +2 at 5 (`EXTRA_OBJECTIVES_BY_PLAYERS`);
  mixed slots from camp 3 at 4+ players; the first lead of a camp can't be the Sun or Moon unless
  the leader holds nothing else (`no_joker_first_lead`).
- Heavy Pack's extra failure cost counts once per crew; the loadout prompt warns when one is equipped.
- Economy: payout 5, +2 off plain ground, +2 in bad weather, +1 per unplayed trick up to 2; route
  cards show the range; a Short run also shops before camp 3 (`SHOP_CAMPS`).
- Stage order before a shop camp: draft, event, route, shop, loadout.
- Events: Abandoned camp, Fresh spring, Dropped pack replace the Quiet trail stub.
- Camp recap: `RunState.lastAttempt` / view `lastCamp`; the signboard names the failed objective and
  the supply cost by source; the trail shows the last camp.
- Hold on: any non-leader may hold the next lead once per gap; refused actions now show a message.
- Rules text and copy: Sun/Moon suit, off-plate temple leads, Bait ties, whisper timing, replays skip
  the draft, Camouflage, Magma, Pack Mule, Bottom Line, Clifftop never Fair, route dedupe, Pack Rat
  offer label, Magician swap/whisper count.

## Placeholders (need real art)

- `apps/web/components/expedition/phaser/draw/draw-trail.ts`: recap panel (text on a plate).
- `apps/web/components/expedition/phaser/draw/draw-controls.ts`: Hold on button icon (text only).

## Verification

`npx tsc -b` clean; vitest schema 195, rules 1824, web 1298, worker 333 pass. No Playwright run
(no browser in the environment); `e2e/expedition-bosses.spec.ts` step count changed and needs a
real run. Dev-mode smoke run played end to end through the text harness.

## Bot baseline (18 Short runs each, harness bots that never whisper or use powers)

| | Wins | Camp 1 first try | Camp 1 ever | Camps cleared per run |
|---|---|---|---|---|
| 3p before | 0/12 | 6/12 | 10/12 | 1.17 |
| 3p after | 0/12 | 4/12 | 9/12 | 0.92 |
| 4p before | 0/6 | 1/6 | 4/6 | 0.83 |
| 4p after | 0/6 | 0/6 | 1/6 | 0.17 |

The bots got worse everywhere, most at 4 players. Humans found 4 players trivial, so a human
4-player replay should calibrate the +1 objective before it ships.
