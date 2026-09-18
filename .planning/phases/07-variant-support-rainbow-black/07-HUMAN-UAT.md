---
status: pending
phase: 07-variant-support-rainbow-black
source: [07-05-PLAN.md Task 1/Task 2, 07-CONTEXT.md "Ask the owner directly at sign-off"]
started: 2026-09-18T23:30:16Z
updated: 2026-09-18T23:30:16Z
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
