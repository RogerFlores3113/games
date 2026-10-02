import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ART, fittedFallbackLabel, resolveArt, type ArtId } from "./art-registry";
import { ART_FILES } from "./art-files.generated";

const SPRITES_DIR = fileURLToPath(new URL("../../../../public/expedition/sprites/", import.meta.url));

describe("resolveArt", () => {
  it("draws the PNG when its file is on disk, otherwise the labelled fallback", () => {
    expect(resolveArt("campfire", new Set(["camp/campfire.png"]))).toMatchObject({
      kind: "file",
      key: "art:campfire",
      url: "/expedition/sprites/camp/campfire.png",
    });
    expect(resolveArt("campfire", new Set())).toMatchObject({ kind: "fallback", key: "art-fallback:campfire" });
  });
});

describe("fittedFallbackLabel", () => {
  it("keeps a label that fits and drops one that does not", () => {
    expect(fittedFallbackLabel({ file: "x.png", w: 32, h: 32, fallback: { color: 0, label: "panda" } })).toBe("panda");
    expect(fittedFallbackLabel({ file: "x.png", w: 24, h: 24, fallback: { color: 0, label: "pack" } })).toBe("");
    expect(fittedFallbackLabel({ file: "x.png", w: 40, h: 8, fallback: { color: 0, label: "ok" } })).toBe("");
  });
});

describe("ART and ART_FILES", () => {
  it("every listed sprite file belongs to an ART entry and exists under public/expedition/sprites", () => {
    const known: ReadonlySet<string> = new Set(Object.values(ART).map((d) => d.file));
    expect(ART_FILES.filter((f) => !known.has(f))).toEqual([]);
    expect(ART_FILES.filter((f) => !existsSync(`${SPRITES_DIR}${f}`))).toEqual([]);
  });

  it("no two entries share a file", () => {
    const files = (Object.keys(ART) as ArtId[]).map((id) => ART[id].file);
    expect(files.length - new Set(files).size).toBe(0);
  });
});
