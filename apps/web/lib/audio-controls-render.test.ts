import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AudioControls, type AudioControlsProps } from "../components/hanabi/AudioControls";

const HOOK_SOURCE = readFileSync(
  fileURLToPath(new URL("../components/hanabi/useHanabiAudio.ts", import.meta.url)),
  "utf-8",
);
const CONTROLS_SOURCE = readFileSync(
  fileURLToPath(new URL("../components/hanabi/AudioControls.tsx", import.meta.url)),
  "utf-8",
);

function render(props: AudioControlsProps): string {
  return renderToStaticMarkup(createElement(AudioControls, props));
}

const BASE_PROPS: AudioControlsProps = {
  muted: false,
  volume: 0.5,
  onToggleMute: () => {},
  onVolumeChange: () => {},
};

describe("AudioControls markup", () => {
  it("renders an accessible mute toggle and volume slider when unmuted", () => {
    const markup = render(BASE_PROPS);
    expect(markup).toContain('aria-label="Mute sound"');
    expect(markup).toContain('data-testid="audio-mute-toggle"');
    expect(markup).toContain('data-testid="audio-volume"');
    expect(markup).toContain('aria-label="Sound volume"');
    expect(markup).toContain('min="0"');
    expect(markup).toContain('max="100"');
    expect(markup).toContain('value="50"');
  });

  it("renders 'Unmute sound' when muted", () => {
    const markup = render({ ...BASE_PROPS, muted: true });
    expect(markup).toContain('aria-label="Unmute sound"');
  });

  it("carries 44px touch targets and accent focus-visible outline classes", () => {
    expect(CONTROLS_SOURCE).toContain("var(--size-touch-min)");
    expect(CONTROLS_SOURCE).toContain("focus-visible:outline-[var(--color-accent)]");
  });
});

describe("useHanabiAudio source guards (D-26)", () => {
  it("never references AudioContext directly — the engine owns it", () => {
    expect(HOOK_SOURCE).not.toContain("AudioContext");
    expect(CONTROLS_SOURCE).not.toContain("AudioContext");
  });

  it("registers pointerdown/keydown gesture-unlock listeners with once/removal semantics", () => {
    expect(HOOK_SOURCE).toMatch(/addEventListener\("pointerdown", unlock/);
    expect(HOOK_SOURCE).toMatch(/addEventListener\("keydown", unlock/);
    expect(HOOK_SOURCE).toMatch(/removeEventListener\("pointerdown", unlock\)/);
    expect(HOOK_SOURCE).toMatch(/removeEventListener\("keydown", unlock\)/);
  });

  it("wires cuesForTransition and the D-29 reconnect baseline reset", () => {
    expect(HOOK_SOURCE).toContain("cuesForTransition");
    expect(HOOK_SOURCE).toContain("prevRef.current = null");
  });
});
