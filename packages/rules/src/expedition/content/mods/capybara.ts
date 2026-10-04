import type { SlotTemplate } from "../../run/route";
import { defineBoss } from "./mod-def";

const extra = (n: number) => (prev: readonly SlotTemplate[]): readonly SlotTemplate[] => [...prev, ...Array.from({ length: n }, () => ({ kind: "win-card" as const }))];

export const capybara = defineBoss({
  id: "capybara",
  kind: "animal",
  name: "Capybara",
  weight: 1,
  text: "The capybara does nothing but bring two extra objectives.",
  full: { slots: extra(2) },
  half: { slots: extra(1) },
});
