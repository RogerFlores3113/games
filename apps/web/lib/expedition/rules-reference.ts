import { BOSS_DISPLAY, GEAR_DISPLAY, type ExpeditionView } from "@games/rules";

export interface RulesItem {
  label: string;
  body: string;
}

export interface RulesSection {
  id: "goal" | "tricks" | "objectives" | "whisper" | "gear" | "this-camp";
  heading: string;
  paragraphs: string[];
  items: RulesItem[];
}

const WINDOW_LABELS = {
  "pre-deal": "before the deal",
  "objective-pick": "while picking objectives",
  "between-tricks": "between tricks",
  passive: "always on",
} as const;

type RulesView = Pick<ExpeditionView, "yourOwnedGearIds" | "activeBossTwistId" | "campNumber" | "yourCapacity">;

function gearSection(view: RulesView | null): RulesSection {
  const owned = view?.yourOwnedGearIds ?? [];
  const capacity = view === null ? null : (view.yourCapacity ?? view.campNumber);
  const paragraphs = [
    "Capacity equals the camp number. Each equipped item can be used once per camp, in its window.",
  ];
  if (capacity !== null) paragraphs.push(`Your capacity this camp: ${capacity}.`);
  const items: RulesItem[] = [];
  for (const id of owned) {
    const gear = GEAR_DISPLAY[id];
    if (!gear) continue;
    const meta = `Size ${gear.size}, ${WINDOW_LABELS[gear.window]}.`;
    items.push({
      label: gear.name,
      body: [meta, gear.text, gear.downside ? `Downside: ${gear.downside}` : null].filter(Boolean).join(" "),
    });
  }
  if (items.length === 0) paragraphs.push("You do not own any gear yet.");
  return { id: "gear", heading: "Gear", paragraphs, items };
}

function campSection(view: RulesView | null): RulesSection {
  const boss = view?.activeBossTwistId ? BOSS_DISPLAY[view.activeBossTwistId] : undefined;
  return {
    id: "this-camp",
    heading: "This camp",
    paragraphs: boss ? [] : ["No boss twist this camp."],
    items: boss ? [{ label: boss.name, body: boss.text }] : [],
  };
}

export function buildRulesReference(view: ExpeditionView | null): RulesSection[] {
  return [
    {
      id: "goal",
      heading: "Goal",
      paragraphs: [
        "Clear 6 camps. A camp is cleared when every objective is done.",
        "A failed camp costs a supply and is replayed with a fresh deal. Run out of supplies and the run ends.",
      ],
      items: [],
    },
    {
      id: "tricks",
      heading: "Tricks",
      paragraphs: [
        "Follow the led suit if you can. Otherwise play anything.",
        "The Sun beats everything and the Moon beats everything but the Sun. Otherwise the highest card of the led suit wins.",
        "The winner leads the next trick. Whoever holds the Sun leads the first trick and picks the first objective.",
      ],
      items: [],
    },
    {
      id: "objectives",
      heading: "Objectives",
      paragraphs: ["Each marker on an objective card tells you what you must do."],
      items: [
        { label: "A card", body: "Win the trick that contains that card." },
        { label: "Order badge (1, 2, ...)", body: "The card must be won in that order relative to the other numbered objectives." },
        { label: "Last", body: "The card must be won in the final trick." },
        { label: "No tricks", body: "The holder must win no tricks this camp." },
        { label: "Exactly N tricks", body: "The holder must win exactly N tricks this camp." },
      ],
    },
    {
      id: "whisper",
      heading: "The Whisper",
      paragraphs: [
        "Once per camp, between tricks, show one card from your hand to one teammate. Everyone sees that you whispered, but only they see the card.",
      ],
      items: [],
    },
    gearSection(view),
    campSection(view),
  ];
}
