import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BOSS_DISPLAY, GEAR_DISPLAY, type ExpeditionView } from "@games/rules";
import { ExpeditionRulesModal } from "../components/expedition/ExpeditionRulesModal";

const source = readFileSync(
  fileURLToPath(new URL("../components/expedition/ExpeditionRulesModal.tsx", import.meta.url)),
  "utf-8",
);
const gearId = Object.keys(GEAR_DISPLAY)[0]!;
const bossId = Object.keys(BOSS_DISPLAY)[0]!;
const game = {
  yourOwnedGearIds: [gearId],
  activeBossTwistId: bossId,
  campNumber: 3,
  yourCapacity: 3,
} as ExpeditionView;

const render = (props: { open: boolean; game: ExpeditionView | null }) =>
  renderToStaticMarkup(createElement(ExpeditionRulesModal, { onClose: () => {}, ...props }));

describe("expedition-rules-modal-render", () => {
  it("renders nothing when closed", () => {
    expect(render({ open: false, game })).toBe("");
  });

  it("renders the dialog shell with every section heading", () => {
    const markup = render({ open: true, game: null });
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-label="Rules"');
    for (const h of ["Goal", "Tricks", "Objectives", "The Whisper", "Gear", "This camp"]) {
      expect(markup).toContain(`>${h}</h3>`);
    }
  });

  it("renders owned gear and the boss twist from the view", () => {
    const markup = render({ open: true, game });
    expect(markup).toContain(GEAR_DISPLAY[gearId]!.name);
    expect(markup).toContain(BOSS_DISPLAY[bossId]!.name);
  });

  it("source registers Escape, backdrop close and panel stopPropagation", () => {
    expect(source).toMatch(/event\.key === "Escape"/);
    expect(source).toMatch(/onClick=\{onClose\}/);
    expect(source).toContain("stopPropagation");
  });
});
