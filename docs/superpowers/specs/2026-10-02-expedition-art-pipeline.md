# Expedition art pipeline (Phase 14)

## Shape

One registry owns every sprite the scenes draw:
`apps/web/components/expedition/phaser/art/art-registry.ts`.

```ts
type ArtId = keyof typeof ART;
interface ArtDef {
  file: string;            // under /expedition/sprites/, e.g. "camp/campfire.png"
  w: number; h: number;    // frame size in stage px
  frames?: number;         // horizontal strip; animated when > 1
  fps?: number;
  fallback: { color: number; label: string }; // drawn when the PNG is missing
}
```

- Scenes never call `this.add.image` with a raw key. They call `placeArt(scene, id,
  x, y)`, which returns a sprite from the loaded texture, or a labelled placeholder
  rectangle in `fallback.color` when the file is absent. Art can land one file at a
  time without breaking any scene.
- A `preload()` step loads every `ART` entry whose file exists. A generated manifest
  (`art-files.generated.ts`, written by the art script) lists the files actually on
  disk, so the browser never requests a 404.
- Card faces stay procedural (card packs). Fonts stay procedural.

## Sources and records

- Generated with PixelLab through its MCP tools. Each asset's prompt spec lives in
  `apps/web/art/expedition/prompts/<id>.json`: `{ id, tool, prompt, negative,
  size, view, direction, outline, shading, detail, palette, seed }`. Re-running the
  same spec reproduces the style.
- PNGs are committed under `apps/web/public/expedition/sprites/`.
- `apps/web/public/expedition/CREDITS.md` gets one row per asset when it is added:
  asset, file, source (PixelLab generation and spec path, or the pack's URL), licence,
  date. PixelLab output is used under the account's PixelLab terms. CC0 packs are
  recorded with their licence URL.
- Nothing shows people or watermarks. The crew is never drawn as humans. Seats are
  shown as camp gear (a backpack and bedroll per seat) and the mascot is a red panda.

## Style

Night jungle, warm firelight, limited palette anchored on the existing palette tokens
(`palette.ts`): deep greens and blue-black sky, firelight orange and gold, moss and
bark browns. Single-pixel dark outline, simple shading, no dithering noise. Side or
low top-down view to match the stump table.

## Asset list

| Id | Size | Scene | Notes |
|---|---|---|---|
| `bg-jungle-night` | 640x360 | camp | Backdrop: canopy silhouettes, vines, stars. Leaves the centre calm for the stump |
| `stump-table` | 368x128 | camp | Oval tree-stump tabletop, rings visible, seen from above at an angle |
| `campfire` | 32x32 x4 | camp, fireside | Animated flames |
| `lantern` | 16x32 | camp | Hanging oil lantern |
| `firefly` | 4x4 x2 | camp | Glow blink |
| `mascot-panda` | 32x32 x4 | camp | Red panda idle loop. Extra strips: `mascot-cheer`, `mascot-flop` |
| `crate` | 12x10 | camp, fireside | Supply crate |
| `seat-pack` | 24x24 | camp | Backpack and bedroll marking a seat |
| `leader-sun` | 10x10 | camp | Leader marker |
| `icon-whisper` | 12x12 | camp | A leaf with a small speech curl |
| `icon-tricks` | 10x10 | camp | Stack of won cards |
| `gear-<id>` | 16x16 | all | One per gear: whistle, spyglass, flare, camouflage net, compass, monkey, machete, poncho, trail map, tonic bottle |
| `bg-fireside` | 640x360 | fireside | Clearing at night around a fire, logs to sit on |
| `trail-map` | 608x64 | fireside, run end | Parchment strip with a winding path, room for 6 markers and the temple |
| `marker-camp` / `marker-cleared` / `marker-boss` / `temple` | 16x16 | fireside, run end | Trail markers |
| `backpack-open` | 96x64 | fireside | Open backpack the slots sit on |
| `bg-temple-dawn` | 640x360 | run end (won) | Overgrown temple at dawn |
| `bg-trail-dusk` | 640x360 | run end (lost) | Trail at dusk, empty camp |
