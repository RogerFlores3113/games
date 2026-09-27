# Phase 12: Phaser Shell - Pattern Map

**Mapped:** 2026-09-27
**Files analyzed:** 17 (new/modified)
**Analogs found:** 15 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `apps/web/components/expedition/ExpeditionBoard.tsx` (rewrite) | component | request-response | `apps/web/components/hanabi/HanabiBoard.tsx` (also: current file itself, being replaced) | exact (role), current file is the pre-image |
| `apps/web/components/expedition/ExpeditionPhaserMount.tsx` (new) | component / provider | event-driven | none in-repo (first non-React-imperative-library mount) | no analog — use RESEARCH.md Pattern 1 |
| `apps/web/components/expedition/ExpeditionSettingsButton.tsx` (new) | component | request-response | `apps/web/components/hanabi/HanabiBoard.tsx` gear-trigger button (lines ~339-360) | role-match |
| `apps/web/components/expedition/SettingsModal` reuse/port (new, Expedition-scoped) | component | request-response | `apps/web/components/hanabi/SettingsModal.tsx` | exact |
| `apps/web/components/expedition/phaser/scenes/CampScene.ts` (new) | component (Phaser scene) | streaming (server-view driven redraw) | none in-repo (first Phaser scene) — nearest conceptual analog `apps/web/lib/hanabi-board-logic.ts` for "derive presentation facts from a view, never recompute rules" | no direct analog — use RESEARCH.md Pattern 2 diagram |
| `apps/web/components/expedition/phaser/scenes/BetweenCampsScene.ts` (new) | component (Phaser scene) | request-response | same as CampScene | no direct analog |
| `apps/web/components/expedition/phaser/interactables/registry.ts` (new) | config / registry | event-driven | `packages/rules/src/expedition/gear/registry.ts` | exact (registry-per-entry shape) |
| `apps/web/components/expedition/phaser/card-packs/registry.ts` (new) | config / registry | CRUD (read pref, list defs) | `packages/rules/src/expedition/gear/registry.ts` (registry shape) + `apps/web/lib/tile-color-pref.ts` (per-browser pref half) | role-match (split analog) |
| `apps/web/components/expedition/phaser/test-bridge.ts` (new) | utility | event-driven | spec §7.5 code example (RESEARCH.md); no in-repo analog | no analog — spec-defined shape |
| `apps/web/lib/expedition/build-scene-model.ts` (new) | utility (pure view→model transform) | transform | `apps/web/lib/hanabi-board-logic.ts` | exact |
| `apps/web/lib/expedition/build-scene-model.test.ts` (new) | test | transform | `apps/web/lib/hanabi-board-logic.test.ts` | exact |
| `apps/web/lib/expedition/expedition-card-pack-pref.ts` (new) | utility (per-browser pref) | CRUD | `apps/web/lib/tile-color-pref.ts` | exact |
| `apps/web/lib/expedition/expedition-card-pack-pref.test.ts` (new) | test | CRUD | `apps/web/lib/tile-color.test.ts` (sibling of tile-color-pref.ts, same dir — not opened but same-pattern) | role-match |
| `apps/web/components/expedition/phaser/palette.ts` (new) | config | transform | none in-repo (first canvas-hex mirror module) — pattern is documented duplication, precedent cited in UI-SPEC as `packages/rules/src/expedition/adapter.ts`'s locally-duplicated `Variant` type | no direct analog |
| `apps/web/lib/create-room-form.ts` (modify, D-17/WR-06 fix) | utility | transform | itself (existing file, bug fix in place) | exact (self) |
| `apps/web/lib/game-agnostic-source.test.ts` (extend or sibling test for Phaser import confinement) | test (source-scan) | batch | `apps/web/lib/game-agnostic-source.test.ts` itself + `apps/worker/src/source-structure.test.ts` | exact |
| `e2e/expedition-create.spec.ts`, `e2e/expedition-camp.spec.ts` (new) | test (e2e) | request-response | existing `e2e/*.spec.ts` + `e2e/helpers.ts` (not opened this pass; use existing multi-browser room helpers) | role-match |

## Pattern Assignments

### `apps/web/components/expedition/ExpeditionBoard.tsx` (component, request-response)

**Analog:** current file itself (Phase 11 placeholder) + `apps/web/components/hanabi/HanabiBoard.tsx` for the surrounding contract shape.

