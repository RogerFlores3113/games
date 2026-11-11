import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHARACTER_DISPLAY, SOURCE_DISPLAY } from "@games/rules";
import { PLACEHOLDER_SOURCE_ICONS, crewArtId, sourceArtId } from "./art-registry";

const SPRITES_DIR = fileURLToPath(new URL("../../../../public/expedition/sprites/", import.meta.url));

describe("source icons", () => {
  it("every catalogue source has an icon entry and its PNG", () => {
    const missing = Object.keys(SOURCE_DISPLAY).filter((id) => sourceArtId(id) === null || !existsSync(`${SPRITES_DIR}sources/${PLACEHOLDER_SOURCE_ICONS[id] ?? id}.png`));
    expect(missing).toEqual([]);
  });

  it("every character has a silhouette entry and its PNG", () => {
    const missing = Object.keys(CHARACTER_DISPLAY).filter((id) => crewArtId(id) === null || !existsSync(`${SPRITES_DIR}crew/${id}.png`));
    expect(missing).toEqual([]);
  });
});
