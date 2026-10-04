import { describe, expect, it } from "vitest";
import { currentActorSeatId } from "../camp";
import { cardLabel } from "../deck";
import { attemptOf } from "../run/attempt";
import { CATALOG } from "../run/catalog";
import { rulesFor } from "../run/compose";
import { advanceTo, setupRun } from "../run/run-test-support";
import { applyRunAction } from "../run/stages/registry";
import type { RunState } from "../run/types";
import { inspectRun } from "./inspect";

const SEATS = ["p0", "p1", "p2"];

function caveWithALead(): { run: RunState; leader: string; label: string } {
  const loadout = setupRun({ seatIds: SEATS, seed: "inspect", catalog: CATALOG, camp: 2 });
  if (loadout.stage.tag !== "loadout") throw new Error("expected a loadout");
  const between = advanceTo({ ...loadout, stage: { ...loadout.stage, camp: { ...loadout.stage.camp, location: "cave", weather: "fair" } } }, "between-tricks", CATALOG);
  const camp = attemptOf(between)!.camp;
  const rules = rulesFor(between, CATALOG);
  const leader = currentActorSeatId(camp, rules)!;
  const card = rules.legalPlays(camp, leader)[0]!;
  const result = applyRunAction(between, leader, { type: "play-card", cardId: card.id }, CATALOG);
  if (!result.ok) throw new Error(result.error);
  return { run: result.state, leader, label: cardLabel(card.identity) };
}

describe("inspectRun", () => {
  it("names the seats a face-down play is hidden from", () => {
    const { run, leader, label } = caveWithALead();
    const trick = inspectRun(run, CATALOG).find((s) => s.title === "Trick")!;
    const others = SEATS.filter((s) => s !== leader).join(", ");
    expect(trick.lines[1]).toBe(`played: ${leader} ${label} (hidden from ${others})`);
  });
});