**Current placeholder (full file, to be replaced) — `apps/web/components/expedition/ExpeditionBoard.tsx` lines 1-29:**
```typescript
import type { RoomView } from "@games/schema";

export function ExpeditionBoard({ view }: { view: RoomView }) {
  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--space-sm, 0.5rem)", textAlign: "center" }}>
      <h1>{view.gameDisplayName}</h1>
      <p style={{ color: "var(--color-text-muted)" }}>This table isn&apos;t ready to play in the browser yet.</p>
    </main>
  );
}
```
This is the exact registration point (`BOARD_COMPONENTS.expedition`) — the new file must keep the same `BoardProps` shape (`apps/web/components/game-ui.tsx` lines 16-22: `{ view, onAction, reconnecting, onDeleteRoom, onRestartLobby }`) so `game-ui.tsx`'s `Record<GameId, ComponentType<BoardProps>>` stays exhaustive with zero edits elsewhere.

**Host-check / delete-room wiring pattern** (from `HanabiBoard.tsx` line 80):
```typescript
const isHost = view.youSeatId !== null && view.youSeatId === view.hostSeatId;
```
Copy verbatim — same field names exist on `ExpeditionView`'s sibling `RoomView` wrapper. `onDeleteRoom` is passed straight through to the settings modal; the server re-checks host on every `delete_room` regardless (comment at `HanabiBoard.tsx` lines 49-53).

**Settings-modal open-state pattern** (`HanabiBoard.tsx` lines 115-117, 339-360, 458-470):
```typescript
const [settingsOpen, setSettingsOpen] = useState(false);
// ... gear-icon trigger button ...
<button type="button" onClick={() => setSettingsOpen(true)} aria-label="Settings">
  <Settings size={20} aria-hidden="true" color="var(--color-text)" />
</button>
// ...
<SettingsModal
  open={settingsOpen}
  onClose={() => setSettingsOpen(false)}
  isHost={isHost}
  onDeleteRoom={onDeleteRoom}
  {/* ...other props... */}
/>
```
D-05 explicitly reuses this exact pattern for Expedition's corner gear button + modal, with card-pack picker and no-op mute toggle substituted for tile-color/audio/hints.

---

### `apps/web/components/expedition/phaser/interactables/registry.ts` and `card-packs.ts` (config/registry, event-driven / CRUD)

**Analog:** `packages/rules/src/expedition/gear/registry.ts` (full file, 40 lines) — the exact "one file + one registry line" discipline (ENG-01) this phase must extend into `apps/web`.

**Registry shape to copy** (lines 14-39):
```typescript
import { chatter } from "./chatter";
import { peek } from "./peek";
// ... one import per entry
import type { GearDef } from "./gear-def";

export const GEAR_REGISTRY = {
  chatter,
  peek,
  // ... one object-literal line per entry
} satisfies Readonly<Record<string, GearDef>>;

export type GearId = keyof typeof GEAR_REGISTRY;
```
Apply identically for `INTERACTABLE_REGISTRY: Readonly<Record<string, InteractableDef>>` (RESEARCH.md Pattern 3 already sketches `InteractableDef`) and `CARD_PACK_REGISTRY: Readonly<Record<string, CardPackDef>>`. `satisfies` + `keyof typeof` gives the same exhaustiveness guarantee `GameId` gets in `game-ui.tsx`.

**Registry contract test pattern** — `packages/rules/src/expedition/gear/gear.contract.test.ts` (lines 1-20, structure only):
```typescript
// Iterates Object.entries(GEAR_REGISTRY) ONLY — never a hand list — so a new
// entry (one file + one registry line) is covered automatically with zero
// test edits.
import { GEAR_REGISTRY } from "./registry";

function checkGearDef(def: GearDef): string[] { /* pure shape checks, push violation strings */ }

describe("gear catalogue contract", () => {
  for (const [id, def] of Object.entries(GEAR_REGISTRY)) {
    it(`${id}: passes shape checks`, () => {
      expect(checkGearDef(def)).toEqual([]);
    });
  }
});
```
For SCENE-09's interactable contract test, mirror this shape but assert **no import of the socket/store module** per entry (grep the interactable's source file for forbidden import specifiers), exactly as RESEARCH.md's Validation Architecture section specifies ("iterate `INTERACTABLE_REGISTRY`, assert no import of the room-socket/store module").

