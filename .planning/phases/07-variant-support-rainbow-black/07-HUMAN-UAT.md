---
status: pending
phase: 07-variant-support-rainbow-black
source: [07-05-PLAN.md Task 1/Task 2, 07-CONTEXT.md "Ask the owner directly at sign-off", 07-06/07-07/07-08 gap closure]
started: 2026-09-18T23:30:16Z
updated: 2026-09-19T02:07:54Z
---

**The automated gate is fully green** — 967/967 unit tests, 62/62 e2e tests, a clean typecheck across all four projects, and no new hex-literal regressions. Everything below is a visual or interaction judgement none of those tests could catch; nothing here indicates a gate regression.

## Gate results (Task 1, run fresh from repo root after killing the full 3100/8787 process trees by PID)

Port-kill: `ss -ltnp` identified the two dev-server listeners (`next-server`, pid 968953, cwd `/home/rflor/games/apps/web`, listening on 3100; `workerd`, pid 969116, cwd `/home/rflor/games/apps/worker`, listening on 8787). Walked each up to its process-group root (`sh -c next dev -p 3100` at pid 968940; `wrangler dev --port 8787` at pid 969086) and killed the full tree (`pkill -TERM -P`, then `kill -TERM` the root, then a `-KILL` sweep). Confirmed via `ss -ltnp` that 3100 and 8787 were empty afterward. The unrelated `/tmp/games-preexisting` pair (workerd pid 588228 on port 8788, cwd confirmed via `/proc/588228/cwd` before any kill decision; its 3101 web counterpart was not running at check time) was left untouched.

| Command | Result |
|---|---|
| `npm test` | **PASS** — 76 test files, 967/967 tests passed (83.81s) |
| `npx playwright test` | **PASS** — 62/62 tests passed (53.1s), 0 flaky, 0 retries |
| `npx tsc -b apps/web packages/rules packages/schema apps/worker` | **PASS** — exit 0, no diagnostics |
| no-hex guard: `grep -rnE "#[0-9A-Fa-f]{6}\b" apps/web/components apps/web/lib --include=*.tsx --include=*.ts` | **PASS** — only pre-existing matches in `note-box-render.test.ts`, `settings-modal-render.test.ts`, `tile-color.test.ts` (the user-facing tile-colour-picker feature predates this phase; no new matches introduced) |

All commands were run once each, in sequence, with no retries needed — no flake occurred this run.

## Current status

