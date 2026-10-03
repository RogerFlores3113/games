import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BOSS_DISPLAY, SOURCE_DISPLAY, type ExpeditionView } from "@games/rules";
import { ExpeditionRulesModal } from "../components/expedition/ExpeditionRulesModal";

const source = readFileSync(
  fileURLToPath(new URL("../components/expedition/ExpeditionRulesModal.tsx", import.meta.url)),
  "utf-8",
);
const bossId = Object.keys(BOSS_DISPLAY)[0]!;
const game = {
  yourSeatId: "s1",
  seats: [{ seatId: "s1", characterId: "scout", kit: ["bait"] }],
  activeBossTwistId: bossId,
  campNumber: 3,
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
    for (const h of ["Goal", "Tricks", "Objectives", "The Whisper", "Your kit", "This camp"]) {
      expect(markup).toContain(`>${h}</h3>`);
    }
  });

  it("renders your character, kit and the boss twist from the view", () => {
    const markup = render({ open: true, game });
    expect(markup).toContain(SOURCE_DISPLAY.scout!.name);
    expect(markup).toContain(SOURCE_DISPLAY.bait!.name);
    expect(markup).toContain(BOSS_DISPLAY[bossId]!.name);
  });

  it("source registers Escape, backdrop close and panel stopPropagation", () => {
    expect(source).toMatch(/event\.key === "Escape"/);
    expect(source).toMatch(/onClick=\{onClose\}/);
    expect(source).toContain("stopPropagation");
  });
});
