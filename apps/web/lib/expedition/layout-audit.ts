export interface LayoutEntry {
  kind: "text" | "interactive";
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Violation =
  | { type: "text-overlap"; a: string; b: string }
  | { type: "text-over-control"; text: string; control: string }
  | { type: "out-of-stage"; label: string };

const STAGE_W = 640;
const STAGE_H = 360;
const TOLERANCE = 1;

function overlapDepth(a: LayoutEntry, b: LayoutEntry): { x: number; y: number } {
  return {
    x: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    y: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  };
}

function inside(inner: LayoutEntry, outer: LayoutEntry): boolean {
  return (
    inner.x >= outer.x - TOLERANCE &&
    inner.y >= outer.y - TOLERANCE &&
    inner.x + inner.w <= outer.x + outer.w + TOLERANCE &&
    inner.y + inner.h <= outer.y + outer.h + TOLERANCE
  );
}

export function auditLayout(entries: LayoutEntry[]): Violation[] {
  const violations: Violation[] = [];
  const texts = entries.filter((e) => e.kind === "text");
  const controls = entries.filter((e) => e.kind === "interactive");

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const d = overlapDepth(texts[i]!, texts[j]!);
      if (d.x > TOLERANCE && d.y > TOLERANCE) {
        violations.push({ type: "text-overlap", a: texts[i]!.label, b: texts[j]!.label });
      }
    }
  }

  for (const text of texts) {
    const touching = controls.filter((c) => {
      const d = overlapDepth(text, c);
      return d.x > TOLERANCE && d.y > TOLERANCE;
    });
    if (touching.length === 0) continue;
    const containing = touching.filter((c) => inside(text, c));
    if (containing.length === 1 && touching.length === 1) continue;
    for (const c of touching) {
      violations.push({ type: "text-over-control", text: text.label, control: c.label });
    }
  }

  for (const e of entries) {
    if (e.x < -TOLERANCE || e.y < -TOLERANCE || e.x + e.w > STAGE_W + TOLERANCE || e.y + e.h > STAGE_H + TOLERANCE) {
      violations.push({ type: "out-of-stage", label: e.label });
    }
  }
  return violations;
}
