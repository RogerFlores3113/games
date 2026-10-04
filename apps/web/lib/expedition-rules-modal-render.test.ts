import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SOURCE_DISPLAY, type ExpeditionView } from "@games/rules";
import { ExpeditionRulesModal } from "../components/expedition/ExpeditionRulesModal";

const source = readFileSync(
  fileURLToPath(new URL("../components/expedition/ExpeditionRulesModal.tsx", import.meta.url)),
  "utf-8",
);
const partial: Pick<ExpeditionView, "yourSeatId" | "seats"> = {
  yourSeatId: "s1",
  seats: [{ seatId: "s1", characterId: "scout", upgradeId: null, items: { equipped: [{ uid: "it0", itemId: "bait", remaining: null }], backpack: [], concealed: false }, pool: null, usage: [] }],
};
const game = partial as ExpeditionView;

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
    for (const h of ["Goal", "Tricks", "Objectives", "The Whisper", "Explorers and gear", "Your kit"]) {
      expect(markup).toContain(`>${h}</h3>`);
    }
  });

  it("renders your character and kit from the view", () => {
    const markup = render({ open: true, game });
    expect(markup).toContain("Spyglass (The Scout)");
    expect(markup).toContain(SOURCE_DISPLAY.bait!.name);
  });

  it("source registers Escape, backdrop close and panel stopPropagation", () => {
    expect(source).toMatch(/event\.key === "Escape"/);
    expect(source).toMatch(/onClick=\{onClose\}/);
    expect(source).toContain("stopPropagation");
  });
});
