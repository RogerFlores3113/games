import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MOD_DISPLAY } from "@games/rules";
import { ART, backdropArtId, fittedFallbackLabel, crewArtId, resolveArt, sourceArtId, type ArtId } from "./art-registry";
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

  it("lists exactly the PNGs on disk (rerun `npm run art:files` after adding one)", () => {
    const onDisk = readdirSync(SPRITES_DIR, { recursive: true, encoding: "utf8" })
      .map((f) => f.replaceAll("\\", "/"))
      .filter((f) => f.endsWith(".png"))
      .sort();
    expect([...ART_FILES]).toEqual(onDisk);
  });

  it("every listed PNG is the size its entry declares, frames side by side", () => {
    const byFile = new Map(Object.values(ART).map((d) => [d.file as string, d]));
    const mismatched = ART_FILES.flatMap((file) => {
      const png = readFileSync(`${SPRITES_DIR}${file}`);
      const actual = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
      const def = byFile.get(file)!;
      const declared = `${def.w * (("frames" in def ? def.frames : undefined) ?? 1)}x${def.h}`;
      return actual === declared ? [] : [`${file}: ${actual} on disk, ${declared} declared`];
    });
    expect(mismatched).toEqual([]);
  });

  it("sourceArtId and crewArtId find the art for an id that has one and null otherwise", () => {
    expect(sourceArtId("botanist.antidote")).toBe("source-botanist.antidote");
    expect(sourceArtId("not-a-source")).toBeNull();
    expect(crewArtId("medic")).toBe("crew-medic");
    expect(crewArtId("bait")).toBeNull();
  });

  it("every location has a backdrop: its own, or the Jungle's camp art for the Jungle", () => {
    const locations = Object.values(MOD_DISPLAY).filter((mod) => mod.kind === "location").map((mod) => mod.id);
    expect(locations.map((id) => [id, backdropArtId(id)])).toEqual(locations.map((id) => [id, id === "jungle" ? "bg-jungle-night" : `bg-${id}`]));
    expect(backdropArtId("nowhere")).toBe("bg-jungle-night");
  });

  it("no two entries share a file", () => {
    const files = (Object.keys(ART) as ArtId[]).map((id) => ART[id].file);
    expect(files.length - new Set(files).size).toBe(0);
  });
});