Dev servers are up (`npm run dev --workspace apps/web -- -p 3100` with `NEXT_PUBLIC_WORKER_HOST=localhost:8787`, `NEXT_PUBLIC_HEARTBEAT_INTERVAL_MS=1000`, `NEXT_PUBLIC_HEARTBEAT_PONG_TIMEOUT_MS=1000`; and `npx wrangler dev --port 8787 --var SOCKET_STALE_MS:5000 --var ZOMBIE_SWEEP_INTERVAL_MS:1000` under `apps/worker` — matching `playwright.config.ts`'s own `webServer` invocation exactly) and left running in the background for the owner's review.

- Web: http://localhost:3100
- Worker: ws(s) target `localhost:8787` (dialed automatically by the web app; nothing to open directly)

## Sign-off checklist prepared for the owner

1. Open http://localhost:3100 in two or three browser windows at 1280x720, create a room, choose Rainbow, seat everyone, start.
2. On your turn, click a teammate's rainbow tile. Confirm the popover shows Red, Yellow, Green, Blue, White in their own colours with the bold number below, and no "Rainbow" option (**D-05**). If a rainbow tile sits at the far left or right of a hand, confirm the popover stays fully on screen and nothing on the board moves.
3. Click one colour. On the receiver's screen, the rainbow tile and every tile of that colour get that colour's ring and pulse (**D-09/D-10**).
4. Confirm rainbow tiles read clearly as rainbow and are clearly different from the violet turn highlight (**D-12**).
5. Confirm there is no variant label on the board (owner answer 3, D-15 context).
6. Play a Rainbow game to the end: the end overlay reads "/ 30".
7. Start a Black game: a black tile's popover shows a single "Black" button (**D-08**); Black is still silver with its double-ring burst (**D-15**); play to the end, "/ 30"; nothing warns about last copies and the game ends only on fuses, a perfect score or the final round (**D-13/D-14**).
8. Play one base game to the end: "/ 25".

## Owner's verbatim reply

*(pending)*

## Owner's verbatim reply (2026-09-18)

"black mode should have rainbows in it."

Clarified in a follow-up, verbatim: "black variant has 5 colors + rainbow + black. do not adjust number of rainbow tiles."

result: issues

## Gaps

1. **The Black variant must contain Rainbow as well.** Black is 7 suits: the five normal colours, plus Rainbow at its normal copy counts (three 1s, two each of 2/3/4, one 5 — exactly as in the Rainbow variant), plus Black at a single copy of each rank. That is 65 tiles and a maximum score of 35. Rainbow keeps its Rainbow-variant rules inside Black: every colour clue touches it, and it cannot be named. Black remains its own nameable colour clue.
   - This supersedes RULES-03's "Black (6)" suit count.
   - The board must fit 7 suit columns. `MAX_SUITS` is currently 6, and the 1280x720 floor has about 10px of slack.
   - The owner's earlier answers still hold: Black keeps its silver colour, and there is no variant label.
   - Fix implemented in 07-06 (board widened for a 7th column, tiles unchanged) and 07-07 (7-suit Black engine + six-colour rainbow row); awaiting owner verification.

## Gap closure 07-06..07-08 — gate results

Port-kill (run fresh from repo root, 2026-09-19): `ss -ltnp` identified the two repo dev-server listeners (`next-server`, pid 1000857, cwd `/home/rflor/games/apps/web`, listening on 3100; `workerd`, pid 1000677, cwd `/home/rflor/games/apps/worker`, listening on 8787). Walked each up to its process-group root (pgid 1000832 for the web listener, pgid 1000636 for the worker listener) and sent `SIGTERM` to the group then the pid. Confirmed via `ss -ltnp` afterward that 3100 and 8787 were empty. The unrelated `/tmp/games-preexisting` pair (`workerd` pid 588228, cwd confirmed via `/proc/588228/cwd` = `/tmp/games-preexisting/apps/worker (deleted)`, listening on 8788) was left untouched; no process was found listening on 3101 at check time.

| Command | Result |
|---|---|
| `npm test` | **PASS** — 76 test files, 976/976 tests passed (83.99s) |
| `npx playwright test` | **PASS** — 65/65 tests passed (52.1s), 0 flaky, 0 retries |
| `npx tsc -b apps/web packages/rules packages/schema apps/worker` | **PASS** — exit 0, no diagnostics |
| no-hex guard: `grep -rnE "#[0-9A-Fa-f]{6}\b" apps/web/components apps/web/lib --include=*.tsx --include=*.ts` | **PASS** — only the same pre-existing matches as the 07-05 gate: `note-box-render.test.ts`, `settings-modal-render.test.ts`, `tile-color.test.ts` |

All commands were run once each, in sequence, with no retries needed — no flake occurred this run. Test/e2e counts grew from the 07-05 gate (967 -> 976 unit tests, 62 -> 65 e2e tests) reflecting the new coverage added by 07-06 (board-fit-black.spec.ts) and 07-07 (variant-black.spec.ts plus updated Black-variant assertions across rules and web). No fixes were needed — nothing in this gate run regressed from 07-06/07-07.

### Board fit (1280x720, 5 seats, Black)

| Metric | Before (07-06 baseline, MAX_SUITS=6) | After (07-06/07-07, MAX_SUITS=7, engine dealing 7 suits) |
|---|---|---|
| Rank slot (tile) size | 50 x 65px | 50 x 65px (unchanged) |
| Play region width | 328px | 382px |
| Tableau width | 619px | 673px |
| Free horizontal width (1280 - tableau) | 661px | 607px |
| Suit columns rendered | 6 | 7 (red, yellow, green, blue, white, rainbow, black) |
| Token/deck/discard region widths (clue/fuse/deck/discard) | 58 / 27 / 54 / 130px | 58 / 27 / 55 / 130px |
| scrollWidth / innerWidth @1280 | 1280 / 1280 (no scroll) | 1280 / 1280 (no scroll) |
| scrollHeight / innerHeight @1280 | 720 / 720 (no scroll) | 720 / 720 (no scroll) |
| Fit at 1024 wide | no horizontal overflow, all columns inside Play region | no horizontal overflow, all columns inside Play region |

Source: 07-06-SUMMARY.md (before/after BOARD-FIT-BLACK measurements) and 07-07-SUMMARY.md (after measurement with the engine genuinely dealing 7 suits — byte-identical geometry to 07-06's "after" row, confirming 07-07 added zero layout change of its own).

### Popover fit (Black, six-colour rainbow row)

From `e2e/variant-black.spec.ts` (`BLACK-POPOVER-FIT`, 1280x720, 5 seats, reconfirmed this run at line matching the above Playwright pass):

- Row width (W): **272px**
- Leftmost visible teammate tile x: **89px** → left-anchored flip fits (`272 <= 1280 - 89 = 1191`)
- Rightmost visible teammate tile edge (x + width): **1127 + 64 = 1191px** → right-anchored flip fits (`272 <= 1191`)
- Both edge-fit checks and the live in-viewport boundingBox assertion passed this run (`leftFit=true rightFit=true`)

## Current status

Dev servers were restarted after the gate, matching `playwright.config.ts`'s own `webServer` invocation exactly:
- Web: `NEXT_PUBLIC_WORKER_HOST=localhost:8787 NEXT_PUBLIC_HEARTBEAT_INTERVAL_MS=1000 NEXT_PUBLIC_HEARTBEAT_PONG_TIMEOUT_MS=1000 npm run dev --workspace apps/web -- -p 3100`
- Worker: `npx wrangler dev --port 8787 --var SOCKET_STALE_MS:5000 --var ZOMBIE_SWEEP_INTERVAL_MS:1000` (cwd `apps/worker`)

Confirmed listening via `ss -ltnp` (3100, 8787), left running in the background for the owner.

- Web: http://localhost:3100
- Worker: ws(s) target `localhost:8787` (dialed automatically by the web app; nothing to open directly)

## Sign-off checklist for the 7-suit Black variant (prepared for the owner)

1. Open http://localhost:3100 in two or three browser windows at 1280x720 (five if you want the tightest board). Create a room, choose Black, seat everyone, start.
2. The Play area shows seven columns in the order red, yellow, green, blue, white, rainbow, black. The board is a little wider than before, tiles are the same size as in Rainbow and base, and nothing scrolls or is cut off.
3. On your turn, click a teammate's rainbow tile. The popover shows Red, Yellow, Green, Blue, White and Black in their own colours, with the bold number below and no "Rainbow" option. If the rainbow tile sits at the far left or right of a hand, the popover stays fully on screen and nothing on the board moves.
4. Click Black on that rainbow tile. On the receiver's screen, the rainbow tile and every black tile get Black's ring and pulse.
5. Click a teammate's black tile. It shows a single "Black" button. Black is still silver with its double-ring burst, and there is no variant label anywhere on the board.
6. The deck counter at the start reflects a 65-tile deck (65 minus the dealt hands). Play the Black game to the end: the end overlay reads "/ 35". Nothing warns about last copies, and the game ends only on fuses, a perfect score or the final round.
7. Regression: a Rainbow game still has six columns and ends "/ 30"; a base game has five columns and ends "/ 25".

## Owner's verbatim reply to the 7-suit Black checkpoint (2026-09-18)

"black is not a color that accepts hints. You cannot hint at the color black. that's how black works. And black is reverse - there's 3x 5s, 2x of 4 3 2, and 1x 1s, and you play them in reverse order - 5 then 4 then 3 then 2 then 1. Also, can we take the discard area and swap that into the space that says "X's turn"? should give the discard pile more real estate to breathe and thus a larger tile size."

result: issues

## Gaps (round 2)

2. **Black cannot be clued by colour.** "Black" is never a nameable colour clue, and colour clues never touch Black tiles; only rank clues touch them. The Phase 7 gap-1 implementation, which made Black nameable and made a Black clue touch Rainbow, is wrong and must be reversed. The Rainbow tile popover goes back to the five nameable colours. A Black tile's popover offers only the number. A server-side colour clue naming "black" is refused with `clue_color_not_nameable`.
3. **Black is a reversed suit.** Copies: three 5s, two each of 4/3/2, and one 1, so 10 tiles. Play order is 5 -> 4 -> 3 -> 2 -> 1: the first playable Black tile is a 5, each next Black play must be exactly one lower, and the stack is complete when its 1 is played. That stack scores 5 like any other.
   - The Black deck becomes 5 colours x 10 + Rainbow 10 (unchanged) + Black 10 = 70 tiles. The maximum score stays 35.
   - Engine legality, stack state, completion, "max playable" and score must all be direction-aware, driven by the variant configuration rather than a `=== "black"` special case where possible.
4. **Swap the discard area with the turn sign.** The discard pile moves into the large space below the tokens and deck that currently holds the "X's turn" sign; the turn sign moves into the smaller spot the discard vacates. The larger area gives discard tiles room to be bigger. Fixed geometry and the 1280x720 fit still hold.
