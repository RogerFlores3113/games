import { activeBossId } from "../../run/compose";
import { ability, defineItem } from "../source-def";

export const rainPoncho = defineItem({
  id: "rain-poncho",
  name: "Rain Poncho",
  text: "Cancel this camp's boss twist, and nobody may whisper this camp.",
  active: ability({
    window: "pre-deal",
    limit: { kind: "per-run", times: 1 },
    targets: [],
    canUse: (ctx) => (activeBossId(ctx.run) === null ? "There is no boss twist this camp" : true),
    apply: () => [{ op: "cancel-boss-twist" }, { op: "add-modifier", lasts: "attempt", audience: "public", params: {} }],
    effect: () => ({ whisperAllowed: () => () => false }),
  }),
});
