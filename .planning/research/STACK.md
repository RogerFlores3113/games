# Stack Research: Expedition (v2.0)

**Domain:** Pixel-art canvas rendering (Phaser) inside an existing Next.js/Cloudflare monorepo; art sourcing for a public site
**Researched:** 2026-09-22
**Confidence:** HIGH on library versions/licenses (npm registry + official docs directly checked); MEDIUM on some integration-pattern specifics (community-sourced, cross-checked); LOW/flag on exact per-asset licensing (must be verified per-asset at art-pass time, not decidable in research)

This is an **additive** research pass. Everything in `.planning/milestones/v1.0-research/STACK.md` (Next.js 16, Cloudflare Workers + Durable Objects + `partyserver`, `packages/rules`/`packages/schema`, Zustand, `partysocket`, Vitest/fast-check/Playwright, Tailwind 4) is unchanged and not re-litigated here.

---

## Recommended Stack

### Core Technologies (new for Expedition)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `phaser` | **4.2.1** (npm `latest` dist-tag, checked 2026-09-22) | Canvas 2D/WebGL rendering engine for the camp/fireside/run-end scenes | Phaser 4 went stable on 2026-04-30 (`4.0.0`) and is now at `4.2.x`; Phaser's own migration article states plainly "if you're starting a new project, there's no reason to start on Phaser 3." A greenfield feature starting in September 2026 should not start on the previous major. MIT licensed, zero runtime dependencies, ships ESM (`phaser.esm.min.js`) which tree-shakes cleanly under Next.js's Turbopack/webpack production build. |

**Version note:** pin to an exact version (`4.2.1`), consistent with the rest of this repo's convention of pinned exact versions (no `^`/`~` in `apps/web/package.json` and `apps/worker/package.json`).

### Supporting Libraries

No new supporting libraries are required beyond Phaser itself. Specifically **not needed**:

| Considered | Verdict | Why not |
|---|---|---|
| A seeded-PRNG package (e.g. `seedrandom`, `pure-rand` standalone) | **Not needed** | The design spec (§6.5) explicitly reuses the existing `sfc32`/`cyrb128` pair already implemented in `packages/rules/src/shuffle.ts` for Hanabi's deterministic shuffles. It is a small, already-audited, zero-dependency implementation carried in run state; introducing a second PRNG source would fragment the "one seed determines the whole run" guarantee and add a dependency for something ~20 lines of code already does correctly. fast-check's own internal PRNG (`pure-rand`, a transitive dev-dependency) is for test-input generation only and must not be confused with or substituted for game-state randomness. |
| A React-Phaser binding library (e.g. `phaser-react-ui`, `react-phaser-fiber`) | **Not needed** | The design's architecture (§7.1) is "Phaser only renders... a pure `buildSceneModel(serverView, localUi)`... Input becomes requests." This is a one-way data flow (Zustand store → scene model → Phaser draws it; Phaser input → store action) implementable with a handful of lines of glue code (see Integration Pattern below). A binding library would fight this design rather than help it — most exist to let React own individual game objects as components, which is the opposite of "Phaser owns the whole canvas, React owns the shell." |
| A bitmap-font generation tool (e.g. Littera, BMFont, Hiero) as a build dependency | **Not needed as a library**, but relevant as an **asset pipeline step** — see Pixel-Art Rendering section below. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `phaserjs/custom-build` (GitHub tool, not npm) | Optional: trims Phaser's bundle to only the modules Expedition uses | Only relevant if bundle size becomes a real problem post-measurement (see Bundle Size below); Phaser 4's `@phaserjs`-scoped modular packages under one `Phaser` namespace already tree-shake under Rollup/webpack production builds without this tool in most cases — treat as a later optimization, not a day-one requirement. |

## Installation

```bash
# apps/web only — Phaser must never be a dependency of apps/worker (server never renders)
npm install phaser@4.2.1 --workspace apps/web
```

No new dev dependencies are required. Playwright, Vitest, and fast-check are already root dev dependencies (`@playwright/test@1.62.1`, `vitest@4.1.11`, `fast-check@4.9.0`) and cover Expedition's test needs as specified in the design (§8) without additions.

---

## (1) Phaser: version, license, bundle size, Next.js integration

### Phaser 3 vs Phaser 4 status (HIGH confidence)

