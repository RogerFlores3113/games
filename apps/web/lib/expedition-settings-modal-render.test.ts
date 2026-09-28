// D-05/SCENE-08 (Plan 12-11): render-contract guards for the Expedition-
// scoped port of Hanabi's `SettingsModal.tsx` shell. Mirrors
// settings-modal-render.test.ts's renderToStaticMarkup + source-scan
// pattern — this "web" vitest project runs in Node (no real DOM), so
// Escape/backdrop-click handlers are proven by scanning the source for the
// keydown registration and stopPropagation, not by dispatching events.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CARD_PACK_IDS, CARD_PACK_LABELS, type CardPackId } from "./expedition/card-pack-ids";
import { ExpeditionSettingsModal } from "../components/expedition/ExpeditionSettingsModal";

const SOURCE_PATH = fileURLToPath(new URL("../components/expedition/ExpeditionSettingsModal.tsx", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf-8");

function baseProps() {
  return {
    open: true,
    onClose: () => {},
    cardPackId: "big-index" as CardPackId,
    onCardPackChange: () => {},
    muted: false,
    onToggleMute: () => {},
  };
}

describe("expedition-settings-modal-render", () => {
  it("renders nothing when open is false", () => {
    const markup = renderToStaticMarkup(createElement(ExpeditionSettingsModal, { ...baseProps(), open: false }));
    expect(markup).toBe("");
  });

  it("when open, renders the dialog shell", () => {
    const markup = renderToStaticMarkup(createElement(ExpeditionSettingsModal, baseProps()));
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Settings"');
  });

  it("renders a card-pack fieldset with one radio per CARD_PACK_IDS entry, current pack checked", () => {
    const markup = renderToStaticMarkup(createElement(ExpeditionSettingsModal, baseProps()));
    for (const id of CARD_PACK_IDS) {
      expect(markup).toContain(CARD_PACK_LABELS[id]);
    }
    expect(markup).toContain('name="card-pack"');
    expect(markup).toMatch(/checked="?"?[^>]*value="big-index"|value="big-index"[^>]*checked/);
  });

  it("renders a mute toggle with aria-pressed reflecting muted", () => {
    const mutedMarkup = renderToStaticMarkup(createElement(ExpeditionSettingsModal, { ...baseProps(), muted: true }));
    expect(mutedMarkup).toContain('aria-pressed="true"');
    const unmutedMarkup = renderToStaticMarkup(createElement(ExpeditionSettingsModal, { ...baseProps(), muted: false }));
    expect(unmutedMarkup).toContain('aria-pressed="false"');
  });

  it("isHost false: no Delete room and no Restart control", () => {
    const markup = renderToStaticMarkup(
      createElement(ExpeditionSettingsModal, { ...baseProps(), isHost: false, canRestart: true, onRestartLobby: () => {} }),
    );
    expect(markup).not.toContain("Delete room");
    expect(markup).not.toContain("Restart");
  });

  it("isHost true: Delete room present; canRestart true + isHost: Restart present", () => {
    const markup = renderToStaticMarkup(
      createElement(ExpeditionSettingsModal, {
        ...baseProps(),
        isHost: true,
        onDeleteRoom: () => {},
        canRestart: true,
        onRestartLobby: () => {},
      }),
    );
    expect(markup).toContain("Delete room");
    expect(markup).toContain("Restart");
  });

  it("isHost true but canRestart false: no Restart control", () => {
    const markup = renderToStaticMarkup(
      createElement(ExpeditionSettingsModal, {
        ...baseProps(),
        isHost: true,
        onDeleteRoom: () => {},
        canRestart: false,
        onRestartLobby: () => {},
      }),
    );
    expect(markup).toContain("Delete room");
    expect(markup).not.toContain("Restart");
  });

  it("renders a Leave link with href=\"/\"", () => {
    const markup = renderToStaticMarkup(createElement(ExpeditionSettingsModal, baseProps()));
    expect(markup).toContain('href="/"');
  });

  it("source registers an Escape keydown handler, backdrop onClick={onClose}, panel stopPropagation", () => {
    expect(source).toContain('window.addEventListener("keydown"');
    expect(source).toMatch(/event\.key === "Escape"/);
    expect(source).toMatch(/onClick=\{onClose\}/);
    expect(source).toContain("stopPropagation");
  });

  it("source contains the two-step delete confirmation copy", () => {
    expect(source).toContain("This ends the game for everyone and cannot be undone.");
  });

  it("source contains no Hanabi-only concepts", () => {
    expect(source).not.toMatch(/keepHints|TileColorPicker|volume/);
  });
});