---

### `apps/web/lib/expedition/build-scene-model.ts` (utility, pure transform)

**Analog:** `apps/web/lib/hanabi-board-logic.ts` (framework-free pure-function module consuming a redacted view, producing display-only derived facts — never recomputing rules).

**Header discipline to copy** (lines 1-21):
```typescript
import type { HanabiView, Clue, Suit } from "@games/rules";
import { variantConfig, maxScoreFor, scoreBand, MAX_FUSES } from "@games/rules";

/**
 * D-12 boundary: these predicates are the ONLY client-side disabling
 * permitted this phase, because they are the only cases the redacted
 * view makes unambiguous... If you find yourself adding a fifth disabling
 * rule here, stop — it was cut.
 */
```
For `build-scene-model.ts`, the equivalent boundary comment should state: `buildSceneModel` renders `view.camp.yourLegalCardIds` / `view.yourGear[].usableNow`/`.reason` directly and NEVER recomputes legality — this is Don't-Hand-Roll table's #1 rule in RESEARCH.md.

**Pure derived-value function shape** (lines 53-77):
```typescript
export function isPlayDisabled(view: HanabiView): boolean {
  return !view.isYourTurn;
}

export function bandForView(view: HanabiView): string {
  return scoreBand(view.score, maxScoreFor(variantConfig(view.variant)));
}
```
Every field `buildSceneModel` derives should follow this one-liner-reading-existing-view-fields shape — no `Date.now()`, no randomness, no Phaser import (RESEARCH.md Pattern 2 explicitly bans a Phaser import in this file).