- Phaser 4 reached `4.0.0` stable on 2026-04-30, after a public alpha/beta/RC cycle; current npm `latest` is `4.2.1` (checked via `npm view phaser dist-tags` on 2026-09-22).
- Phaser's own comparison post ("Phaser 3 vs Phaser 4: What Changed and Why You Should Upgrade," phaser.io, 2026-05) states new projects should start on Phaser 4 directly; Phaser 3 (`3.90.0` is the last Phaser 3 minor on npm) is now the legacy line, still published for existing projects but not the recommendation for green-field work.
- The core architectural change is the renderer: Phaser 4 replaced the old pipeline system with a "RenderNode" architecture (fully managed WebGL state, built-in context restoration). This does not affect Expedition's design (it never touches custom WebGL pipelines) but is the reason Phaser 4 is described as "faster, cleaner" rather than a purely cosmetic major-version bump.
- License: **MIT** (confirmed via `npm view phaser license`), consistent with every other dependency already in this repo — no new license class introduced.

### Bundle size (HIGH confidence — measured directly)

Measured by downloading `phaser@4.2.1` from npm and inspecting `dist/`:

| Build | Size |
|---|---|
| `phaser.esm.min.js` (what a modern bundler will pull in via `"module"`/`"exports"`) | 1.4 MB minified, **~347 KB gzipped** (measured directly with `gzip -c \| wc -c`) |
| `phaser.min.js` (UMD) | 1.4 MB minified |
| `phaser-arcade-physics.min.js` (Arcade Physics-only trimmed build) | 1.3 MB minified |

