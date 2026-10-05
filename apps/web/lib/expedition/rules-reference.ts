import { BALANCE_DISPLAY, MOD_DISPLAY, RUN_LENGTH_DISPLAY, SOURCE_DISPLAY, type ExpeditionView } from "@games/rules";
import { ART, ART_URL_PREFIX, modArtId, type ArtId } from "../../components/expedition/phaser/art/art-registry";
import { modIconRows } from "../../components/expedition/phaser/art/mod-icons";
import { characterName, sourceBadges, sourceName } from "./source-text";

export interface RulesItem {
  label: string;
  body: string;
}

export interface RulesSection {
  id: "goal" | "between" | "tricks" | "objectives" | "whisper" | "gear" | "temple" | "kit";
  heading: string;
  paragraphs: string[];
  items: RulesItem[];
}

type RulesView = Pick<ExpeditionView, "seats" | "yourSeatId">;

function kitSection(view: RulesView | null): RulesSection {
  const you = view?.seats.find((s) => s.seatId === view.yourSeatId);
  const itemIds = you === undefined ? [] : [...you.items.equipped, ...(you.items.backpack ?? [])].map((item) => item.itemId);
  const owned = you === undefined ? [] : [...(you.characterId === null ? [] : [you.characterId]), ...(you.upgradeId === null ? [] : [you.upgradeId]), ...new Set(itemIds)];
  const paragraphs = ["Your explorer's power, its upgrades and every item you carry stay with you for the run."];
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

const { short, standard, long } = RUN_LENGTH_DISPLAY;
const B = BALANCE_DISPLAY;
const count = (n: number, one: string, many: string): string => `${n === 1 ? "one" : n} ${n === 1 ? one : many}`;

export function buildRulesReference(view: ExpeditionView | null): RulesSection[] {
  return [
    {
      id: "goal",
      heading: "Goal",
      paragraphs: [
        `Before camp 1 the crew votes on the run: ${short.name} (${short.camps} camps), ${standard.name} (${standard.camps}) or ${long.name} (${long.camps}). The last camp is the temple.`,
        `A camp is cleared when every objective is done. A failed camp costs ${count(B.failureCost, "supply", "supplies")} and is replayed with a fresh deal. The crew starts with ${B.suppliesStart} supplies and holds at most ${B.suppliesMax}. With none left, the run ends.`,
      ],
      items: [],
    },
    {
      id: "between",
      heading: "Between camps",
      paragraphs: [
        `A cleared camp pays ${B.payout.base} coins into the crew's purse, plus ${B.payout.perUnplayedTrick} for each unplayed trick, up to ${B.payout.unplayedCap * B.payout.perUnplayedTrick} more.`,
        `Everyone then drafts one of ${B.draftOptions} bundles of items. The crew votes on the route to the next camp, and a tied vote is settled by a coin flip. An event waits on the trail.`,
        `Before a boss camp the crew shops with the purse: supplies (${B.supplyPrice} coins), items, and your own character's upgrades (${B.upgradePrice} coins). An upgrade also gives you ${count(B.whispersPerUpgrade, "more whisper", "more whispers")} each camp.`,
        `Each explorer has ${B.itemSlots} item slots. Extra items wait in the backpack, and you choose your loadout between camps.`,
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
        "In Rain or a Downpour the crew's first whispers each camp wash away: they are spent, everyone sees them wash away, and nobody sees the card.",
      ],
      items: [],
    },
    {
      id: "gear",
      heading: "Explorers and gear",
      paragraphs: [
        "Each player picks one explorer before camp 1, and each has a base power. Click a power or item in your kit to use it, then pick its targets and confirm.",
        "Every power and item says when it works and how often.",
      ],
      items: [
        { label: "Once per run", body: "One use for the whole expedition." },
        { label: "Single use", body: "The item is used up. You may draft it again later." },
        { label: "Once per camp", body: "A power or item that works again in the next camp, or when a camp is replayed." },
        { label: "N charges", body: "The item can be used N times, then it is spent." },
        { label: "Always on", body: "Nothing to click. It works for as long as you carry it." },
        { label: "Rescue", body: "When an objective fails, anyone with a rescue power may save it. The table waits for them to use it or pass; if nobody saves it, the camp fails." },
      ],
    },
    {
      id: "temple",
      heading: "The temple",
      paragraphs: [
        "At the last camp, lead each plate's suit in order, ending with the Sun. Every plate must be pressed, or the camp fails. The Sun is also an objective someone must win.",
        "Winning the Sun earns the crew a Skip. Any seat can spend it between tricks or in rescue to drop one open objective.",
        "Bosses you beat earlier return as helpers at half strength.",
      ],
      items: [],
    },
    kitSection(view),
  ];
}

/** `icon` is the 9x9 pixel icon the canvas draws for it, as rows of palette letters. */
export type ModEntry = { id: string; name: string; text: string; imageUrl: string | null; icon: readonly string[] };
export type ModGroup = { id: string; heading: string; note: string | null; entries: ModEntry[] };
export type ModPage = { id: "locations" | "weather" | "bosses"; label: string; groups: ModGroup[] };
export type ReferencePageId = "rules" | ModPage["id"];

export const REFERENCE_PAGES: readonly { id: ReferencePageId; label: string }[] = [
  { id: "rules", label: "Rules" },
  { id: "locations", label: "Locations" },
  { id: "weather", label: "Weather" },
  { id: "bosses", label: "Bosses" },
];

const artUrl = (id: ArtId): string => `${ART_URL_PREFIX}${ART[id].file}`;

function entriesOf(kind: string, imageOf: (id: string, kind: string) => string | null): ModEntry[] {
  return Object.values(MOD_DISPLAY)
    .filter((mod) => mod.kind === kind)
    .map((mod) => ({ id: mod.id, name: mod.name, text: mod.text, imageUrl: imageOf(mod.id, mod.kind), icon: modIconRows(mod.id, mod.kind) }));
}

function modImage(id: string, kind: string): string | null {
  const art = modArtId({ id, kind });
  return art === null ? null : artUrl(art);
}

/** Where a boss tier waits: "One waits at camp 3 of a Standard or Long run." */
function tierNote(tier: "animal" | "disaster"): string {
  const byCamp = new Map<number, string[]>();
  for (const length of Object.values(RUN_LENGTH_DISPLAY)) {
    for (const boss of length.bossCamps) if (boss.tier === tier) byCamp.set(boss.at, [...(byCamp.get(boss.at) ?? []), length.name]);
  }
  return `One waits at ${[...byCamp].map(([at, names]) => `camp ${at} of a ${names.join(" or ")} run`).join(", or ")}.`;
}

/** Weather has no art file: its entries show the pixel icon the canvas draws. */
export function buildModPages(): ModPage[] {
  return [
    {
      id: "locations",
      label: "Locations",
      groups: [
        {
          id: "location",
          heading: "Locations",
          note: "The route shows where each camp is. Camp 1 is always the Jungle.",
          entries: entriesOf("location", modImage),
        },
      ],
    },
    {
      id: "weather",
      label: "Weather",
      groups: [
        {
          id: "weather",
          heading: "Weather",
          note:
            `Most camps have fair weather (${B.fairWeatherChance}% of routes, fewer on the Clifftop). Other weather is drawn for the route. ` +
            `On the Clifftop bad weather hits harder: Rain washes away ${B.washes.rain.exposed} more whispers, a Downpour ${B.washes.downpour.exposed} more, ` +
            `and lightning can strike ${B.strikes.max + B.strikes.exposed} times.`,
          entries: entriesOf("weather", () => null),
        },
        {
          id: "pairing",
          heading: "Pairings",
          note: "Some weather changes a location. These are never drawn on their own.",
          entries: entriesOf("pairing", () => null),
        },
      ],
    },
    {
      id: "bosses",
      label: "Bosses",
      groups: [
        { id: "animal", heading: "Animal bosses", note: tierNote("animal"), entries: entriesOf("animal", modImage) },
        { id: "disaster", heading: "Disaster bosses", note: tierNote("disaster"), entries: entriesOf("disaster", modImage) },
        {
          id: "temple",
          heading: "The temple",
          note: null,
          entries: entriesOf("temple", (id) => (id === "temple" ? artUrl("bg-temple") : null)),
        },
      ],
    },
  ];
}
