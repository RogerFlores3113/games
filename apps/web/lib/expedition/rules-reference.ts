import { SOURCE_DISPLAY, type ExpeditionView } from "@games/rules";
import { characterName, sourceBadges, sourceName } from "./source-text";

export interface RulesItem {
  label: string;
  body: string;
}

export interface RulesSection {
  id: "goal" | "tricks" | "objectives" | "whisper" | "explorers" | "kit";
  heading: string;
  paragraphs: string[];
  items: RulesItem[];
}

type RulesView = Pick<ExpeditionView, "seats" | "yourSeatId">;

function kitSection(view: RulesView | null): RulesSection {
  const you = view?.seats.find((s) => s.seatId === view.yourSeatId);
  const owned = you === undefined ? [] : [...(you.characterId === null ? [] : [you.characterId]), ...you.kit];
  const paragraphs = ["Your explorer's power and everything you draft stay with you for the run."];
  const items: RulesItem[] = [];
  for (const id of owned) {
    const source = SOURCE_DISPLAY[id];
    if (!source) continue;
    const label = source.kind === "character" ? `${sourceName(id)} (${characterName(id)})` : source.name;
    items.push({ label, body: `${sourceBadges(id).join(", ")}. ${source.text}` });
  }
  if (items.length === 0) paragraphs.push("You have not picked a character yet.");
  return { id: "kit", heading: "Your kit", paragraphs, items };
}

export function buildRulesReference(view: ExpeditionView | null): RulesSection[] {
  return [
    {
      id: "goal",
      heading: "Goal",
      paragraphs: [
        "Before camp 1 the crew votes on the run: Short (4 camps), Standard (6) or Long (8). Clear every camp to reach the temple. A camp is cleared when every objective is done.",
        "A cleared camp pays coins into the crew's purse. Then everyone drafts, the crew votes on the route to the next camp, and an event waits on the trail. A tied vote is settled by a coin flip.",
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
    {
      id: "explorers",
      heading: "Explorers and gear",
      paragraphs: [
        "Each player picks one of six explorers before camp 1. Each explorer has a base power.",
        "After every cleared camp, take one of three offers: an upgrade to your explorer's power, or an item.",
        "Every power says when it works and how often. Click it in your kit to use it, then pick its targets and confirm.",
      ],
      items: [
        { label: "1 per camp", body: "Works again in the next camp, or when a camp is replayed." },
        { label: "Once per run", body: "One use for the whole expedition." },
        { label: "Single use", body: "The item is used up. You may draft it again later." },
        { label: "Herbs and supplies", body: "Some powers spend the Botanist's herbs or the crew's supplies. Herbs come back after a cleared camp." },
        { label: "Rescue", body: "When an objective fails, anyone with a rescue power may save it. The table waits for them to use it or pass; if nobody saves it, the camp fails." },
      ],
    },
    kitSection(view),
  ];
}