~350 KB gzipped is the cost of the *entire* engine (renderer, physics systems, tilemaps, audio, input, animation, GameObjects, plugins) loaded as one chunk. This is why the dynamic-import isolation below is not optional polish — it is the only way this weight stays off every route except the one Expedition game screen. Because Expedition uses no physics simulation (it's a card game — click targets and scripted tweens, not collision/gravity), the Arcade Physics build is irrelevant; the design's use of pure rendering + tweens does not need it. If post-measurement the ~350 KB matters (Lighthouse budget, etc.), `phaserjs/custom-build` can trim unused subsystems (physics, specific renderers) — treat this as a later lever, not a day-one blocker, since it only loads on the one route that plays Expedition.

### Mounting inside Next.js 16 App Router with dynamic import (MEDIUM-HIGH confidence, cross-checked across multiple sources)

Pattern, adapted to this repo's conventions:

```tsx
// apps/web/src/app/room/[id]/expedition/expedition-canvas.tsx
"use client";

import dynamic from "next/dynamic";

const PhaserGame = dynamic(() => import("./phaser-game"), { ssr: false });

export function ExpeditionCanvas() {
  return <PhaserGame />;
}
```

```tsx
// apps/web/src/app/room/[id]/expedition/phaser-game.tsx
"use client";
import { useEffect, useRef } from "react";
import type Phaser from "phaser";

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (gameRef.current) return; // StrictMode double-invoke guard, see below
    let cancelled = false;

    import("phaser").then((Phaser) => {
      if (cancelled || gameRef.current) return;
      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current!,
        render: { pixelArt: true },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [/* CampScene, FiresideScene, RunEndScene */],
      });
    });

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} />;
}
```

Two layers of isolation, both needed:
1. **`next/dynamic(..., { ssr: false })`** guarantees the Phaser module is never evaluated during server-side rendering — Phaser's core touches `window`/`document`/`HTMLCanvasElement` at import time in several places, which throws under Node's SSR execution. `ssr: false` is the documented, supported way to opt a client component subtree out of SSR entirely in the App Router, and it is also what keeps this bundle out of the shared client JS for every other route (landing page, Hanabi board) — Next.js only fetches the dynamically-imported chunk when this specific component is actually rendered.
2. **A second, inner `import("phaser")`** (or top-level `import Phaser from "phaser"` inside a file that is *itself* only reachable via the dynamically-imported component) is what actually defers evaluation of the ~350 KB module until this component mounts, rather than the App Router's client-reference-manifest deciding chunk boundaries in a less predictable way. Either the dynamic-import-of-Phaser-directly pattern above, or a static `import Phaser from "phaser"` at the top of `phaser-game.tsx` (which is fine because `phaser-game.tsx` itself is only loaded via the outer `next/dynamic`), both work — pick one and be consistent; the outer `next/dynamic({ ssr: false })` boundary is the one doing the real work of keeping Phaser off other routes.

### SSR pitfalls (HIGH confidence, matches Next.js's own documented behavior)

- Phaser instantiation must happen inside `useEffect` (client-only lifecycle), never in render body or a Server Component — this is standard React/Next SSR hygiene and nothing Phaser-specific, but worth stating because it's the actual mechanism that keeps this safe, not the `"use client"` directive alone. `"use client"` marks the component as client-renderable; it does **not** prevent the component's *first render* from happening on the server during the initial HTML pass, which is exactly when a top-level `new Phaser.Game(...)` call would throw on `document`. `ssr: false` on the dynamic import is what actually removes it from that server pass, which is why both are used together above.
- Because the room shell (landing page, lobby, reconnect banner) stays in ordinary Next.js Server/Client Components per the design (§7.1), only the leaf Expedition game route needs this treatment — Hanabi's existing board is unaffected and does not gain this bundle.

### React 19 Strict Mode double-mount (HIGH confidence)

React's Strict Mode (on by default in Next.js dev builds) intentionally mounts, unmounts, and remounts every component once in development to surface effect-cleanup bugs — this is dev-only behavior and does not happen in production builds regardless of Strict Mode being left enabled. Without a guard, this creates two `Phaser.Game` instances fighting over one canvas/WebGL context in dev. The guard shown above (`if (gameRef.current) return` inside the effect, plus a `cancelled` flag for the async `import("phaser")` branch, plus a real `destroy(true)` in cleanup) is the standard fix and is what the design's test-bridge/E2E approach implicitly assumes (one live game instance per mounted route). This is dev-only friction — it does not affect the production build Vercel serves — but must be handled correctly or local development becomes unusable (WebGL context errors, duplicated input handlers).

### Reading Zustand and emitting intents (MEDIUM confidence — architectural pattern, not a library API; consistent with design §7.1)

The design's "Phaser only renders" boundary maps cleanly onto the existing Zustand store (already the source of truth for "the last filtered view the server sent me," per v1.0 STACK.md):

- **Store → Phaser:** subscribe to the Zustand store from *outside* React (Zustand stores expose `.subscribe()` independent of the `useStore` hook), inside the Phaser Scene's `create()`/`init()`. On each store change, call the pure `buildSceneModel(serverView, localUi)` function from the design (§7.1) and diff it against the last-drawn model to animate only what changed. This avoids re-rendering React on every server push — Phaser owns its own render loop and pulls from the store on its own cadence, matching "Scenes draw the model and animate differences between models."
- **Phaser → Store:** input handlers (`pointerdown` on a card sprite, a gear item, an interactable) call plain Zustand actions (`useExpeditionStore.getState().submitAction(...)`) directly from the Scene — no React event system involved, since Phaser input never flows through React's synthetic event system. The store action is what actually sends the message over the existing `partysocket` connection; per the design, "Input becomes requests... Phaser never decides an outcome," so these handlers must not do local validation beyond disabling obviously-illegal targets for UX — legality is re-checked server-side exactly as Hanabi already does.
- This requires zero new libraries: `zustand`'s vanilla `subscribe`/`getState` API (already a dependency) is sufficient; no Phaser-specific state adapter is needed.

---

## (2) Pixel-art rendering configuration

### `pixelArt` / `roundPixels` / scaling (HIGH confidence — verified against Phaser's own "Phaser 4 Pixel Art Guide")

Phaser 4 restructured this slightly from Phaser 3's flat `pixelArt: true` boolean into a small `render` config block, but the effect is the same intent:

```ts
new Phaser.Game({
  render: {
    pixelArt: true,        // shorthand: disables antialiasing + forces roundPixels
    // — OR, if any sprites are ever rotated/scaled non-uniformly and you want
    //   crisp pixels with antialiased edges instead of jagged ones:
    // smoothPixelArt: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,          // integer-friendly letterboxed fit
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // For strictly-integer scaling to arbitrary viewports (recommended for
    // crisp pixel art at any window size), pair FIT with a fixed low-res
    // "game" resolution (e.g. 480x270 or 640x360) authored at 1x pixel scale,
    // and let the Scale Manager's FIT mode scale that logical canvas up —
    // Phaser 3.70+ (carried into 4.x) does the up-scaling on the GPU with
    // roundPixels handling sub-pixel snapping, which is what keeps art crisp
    // at non-integer zoom factors like 2.7x rather than requiring the zoom
    // factor itself to be an integer.
  },
});
```

Key facts, HIGH confidence (from `phaserjs/phaser`'s own `docs/Phaser 4 Pixel Art Guide/Phaser 4 Pixel Art Guide.md`, fetched directly):
- `render: { pixelArt: true }` is the correct one-line config for 1:1, unscaled/unrotated pixel display — it disables antialiasing and turns on `roundPixels` automatically.
- `render: { smoothPixelArt: true }` is the alternative when sprites *are* scaled or rotated at runtime (e.g. a tween that scales a card on hover) — it uses different shaders to keep pixels crisp with antialiased edges rather than the harsher all-or-nothing snap of plain `pixelArt`.
- `roundPixels` defaults to a `safeAuto` mode as of Phaser 3.70+ (carried into 4.x): it rounds vertices to integer display pixels automatically for un-transformed objects, and only needs the more aggressive `full` mode manually if flicker-free integer-snapping is required even during scale/rotate tweens (tradeoff: `full` can itself introduce visible "stepping" during smooth transform animations).
- This directly informs the **hover/targeting scale tweens** the design calls for (gear items dimming, targeting mode highlighting cards) — use `smoothPixelArt` if any of those involve non-uniform scale, plain `pixelArt` otherwise; verify visually during the art pass (§7.4/§9 step 7 in the design), since this is a visual call the owner reviews, not a purely technical one.

### Crisp text for card faces: bitmap fonts vs. web fonts (MEDIUM confidence — Phaser's own guide plus cross-checked community sources)

Phaser's own Pixel Art Guide is explicit on this point: **bitmap fonts aligned to a pixel grid render more reliably crisp than DOM/web-font-based text in a pixel-art game.** Two concrete implications for Expedition's card faces (design §7.3, `CardPackDef { face(card), back() }` drawing to Phaser textures):

- **Recommendation: bitmap fonts (`Phaser.GameObjects.BitmapText`) for in-canvas card rank/suit glyphs**, not `Phaser.GameObjects.Text` (which rasterizes a system/web font via an offscreen `<canvas>` — susceptible to sub-pixel antialiasing blur exactly like DOM text, since it goes through the same browser font-rasterization path). Bitmap fonts are pre-rasterized pixel-exact glyph atlases, so a rank like "10♠" drawn at a fixed integer position stays crisp at any of Phaser's scale factors, matching the retro aesthetic the `Big Index`/`Classic` card packs (§7.3) are going for.
- **Practical generation path:** author the two card-pack fonts (or reuse/extend a CC0 pixel bitmap font — Kenney publishes several MIT/CC0 bitmap fonts specifically, see Sources) with a bitmap-font tool (e.g. the open-source **Hiero** tool bundled with libGDX tooling, or **BMFont**) to produce a `.png` + `.xml`/`.fnt` pair, loaded via `this.load.bitmapFont(...)` in a Phaser preload step. This is a one-time asset-authoring step, not a runtime dependency — no new npm package required.
- If per-card text ends up simple enough (e.g. only rank digits/letters + 4 suit glyphs, a small fixed glyph set), an alternative that avoids the bitmap-font tool entirely is drawing each rank/suit combination as a small pre-rendered pixel-art texture per `CardPackDef.face(card)` (i.e., the face glyphs *are* sprite art, not text at all) — this is arguably a better fit for the "Big Index"/"Classic" card-pack swapping requirement (§7.3) since it keeps every visual variation (including any stylized numerals) as ordinary texture assets rather than mixing a font-rendering system into card art. **Recommend deciding this during the art pass (§9 step 7)**, not now — both are technically sound; it is a scope/effort tradeoff (font tool setup once vs. drawing ~15 glyphs × pack count as sprites) the owner/artist should make when actually producing `Big Index` vs `Classic`.

### Texture generation for card packs (MEDIUM confidence, standard Phaser pattern)

`CardPackDef { face(card), back() }` (design §7.3) drawing to Phaser textures is a standard use of `Phaser.GameObjects.RenderTexture` or, more simply, **pre-baked PNG texture atlases loaded via `this.load.atlas(...)`** — one atlas per card pack, generated at build/art time (e.g. with a free tool like TexturePacker's free tier or Kenney's own free "Sprite Packer," or simply hand-placed PNGs if the per-card art is simple enough that an atlas isn't needed yet). No new library is required: Phaser's built-in `Loader` and `TextureManager` handle atlas loading natively. The `CardPackDef` interface itself (already specified in the design) is the seam — `face(card)` returns a texture/frame key to draw, `back()` likewise — so pack-switching is just swapping which atlas key a card sprite references, matching how Hanabi's tile-colour picker already works (per-browser stored preference, per PROJECT.md's Key Decisions).

---

## (3) Testing a canvas game with Playwright

### Test-only object bridge (HIGH confidence — this is exactly what the design already specifies in §7.5; confirming it's a standard, sound pattern)

The design's `window.__expeditionTest` bridge (listing interactive objects by stable id + screen position + current scene model) is the standard, well-established approach to E2E-testing canvas-rendered UIs, because Playwright (and any DOM-based test tool) cannot query into canvas pixel content the way it queries the DOM — there is no accessibility tree or DOM node per sprite. Exposing a plain JS object on `window` that mirrors "what's clickable and where" is the conventional bridge pattern used across Phaser/PixiJS/canvas game testing generally (no single canonical library for this — it's implemented directly, which is what the design already does).

Concretely, from Playwright's side this looks like:
```ts
// In a Playwright spec:
const target = await page.evaluate(() => window.__expeditionTest.find("gear:pickpocket"));
await page.mouse.click(target.x, target.y);
```
i.e., Playwright reads positions out of the bridge via `page.evaluate`, then issues real mouse events at those coordinates — this exercises Phaser's actual input pipeline (unlike calling a Phaser API method directly from the test, which would bypass input handling entirely and defeat the point of an E2E test).

### Compile-time stripping from production builds (MEDIUM confidence — standard bundler pattern, not Phaser-specific)

The design requires the bridge be "compiled out of production." The standard way to do this in a Next.js/Turbopack (or webpack) build, without a new dependency:

```ts
if (process.env.NODE_ENV !== "production") {
  window.__expeditionTest = buildTestBridge(scene);
}
```

Next.js inlines `process.env.NODE_ENV` at build time (this is standard Next.js/webpack/Turbopack behavior, not something requiring configuration), so the bundler's dead-code elimination removes the entire `buildTestBridge(...)` branch — and, transitively, any code only reachable from it — from the production bundle via the same tree-shaking pass that already runs on this repo's Next.js builds. No new tooling is needed; this is the same mechanism that already differentiates `apps/web`'s dev vs. production builds today. Playwright's own test run should point at a build with `NODE_ENV` set to something other than `"production"` (e.g. Next.js's own `next dev` or a dedicated `test` env used by the existing Playwright config) so the bridge is present when `npm run test:e2e` runs — verify this matches how the existing Hanabi Playwright suite is configured (likely already solved, since Hanabi's `apps/web` presumably runs its own dev server for `@playwright/test` today; this is a continuity check, not new work).

---

## (4) Seeded PRNG beyond `sfc32`/`cyrb128`

**No new library needed — confirmed by direct reading of the design spec.** §6.5 states plainly: "A seeded PRNG (the existing `sfc32`/`cyrb128` pair from `packages/rules/src/shuffle.ts`) is carried in state. Deals, the objective deck, draft offers, boss selection and Trained Monkey all draw from it." This is a closed decision, not an open research question — flagging it here only to record that no gap exists: Expedition's randomness needs (shuffling two decks, drafting, boss twist selection, one gear's random-card-swap effect) are all served by the same generator already used and validated for Hanabi's deterministic shuffles, keeping "the whole run replays deterministically from its seed and action log" true without introducing a second RNG implementation to keep in sync.

---

## (5) Art sourcing: PixelLab and CC0/permissive packs

### PixelLab (MEDIUM-HIGH confidence — read directly from PixelLab's own Terms of Service, 2026-09-22)

- **Ownership:** PixelLab's TOS states plainly: "You retain ownership of any content you create using PixelLab... free to use, modify, and distribute the outputs from our tools for any purpose" — this covers commercial use on a public website (games.rogerflores.dev) with no additional license purchase or attribution requirement.
- **The one restriction:** outputs may not be used to train a separate AI/ML model without PixelLab's written permission. Irrelevant to this project (sprites are consumed as game art, never as training data).
- **Residual legal responsibility stays with the user**, per the TOS: "you bear full legal responsibility for ensuring that the content you create complies with all applicable laws and does not infringe on the rights of any third parties" — this is standard boilerplate for any generative-AI tool (the underlying model could in theory reproduce something too close to copyrighted training material) and is why the design's `CREDITS.md` verification step (§7.4) matters even for PixelLab output, not just for third-party packs: visually check generated sprites for anything that looks like a recognizable copyrighted character/logo before shipping.
- **Free tier limits:** not stated in the TOS itself (it's a usage-plan detail, not a legal term); check PixelLab's pricing page directly at art-pass time (§9 step 7) since plan limits change independent of licensing terms and are out of scope for this stack research.
- **Export format:** PixelLab is a generation tool producing PNG sprite output (individual frames or sheets depending on the feature used — e.g. its character/animation generator produces frame sequences); these load into Phaser exactly like any other PNG texture/atlas — no special SDK or import step, confirming there's no new library surface here beyond Phaser's existing `Loader`.

### CC0 / permissive pixel-art sources for a jungle/camp-at-night scene (MEDIUM confidence — licensing is asset-specific and must be reverified per-asset at use time)

| Source | License model | Fit for jungle/camp-at-night | Verification approach |
|---|---|---|---|
| **Kenney.nl** (kenney.nl/assets) | **Every asset CC0 (public domain), uniformly** — confirmed directly: "All game assets on Kenney's asset pages are public domain licensed (CC0)... free to use, even in commercial projects. Attribution is not required." This is a blanket site-wide policy, not per-asset. | Kenney's "Nature Kit" and various platformer/tile packs cover foliage, trees, and environmental tiles usable as a jungle base layer; Kenney does not appear (as of this search) to publish a single pre-made "jungle camp at night" pack specifically — expect to compose a scene from Nature Kit tiles, a separate lighting/particle treatment (campfire glow, fireflies) authored in-house or via PixelLab, rather than finding one drop-in asset pack. | Lowest-verification-burden source in this list — the CC0 declaration is site-wide, so no per-asset license check is needed, only a per-asset *fit/quality* check. Record the pack name + kenney.nl URL in `CREDITS.md` per the design's existing convention even though attribution isn't required, for traceability. |
| **OpenGameArt.org** | **Mixed, per-submission** — individual pieces carry their own license (CC0, CC-BY, CC-BY-SA, GPL, etc.), set by each contributor. A CC0-tagged campfire animation was found directly (search result: "Campfire pixel art animated," opengameart.org) but this is one submission's license, not site-wide. | Good source specifically for the animated campfire centerpiece the design calls for (§7.5 interactables: "Campfire: click for a burst of sparks"), and for miscellaneous night/jungle set-dressing. | **Must check the license field on every individual submission page before use** — OpenGameArt has no blanket policy. Filter search/browse by "CC0" explicitly (the site supports license filtering) rather than assuming a jungle-themed result is free-use. Record each asset's specific license (not just "OpenGameArt") in `CREDITS.md`. |
| **itch.io asset marketplace** | **Mixed, per-listing** — itch.io hosts both free and paid packs from independent creators; license terms are set by each creator and stated on the listing page (some explicitly CC0, many are "free to use with attribution" or "free for personal use only," which would NOT satisfy this project's public-commercial-adjacent use). itch.io supports a `tag-cc0` filter which surfaces creator-declared-CC0 listings. | itch.io has jungle-tagged and campfire-tagged pixel-art asset listings (confirmed via search, e.g. a free "Jungle Tileset" listing was surfaced); breadth here is larger than Kenney or OpenGameArt for a specific "jungle at night" mood, but license rigor is lower/more variable. | **Highest verification burden of the three** — read the specific listing's license terms in full (not just the CC0 tag, which is creator-self-declared and not independently audited by itch.io), and prefer listings that explicitly say "commercial use permitted, no attribution required" in their own words over ones that only carry a tag. Screenshot or archive the license text at time of download in case a listing's terms change later, and record the exact listing URL + license statement in `CREDITS.md`. |

**Recommended sourcing order for the jungle/camp-at-night scene, matching the design's art pipeline (§7.4):** Kenney first for any base tile/environment needs (zero verification burden), PixelLab for anything bespoke to Expedition's specific mascot/characters/gear icons (owner already has a PixelLab red panda mascot sprite per §5.4, confirming this tool is already in active use), OpenGameArt/itch.io filled in only for specific missing pieces (e.g. an animated campfire, firefly particles) where a CC0-tagged asset is found and its license is read in full before use. This matches the design's existing verification discipline: "Every asset is listed in `apps/web/public/expedition/CREDITS.md` with its source and licence, verified before use, as with the existing background photos. Assets with people, watermarks or unverified licences are not used" (§7.4) — this stack research does not change that process, it only maps out where to look.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| Phaser 4.2.1 | Phaser 3.90.0 (legacy, still maintained) | Only if a specific Phaser 3-only plugin or tutorial pattern turns out to be load-bearing and has no Phaser 4 equivalent yet — unlikely given Expedition's needs (sprites, tweens, bitmap text, input, a Scale Manager) are all core APIs present and improved in Phaser 4. Not recommended: starting a new 2026 project on a framework's own-stated legacy major adds migration debt with no offsetting benefit. |
| Phaser (canvas engine) | PixiJS (renderer-only, no scene/input/tween framework) | If Expedition's needs were purely "draw sprites fast" with a hand-rolled scene graph and input system on top — PixiJS is lighter (renderer only) but would require building everything Phaser's Scene/Input/Tween/Loader systems already provide, which the design's scope (multiple scenes, targeting-mode input, tweened card movement, bitmap text, texture atlases) does not justify reinventing. |
| Bitmap fonts (`BitmapText`) or pre-rendered sprite glyphs for card faces | Phaser `Text` (canvas-rasterized web/system font) | Only for non-gameplay-critical, infrequently-shown text (e.g. a long rules-text tooltip on hover, per §7.2 "Text appears only on hover or long-press... never as panels") where crispness matters less than easy font/i18n flexibility and the text is not part of the repeatedly-rendered card face art itself. |
| Kenney/OpenGameArt/itch.io CC0 packs + PixelLab | A single paid "jungle asset pack" bundle (e.g. from Unity Asset Store, itch.io paid listings, Humble Bundle asset packs) | If the owner is willing to spend money for stylistic consistency/time savings — this project's constraints (CLAUDE.md: "every dependency must have a workable free tier") are about *service* dependencies (hosting, databases, push), not one-time art purchases, so a small one-time art-pack purchase would not violate the project's cost constraints the way a recurring paid service would. Not recommended as the default given PixelLab (already in use) plus free sources cover the stated scope, but worth naming as a legitimate fallback if the free-source jungle/night mood proves hard to assemble cohesively. |

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| Importing `phaser` at the top level of any Server Component, `layout.tsx`, or any file reachable from the landing page / Hanabi routes | Evaluates Phaser's `window`/`document`-touching code during SSR (throws) and/or bundles ~350 KB gzipped into shared/other-route JS, defeating the entire point of dynamic-importing it | `next/dynamic(() => import(...), { ssr: false })` scoped to only the Expedition game route's leaf client component |
| `Phaser.GameObjects.Text` for card rank/suit glyphs that are drawn/redrawn frequently as part of the core card art | Canvas-rasterized web-font text blurs at non-1x pixel scale exactly like DOM text — undermines the "crisp pixel art" visual goal that is a named, owner-reviewed requirement (§7.2, §9 step 7) | `BitmapText` with a pixel-aligned bitmap font, or pre-rendered sprite/texture glyphs per `CardPackDef.face(card)` |
| Treating any OpenGameArt or itch.io asset's license as CC0 based on a search-result snippet, tag, or filename alone | Both platforms host creator-declared, per-submission licenses that are not centrally audited — a "CC0" search-filter match or tag is a starting point, not proof; a stale/incorrect tag or a listing that mixes CC0 assets with non-CC0 ones in the same download is a realistic failure mode | Open the specific asset/listing page and read its stated license in full before use; record the verified license text/URL in `CREDITS.md`, exactly as the design already mandates for all assets |
| A hand-rolled second seeded-PRNG implementation for Expedition-specific randomness (drafts, boss selection, Trained Monkey) | Fragments the "whole run replays deterministically from its seed" guarantee the design explicitly relies on (§6.5) and duplicates already-validated code | Reuse `packages/rules/src/shuffle.ts`'s existing `sfc32`/`cyrb128` pair, carried in Expedition's run state exactly as Hanabi already does |
| Calling a Phaser scene method directly from a Playwright test (bypassing real mouse/pointer events) to "click" something faster | Skips Phaser's actual input pipeline (hit-testing, pointer event propagation), so the test no longer exercises what a real player's click does — defeats the purpose of an E2E test and can pass while real clicks are broken | The design's `window.__expeditionTest` bridge: read a target's screen coordinates from the bridge, then issue a real `page.mouse.click(x, y)` |

## Stack Patterns by Variant

**If bundle size measurement (post-integration, via Lighthouse or `next build`'s own output) shows the ~350 KB gzipped Phaser chunk is a real problem for the Expedition route's load time:**
- Use `phaserjs/custom-build` to produce a trimmed Phaser build excluding unused subsystems (Arcade/Matter physics, unused renderers)
- Because Expedition's design has no physics simulation — cards move via tweens, not collision/gravity — a meaningful chunk of Phaser's default bundle (physics engines) is dead weight that a custom build can remove without any code changes elsewhere

**If card-pack text ends up needing more than a small fixed glyph set (e.g. localized rules text rendered as pixel-art-styled labels, not just rank/suit):**
- Fall back to `Phaser.GameObjects.Text` with a pixel-styled web font (`@font-face`-loaded, `image-rendering: pixelated`-adjacent CSS has no canvas equivalent, but choosing a font designed to look correct without antialiasing, e.g. a font intentionally drawn on a pixel grid, mitigates most of the blur concern) for that specific text, while keeping `BitmapText`/sprite glyphs for the high-frequency card-face rank/suit rendering
- Because forcing every piece of in-game text through a hand-authored bitmap font doesn't scale if text content grows beyond what was scoped in the design (§2 "Out of scope for v1... Audio" and a generally text-light UI suggests this is unlikely to be needed for v1, but noting the fallback for completeness)

## Version Compatibility

| Package A | Compatible With | Notes |
|---|---|---|
| `phaser@4.2.1` | Next.js 16.3.4 / React 19.2.8 (this repo's current pinned versions) | No direct dependency relationship — Phaser is framework-agnostic and mounts into a plain DOM node via a `ref`; verified compatible by the mounting pattern above, which is the standard integration shape used across the Next.js + Phaser community examples reviewed. No known incompatibility with React 19 or Next.js 16's Turbopack production build. |
| `phaser@4.2.1` | TypeScript 5.9.3 (this repo's current pinned version) | Phaser ships its own TypeScript definitions bundled in the package; no `@types/phaser` package needed (that older DefinitelyTyped package is for Phaser 2/CE and should not be installed alongside Phaser 3/4's built-in types). |
| `phaser@4.2.1` | `apps/worker` (Cloudflare Worker) | **Must never be a dependency of `apps/worker`.** Phaser is a browser rendering library; the worker only ever produces/consumes `ExpeditionState`/`ExpeditionAction`/view JSON via `packages/rules` and `packages/schema`, both of which the design keeps framework-free. Installing Phaser at the root or in the worker's `package.json` would be a scope error — install it only in `apps/web`. |
| Bitmap font tooling (Hiero/BMFont) | Phaser's `this.load.bitmapFont(...)` loader | Output format expected is the standard AngelCode BMFont `.fnt`/`.xml` + texture PNG pair, which both Hiero and BMFont produce; this is a build-time/art-time asset-authoring step, not an npm dependency, so no version pinning applies the way it does for code dependencies. |

## Sources

- `npm view phaser dist-tags / versions / license` — HIGH confidence, directly queried 2026-09-22; confirmed `latest` = `4.2.1`, MIT license, full version history from `3.87.0` through `4.2.1`
- Direct download + inspection of `phaser@4.2.1`'s `dist/` output (`npm pack`, `tar`, `du -sh`, `gzip | wc -c`) — HIGH confidence, measured directly 2026-09-22: `phaser.esm.min.js` = 1.4 MB minified / ~347 KB gzipped
- [Phaser v4 Release Candidate 7](https://phaser.io/news/2026/03/phaser-v4-release-candidate-7) — publication date 2026-03, confirms RC timeline
- [Phaser 3 vs Phaser 4: What Changed and Why You Should Upgrade](https://phaser.io/news/2026/05/phaser-3-vs-phaser-4) — fetched directly 2026-09-22, MEDIUM-HIGH confidence, official Phaser source, confirms "start new projects on Phaser 4," renderer architecture change, migration effort estimate
- [Migrating from Phaser 3 to Phaser 4](https://phaser.io/news/2026/04/migrating-from-phaser-3-to-phaser-4-what-you-need-to-know) — official Phaser source, referenced for migration-effort context (not directly load-bearing since Expedition is greenfield, no migration needed)
- [`phaserjs/phaser` — Phaser 4 Pixel Art Guide](https://github.com/phaserjs/phaser/blob/master/docs/Phaser%204%20Pixel%20Art%20Guide/Phaser%204%20Pixel%20Art%20Guide.md) — fetched directly 2026-09-22, HIGH confidence, official/canonical source for `pixelArt`/`smoothPixelArt`/`roundPixels` config and the bitmap-font-vs-DOM-text guidance
- [Phaser `pixelArt` config docs (3.55.2)](https://newdocs.phaser.io/docs/3.55.2/focus/Phaser.Core.Config-pixelArt) and Phaser `v3.70.0` release notes (github.com/phaserjs/phaser/releases/tag/v3.70.0) — MEDIUM confidence (Phaser 3-era docs, cross-checked against the Phaser 4 guide above which carries the same `roundPixels` GPU-based behavior forward) — used only to corroborate the `roundPixels` default-`true`-since-3.70 fact
- [PixelLab Terms of Service](https://www.pixellab.ai/termsofservice) — fetched directly 2026-09-22, MEDIUM-HIGH confidence (primary source, official ToS text), confirms output ownership, commercial-use permission, the model-training restriction, and user's residual legal-compliance responsibility
- Kenney.nl licensing — WebSearch-corroborated across multiple sources (kenney.nl itself, Godot Forum thread quoting Kenney's policy, Kenney's own social-media statement on CC0) — MEDIUM-HIGH confidence, consistent site-wide CC0 claim across all sources, not independently fetched from kenney.nl's own site in this session
- OpenGameArt.org / itch.io per-submission licensing — WebSearch only, LOW-MEDIUM confidence by design (these platforms are explicitly per-submission/per-listing, so no blanket claim is possible or was made — the finding here is "verify each asset individually," not a specific license fact, so the low-confidence caveat is inherent to the correct guidance rather than a research gap)
- `apps/web/package.json`, `apps/worker/package.json`, root `package.json` (this repo) — HIGH confidence, read directly 2026-09-22, establishes the existing pinned-exact-version convention and workspace boundaries this research follows
- `docs/superpowers/specs/2026-09-22-expedition-design.md` (this repo) — HIGH confidence, read directly, source of truth for all architectural constraints this research maps libraries onto
- Next.js `dynamic(..., { ssr: false })` and React Strict Mode double-invoke behavior — WebSearch-corroborated across multiple independent sources (Vercel's own `next.js` GitHub issue #36233 discussing Strict Mode double-`useEffect` behavior, multiple Next.js/Phaser integration tutorials dated 2025) — MEDIUM confidence, consistent across sources and matches well-documented, long-standing React/Next.js behavior rather than anything Phaser-specific or recently changed

---
*Stack research for: Expedition (v2.0 milestone) — Phaser rendering layer and art sourcing*
*Researched: 2026-09-22*
