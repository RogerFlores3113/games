import { extraWhisper } from "../helpers";
import { ability, defineItem } from "../source-def";

export const smokeSignal = defineItem({
  id: "smoke-signal",
  name: "Smoke Signal",
  text: "Everyone may whisper once more this camp.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "supplies", cost: 1 },
    targets: [],
    apply: () => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: {} }],
    effect: () => extraWhisper(null),
  }),
});
