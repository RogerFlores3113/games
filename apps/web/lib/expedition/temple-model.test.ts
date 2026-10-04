import { describe, expect, it } from "vitest";
import type { ExpeditionModView, ExpeditionObjectiveView, ExpeditionView } from "@games/rules";
import { buildTemplePath } from "./temple-model";

function templeView(plates: ("spades" | "hearts" | "diamonds" | "clubs" | "sun")[], pressed: number, goal: ExpeditionObjectiveView["status"] | null = "pending"): ExpeditionView {
  const temple: ExpeditionModView = { id: "temple", kind: "temple", strength: "full", status: [{ kind: "path", plates, pressed }] };
  return {
    stage: {
      tag: "camp",
      camp: { index: 6 },
      mods: [{ id: "jungle", kind: "location", strength: "full", status: [] }, temple],
      attempt: { attemptNumber: 2, camp: { goals: goal === null ? [] : [{ id: "temple", status: goal }] } },
    },
  } as unknown as ExpeditionView;
}

describe("buildTemplePath", () => {
  it("is null at a camp without a temple", () => {
    const view = templeView(["sun"], 0);
    if (view.stage.tag === "camp") view.stage.mods = view.stage.mods.slice(0, 1);
    expect(buildTemplePath(view)).toBeNull();
  });

  it("lights the pressed plates, marks the next and dims the rest, and says what to lead", () => {
    expect(buildTemplePath(templeView(["spades", "hearts", "clubs", "sun"], 2))).toEqual({
      plates: [
        { plate: "spades", state: "pressed", objectId: "plate:0" },
        { plate: "hearts", state: "pressed", objectId: "plate:1" },
        { plate: "clubs", state: "next", objectId: "plate:2" },
        { plate: "sun", state: "ahead", objectId: "plate:3" },
      ],
      pressed: 2,
      count: "Plates 2/4",
      hint: "Next: lead ♣",
      status: "pending",
      key: "6:2",
    });
  });

  it("asks for the Sun on the last plate, and says when the path is done or broken", () => {
    expect(buildTemplePath(templeView(["spades", "sun"], 1))?.hint).toBe("Next: lead the Sun");
    expect(buildTemplePath(templeView(["spades", "sun"], 2, "done"))).toMatchObject({ count: "Plates 2/2", hint: "Every plate pressed", status: "done" });
    const broken = buildTemplePath(templeView(["spades", "hearts", "sun"], 1, "failed"));
    expect(broken).toMatchObject({ hint: "The path is broken", status: "failed" });
    expect(broken?.plates.map((p) => p.state)).toEqual(["pressed", "ahead", "ahead"]);
  });
});
