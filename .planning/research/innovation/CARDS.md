# Innovation (base game) — Card Catalog

**Researched:** 2026-09-19 · **Machine-readable data:** `cards.json` (same directory) · **Status:** complete for 3rd edition (105 cards) and 4th edition (115 cards = 105 + 10 age-11).

## TL;DR

- **Counts are correct:** 3E = 105 cards (age 1 = 15, ages 2–10 = 10 each, exactly 2 per color per age for ages 2–10, 3 per color at age 1). 4E base box = **115** — the same 105 cards (none replaced, none renamed) **plus 10 new age-11 cards**.
- **Both editions are in `cards.json`** under `editions["3"]` and `editions["4"]`. 3E text comes from BGA's source; 4E text is Asmadi's official online card reference. Icons for both editions were checked against a second source (4E: all 460 icon slots checked against Asmadi's official card images, 100% match).
- **Icon slots:** base cards have **4** icon slots, stored as `slots: [TL, BL, BC, BR]` (top-left, bottom-left, bottom-center, bottom-right). Exactly one slot is `"hex"` (the hexagon picture). No base card has a blank slot; `null` would mean an empty slot, but it never appears in base. The 6-slot 3×2 grid is from the expansions (BGA stores `spot_5` = top-right and `spot_6` = top-center for Echoes and Cities; they are always empty on base cards).
- **"I compel" does not exist in the base game** in any edition. It is an Artifacts-of-History expansion mechanic. Base cards only have "I demand" and non-demand effects. No base card has more than one demand, and the demand is always the first effect.
- **Icons:** crown, leaf, lightbulb, castle, factory, clock. **4E renamed them** to prosperity, health, concept, authority, industry, efficiency, and **added a 7th icon, avatar**. It appears on four existing age-10 cards (Software, Robotics, Self Service, The Internet) and on age-11 cards.
- **4E is not a small patch:** 43 of 105 cards changed meaningfully, 3 were restructured (the same effects split into more parts), 29 were reworded only, and 30 did not change. 4E also adds the **junk** zone, the **aslant** splay, **self-execute**, age 11, the avatar icon, and new special-achievement conditions.

## Which edition to build?

- **3rd edition** is what BGA uses by default. Asmadi's page links BGA as "3rd Edition — 4th Coming Soon!", although BGA's source already has 4E behind a game option. 3E needs no junk pile, no aslant splay, and no age 11, and it has fewer "you win" triggers. It is the smaller engine.
- **4th edition** (Asmadi, **2025** according to asmadigames.com; the brief's "~2022–23" estimate is too early) is the version in print, and its official card reference is online. It needs a junk zone, aslant splay (all 4 icons visible), age 11 draws (instead of drawing an 11 ending the game), and reworked special achievements.
- Recommendation: target one edition only. The data supports either one. Building the 3E engine first and adding 4E later is feasible: 30 cards are unchanged and 29 only reworded, but 4E adds 10 age-11 cards.

## Card anatomy (for the type system)

| Field | Values | Notes |
|---|---|---|
| `age` | 1–10 (1–11 in 4E) | Also the card's "value". |
| `color` | red, yellow, green, blue, purple | BGA encodes 0 blue, 1 red, 2 green, 3 yellow, 4 purple. |
| `slots` | `[TL, BL, BC, BR]`, each an icon, `"hex"`, or `null` | Exactly one `"hex"` per base card. Splays reveal: left = BR; right = TL+BL; up = BL+BC+BR; aslant (4E) = all four. |
| `dogmaIcon` | one of the 6 (7 in 4E) icons | The icon printed beside every effect. Every effect on a base card uses the same icon. |
| `effects[]` | `{kind: "demand" \| "nonDemand", text}` | In printed order. Text tokens: `[N]` = the age-N value glyph, `{icon}` = icon glyph. |

Icon name map (legacy → 4E official): crown→prosperity, leaf→health, lightbulb→concept, castle→authority, factory→industry, clock→efficiency, (new) avatar. BGA's numeric codes are 1–7 in that order, with 0 = hex.

Hex position statistics (3E): TL 52, BC 15, BL 8, BR 30.

## Sources and cross-checks

| # | Source | Kind | Used for |
|---|---|---|---|
| S1 | [micahstairs/bga-innovation](https://github.com/micahstairs/bga-innovation) (MIT; branch `main-4`, the live BGA implementation): `material.inc.php`, `dbmodel.sql`, `innovation.game.php` | Structured, per edition (`_first`, `_first_and_third`, `_third`, `_fourth` keys) | Primary source for 3E text, icons for both editions, and bgaId |
| S2 | [asmadigames.com/innovation](https://asmadigames.com/innovation/) card reference, codes B001–B115, and the card images `images/cards/BaseN.png` | Official publisher, 4E | Primary source for 4E text, color, age, and dogma icon. The images were used to verify every 4E icon slot by pixel classification |
| S3 | Innovation Official FAQ and cards list, July 2011 ([BGG file 67894](https://boardgamegeek.com/filepage/67894/innovation-official-faq-and-cards-list); PDF mirror on tesera.ru) | Official, 1st-edition era; lists icons in TL, BL, BC, BR order | Cross-check of 3E icons, dogma icons, and effect text |
| S4 | [jrdek/innovation](https://github.com/jrdek/innovation) `cards/base_game.cards` | Independent hand transcription (paraphrased DSL) | Cross-check of icons, dogma icons, and effect counts |
| S5 | [maxhbr/innovation](https://github.com/maxhbr/innovation) `Cards.hs` | Partial (ages 1–2) | Tie-breaker for City States |

**Results:**
- 3E icons: S1 = S3 on **all 105 cards × 4 slots**. S1 = S4 on 104/105. 3E dogma icons: S1 = S4 on 105/105, and S1 = S3 on 104/105.
- 4E: S1 icons = S2 images on **115/115 cards (460 slots)**. S1 dogma icon = S2 on 115/115. S1 4E text = S2 on 102/115 near-verbatim; the rest are listed below.
- 3E text: S1 matches S3 (1E-era) except where the text changed between 1E and 3E. BGA stores 1E and 3E variants separately, and those account for the differences.

**Disagreements found:**

| Card | Disagreement | Resolution |
|---|---|---|
| City States | S4 gives BR = crown; S1, S3, and S5 give castle (and so does the 4E image) | **castle** |
| A.I. | S3 (2011 FAQ) gives dogma icon clock; S1, S4, and S2 give lightbulb | **lightbulb**. The FAQ is probably a 1E print or transcription error |
| Reformation (3E) | S1 `material.inc.php` repeats effect 1's text as effect 2 (copy-paste bug in the display text) | Effect 2 = "You may splay your yellow or purple cards right." (S3, S4, and BGA's own `Card44_3E.php` implementation comment). Corrected in `cards.json` |
| Empiricism (3E) | S4 omits the "twenty or more {lightbulb} → you win" effect | S1 and S3 include it. Kept |
| Robotics (4E) | S1 has 1 effect; S2 has 2 ("Score your top green card." / "Draw and meld a [10]…") | **S2 (official)** used |
| Fission (4E) | S1 splits "Return a top card…" and "Draw a [10]." into 2 effects; S2 has them as 1 | **S2** used |
| Stem Cells (4E) | S1 keeps the 3E sentence "If you score one, you must score them all."; S2 drops it | **S2** used. The 4E "All cards" keyword makes it implicit |
| Classification, Climatology, Space Traffic, City States, Translation, Democracy (4E) | Small wording differences between S1 and S2 (e.g. "take into" vs "transfer to", "at least four" vs "four", "Otherwise," added) | **S2** used |
| Archery, Medicine, Encyclopedia, Socialism (4E) | S1 writes achievement values as glyphs `[1]`; S2 writes plain numbers | Cosmetic. S2 used |

## 3rd → 4th edition diff (base 105 cards)

No card was replaced or renamed. Icons changed on **4 cards only**: Software, Robotics, Self Service, and The Internet (clock or crown or lightbulb slots became avatar; The Internet's dogma icon also changed from clock to avatar). BGA's `innovation.game.php` reverts exactly these four for 3E games, and the official 4E images confirm them. Every other card keeps its icons, and every other card keeps its dogma icon.

| Card | Age | Category | Change |
|---|---|---|---|
| Archery | 1 | substantive | Adds non-demand: junk an available achievement of value 1 or 2. |
| Masonry | 1 | substantive | Monument no longer via melding 4+ castles; new separate effect: claim Monument if exactly three red cards on board. |
| Canal Building | 2 | substantive | Adds alternative: junk all cards in the 3 deck. |
| Fermenting | 2 | substantive | Adds effect: may tuck a green card; if you don't, junk the 2 deck and junk Fermenting if top card. |
| Road Building | 2 | substantive | You meld the opponent's top green card (was transfer to your board). |
| Alchemy | 3 | substantive | Draw count now per color with {castle} (was per three {castle}); red result returns only hand, not drawn cards. |
| Compass | 3 | substantive | Your part: meld a top card without {leaf} from the demander's board (was transfer); counts as meld. |
| Feudalism | 3 | substantive | Demand consequence changed from "unsplay that color" to "junk all available special achievements"; splay effect now also draws a 3. |
| Medicine | 3 | substantive | Adds non-demand: junk an available achievement of value 3 or 4. |
| Paper | 3 | substantive | Second effect now requires scoring a top {leaf} card first. |
| Anatomy | 4 | substantive | Adds third consequence: junk the 4 deck. |
| Colonialism | 4 | substantive | Adds: if green, junk the 5 deck. |
| Invention | 4 | substantive | Wonder condition simplified ("five colors splayed"); first effect reworded. |
| Perspective | 4 | substantive | Score count per color with {lightbulb} (was per two {lightbulb}). |
| Reformation | 4 | substantive | Effects swapped; tuck count now "for every splayed color" instead of "for every two {leaf}". |
| Coal | 5 | substantive | Third effect: choose a color and score your top two cards of it (was: score any top card and the card beneath it). |
| Statistics | 5 | substantive | Demand: value of my choice instead of all highest. |
| Steam Engine | 5 | substantive | Adds: if the scored card is Steam Engine, junk the 6 deck. |
| Encyclopedia | 6 | substantive | Choose any value to meld from score pile (was highest only); adds junk-achievement (5/6/7) effect. |
| Industrialization | 6 | substantive | Now draw and tuck exactly three 6, then return top red card if single most {clock}. |
| Vaccination | 6 | substantive | Demand: returns all cards of one chosen value (was all lowest). |
| Combustion | 7 | substantive | Transfer count: one per color with {crown} on demander's board (was one per four {crown}). |
| Publications | 7 | substantive | Rearrange effect removed; new effect junks/unjunks a special achievement; splay effect moved first. |
| Refrigeration | 7 | substantive | Demand: return all but one card in hand (was half rounded down). |
| Sanitation | 7 | substantive | Adds non-demand: choose 7 or 8, junk that deck. |
| Empiricism | 8 | substantive | Splay up now mandatory on match; on miss, unsplay that color. |
| Mobility | 8 | substantive | Transferred cards must be of different colors. |
| Rocketry | 8 | substantive | Count per color with {clock} (was per two {clock}). |
| Skyscrapers | 8 | substantive | Scores top card of that color and returns the whole color; transfers Skyscrapers to demander's hand if top card. |
| Socialism | 8 | substantive | Completely rewritten: tuck a top card then tuck hand; junk-achievement (8/9/10) effect. Purple-steal clause removed. |
| Ecology | 9 | substantive | Adds effect: may junk the 10 deck. |
| Genetics | 9 | substantive | Draws and melds an 11 (was 10). |
| Services | 9 | substantive | Demand: value of my choice instead of all highest. |
| Suburbia | 9 | substantive | Adds effect: may junk the 9 deck. |
| Bioengineering | 10 | substantive | First effect scores the card directly from opponent board (was transfer to score pile; same result but counts as "score" for Monument-type checks); win threshold fewer than two {leaf} (was three). |
| Databases | 10 | substantive | Demand returns cards equal to value of your highest achievement (was half of score pile rounded up). |
| Globalization | 10 | substantive | Second effect draws and melds an 11 (was draw and score a 6). |
| Miniaturization | 10 | substantive | No longer optional ("You may" removed); adds 11 clause (junk the 11 deck). |
| Robotics | 10 | substantive | Icons changed (BC clock -> avatar); split into two effects; self-executes only if melded card has {factory} or {clock}. |
| Self Service | 10 | substantive | Icons changed (BC crown -> avatar); effects reordered; win needs twice as many achievements as each opponent. |
| Software | 10 | substantive | Icons changed (BL clock -> avatar); melds two 9 (was two 10). |
| Stem Cells | 10 | substantive | Adds effect: draw an 11. ("must score all" clause dropped as implicit). |
| The Internet | 10 | substantive | Icons changed (BC clock -> avatar, BR lightbulb -> avatar); dogma icon clock -> avatar; third effect melds exactly two 10. |
| Machinery | 3 | structural | Splay clause split into its own (third) non-demand effect. |
| Railroad | 7 | structural | "Return hand, then draw three 6" split into two effects. |
| Satellites | 9 | structural | Effects regrouped: splay moved into effect 1, draw three 8 becomes effect 2; "execute..." -> "self-execute". |
| Agriculture | 1 | wording | Tense only. |
| Clothing | 1 | wording | Rephrased; same effect. |
| Metalworking | 1 | wording | Drops redundant "Otherwise, keep it." |
| Pottery | 1 | wording | Tense only (returned -> return). |
| Currency | 2 | wording | Tense only. |
| Mapmaking | 2 | wording | Drops "if it has any" (implicit). |
| Mathematics | 2 | wording | Tense only. |
| Monotheism | 2 | wording | "different from any card" -> "different from every card on my board" (clarification; same intent). |
| Engineering | 3 | wording | Demand takes one top {castle} card of each color (same as "all top cards with {castle}"; effectively wording). |
| Translation | 3 | wording | Drops "If you meld one, you must meld them all" (4E "All cards" keyword makes it implicit). |
| Gunpowder | 4 | wording | "a {castle}" -> "{castle}"; typo fix. |
| Navigation | 4 | wording | Drops "if it has any" (implicit). |
| Astronomy | 5 | wording | "dogma effect" -> "effect". |
| Measurement | 5 | wording | Rephrased; same effect. |
| Physics | 5 | wording | On failure returns only hand (drawn cards are in hand, so net similar); "Otherwise keep them" dropped. |
| Societies | 5 | wording | Article fix only. |
| The Pirate Code | 5 | wording | Icon article and value glyph formatting only. |
| Canning | 6 | wording | Scores a top card without {factory} of each color (was all top cards without {factory}); functionally near-identical. |
| Classification | 6 | wording | "Reveal the color of a card" -> "Reveal a card"; "take" -> "transfer"; "other players" -> "opponents". |
| Democracy | 6 | wording | "any other player" -> "any opponent"; "dogma action" -> "action" (same meaning in non-team play; matters for 4E team rules). |
| Bicycle | 7 | wording | Drops "If you exchange one, you must exchange them all" (implicit in 4E). |
| Electricity | 7 | wording | Wording ("top card of each color") - effectively the same; tense change. |
| Explosives | 7 | wording | Tense only. |
| Lighting | 7 | wording | Tense only. |
| Antibiotics | 8 | wording | Tense only. |
| Collaboration | 9 | wording | "ten or more" -> "at least ten". |
| Computers | 9 | wording | "execute each of its non-demand effects. Do not share them." -> "self-execute it" (4E keyword, same meaning). |
| Fission | 9 | wording | "Remove from the game" -> "junk" all non-achievement cards (same outcome, new zone). |
| Specialization | 9 | wording | "Take into your hand" -> "Transfer to your hand". |

Unchanged (30): Tools, Writing, Oars, Sailing, The Wheel, Domestication, City States, Code of Laws, Mysticism, Calendar, Construction, Philosophy, Optics, Education, Experimentation, Printing Press, Enterprise, Chemistry, Banking, Atomic Theory, Machine Tools, Metric System, Emancipation, Evolution, Quantum Theory, Flight, Corporations, Mass Media, Composites, A.I..

Age 11 (4E only, 10 new cards): Climatology, Solar Sailing, Astrogeology, Fusion, Hypersonics, Space Traffic, Near-Field Comm, Reclamation, Escapism, Whataboutism.

## Special achievements (not among the 105 cards; both editions)

| Name | 3E condition | 4E condition | Card that can also claim it |
|---|---|---|---|
| Empire | Claim this special achievement immediately if you have three or more icons of all six types: {crown} {leaf} {lightbulb} {castle} {factory} {clock} | Claim this special achievement at the end of any action if you have at least three icons of each of these six types: {crown} {leaf} {lightbulb} {castle} {factory} {clock} | May also be claimed via [2] Construction. |
| Monument | Claim this special achievement immediately if you tuck six or score six cards during a single turn. | Claim this special achievement at the end of any action if you have at least four top cards with a demand effect. | May also be claimed via [1] Masonry. |
| Wonder | Claim this special achievement immediately if you have five colors on your board, and each is splayed either up or right. | Claim this special achievement at the end of any action if you have five colors splayed on your board, and each is splayed either right, up, or aslant. | May also be claimed via [4] Invention. |
| World | Claim this special achievement immediately if you have twelve or more {clock} on your board. | Claim this special achievement at the end of any action if you have at least twelve {clock} on your board. | May also be claimed via [3] Translation. |
| Universe | Claim this special achievement immediately if you have five top cards, and each is of value [8] or higher. | Claim this special achievement at the end of any action if you have five top cards, and each is of value at least 8. | May also be claimed via [5] Astronomy. |

Important 4E rule change: special achievements are now checked **at the end of each action**, not immediately. Monument is now "four or more top cards with a demand effect", not "tuck six or score six in one turn". The 4E Masonry, Invention, Astronomy, Translation, and Construction texts in the catalog still claim these by name, under changed conditions. (Source: S1 `material.inc.php` achievement text. Asmadi's site does not list the special achievements under the B codes, so this is single-sourced.)

## Implementation flags and difficulty tally

The flags are **regex-derived** from the card text (`cards.json` → `editions[ed].flags`). They are for estimating work, not for driving rules. Difficulty uses a weighted sum of flags plus a small bonus per extra effect and for text length. Tiers: easy < 2.5 ≤ medium < 5 ≤ hard.

**Edition 3** (105 cards): easy 43, medium 46, hard 16.

| Flag | Count | Cards |
|---|---|---|
| winOrLose | 6 | Empiricism, Collaboration, Bioengineering, Self Service, Globalization, A.I. |
| endsAction | 1 | Fission |
| achievements | 6 | Masonry, Construction, Translation, Invention, Astronomy, Self Service |
| executesOtherCard | 5 | Computers, Satellites, Software, Robotics, Self Service |
| repeat | 4 | Metalworking, Oars, Colonialism, Astronomy |
| transferOrExchange | 36 | 36 cards (see JSON) |
| crossPlayer | 45 | 45 cards (see JSON) |
| demand | 34 | 34 cards (see JSON) |
| splay | 29 | Code of Laws, Philosophy, Engineering, Paper, Machinery, Feudalism, Printing Press, Invention, Enterprise, Reformation, Chemistry, Coal, Banking, Measurement, Statistics, Atomic Theory, Industrialization, Metric System, Canning, Emancipation, Publications, Railroad, Flight, Mass Media, Empiricism, Computers, Satellites, Specialization, The Internet |
| unsplayOrAslant | 1 | Feudalism |
| junk | 0 |  |
| youMay | 53 | 53 cards (see JSON) |
| choice | 17 | Pottery, Clothing, Masonry, Currency, Democracy, Evolution, Publications, Lighting, Quantum Theory, Rocketry, Mass Media, Antibiotics, Empiricism, Fission, Collaboration, Suburbia, Bioengineering |
| countsIcons | 12 | City States, Fermenting, Alchemy, Perspective, Reformation, Industrialization, Combustion, Rocketry, Empiricism, Bioengineering, Globalization, The Internet |
| reveal | 10 | Metalworking, Mysticism, Alchemy, Physics, Measurement, Astronomy, Classification, Empiricism, Collaboration, Specialization |
| tuck | 11 | Code of Laws, Monotheism, Colonialism, Reformation, Coal, Steam Engine, Industrialization, Canning, Lighting, Socialism, Suburbia |
| returnCards | 31 | 31 cards (see JSON) |

Hard cards: Self Service (7.65), Collaboration (7.16), Bioengineering (6.79), Fission (6.62), Empiricism (6.32), Satellites (6.01), Globalization (5.99), Oars (5.76), Feudalism (5.66), Combustion (5.28), Machinery (5.17), Banking (5.14), Enterprise (5.13), Construction (5.09), Computers (5.05), Emancipation (5.02)

**Edition 4** (115 cards): easy 40, medium 51, hard 24.

| Flag | Count | Cards |
|---|---|---|
| winOrLose | 9 | Empiricism, Collaboration, Bioengineering, Self Service, Globalization, A.I., Solar Sailing, Astrogeology, Space Traffic |
| endsAction | 1 | Fission |
| achievements | 14 | Archery, Masonry, Construction, Translation, Medicine, Feudalism, Invention, Astronomy, Encyclopedia, Publications, Socialism, Fission, Databases, Self Service |
| executesOtherCard | 7 | Computers, Satellites, Software, Robotics, Self Service, Near-Field Comm, Escapism |
| repeat | 7 | Metalworking, Oars, Colonialism, Astronomy, Fusion, Space Traffic, Reclamation |
| transferOrExchange | 37 | 37 cards (see JSON) |
| crossPlayer | 50 | 50 cards (see JSON) |
| demand | 38 | 38 cards (see JSON) |
| splay | 32 | 32 cards (see JSON) |
| unsplayOrAslant | 4 | Empiricism, Solar Sailing, Astrogeology, Space Traffic |
| junk | 17 | Archery, Canal Building, Fermenting, Medicine, Feudalism, Colonialism, Anatomy, Steam Engine, Encyclopedia, Publications, Sanitation, Socialism, Fission, Ecology, Suburbia, Miniaturization, Escapism |
| youMay | 52 | 52 cards (see JSON) |
| choice | 26 | Pottery, Masonry, Currency, Canal Building, Invention, Coal, Statistics, Encyclopedia, Vaccination, Democracy, Evolution, Sanitation, Lighting, Quantum Theory, Rocketry, Mass Media, Antibiotics, Empiricism, Fission, Collaboration, Suburbia, Services, Bioengineering, Climatology, Fusion, Near-Field Comm |
| countsIcons | 12 | City States, Fermenting, Alchemy, Perspective, Industrialization, Canning, Combustion, Rocketry, Empiricism, Bioengineering, Globalization, Climatology |
| reveal | 13 | Metalworking, Mysticism, Alchemy, Physics, Measurement, Astronomy, Classification, Empiricism, Collaboration, Specialization, Astrogeology, Near-Field Comm, Escapism |
| tuck | 13 | Code of Laws, Fermenting, Monotheism, Colonialism, Reformation, Coal, Steam Engine, Industrialization, Canning, Lighting, Socialism, Suburbia, Space Traffic |
| returnCards | 37 | 37 cards (see JSON) |

Hard cards: Near-Field Comm (8.64), Fission (8.01), Self Service (7.56), Collaboration (7.17), Feudalism (6.77), Empiricism (6.41), Statistics (6.03), Globalization (6.0), Satellites (5.79), Oars (5.73), Bioengineering (5.68), Machinery (5.64), Climatology (5.62), Medicine (5.57), Sanitation (5.55), Archery (5.51), Combustion (5.31), Astrogeology (5.28), Space Traffic (5.18), Banking (5.13), Enterprise (5.12), Construction (5.09), Engineering (5.02), Emancipation (5.02)

**Engine-design notes derived from the flags:**
- **Game-ending cards** (need a `win`/`lose` result that exits mid-dogma): see `winOrLose` above. They include "single player with …" ties, where the game continues if nobody is the single player (A.I., Bioengineering, Globalization). 4E adds a player-elimination "you lose" (Space Traffic).
- **Nested execution** (`executesOtherCard`): Computers, Robotics, Software, Satellites, Self Service (3E and 4E), plus age-11 Near-Field Comm and Escapism in 4E. The dogma resolver must be re-entrant: running one card's non-demand effects inside another card's effect.
- **Repeat loops** (`repeat`): Metalworking, Oars (3E), Astronomy, Colonialism, Fusion, Space Traffic, and others. These need loop guards against empty decks, since drawing past age 10 ends the game in 3E.
- **Achievement interaction**: claims special achievements by name (Masonry, Construction, Translation, Invention, Astronomy). 4E adds junking available achievements (Archery, Medicine, Encyclopedia, Socialism, Feudalism, Publications).
- **Cross-player transfer/exchange**: most demands, plus Canal Building, Bicycle (own zones only), Classification, Specialization, Road Building, Compass, and Whataboutism (4E) swapping entire score piles.
- **"If you do" / "due to the demand" memory**: Oars, Gunpowder, Vaccination, The Pirate Code, and Democracy ("so far during this action") need the dogma context to record what happened in earlier effects.

## Full catalog

Slots are listed in TL / BL / BC / BR order. HEX = hexagon image. The 3E text is shown; the 4E text is shown only where it differs. **[DEMAND]** marks an "I demand" effect. Age-11 cards are 4E-only.

### Age 1

| Card | Color | Slots (3E) | Dogma | 3E effects | 4E (if different) |
|---|---|---|---|---|---|
| **Archery** (B001, bga 3) | red | castle / bulb / HEX / castle | castle | 1. **[DEMAND]** I demand you draw a [1], then transfer the highest card in your hand to my hand! | 1. **[DEMAND]** I demand you draw a [1], then transfer the highest card in your hand to my hand!<br>2. Junk an available achievement of value 1 or 2. |
| **Metalworking** (B002, bga 4) | red | castle / castle / HEX / castle | castle | 1. Draw and reveal a [1]. If it has a {castle}, score it and repeat this dogma effect. Otherwise, keep it. | 1. Draw and reveal a [1]. If it has {castle}, score it and repeat this effect. |
| **Oars** (B003, bga 5) | red | castle / crown / HEX / castle | castle | 1. **[DEMAND]** I demand you transfer a card with a {crown} from your hand to my score pile! If you do, draw a [1], and repeat this dogma effect!<br>2. If no cards were transferred due to this demand, draw a [1]. |  |
| **Agriculture** (B004, bga 9) | yellow | HEX / leaf / leaf / leaf | leaf | 1. You may return a card from your hand. If you do, draw and score a card of value one higher than the card you returned. | 1. You may return a card from your hand. If you do, draw and score a card of value one higher than the card you return. |
| **Domestication** (B005, bga 10) | yellow | castle / crown / HEX / castle | castle | 1. Meld the lowest card in your hand. Draw a [1]. |  |
| **Masonry** (B006, bga 11) | yellow | castle / HEX / castle / castle | castle | 1. You may meld any number of cards from your hand, each with a {castle}. If you melded four or more cards in this way, claim the Monument achievement. | 1. You may meld any number of cards from your hand, each with {castle}.<br>2. If you have exactly three red cards on your board, claim the Monument achievement. |
| **Clothing** (B007, bga 6) | green | HEX / crown / leaf / leaf | leaf | 1. Meld a card from your hand of different color from any card on your board.<br>2. Draw and score a [1] for each color present on your board not present on any opponent's board. | 1. Meld a card from your hand of a color not on your board.<br>2. Draw and score a [1] for every color present on your board that no opponent has on their board. |
| **Sailing** (B008, bga 7) | green | crown / crown / HEX / leaf | crown | 1. Draw and meld a [1]. |  |
| **The Wheel** (B009, bga 8) | green | HEX / castle / castle / castle | castle | 1. Draw two [1]. |  |
| **Pottery** (B010, bga 0) | blue | HEX / leaf / leaf / leaf | leaf | 1. You may return up to three cards from your hand. If you returned any cards, draw and score a card of value equal to the number of cards you returned.<br>2. Draw a [1]. | 1. You may return up to three cards from your hand. If you return any, draw and score a card of value equal to the number of cards you return.<br>2. Draw a [1]. |
| **Tools** (B011, bga 1) | blue | HEX / bulb / bulb / castle | lightbulb | 1. You may return three cards from your hand. If you do, draw and meld a [3].<br>2. You may return a [3] from your hand. If you do, draw three [1]. |  |
| **Writing** (B012, bga 2) | blue | HEX / bulb / bulb / crown | lightbulb | 1. Draw a [2]. |  |
| **City States** (B013, bga 12) | purple | HEX / crown / crown / castle | crown | 1. **[DEMAND]** I demand you transfer a top card with a {castle} from your board to my board if you have at least four {castle} on your board! If you do, draw a [1]! |  |
| **Code of Laws** (B014, bga 13) | purple | HEX / crown / crown / leaf | crown | 1. You may tuck a card from your hand of the same color as any card on your board. If you do, you may splay that color of your cards left. |  |
| **Mysticism** (B015, bga 14) | purple | HEX / castle / castle / castle | castle | 1. Draw and reveal a [1]. If it is the same color as any card on your board, meld it and draw a [1]. |  |

### Age 2

| Card | Color | Slots (3E) | Dogma | 3E effects | 4E (if different) |
|---|---|---|---|---|---|
| **Construction** (B016, bga 17) | red | castle / HEX / castle / castle | castle | 1. **[DEMAND]** I demand you transfer two cards from your hand to my hand! Draw a [2]!<br>2. If you are the only player with five top cards, claim the Empire achievement. |  |
| **Road Building** (B017, bga 18) | red | castle / castle / HEX / castle | castle | 1. Meld one or two cards from your hand. If you melded two, you may transfer your top red card to another player board. If you do, transfer that player's top green card to your board. | 1. Meld one or two cards from your hand. If you meld two, you may transfer your top red card to another player's board. If you do, meld that player's top green card. |
| **Canal Building** (B018, bga 21) | yellow | HEX / crown / leaf / crown | crown | 1. You may exchange all the highest cards in your hand with all the highest cards in your score pile. | 1. You may choose to either exchange all the highest cards in your hand with all the highest cards in your score pile, or junk all cards in the [3] deck. |
| **Fermenting** (B019, bga 22) | yellow | leaf / leaf / HEX / castle | leaf | 1. Draw a [2] for every color on your board with one or more {leaf}. | 1. Draw a [2] for every color on your board with {leaf}.<br>2. You may tuck a green card from your hand. If you don't, junk all cards in the [2] deck, and junk Fermenting if it is a top card on any board. |
| **Currency** (B020, bga 19) | green | leaf / crown / HEX / crown | crown | 1. You may return any number of cards from your hand. If you do, draw and score a [2] for every different value of card you returned. | 1. You may return any number of cards from your hand. If you do, draw and score a [2] for every different value of card you return. |
| **Mapmaking** (B021, bga 20) | green | HEX / crown / crown / castle | crown | 1. **[DEMAND]** I demand you transfer a [1] from your score pile, if it has any, to my score pile!<br>2. If any card was transferred due to the demand, draw and score a [1]. | 1. **[DEMAND]** I demand you transfer a [1] from your score pile to my score pile!<br>2. If any card was transferred due to the demand, draw and score a [1]. |
| **Calendar** (B022, bga 15) | blue | HEX / leaf / leaf / bulb | leaf | 1. If you have more cards in your score pile than in your hand, draw two [3]. |  |
| **Mathematics** (B023, bga 16) | blue | HEX / bulb / crown / bulb | lightbulb | 1. You may return a card from your hand. If you do, draw and meld a card of value one higher than the card you returned. | 1. You may return a card from your hand. If you do, draw and meld a card of value one higher than the card you return. |
| **Monotheism** (B024, bga 23) | purple | HEX / castle / castle / castle | castle | 1. **[DEMAND]** I demand you transfer a top card on your board of different color from any card on my board to my score pile! If you do, draw and tuck a [1]!<br>2. Draw and tuck a [1]. | 1. **[DEMAND]** I demand you transfer a top card on your board of a different color from every card on my board to my score pile! If you do, draw and tuck a [1]!<br>2. Draw and tuck a [1]. |
| **Philosophy** (B025, bga 24) | purple | HEX / bulb / bulb / bulb | lightbulb | 1. You may splay left any one color of your cards.<br>2. You may score a card from your hand. |  |

### Age 3

| Card | Color | Slots (3E) | Dogma | 3E effects | 4E (if different) |
|---|---|---|---|---|---|
| **Engineering** (B026, bga 27) | red | castle / HEX / bulb / castle | castle | 1. **[DEMAND]** I demand you transfer all top cards with a {castle} from your board to my score pile!<br>2. You may splay your red cards left. | 1. **[DEMAND]** I demand you transfer a top card with {castle} of each color from your board to my score pile!<br>2. You may splay your red cards left. |
| **Optics** (B027, bga 28) | red | crown / crown / crown / HEX | crown | 1. Draw and meld a [3]. If it has a {crown}, draw and score a [4]. Otherwise, transfer a card from your score pile to the score pile of an opponent with fewer points than you. |  |
| **Machinery** (B028, bga 31) | yellow | leaf / leaf / HEX / castle | leaf | 1. **[DEMAND]** I demand you exchange all the cards in your hand with all the highest cards in my hand!<br>2. Score a card from your hand with a {castle}. You may splay your red cards left. | 1. **[DEMAND]** I demand you exchange all cards in your hand with all the highest cards in my hand!<br>2. Score a card from your hand with {castle}.<br>3. You may splay your red cards left. |
| **Medicine** (B029, bga 32) | yellow | crown / leaf / leaf / HEX | leaf | 1. **[DEMAND]** I demand you exchange the highest card in your score pile with the lowest card in my score pile! | 1. **[DEMAND]** I demand you exchange the highest card in your score pile with the lowest card in my score pile!<br>2. Junk an available achievement of value 3 or 4. |
| **Compass** (B030, bga 29) | green | HEX / crown / crown / leaf | crown | 1. **[DEMAND]** I demand you transfer a top non-green card with a {leaf} from your board to my board, and then you transfer a top card without a {leaf} from my board to your board! | 1. **[DEMAND]** I demand you transfer a top non-green card with {leaf} from your board to my board, and then meld a top card without {leaf} from my board! |
| **Paper** (B031, bga 30) | green | HEX / bulb / bulb / crown | lightbulb | 1. You may splay your green or blue cards left.<br>2. Draw a [4] for every color you have splayed left. | 1. You may splay your green or blue cards left.<br>2. Score a top card with {leaf} from your board. If you do, draw a [4] for every color you have splayed left. |
| **Alchemy** (B032, bga 25) | blue | HEX / leaf / castle / castle | castle | 1. Draw and reveal a [4] for every three {castle} on your board. If any of the drawn cards are red, return the cards drawn and all cards in your hand. Otherwise, keep them.<br>2. Meld a card from your hand, then score a card from your hand. | 1. Draw and reveal a [4] for every color on your board with {castle}. If any of the drawn cards are red, return all cards from your hand.<br>2. Meld a card from your hand, then score a card from your hand. |
| **Translation** (B033, bga 26) | blue | HEX / crown / crown / crown | crown | 1. You may meld all the cards in your score pile. If you meld one, you must meld them all.<br>2. If each top card on your board has a {crown}, claim the World achievement. | 1. You may meld all cards in your score pile.<br>2. If each top card on your board has {crown}, claim the World achievement. |
| **Education** (B034, bga 33) | purple | bulb / bulb / bulb / HEX | lightbulb | 1. You may return the highest card from your score pile. If you do, draw a card of value two higher than the highest card remaining in your score pile. |  |
| **Feudalism** (B035, bga 34) | purple | HEX / castle / leaf / castle | castle | 1. **[DEMAND]** I demand you transfer a card with a {castle} from your hand to my hand! If you do, unsplay that color of your cards!<br>2. You may splay your yellow or purple cards left. | 1. **[DEMAND]** I demand you transfer a card with {castle} from your hand to my hand! If you do, junk all available special achievements!<br>2. You may splay your yellow or purple cards left. If you do, draw a [3]. |

### Age 4

| Card | Color | Slots (3E) | Dogma | 3E effects | 4E (if different) |
|---|---|---|---|---|---|
| **Colonialism** (B036, bga 37) | red | HEX / factory / bulb / factory | factory | 1. Draw and tuck a [3]. If it has a {crown}, repeat this dogma effect. | 1. Draw and tuck a [3]. If it is green, junk all cards in the [5] deck. If it has {crown}, repeat this effect. |
| **Gunpowder** (B037, bga 38) | red | HEX / factory / crown / factory | factory | 1. **[DEMAND]** I demand you transfer a top card with a {castle} from your board to my score pile!<br>2. If any card was transfered due to the demand, draw and score a [2]. | 1. **[DEMAND]** I demand you transfer a top card with {castle} from your board to my score pile!<br>2. If any card was transferred due to the demand, draw and score a [2]. |
| **Anatomy** (B038, bga 41) | yellow | leaf / leaf / leaf / HEX | leaf | 1. **[DEMAND]** I demand you return a card from your score pile! If you do, return a top card of equal value from your board! | 1. **[DEMAND]** I demand you return a card from your score pile! If you do, return a top card of equal value from your board! If you do, junk all cards in the [4] deck! |
| **Perspective** (B039, bga 42) | yellow | HEX / bulb / bulb / leaf | lightbulb | 1. You may return a card from your hand. If you do, score a card from your hand for every two {lightbulb} on your board. | 1. You may return a card from your hand. If you do, score a card from your hand for every color on your board with {lightbulb}. |
| **Invention** (B040, bga 39) | green | HEX / bulb / bulb / factory | lightbulb | 1. You may splay right any one color of your cards currently splayed left. If you do, draw and score a [4].<br>2. If you have five colors splayed, each in any direction, claim the Wonder achievement. | 1. You may choose a color you have splayed left and splay it right. If you do, draw and score a [4].<br>2. If you have five colors splayed, claim the Wonder achievement. |
| **Navigation** (B041, bga 40) | green | HEX / crown / crown / crown | crown | 1. **[DEMAND]** I demand you transfer a [2] or [3] from your score pile, if it has any, to my score pile! | 1. **[DEMAND]** I demand you transfer a [2] or [3] from your score pile to my score pile! |
| **Experimentation** (B042, bga 35) | blue | HEX / bulb / bulb / bulb | lightbulb | 1. Draw and meld a [5]. |  |
| **Printing Press** (B043, bga 36) | blue | HEX / bulb / bulb / crown | lightbulb | 1. You may return a card from your score pile. If you do, draw a card of value two higher than the top purple card on your board.<br>2. You may splay your blue cards right. |  |
| **Enterprise** (B044, bga 43) | purple | HEX / crown / crown / crown | crown | 1. **[DEMAND]** I demand you transfer a top non-purple card with a {crown} from your board to my board! If you do, draw and meld a [4]!<br>2. You may splay your green cards right. |  |
| **Reformation** (B045, bga 44) | purple | leaf / leaf / HEX / leaf | leaf | 1. You may tuck a card from your hand for every two {leaf} on your board.<br>2. You may splay your yellow or purple cards right. | 1. You may splay your yellow or purple cards right.<br>2. You may tuck a card from your hand for every splayed color on your board. |

### Age 5

| Card | Color | Slots (3E) | Dogma | 3E effects | 4E (if different) |
|---|---|---|---|---|---|
| **Coal** (B046, bga 47) | red | factory / factory / factory / HEX | factory | 1. Draw and tuck a [5].<br>2. You may splay your red cards right.<br>3. You may score any one of your top cards. If you do, also score the card beneath it. | 1. Draw and tuck a [5].<br>2. You may splay your red cards right.<br>3. You may choose a color. If you do, score your top two cards of that color. |
| **The Pirate Code** (B047, bga 48) | red | crown / factory / crown / HEX | crown | 1. **[DEMAND]** I demand you transfer two cards of value [4] or less from your score pile to my score pile!<br>2. If any cards were transferred due to the demand, score the lowest top card with a {crown} from your board. | 1. **[DEMAND]** I demand you transfer two cards of value 4 or less from your score pile to my score pile!<br>2. If any cards were transferred due to the demand, score the lowest top card with {crown} from your board. |
| **Statistics** (B048, bga 51) | yellow | leaf / bulb / leaf / HEX | leaf | 1. **[DEMAND]** I demand you transfer all the highest cards in your score pile to your hand!<br>2. You may splay your yellow cards right. | 1. **[DEMAND]** I demand you transfer all the cards of the value of my choice in your score pile to your hand!<br>2. You may splay your yellow cards right. |
| **Steam Engine** (B049, bga 52) | yellow | HEX / factory / crown / factory | factory | 1. Draw and tuck two [4], then score your bottom yellow card. | 1. Draw and tuck two [4]. Score your bottom yellow card. If it is Steam Engine, junk all cards in the [6] deck. |
| **Banking** (B050, bga 49) | green | factory / crown / HEX / crown | crown | 1. **[DEMAND]** I demand you transfer a top non-green card with a {factory} from your board to my board. If you do, draw and score a [5]!<br>2. You may splay your green cards right. |  |
| **Measurement** (B051, bga 50) | green | bulb / leaf / bulb / HEX | lightbulb | 1. You may reveal and return a card from your hand. If you do, splay that color of your cards right, and draw a card of value equal to the number of cards of that color on your board. | 1. You may reveal and return a card from your hand. If you do, splay your cards of that card’s color right and draw a card of value equal to the number of cards of that color on your board. |
| **Chemistry** (B052, bga 45) | blue | factory / bulb / factory / HEX | factory | 1. You may splay your blue cards right.<br>2. Draw and score a card of value one higher than the highest top card on your board and then return a card from your score pile. |  |
| **Physics** (B053, bga 46) | blue | factory / bulb / bulb / HEX | lightbulb | 1. Draw three [6] and reveal them. If two or more of the drawn cards are the same color, return the drawn cards and all cards in your hand. Otherwise, keep them. | 1. Draw three [6] and reveal them. If at least two of the drawn cards are the same color, return all cards in your hand. |
| **Astronomy** (B054, bga 53) | purple | crown / bulb / bulb / HEX | lightbulb | 1. Draw and reveal a [6]. If the card is green or blue, meld it and repeat this dogma effect.<br>2. If all non-purple top cards on your board are value [6] or higher, claim the Universe achievement. | 1. Draw and reveal a [6]. If the card is green or blue, meld it and repeat this effect.<br>2. If all non-purple top cards on your board are value 6 or higher, claim the Universe achievement. |
| **Societies** (B055, bga 54) | purple | crown / HEX / bulb / crown | crown | 1. **[DEMAND]** I demand you transfer a top card with a {lightbulb} higher than my top card of the same color from your board to my board! If you do, draw an [5]! | 1. **[DEMAND]** I demand you transfer a top card with {lightbulb} higher than my top card of the same color from your board to my board! If you do, draw a [5]! |

### Age 6

| Card | Color | Slots (3E) | Dogma | 3E effects | 4E (if different) |
|---|---|---|---|---|---|
| **Industrialization** (B056, bga 57) | red | crown / factory / factory / HEX | factory | 1. Draw and tuck a [6] for every color on your board with one or more {factory}.<br>2. You may splay your red or purple cards right. | 1. Draw and tuck three [6]. Then, if you are the single player with the most {clock}, return your top red card.<br>2. You may splay your red or purple cards right. |
| **Machine Tools** (B057, bga 58) | red | factory / factory / HEX / factory | factory | 1. Draw and score a card of value equal to the highest card in your score pile. |  |
| **Canning** (B058, bga 61) | yellow | HEX / factory / leaf / factory | factory | 1. You may draw and tuck a [6]. If you do, score all your top cards without a {factory}.<br>2. You may splay your yellow cards right. | 1. You may draw and tuck a [6]. If you tuck a card, score a top card without {factory} of each color on your board.<br>2. You may splay your yellow cards right. |
| **Vaccination** (B059, bga 62) | yellow | leaf / factory / leaf / HEX | leaf | 1. **[DEMAND]** I demand you return all the lowest cards in your score pile! If you returned any, draw and meld a [6]!<br>2. If any card was returned as a result of the demand, draw and meld a [7]. | 1. **[DEMAND]** I demand you choose a card in your score pile! Return all the cards from your score pile of its value! If you do, draw and meld a [6]!<br>2. If any card was returned as a result of the demand, draw and meld a [7]. |
| **Classification** (B060, bga 59) | green | bulb / bulb / bulb / HEX | lightbulb | 1. Reveal the color of a card in your hand. Take into your hand all cards of that color from all other player's hands. Then meld all cards of that color from your hand. | 1. Reveal a card from your hand. Transfer to your hand all cards of that card's color from all opponents' hands. Then, meld all cards of that color from your hand. |
| **Metric System** (B061, bga 60) | green | HEX / factory / crown / crown | crown | 1. If your green cards are splayed right, you may splay any one color of your cards right.<br>2. You may splay your green cards right. |  |
| **Atomic Theory** (B062, bga 55) | blue | bulb / bulb / bulb / HEX | lightbulb | 1. You may splay your blue cards right.<br>2. Draw and meld a [7]. |  |
| **Encyclopedia** (B063, bga 56) | blue | HEX / crown / crown / crown | crown | 1. You may meld all the highest cards in your score pile. If you meld one of the highest, you must meld all of the highest. | 1. Choose a value. You may meld all the cards of that value in your score pile.<br>2. You may junk an available achievement of value 5, 6, or 7. |
| **Democracy** (B064, bga 63) | purple | crown / bulb / bulb / HEX | lightbulb | 1. You may return any number of cards from your hand. If you have returned more cards than any other player due to Democracy so far during this dogma action, draw and score an [8]. | 1. You may return any number of cards from your hand. If you have returned more cards than any opponent due to Democracy so far during this action, draw and score an [8]. |
| **Emancipation** (B065, bga 64) | purple | factory / bulb / factory / HEX | factory | 1. **[DEMAND]** I demand you transfer a card from your hand to my score pile! If you do, draw a [6]!<br>2. You may splay your red or purple cards right. |  |

### Age 7

| Card | Color | Slots (3E) | Dogma | 3E effects | 4E (if different) |
|---|---|---|---|---|---|
| **Combustion** (B066, bga 67) | red | crown / crown / factory / HEX | crown | 1. **[DEMAND]** I demand you transfer one card from your score pile to my score pile for every four {crown} on my board!<br>2. Return your bottom red card. | 1. **[DEMAND]** I demand you transfer one card from your score pile to my score pile for every color with {crown} on my board!<br>2. Return your bottom red card. |
| **Explosives** (B067, bga 68) | red | HEX / factory / factory / factory | factory | 1. **[DEMAND]** I demand you transfer the three highest cards from your hand to my hand! If you transferred any, and then have no card in hand, draw a [7]! | 1. **[DEMAND]** I demand you transfer the three highest cards from your hand to my hand! If you transfer any, and have no cards in hand, draw a [7]! |
| **Refrigeration** (B068, bga 71) | yellow | HEX / leaf / leaf / crown | leaf | 1. **[DEMAND]** I demand you return half (rounded down) of the cards in your hand!<br>2. You may score a card from your hand. | 1. **[DEMAND]** I demand you return all but one of the cards in your hand!<br>2. You may score a card from your hand. |
| **Sanitation** (B069, bga 72) | yellow | leaf / leaf / HEX / leaf | leaf | 1. **[DEMAND]** I demand you exchange the two highest cards in your hand with the lowest card in my hand! | 1. **[DEMAND]** I demand you exchange the two highest cards in your hand with the lowest card in my hand!<br>2. Choose [7] or [8]. Junk all cards in that deck. |
| **Bicycle** (B070, bga 69) | green | crown / crown / clock / HEX | crown | 1. You may exchange all the cards in your hand with all the cards in your score pile. If you exchange one, you must exchange them all. | 1. You may exchange all cards in your hand with all cards in your score pile. |
| **Electricity** (B071, bga 70) | green | bulb / factory / HEX / factory | factory | 1. Return all your top cards without a {factory}, then draw an [8] for each card you returned. | 1. Return your top card of each color without {factory}, then draw an [8] for each card you return. |
| **Evolution** (B072, bga 65) | blue | bulb / bulb / bulb / HEX | lightbulb | 1. You may choose to either draw and score an [8] and then return a card from your score pile, or draw a card of value one higher than the highest card in your score pile. |  |
| **Publications** (B073, bga 66) | blue | HEX / bulb / clock / bulb | lightbulb | 1. You may rearrange the order of one color of cards on your board.<br>2. You may splay your yellow or blue cards up. | 1. You may splay your yellow or blue cards up.<br>2. You may junk an available special achievement or make a special achievement in the junk available. |
| **Lighting** (B074, bga 73) | purple | HEX / leaf / clock / leaf | leaf | 1. You may tuck up to three cards from your hand. If you do, draw and score a [7] for every different value of card you tucked. | 1. You may tuck up to three cards from your hand. If you do, draw and score a [7] for every different value of card you tuck. |
| **Railroad** (B075, bga 74) | purple | clock / factory / clock / HEX | clock | 1. Return all cards from your hand, then draw three [6].<br>2. You may splay up any one color of your cards currently splayed right. | 1. Return all cards from your hand.<br>2. Draw three [6].<br>3. You may splay up any one color of your cards currently splayed right. |

### Age 8

| Card | Color | Slots (3E) | Dogma | 3E effects | 4E (if different) |
|---|---|---|---|---|---|
| **Flight** (B076, bga 77) | red | crown / HEX / clock / crown | crown | 1. If your red cards are splayed up, you may splay any one color of your cards up.<br>2. You may splay your red cards up. |  |
| **Mobility** (B077, bga 78) | red | HEX / factory / clock / factory | factory | 1. **[DEMAND]** I demand you transfer the two highest non-red top cards without a {factory} from your board to my score pile! If you transferred any cards, draw an [8]! | 1. **[DEMAND]** I demand you transfer your two highest non-red top cards without {factory} of different colors to my score pile! If you transfer any cards, draw an [8]! |
| **Antibiotics** (B078, bga 81) | yellow | leaf / leaf / leaf / HEX | leaf | 1. You may return up to three cards from your hand. For every different value of card that you returned, draw two [8]. | 1. You may return up to three cards from your hand. For every different value of card that you return, draw two [8]. |
| **Skyscrapers** (B079, bga 82) | yellow | HEX / factory / crown / crown | crown | 1. **[DEMAND]** I demand you transfer a top non-yellow card with a {clock} from your board to my board! If you do, score the card beneath it, and return all other cards from that pile! | 1. **[DEMAND]** I demand you transfer a top non-yellow card with {clock} from your board to mine! If you do, score your top card of that color, then return all cards of that color from your board, and transfer Skyscrapers to my hand if it is a top card! |
| **Corporations** (B080, bga 79) | green | HEX / factory / factory / crown | factory | 1. **[DEMAND]** I demand you transfer a top non-green card with a {factory} from your board to my score pile! If you do, draw and meld an [8]!<br>2. Draw and meld an [8]. |  |
| **Mass Media** (B081, bga 80) | green | bulb / HEX / clock / bulb | lightbulb | 1. You may return a card from your hand. If you do, choose a value, and return all cards of that value from all score piles.<br>2. You may splay your purple cards up. |  |
| **Quantum Theory** (B082, bga 75) | blue | clock / clock / clock / HEX | clock | 1. You may return up to two cards from your hand. If you return two, draw a [10] and then draw and score a [10]. |  |
| **Rocketry** (B083, bga 76) | blue | clock / clock / clock / HEX | clock | 1. Return a card in any opponent's score pile for every two {clock} on your board. | 1. Return a card in any opponent's score pile for every color on your board with {clock}. |
| **Empiricism** (B084, bga 83) | purple | bulb / bulb / bulb / HEX | lightbulb | 1. Choose two colors, then draw and reveal a [9]. If it is either of the colors you choose, meld it and you may splay your cards of that color up.<br>2. If you have twenty or more {lightbulb} on your board, you win. | 1. Choose two colors, then draw and reveal a [9]. If the drawn card is one of those colors, meld it and splay your cards of its color up, otherwise unsplay that color.<br>2. If you have at least twenty {lightbulb} on your board, you win. |
| **Socialism** (B085, bga 84) | purple | leaf / HEX / leaf / leaf | leaf | 1. You may tuck all cards from your hand. If you tuck one, you must tuck them all. If you tucked at least one purple card, take all the lowest cards in each other player's hand into your hand. | 1. You may tuck a top card from your board. If you do, tuck all cards from your hand.<br>2. You may junk an available achievement of value 8, 9, or 10. |

### Age 9

| Card | Color | Slots (3E) | Dogma | 3E effects | 4E (if different) |
|---|---|---|---|---|---|
| **Composites** (B086, bga 87) | red | factory / factory / HEX / factory | factory | 1. **[DEMAND]** I demand you transfer all but one card from your hand to my hand! Also transfer the highest card from your score pile to my score pile! |  |
| **Fission** (B087, bga 88) | red | HEX / clock / clock / clock | clock | 1. **[DEMAND]** I demand you draw a [10]! If it is red, remove all hands, boards, and score piles from the game! If this occurs, the dogma action is complete.<br>2. Return a top card other than Fission from any player's board. Draw a [10]. | 1. **[DEMAND]** I demand you draw a [10]! If it is red, junk each player's non-achievement cards, and the Dogma action is complete!<br>2. Return a top card other than Fission from any player's board. Draw a [10]. |
| **Ecology** (B088, bga 91) | yellow | leaf / bulb / bulb / HEX | lightbulb | 1. You may return a card from your hand. If you do, score a card from your hand and draw two [10]. | 1. You may return a card from your hand. If you do, score a card from your hand and draw two [10].<br>2. You may junk all cards in the [10] deck. |
| **Suburbia** (B089, bga 92) | yellow | HEX / crown / leaf / leaf | leaf | 1. You may tuck any number of cards from your hand. Draw and score a [1] for each card you tuck. | 1. You may tuck any number of cards from your hand. Draw and score a [1] for each card you tuck.<br>2. You may junk all cards in the [9] deck. |
| **Collaboration** (B090, bga 89) | green | HEX / crown / clock / crown | crown | 1. **[DEMAND]** I demand you draw two [9] and reveal them! Transfer the card of my choice to my board, and meld the other!<br>2. If you have ten or more green cards on your board, you win. | 1. **[DEMAND]** I demand you draw two [9] and reveal them! Transfer the card of my choice to my board, and meld the other!<br>2. If you have at least ten green cards on your board, you win. |
| **Satellites** (B091, bga 90) | green | HEX / clock / clock / clock | clock | 1. Return all cards from your hand, and draw three [8].<br>2. You may splay your purple cards up.<br>3. Meld a card from your hand and then execute each of its non-demand dogma effects. Do not share them. | 1. Return all cards from your hand. You may splay your purple cards up.<br>2. Draw three [8].<br>3. Meld a card from your hand, then self-execute it. |
| **Computers** (B092, bga 85) | blue | clock / HEX / clock / factory | clock | 1. You may splay your red cards or your green cards up.<br>2. Draw and meld a [10], then execute each of its non-demand effects. Do not share them. | 1. You may splay your red or green cards up.<br>2. Draw and meld a [10], then self-execute it. |
| **Genetics** (B093, bga 86) | blue | bulb / bulb / bulb / HEX | lightbulb | 1. Draw and meld a [10]. Score all cards beneath it. | 1. Draw and meld an [11]. Score all cards beneath it. |
| **Services** (B094, bga 93) | purple | HEX / leaf / leaf / leaf | leaf | 1. **[DEMAND]** I demand you transfer all the highest cards from your score pile to my hand! If you transferred any cards, then transfer a top card from my board without a {leaf} to your hand! | 1. **[DEMAND]** I demand you transfer all the cards of the value of my choice from your score pile to my hand! If you do, transfer a top card without {leaf} from my board to your hand! |
| **Specialization** (B095, bga 94) | purple | HEX / factory / leaf / factory | factory | 1. Reveal a card from your hand. Take into your hand the top card of that color from all opponents' boards.<br>2. You may splay your yellow or blue cards up. | 1. Reveal a card from your hand. Transfer to your hand the top card of that color from all opponents' boards.<br>2. You may splay your yellow or blue cards up. |

### Age 10

| Card | Color | Slots (3E) | Dogma | 3E effects | 4E (if different) |
|---|---|---|---|---|---|
| **Miniaturization** (B096, bga 97) | red | HEX / bulb / clock / bulb | lightbulb | 1. You may return a card from your hand. If you returned a [10], draw a [10] for every different value of card in your score pile. | 1. Return a card from your hand. If you return a [10], draw a [10] for every different value of card in your score pile. If you return an [11], junk all cards in the [11] deck. |
| **Robotics** (B097, bga 98) | red | HEX / factory / clock / factory | factory | 1. Score your top green card. Draw and meld a [10], then execute each of its non-demand dogma effects. Do not share them. | slots HEX / factory / avatar / factory<br>1. Score your top green card.<br>2. Draw and meld a [10]. If it has {factory} or {clock}, self-execute it. |
| **Globalization** (B098, bga 101) | yellow | HEX / factory / factory / factory | factory | 1. **[DEMAND]** I demand you return a top card with a {leaf} on your board!<br>2. Draw and score a [6]. If no player has more {leaf} than {factory} on their board, the single player with the most points wins. | 1. **[DEMAND]** I demand you return a top card with {leaf} from your board!<br>2. Draw and meld an [11]. If no player has more {leaf} than {factory} on their board, the single player with the most points wins. |
| **Stem Cells** (B099, bga 102) | yellow | HEX / leaf / leaf / leaf | leaf | 1. You may score all cards from your hand. If you score one, you must score them all. | 1. You may score all cards from your hand.<br>2. Draw an [11]. |
| **Databases** (B100, bga 99) | green | HEX / clock / clock / clock | clock | 1. **[DEMAND]** I demand you return half (rounded up) of the cards in your score pile! | 1. **[DEMAND]** I demand you return a number of cards from your score pile equal to the value of your highest achievement! |
| **Self Service** (B101, bga 100) | green | HEX / crown / crown / crown | crown | 1. Execute each of the non-demand dogma effects of any other top card on your board. Do not share them.<br>2. If you have more achievements than each other player, you win. | slots HEX / crown / avatar / crown<br>1. If you have at least twice as many achievements as each opponent, you win.<br>2. Self-execute any top card other than Self Service on your board. |
| **Bioengineering** (B102, bga 95) | blue | bulb / clock / clock / HEX | clock | 1. Transfer a top card with a {leaf} from any opponent's board to your score pile.<br>2. If any player has fewer than three {leaf} on their board, the single player with the most {leaf} on their board wins. | 1. Score a top card with {leaf} on any opponent's board.<br>2. If any player has fewer than two {leaf} on their board, the single player with the most {leaf} on their board wins. |
| **Software** (B103, bga 96) | blue | clock / clock / clock / HEX | clock | 1. Draw and score a [10].<br>2. Draw and meld two [10], then execute each of the second card's non dogma effects. Do not share them. | slots clock / avatar / clock / HEX<br>1. Draw and score a [10].<br>2. Draw and meld two [9], then self-execute the second card. |
| **A.I.** (B104, bga 103) | purple | bulb / bulb / clock / HEX | lightbulb | 1. Draw and score a [10].<br>2. If Robotics and Software are top cards on any board, the single player with the lowest score wins. |  |
| **The Internet** (B105, bga 104) | purple | HEX / clock / clock / bulb | clock | 1. You may splay your green cards up.<br>2. Draw and score a [10].<br>3. Draw and meld a [10] for every two {clock} on your board. | slots HEX / clock / avatar / avatar<br>dogma avatar<br>1. You may splay your green cards up.<br>2. Draw and score a [10].<br>3. Draw and meld two [10]. |

### Age 11

| Card | Color | Slots (3E) | Dogma | 3E effects | 4E (if different) |
|---|---|---|---|---|---|
| **Astrogeology** (B106, bga 442) | red | — | — | — (4E only) | slots crown / HEX / factory / factory; dogma factory<br>1. Draw and reveal an [11]. Splay its color on your board aslant. If you do, transfer all but your top four cards of that color into your hand.<br>2. If you have at least eight cards in your hand, you win. |
| **Fusion** (B107, bga 443) | red | — | — | — (4E only) | slots clock / clock / clock / HEX; dogma clock<br>1. Score a top card of value 11 on your board. If you do, choose a value one or two lower than the scored card, then repeat this dogma effect using the chosen value. |
| **Near-Field Comm** (B108, bga 446) | yellow | — | — | — (4E only) | slots HEX / crown / avatar / avatar; dogma avatar<br>1. **[DEMAND]** I demand you transfer all the cards of the value of my choice from your score pile to my score pile!<br>2. Reveal and self-execute the highest card in your score pile. |
| **Reclamation** (B109, bga 447) | yellow | — | — | — (4E only) | slots crown / leaf / HEX / leaf; dogma leaf<br>1. Return your three bottom red cards. Draw and meld a card of value equal to half the total sum value of the returned cards, rounded up. If you return three cards, repeat this effect using the color of the melded card. |
| **Hypersonics** (B110, bga 444) | green | — | — | — (4E only) | slots factory / factory / bulb / HEX; dogma factory<br>1. **[DEMAND]** I demand you return exactly two top cards of different colors from your board of the same value! If you do, return all cards of that value or less in your hand and score pile! |
| **Space Traffic** (B111, bga 445) | green | — | — | — (4E only) | slots crown / crown / clock / HEX; dogma crown<br>1. Draw and tuck an [11]. If you tuck directly under an [11], you lose. Otherwise, score all but your top five cards of the color of the tucked card, splay that color aslant, and if you do not have the highest score, repeat this effect. |
| **Climatology** (B112, bga 440) | blue | — | — | — (4E only) | slots leaf / HEX / leaf / leaf; dogma leaf<br>1. **[DEMAND]** I demand you return two top cards from your board each with the icon of my choice other than {leaf}!<br>2. Return a top card on your board. Return all cards in your score pile of equal or higher value than the returned card. |
| **Solar Sailing** (B113, bga 441) | blue | — | — | — (4E only) | slots clock / bulb / bulb / HEX; dogma lightbulb<br>1. Draw and meld an [11]. If its color is not splayed aslant on your board, return all but your top four cards of that color, and splay that color aslant. If there are at least six cards of that color on your board, you win. |
| **Escapism** (B114, bga 448) | purple | — | — | — (4E only) | slots avatar / HEX / avatar / avatar; dogma avatar<br>1. Reveal and junk a card in your hand. Return from your hand all cards of value equal to the value of the junked card. Draw three cards of that value. Self-execute the junked card. |
| **Whataboutism** (B115, bga 449) | purple | — | — | — (4E only) | slots bulb / HEX / avatar / bulb; dogma lightbulb<br>1. **[DEMAND]** I demand you transfer a top card with a demand effect of each color from your board to my board! If you transfer any cards, exchange all cards in your score pile with all cards in my score pile! |

## JSON schema (cards.json)

```ts
type Icon = "crown"|"leaf"|"lightbulb"|"castle"|"factory"|"clock"|"avatar";
type Slot = Icon | "hex" | null;
interface CardEdition {
  slots: [Slot, Slot, Slot, Slot];          // TL, BL, BC, BR
  dogmaIcon: Icon;
  effects: { kind: "demand" | "nonDemand"; text: string }[];
  flags: Record<string, boolean>;            // regex-derived, see meta
  difficultyScore: number; difficulty: "easy"|"medium"|"hard";
  sources: string[]; notes?: string[];
}
interface Card {
  id: string; name: string; age: number; color: "red"|"yellow"|"green"|"blue"|"purple";
  bgaId: number; asmadiCode: string;         // e.g. "B001"
  editions: { "3"?: CardEdition; "4": CardEdition };
  changes3to4?: { slots: boolean; dogmaIcon: boolean; effectCount: boolean; demandAdded: boolean;
    demandRemoved: boolean; category: "none"|"wording"|"structural"|"substantive"; summary?: string };
}
```

Caveats: (1) The 3E text is BGA's transcription and matches printed cards apart from small punctuation. It was cross-checked in substance against the 2011 FAQ (1E) and jrdek (paraphrase), but no independent verbatim 3E card list was found. BGG's "Card changes from 3rd edition" thread (boardgamegeek.com/thread/3215915) returned HTTP 403 and was not read. (2) The flags come from regular expressions; treat them as estimates. (3) The 4E text uses the official site's wording. Numbers written as plain digits in achievement-junk effects (e.g. "value 1 or 2") are kept as printed.