**Test file analog:** `apps/web/lib/hanabi-board-logic.test.ts` — mirror its per-function `describe`/`it` structure, feeding hand-built `ExpeditionView` fixtures (from `packages/rules/src/expedition/adapter/view-types.ts`'s exported types: `ExpeditionView`, `ExpeditionCampView`, `ExpeditionSeatView`, `ExpeditionGearStatusView`, etc.) instead of `HanabiView` fixtures.

---

### `apps/web/lib/expedition/expedition-card-pack-pref.ts` (utility, per-browser CRUD)

**Analog:** `apps/web/lib/tile-color-pref.ts` (full file, 100 lines) — the established per-browser-preference-through-`safe-storage.ts` pattern.

**Storage wrapper delegation** (lines 1, 83-100):
```typescript
import { safeGetItem, safeRemoveItem, safeSetItem } from "./safe-storage";

export const TILE_COLOR_KEY = "hanabi-tile-color";

export function readTileColorPref(): string | null {
  const stored = safeGetItem(TILE_COLOR_KEY);
  if (stored !== null && isValidHexColor(stored)) {
    return stored;
  }
  return null;
}

export function writeTileColorPref(hex: string | null): void {
  if (hex === null) {
    safeRemoveItem(TILE_COLOR_KEY);
    return;
  }
  safeSetItem(TILE_COLOR_KEY, hex);
}
```
Copy this shape exactly for `expedition-card-pack-pref.ts`: a module-level key constant (e.g. `EXPEDITION_CARD_PACK_KEY = "expedition-card-pack"`), a validity check against the known `CARD_PACK_REGISTRY` ids (replacing `isValidHexColor`), `readCardPackPref()` returning a valid pack id or the default (`"big-index"` per D-01 of CONTEXT.md/RESEARCH.md SCENE-08), and `writeCardPackPref(id)`. A tampered/unknown stored value degrades to the default, never throws — same fail-safe shape as `resolveTileColorCss`.

**Underlying storage primitive** (`apps/web/lib/safe-storage.ts`, full file, 87 lines) — no changes needed, just import `safeGetItem`/`safeSetItem`/`safeRemoveItem` directly; it is SSR-safe and never throws (private-mode Safari included).

---

### `apps/web/lib/create-room-form.ts` (fix, D-17/WR-06)

**Analog:** itself — this is a targeted bug fix, not a new-pattern file.

**Current buggy code** (full file, lines 17-30):
```typescript
export function readCreateRoomForm(formData: FormData): {
  gameId: unknown;
  displayName: unknown;
  config: unknown;
} {
  const selectedGame = formData.get("gameId") ?? undefined;
  const config =
    typeof selectedGame === "string" ? (formData.get(configFieldName(selectedGame)) ?? undefined) : undefined;
  return {
    gameId: selectedGame,
    displayName: formData.get("displayName") ?? undefined,
    config,
  };
}
```
Fix direction (per RESEARCH.md Pitfall 5): when `LANDING_SETTINGS[selectedGame]` (imported from `apps/web/components/game-ui.tsx`) has no entry — i.e., no settings panel was ever rendered for this game — return `config: null` instead of `undefined`, since `CreateRoomRequestSchema`/`ExpeditionConfigSchema` requires a strict `z.null()` for games with no config, and `undefined` fails `.safeParse()`. Games with a registered settings panel (Hanabi today) keep the existing `formData.get(...) ?? undefined` behavior unchanged.

---

### `apps/web/lib/game-agnostic-source.test.ts` (extend, source-scan for Phaser confinement)

**Analog:** the file itself — same comment-stripping + scan-directory + regex-assertion shape already proven for `gameId` branching bans.

**Comment-stripper + scan pattern** (lines 8-11, 94-129):
```typescript
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

function stripComments(source: string): string { /* character-by-character, string/template-aware */ }

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SCAN_DIRS = ["app/room", "components", "lib"];

function listFiles(dir: string): string[] { /* recursive .ts/.tsx collector, skips *.test.ts */ }

const SCANNED_FILES = SCAN_DIRS.flatMap((dir) => listFiles(path.join(ROOT, dir)));

describe("game-agnostic-source (D-11)", () => {
  it("no non-test .ts/.tsx ... branches on gameId", () => {
    for (const file of SCANNED_FILES) {
      const code = stripComments(readFileSync(file, "utf-8"));
      expect(code, `${file} matches gameId branching`).not.toMatch(GAME_ID_BRANCH);
    }
  });
});
```
Add a new `it(...)` (or a sibling test file, e.g. `phaser-import-confinement.test.ts`) that scans every file under `SCAN_DIRS` **except** `components/expedition/phaser/**`, asserting none contains the literal string `"phaser"` in an import statement (RESEARCH.md Pitfall 4). Reuse `stripComments`/`listFiles` verbatim rather than re-implementing the comment stripper — copy the whole function, since it is not currently exported from the existing test file (confirm at implementation time whether to extract it to a shared test-util module instead of duplicating).

---

## Shared Patterns

### Per-browser preference storage (safe, SSR-proof, never throws)
**Source:** `apps/web/lib/safe-storage.ts` (whole file)
**Apply to:** `expedition-card-pack-pref.ts`, any future Expedition browser-local prefs (e.g. mute state persistence, if added beyond the no-op slot)
```typescript
function getLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
export function safeGetItem(key: string): string | null { /* try/catch, never throws */ }
export function safeSetItem(key: string, value: string): void { /* no-op on failure */ }
export function safeRemoveItem(key: string): void { /* no-op on failure */ }
```

### Settings modal (fixed backdrop, centered dialog, Escape/backdrop close, two-step delete confirm)
**Source:** `apps/web/components/hanabi/SettingsModal.tsx` (whole file, 259 lines)
**Apply to:** the Expedition settings modal (D-05) — port the outer shell (backdrop div, `role="dialog"`, Escape-key `useEffect`, `confirmingDelete` two-step state, host-gated delete section) verbatim; swap in the card-pack picker for `TileColorPicker`, a no-op-wired mute toggle for `AudioControls`, and drop the `keepHints` section entirely (Hanabi-only concept, not part of D-05's list).
```typescript
useEffect(() => {
  if (!open) return;
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") onClose();
  }
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [open, onClose]);
```

### Host-only destructive action (client hint only, server re-checks)
**Source:** `apps/web/components/hanabi/HanabiBoard.tsx` line 80 + `SettingsModal.tsx` lines 187-255 (two-step confirm)
**Apply to:** Expedition's settings-modal delete/restart room control
```typescript
const isHost = view.youSeatId !== null && view.youSeatId === view.hostSeatId;
// ...
{isHost && onDeleteRoom && ( /* two-step confirm UI, same copy: "This ends the game for everyone and cannot be undone." */ )}
```

### Reconnect / seat resume (unchanged, consumed not modified)
**Source:** `apps/web/lib/seat-token.ts` (whole file) + `apps/web/components/ReconnectingBanner.tsx` (whole file)
**Apply to:** SCENE-11 — the Phaser mount does not need to reimplement anything here; `ReconnectingBanner` stays rendered by the same parent (`RoomClient.tsx`, not read this pass) above/alongside `ExpeditionBoard`, per D-08's explicit note that the existing banner still covers the viewer's own connection. `ExpeditionPhaserMount` only needs to rehydrate cleanly whenever a new `view` prop arrives post-rebind — no new storage code needed.

### Registry-per-entry + exhaustiveness via `satisfies`/`keyof typeof`
**Source:** `packages/rules/src/expedition/gear/registry.ts` (whole file) and `apps/web/components/game-ui.tsx` (`Record<GameId, ...>` pattern, lines 27-30)
**Apply to:** `INTERACTABLE_REGISTRY`, `CARD_PACK_REGISTRY` — one file per entry, one import + one object-literal line per registry, `satisfies Readonly<Record<string, XDef>>`, and a derived `type XId = keyof typeof X_REGISTRY`.

### Source-scan structural tests (comment-aware regex assertions over the shipped tree)
**Source:** `apps/web/lib/game-agnostic-source.test.ts` (whole file, 156 lines)
**Apply to:** SCENE-01/Pitfall 4 (no `"phaser"` import outside `components/expedition/phaser/**`) and SCENE-12/Pitfall 3 (grep `.next/` build output for `__expeditionTest` absence — same "scan the artifact, don't trust runtime conditionals" discipline, applied to the build output instead of source).

### Landing picker: enabling Expedition (flip `disabled: true` → `false`)
**Source:** `apps/web/components/game-ui.tsx` line 54
```typescript
export const LANDING_GAME_OPTIONS: readonly { value: string; label: string; disabled: boolean }[] = [
  { value: "hanabi", label: "Hanabi", disabled: false },
  { value: "expedition", label: "Expedition - coming soon", disabled: true }, // -> flip to false, update label
];
```
This is the single flip that unblocks SCENE-01's landing entry point, combined with the D-17/WR-06 fix to `create-room-form.ts` above — both are required together, per RESEARCH.md Pitfall 5 ("the JSON path may mask this; confirm both native-form and JS-hydrated paths are exercised").

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/web/components/expedition/ExpeditionPhaserMount.tsx` | component/provider | event-driven | First non-React-imperative-library (Phaser `Game` instance) mounted inside this codebase's React tree; no existing "own an external engine's lifecycle across Strict Mode" code exists. Use RESEARCH.md's Pattern 1 (`gameRef` + `destroyed` flag + `game.destroy(true)`) directly — it is already a concrete, ready-to-copy code block, not an abstract description. |
| `apps/web/components/expedition/phaser/scenes/CampScene.ts`, `BetweenCampsScene.ts` | component (Phaser scene) | streaming | No prior Phaser scene exists anywhere in the repo (this phase is literally titled "Phaser Shell" — establishing the first one). `hanabi-board-logic.ts` is the nearest *conceptual* cousin (pure-derivation-from-view discipline) but is a React/DOM-rendering module, not a scene-graph one — not a structural analog. Follow RESEARCH.md's System Architecture Diagram and Pattern 2 instead. |
| `apps/web/components/expedition/phaser/palette.ts` | config (canvas color mirror) | transform | No prior module mirrors HTML CSS custom properties into a second, canvas-consumable hex table. UI-SPEC's own cited precedent (`packages/rules/src/expedition/adapter.ts`'s locally-duplicated `Variant` type) is a naming/type duplication precedent, not a color-value one — worth reading for the "why duplicate, not import" justification, but not a code template. Build per UI-SPEC's Color section table directly. |

## Metadata

**Analog search scope:** `apps/web/components/hanabi/`, `apps/web/components/expedition/`, `apps/web/lib/`, `packages/rules/src/expedition/gear/`, `packages/rules/src/expedition/boss/`, `apps/worker/src/source-structure.test.ts`
**Files scanned:** 13 read directly (SettingsModal.tsx, tile-color-pref.ts, safe-storage.ts, ExpeditionBoard.tsx, game-ui.tsx, create-room-form.ts, gear/registry.ts, seat-token.ts, ReconnectingBanner.tsx, game-agnostic-source.test.ts, hanabi-board-logic.ts, HanabiBoard.tsx (grep-targeted), LandingForm.tsx, gear.contract.test.ts (partial), view-types.ts (type list only))
**Pattern extraction date:** 2026-09-27
