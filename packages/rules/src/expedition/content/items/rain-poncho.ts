import { extraWhisper } from "../helpers";
import { ability, defineItem } from "../source-def";

export const rainPoncho = defineItem({
  id: "rain-poncho",
  name: "Rain Poncho",
  text: "Whisper once more this camp.",
  active: ability({
    window: "between-tricks",
    limit: { kind: "per-run", times: 2 },
    targets: [],
    apply: () => [{ op: "add-modifier", lasts: "attempt", audience: "public", params: {} }],
    effect: (e) => extraWhisper(e.seatId),
  }),
});
