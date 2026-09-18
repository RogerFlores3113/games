// D-13/D-14/D-05 (TILE-03/HINT-03/UI-11, plan 06.2-13): render-contract
// guards for the centre-justified settings modal that now holds every
// non-play preference control (tile colour, volume, mute, hint
// persistence), replacing the bottom-controls-row's scattered toggles.
// Mirrors note-box-render.test.ts's renderToStaticMarkup + source-scan
// pattern — this "web" vitest project runs in Node (no real DOM), so
// Escape/backdrop-click handlers are proven by scanning the source for the
// keydown registration and stopPropagation, not by dispatching events.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsModal } from "../components/hanabi/SettingsModal";
import { TileColorPicker } from "../components/hanabi/TileColorPicker";

const SOURCE_PATH = fileURLToPath(new URL("../components/hanabi/SettingsModal.tsx", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf-8");

function baseProps() {
  return {
    open: true,
    onClose: () => {},
    muted: false,
    volume: 0.5,
    onToggleMute: () => {},
    onVolumeChange: () => {},
    keepHints: false,
    onToggleKeepHints: () => {},
    tileColorId: "slate" as const,
    onTileColorChange: () => {},
  };
}

describe("settings-modal-render", () => {
  it("renders nothing when closed — no settings-modal testid in the markup", () => {
    const markup = renderToStaticMarkup(createElement(SettingsModal, { ...baseProps(), open: false }));
    expect(markup).not.toContain("settings-modal");
  });

  it("when open, renders the dialog shell with an accessible name", () => {
    const markup = renderToStaticMarkup(createElement(SettingsModal, baseProps()));
    expect(markup).toContain('data-testid="settings-modal"');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Settings"');
  });

  it("when open, contains all four control groups: audio volume/mute, keep-hints, and every tile-colour swatch", () => {
    const markup = renderToStaticMarkup(createElement(SettingsModal, baseProps()));
    expect(markup).toContain('data-testid="audio-volume"');
    expect(markup).toContain('data-testid="audio-mute-toggle"');
    expect(markup).toContain('data-testid="keep-hints-toggle"');
    expect(markup).toContain('data-testid="tile-color-swatch-slate"');
    expect(markup).toContain('data-testid="tile-color-swatch-warm-sand"');
    expect(markup).toContain('data-testid="tile-color-swatch-cool-teal"');
    expect(markup).toContain('data-testid="tile-color-swatch-plum"');
    expect(markup).toContain('data-testid="tile-color-swatch-charcoal"');
  });

  it("renders the embedded swatch grid directly — no tile-color-picker-toggle inside the modal", () => {
    const markup = renderToStaticMarkup(createElement(SettingsModal, baseProps()));
    expect(markup).not.toContain("tile-color-picker-toggle");
  });

  it("has a close button", () => {
    const markup = renderToStaticMarkup(createElement(SettingsModal, baseProps()));
    expect(markup).toContain('data-testid="settings-close"');
    expect(markup).toContain('aria-label="Close settings"');
  });

  it("registers an Escape keydown handler on window, calling onClose (mirrors DiscardOverlay)", () => {
    expect(source).toContain('window.addEventListener("keydown"');
    expect(source).toMatch(/event\.key === "Escape"/);
    expect(source).toContain("onClose");
  });

  it("backdrop click calls onClose; the panel stops propagation", () => {
    expect(source).toMatch(/onClick=\{onClose\}/);
    expect(source).toContain("stopPropagation");
  });

  it("the keep-hints touch-target span is a DESCENDANT of the button, not a sibling", () => {
    const buttonIndex = source.indexOf('data-testid="keep-hints-toggle"');
    expect(buttonIndex).toBeGreaterThan(-1);
    const buttonOpenTagEnd = source.indexOf(">", buttonIndex);
    const closingButtonIndex = source.indexOf("</button>", buttonOpenTagEnd);
    const insetSpanIndex = source.indexOf('style={{ inset:', buttonOpenTagEnd);
    expect(insetSpanIndex).toBeGreaterThan(-1);
    expect(insetSpanIndex).toBeLessThan(closingButtonIndex);
  });

  it("source contains no raw hex colour literal (tokens only)", () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("TileColorPicker embedded mode", () => {
  it("embedded renders only the swatch grid — no toggle button", () => {
    const markup = renderToStaticMarkup(
      createElement(TileColorPicker, { value: "slate", onChange: () => {}, embedded: true }),
    );
    expect(markup).not.toContain("tile-color-picker-toggle");
    expect(markup).toContain('data-testid="tile-color-picker-panel"');
    expect(markup).toContain('data-testid="tile-color-swatch-slate"');
  });

  it("default (non-embedded) render is unchanged — the toggle button still gates the panel", () => {
    const markup = renderToStaticMarkup(createElement(TileColorPicker, { value: "slate", onChange: () => {} }));
    expect(markup).toContain('data-testid="tile-color-picker-toggle"');
    expect(markup).not.toContain("tile-color-picker-panel");
  });
});
