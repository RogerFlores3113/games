import { BOSS_DISPLAY, SOURCE_DISPLAY, type ExpeditionView } from "@games/rules";

export interface RulesItem {
  label: string;
  body: string;
}

export interface RulesSection {
  id: "goal" | "tricks" | "objectives" | "whisper" | "kit" | "this-camp";
  heading: string;
  paragraphs: string[];
  items: RulesItem[];
}

type RulesView = Pick<ExpeditionView, "seats" | "yourSeatId" | "activeBossTwistId" | "campNumber">;

function kitSection(view: RulesView | null): RulesSection {
  const you = view?.seats.find((s) => s.seatId === view.yourSeatId);
  const owned = you === undefined ? [] : [...(you.characterId === null ? [] : [you.characterId]), ...you.kit];
  const paragraphs = ["Your character's power and everything you draft are always with you. Each says when and how often it works."];
  const items: RulesItem[] = [];
  for (const id of owned) {
    const source = SOURCE_DISPLAY[id];
    if (!source) continue;
    const meta = source.active === null ? "Always." : `${source.active.windowPhrase}, ${source.active.limitBadge}.`;
    items.push({ label: source.name, body: `${meta} ${source.text}` });
  }
  if (items.length === 0) paragraphs.push("You have not picked a character yet.");
  return { id: "kit", heading: "Your kit", paragraphs, items };
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
    kitSection(view),
    campSection(view),
  ];
}
