# Innovation (Base Game) — Rules Research for a Server-Authoritative Engine

**Researched:** 2026-09-19
**Scope:** Carl Chudyk's *Innovation*, base game only (no Echoes, Figures, Cities, Artifacts, Unseen).
**Purpose:** The source of truth for the `packages/rules` Innovation engine. Precision over prose.

Confidence legend: **HIGH** = quoted from an official Asmadi rulebook, or several primary sources agree. **MEDIUM** = one primary source, or an inference from official text plus the reference implementation (BGA). **LOW** = secondary sources only, or sources disagree.

---

## 0. Primary sources used

| Key | Source | What it is |
|---|---|---|
| **R3** | https://asmadigames.com/rules/Innovation_Rules.pdf | Official **3rd Edition** base rulebook (Asmadi, ©2016). Read in full. |
| **R4** | https://asmadigames.com/rules/Inno4E_Base_Rulebook_Spreads.pdf | Official **4th Edition** base-game rulebook (Asmadi, ©2024, retail 2025). Read in full. |
| **RU** | https://asmadigames.com/rules/InnoUlt_Rulebook_v4.1.pdf (also draft `https://www.asmadigames.com/innovation/InnoUlt_Rulebook_v0_9.pdf`) | Official *Innovation Ultimate* rulebook v4.1 (the 4th Edition rules plus all expansions). It has more base-rule detail than R4. |
| **CR4** | https://asmadigames.com/innovation/ (`index.php?cardID=B001` … `B115`) | Official Asmadi **4th Edition card reference**: text of every card plus keyword definitions. All 115 base cards were scraped. |
| **FAQ1** | https://tesera.ru/images/items/53014/Innovation_offical_FAQ_july_2011.pdf (mirror of BGG file https://boardgamegeek.com/filepage/67894/innovation-official-faq-and-cards-list) | "Innovation FAQ and cards list, July 2011", published by Asmadi (compiled by El-ad David Amir). Covers **1st edition**. |
| **BGA-H** | https://en.doc.boardgamearena.com/Gamehelpinnovation | Board Game Arena help page for its live implementation (3rd edition rules). |
| **BGA-A** | https://en.doc.boardgamearena.com/Gamehelpinnovationalpha | BGA help page for the 4th-edition alpha: a list of 4E changes. |
| **BGA-SRC** | https://github.com/micahstairs/bga-innovation (branch `main-4`, MIT license, last commit 2026-03-30) | Source of the BGA implementation. It holds 1st/3rd/4th-edition card text (`material.inc.php`), card icon layouts (`dbmodel.sql`) and rule toggles (`innovation.game.php`). Used as the reference implementation. |

The 3E card text in Appendix A comes from BGA-SRC (`*_first_and_third` / `*_third` keys). The 4E card text comes from CR4.

---

## 1. Editions, what changed, and which one to target

### 1.1 Edition timeline

| Edition | Year | Publisher | Notes | Confidence |
|---|---|---|---|---|
| 1st | 2010 | Asmadi Games | Original. FAQ1 is the official FAQ for it. | HIGH |
| Iello edition | 2011 | Iello | "Same mechanics and card effects, but using a different terminology" (BGA-H). BGA groups it with 1st edition. | MEDIUM |
| 2nd (English reprint) | ~2011–2013 | Asmadi | Reprint with corrections. Found no evidence of rules or card changes beyond 1st edition. | LOW |
| **3rd ("Edition III", sold with/as *Innovation Deluxe*)** | 2016 | Asmadi | New graphics, and **9 cards rebalanced** (Oars, Fermenting, Feudalism, Measurement, Statistics, Societies, Industrialization, Combustion, Fission). Suburbia's wording also changed, but its function did not. | HIGH (the diff was computed from BGA-SRC 1st vs 3rd text, and it matches the BGA-H "nine cards" note) |
| **4th (plus *Innovation Ultimate*)** | Crowdfunded on BackerKit 2023–24. Rulebook ©2024. Retail **2025**. | Asmadi | Large revision: see §1.3. The CR4 site says "in 2025 we released two new products — Innovation 4th Edition (just the base game) and Innovation Ultimate". | HIGH |

Correction to the brief: the 4th edition is **not** a 2022–2023 product. It was developed 2023–2024 (the BGA alpha started around early 2024) and released at retail in 2025.

### 1.2 1st → 3rd edition changes (the 9 rebalanced cards)

Rules text was essentially unchanged. The card changes (from BGA-SRC):

| Card | 1st edition | 3rd edition |
|---|---|---|
| Oars (1) | Demand: transfer a [Crown] card from hand to my score pile; if you do, draw a 1. | Same, plus "**and repeat this dogma effect!**" |
| Fermenting (2) | Draw a 2 for every **two [Leaf]** on your board. | Draw a 2 for every **color with one or more [Leaf]**. |
| Feudalism (3) | Demand: transfer a [Castle] card from your hand to my hand. | Same, plus "If you do, **unsplay that color** of your cards!" |
| Measurement (5) | Return a card, choose a color, splay it right… | "You may **reveal and return** a card… splay **that color** (the returned card's color)…" |
| Statistics (5) | Demand: transfer your highest score card to hand; repeat if you then have exactly 1 card in hand. | Demand: transfer **all the highest** cards in your score pile to your hand. |
| Societies (5) | Demand: transfer a top **non-purple** [Bulb] card. | Demand: transfer a top [Bulb] card **higher than my top card of the same color**. |
| Industrialization (6) | Draw and tuck a 6 for every **two [Factory]**. | …for every **color with one or more [Factory]**. |
| Combustion (7) | Demand: transfer **two** cards from score pile. | Demand: transfer one card **for every four [Crown] on my board**. New effect: "Return your bottom red card." |
| Fission (9) | Non-demand: return a top card other than Fission from any board. | Same, plus "**Draw a 10.**" |

### 1.3 3rd → 4th edition changes

**Rules changes** (R4, RU "What's New / Refresh" list, BGA-A). HIGH unless marked otherwise.

| # | Area | 3rd Edition | 4th Edition |
|---|---|---|---|
| 1 | Card pool | 105 cards, ages 1–10 (15 + 9×10) | **115 cards**: adds **Age 11 "Prudence"** (10 cards). Ages 1–10 keep the same titles, colors and ages, but many are reworded (see Appendix A). |
| 2 | Standard achievements | One card from each age **1–9** (9 achievements) | One card from each age **1–10** (10 achievements, never age 11) |
| 3 | Score-victory trigger | Attempting to draw a card **above 10** | Attempting to draw a card **above 11** ("age 12 or higher") |
| 4 | Icons | 6 icons: Castle, Crown, Leaf, Bulb, Factory, Clock | **7th icon, "Avatar"**, appears in ages 10–11. The icons are renamed Authority (Castle), Prosperity (Crown), Health (Leaf), Concept (Bulb), Industry (Factory), Efficiency (Clock). Empire still counts only the original six. |
| 5 | Splay directions | Left (1 icon revealed), Right (2), Up (3) | Adds **Aslant**, which reveals all 4 slots. |
| 6 | Special achievement timing | Claimed **immediately**, even mid-effect | Claimed **at the end of any action** (condition-based claims). Direct "claim the X achievement" card effects still happen when executed. |
| 7 | Monument condition | Tuck six **or** score six cards in a single turn | **At least four top cards with a DEMAND effect** |
| 8 | Achievement-victory check | Immediate: "if you have enough achievements, you win immediately!" | **Checked at the end of each action**, after special achievements. Ties go to the most achievements, then the first tied player clockwise from the left of the current player. |
| 9 | Special-achievement simultaneity | Turn order clockwise, **the current player wins ties** | The first eligible player **starting to the left of the current player**, so the current player is effectively last |
| 10 | Sharing-bonus "did something" | Cards drawn, **revealed**, melded, tucked, splayed, scored, exchanged, or moved | Anything done to a card **except revealing** (splay, meld, tuck, exchange, transfer, draw, achieve, …) |
| 11 | Removal | "Remove" (Fission only) | **Junk** keyword: face-down out-of-play pile. Many cards junk decks or available achievements. |
| 12 | New keywords | "Execute … Do not share them" | **Self-execute** (run the non-demand effects, unshared), **Super-execute** (not used by base cards), **Chain Rule** (see §5.12), **Lose / Elimination** |
| 13 | "If you do" | No formal rule | Formal: refers to the **entire previous sentence**. To satisfy it you must meet, or have just met, the condition, and what you did must "amount to more than nothing". |
| 14 | Locking in | Icon counts fixed at the start of the action | Made explicit: the *list of effects* and eligibility/vulnerability are locked at the start. Everything else is evaluated live. |
| 15 | Verification | FAQ1: show your hand when you cannot comply | Formal rule: reveal the relevant hidden cards whenever others could not otherwise verify you executed an effect correctly |
| 16 | Player count | 2–4 (4 = free-for-all or 2v2 teams) | Base game supports **2–5**. **Parley rules** apply in **non-team games of 4+ players**. |
| 17 | Win count | 2p/team: 6, 3p: 5, 4p: 4 | `8 − players` (or `8 − teams`), **minimum 3** (base only). Same numbers for 2–4. |
| 18 | Team "other players" | FAQ1 (1st ed): effects referring to "opponents" **or "other players"** ignore your partner | 4E: "opponent" ignores the teammate, but "**other players**" **includes** the teammate |
| 19 | Undefined draw value | FAQ1: nonexistent values are 0 | Explicit: "draw a 0" (becomes 1, and so on). This covers an empty board on a Draw action. |
| 20 | Splay no-ops | FAQ1: re-splaying in the same direction does nothing and does not count for sharing | Explicit: you **cannot** splay a 0/1-card pile or re-splay in the same direction. Attempting it does not count for sharing. |
| 21 | Hidden info | Group choice whether covered board cards are public | Board cards are fully **public** (front/back) to everyone (R4 chart) |

**Card changes, 3E → 4E** (full side-by-side text in Appendix A; classification is mine):
- **10 new cards** (Age 11): Astrogeology, Fusion, Near-Field Comm, Reclamation, Hypersonics, Space Traffic, Climatology, Solar Sailing, Escapism, Whataboutism.
- **43 functionally changed** ages 1–10 cards. Examples: Archery, Masonry, Canal Building, Fermenting, Alchemy, Engineering, Paper, Medicine, Feudalism, Colonialism, Anatomy, Perspective, Reformation, Physics, Coal, Statistics, Steam Engine, Encyclopedia, Industrialization, Vaccination, Publications, Combustion, Refrigeration, Sanitation, Rocketry, Mobility, Skyscrapers, Empiricism, Socialism, Genetics, Fission, Ecology, Suburbia, Services, Bioengineering, Software, Miniaturization, Robotics, Databases, Self Service, Globalization, Stem Cells, The Internet.
- **7 minor functional** changes: Compass, Road Building (meld instead of transfer), Machinery, Railroad, Satellites (effects split or re-split), Computers (self-execute, so the Chain Rule applies), Classification ("opponents" instead of "other players").
- **31 wording/clarification only** changes, and **24 identical**.
- **Icon changes** on existing cards (BGA-SRC setup code reverts these for ≤3E): Software, Robotics, Self Service, The Internet. The Internet's featured icon changed from Clock to **Avatar**.
- Recurring 4E themes: "for every two [X]" becomes "**for every color with [X]**"; demands like "all the highest" become "**value of my choice**"; many cards gain "**Junk** a deck / an available achievement" riders.

### 1.4 What is played online

| Platform | Edition | Evidence |
|---|---|---|
| **Board Game Arena** (largest audience) | **3rd edition** in production (help page: "Last edition (this is the default): rules of the Asmadi 'Innovation Deluxe' pack"). **4th edition in alpha** (`innovationalpha`). The BGA-SRC `main-4` branch lists "4th edition" first among the options. | CR4 site (©2026) says "BoardGameArena (3rd Edition — 4th Coming Soon!)". HIGH for 3E-live. MEDIUM on 4E timing. |
| **Yucata.de** | **Innovation Ultimate (4th edition)** | CR4 site links `yucata.de/en/GameInfo/InnovationUltimate`. HIGH |
| Physical retail (2025+) | 4th edition only | CR4 |

### 1.5 Recommendation: target the **4th Edition**, base game (115 cards), and keep the edition as a data/config layer

Rationale:
1. **It is the current official ruleset.** The publisher maintains a living card reference with appendix notes (CR4) and answers questions by email. Any new physical copy a friend owns is 4E, and BGA is migrating to it.
2. **It is easier to make correct on a server.** In 4E every condition-based special achievement and the achievement-win check are **state checks at action boundaries**. 3E instead needs mid-effect triggers, which are precisely the hard part of an effect-resolution engine. 3E's Monument also needs per-turn tuck/score counters, with subtle "transfer/exchange doesn't count" bookkeeping; 4E's Monument is a pure board-state check.
3. **The written rules are much more precise**: locking in, "if you do", verification, the "all cards" one-at-a-time rule, and the sharing definition. This matters for a rules engine.
4. **Reference data exists.** CR4 has the 4E text for all 115 cards. BGA-SRC (MIT) has the 4E icon layouts as the default data, with 3E deltas as explicit overrides.

Costs and caveats:
- About 10 more cards, junk mechanics, aslant splays, age 11, elimination ("you lose": Space Traffic), and the Chain Rule, which only arises through self-execute cards.
- **4E makes Parley mandatory for non-team 4+ player games.** Scope options: (a) implement Parley (three optional prompts, each costing "return a card from hand"), or (b) support only 2p, 3p and **4p teams (2v2)** in v1, since team games have no Parley. Option (b) is recommended for v1.
- If the friend group is made up of BGA veterans who want to "play what BGA plays", 3E is the defensible alternative. The engine differences are enumerated in §1.3 and can be implemented as roughly 10 rule toggles plus a per-edition card-definition table (this is exactly how BGA-SRC does it).

---

## 2. Components and setup

Sources: R3 p6, R4 p4–5, RU p5, BGA-SRC `dbmodel.sql`. Confidence HIGH.

- **Cards per age** (verified by counting the BGA-SRC card rows): Age 1 = **15**. Ages 2–10 = **10 each**. 4E Age 11 = **10**. Totals: 3E 105, 4E 115.
- Each card has: a unique title, a value (= its age), a color (red, yellow, green, blue, purple), **4 icon slots** (one is a hexagon image with no game effect), and 1–3 dogma effects. Each effect is preceded by the featured icon, and 4E states that "It is always the icon occurring most frequently on the card." Each effect is either a demand (dark box, "I DEMAND") or a non-demand.
  - Icon slot positions (FAQ1 order, and BGA `spot_1..4`): **top-left, bottom-left, bottom-middle, bottom-right**.
- **Setup:**
  1. Shuffle each age into its own face-down deck ("supply pile").
  2. **Standard achievements:** randomly, without looking, take one card from each of **ages 1–9 (3E) / 1–10 (4E, not 11)** and place them face down as available achievements. "You may never look at the identity of normal achievement cards, even if you have achieved them" (R3 p23). "You may not look at the front side of any achievement" (R4).
  3. Place the **5 special achievements** (Monument, Empire, World, Wonder, Universe) face up nearby.
  4. 4E: place the Junk card, which marks the junk pile area.
  5. Each player **draws two age-1 cards**, then **all players simultaneously choose one and meld it** (it becomes their first board card). The other card is their starting hand.
  6. **First player** = the player whose melded card's title comes **first alphabetically**. BGA-H: compare the English titles including leading articles, so "The Wheel" comes before "Tools". Titles are unique, so there are never ties.
  7. **First-turn restriction:** the first player takes **one action** on their first turn. In a **4-player** game (3E) / **4+ player** game (4E), **the first two players** each take only one action on their first turn. All later turns have 2 actions.
     - 2p: P1 gets 1 action, then P2 gets 2, P1 gets 2, …
     - 3p: P1 gets 1, P2 gets 2, P3 gets 2, …
     - 4p (and 4E 5p): P1 gets 1, P2 gets 1, P3 gets 2, P4 gets 2, …
     - Play proceeds clockwise.
- **Player counts:** 3E 2–4 (4 = FFA or 2v2). 4E base 2–5 (Parley for 4+ non-team). Recommended scope: 2–4.

### 2.1 Teams (2v2)
- **3E (R3 p17):** "demand effects are not executed by your teammate, and if you share a non-demand effect with your teammate only, you do not get a free Draw action. Any dogma effect that refers to 'opponent' does not affect your teammate. To win, your team must get 6 achievements combined (you claim achievements without your partner's score), or have the highest combined score if a player draws an 11 or higher."
  - FAQ1 (1st ed) additionally says cards referring to "other players" ignore your partner. LOW for 3E: R3 only mentions "opponent".
  - BGA-SRC offers teams by random draw or seat order (1st/3rd vs 2nd/4th, and so on). The standard seating has partners across the table, which alternates teams in turn order.
- **4E (R4 p31, RU p18):** "A teammate is never vulnerable to your demands, nor are they an 'opponent'." "Any effect that refers to an 'opponent' ignores your teammate, but those that refer to 'other players' affect them." Achievements needed = `8 − #teams` (so 6). "If an individual player wins, their entire team wins." Score victory uses combined team score. In teams, **teammates are never "distant"**, so there is no Parley.
- Team score-victory tiebreak: the rules say "If tied, most achievements wins." Applying this to combined team achievements is my inference. MEDIUM.

---

## 3. Turn structure and the four actions

Source: R3 p6–11, R4 p10–27. HIGH.

"You must take two actions on your turn, in any order. You may perform the same action twice." You cannot pass. A Dogma action on a card that does nothing is legal and is the effective pass (R3 p10: "You are allowed to use the Dogma action on a card that will cause nothing at all to happen"). The free Draw action from sharing does **not** count as one of the two actions (R4 p11).

### 3.1 Draw action
- "Find the highest value … top card you have on your board. Take the top card from that age's supply pile and add it to your hand" (R3).
- **Empty pile:** "If a supply pile is empty and you need to draw from it, instead draw from the next higher non-empty pile. This happens both for Draw actions, and for any other effects that cause you to draw cards … if you need to draw a 4, and the 4, 5, and 6 piles are empty, you would draw a 7" (R3 p8).
- **Game end:** "If you ever are required to draw a card of age higher than 10, the game ends immediately" (R3). 4E: "If you attempt to draw an age 12 or higher card, the game ends immediately" (R4). This also triggers when skipping past the empty top age.
- An empty board, or an undefined value, means draw a 0, which becomes 1 and skips upward as needed (FAQ1, RU p8).
- Always legal. It may end the game.

### 3.2 Meld action
"Choose a card from your hand and place it on your board, on top of any other cards of its color if present. If that color … is already splayed, the new card continues that splay in the same direction. You can choose any card from your hand, even if its value is much higher or lower" (R3 p8). You need at least one card in hand (BGA-H).

### 3.3 Achieve action
- Eligibility for a **standard** achievement of age N (R3 p8–9, R4 p27):
  - (1) **score ≥ 5 × N**, where score is the sum of the values of the cards in your score pile, and
  - (2) **a top card of value ≥ N**.
- "Claiming an achievement does not spend any points." Achievements need not be claimed in order.
- You can only take the action if you are eligible for an *available* standard achievement (R4). Special achievements can **never** be claimed with this action.
- Claimed achievements are permanent. "Once you have an achievement, it cannot be taken away" (R3). Caveat: 4E cards can **junk available (unowned)** achievements. They cannot touch owned ones.

### 3.4 Dogma action
See §5.

---

## 4. Card keywords (exact semantics)

Sources: R3 p12–13 "Keywords", R4 p20–25, CR4 keyword popups, RU p10–14. HIGH unless marked.

| Keyword | Rule |
|---|---|
| **Draw [N]** | Take the top card of deck N into your hand. Skip empty ages upward. Above 10 (3E) / above 11 (4E), the game ends. "Draw a [N]" uses N, not your highest top card. |
| **Draw and X** | "Draw a card and then immediately do the second part with that card" (R3). When multiple are drawn, handle them one at a time, in order (FAQ1). You cannot substitute a different card. |
| **Draw and reveal** | The drawn card is shown to all. "'Draw and reveal' effects place the card in your hand, unless the effect takes it away afterward" (R4). |
| **Reveal** | "Shown to all players, then remains where it was" (R4). BGA-A: in 4E, a card revealed *from a deck* goes back onto the deck (not relevant to base-card text). |
| **Meld** (effect) | As the Meld action: goes on top of its color's pile and continues any splay. It is not a Meld *action*. |
| **Tuck** | "Place it on the bottom of the matching color pile, continuing a splay if possible. If no cards of its color are on your board, it forms a new pile" (R3/R4). |
| **Score** | Place face down in your score pile. Score = sum of the values. |
| **Return** | "Placed at the bottom of its supply pile, face down. If multiple cards are returned at once, choose the order. If the pile was empty, it now exists again" (R3). |
| **Transfer** | "Move a card from one area in play to another. Transferring a card does not count as melding, achieving, scoring, etc. A card transferred to a board becomes a top card on that board" (R4). It keeps the destination's splay. If it leaves a pile with ≤1 card, that pile's splay is lost (BGA-H). |
| **Exchange** | "Swap cards from the two locations given, even if one half of the exchange is empty. Exchanging cards does not count as scoring them for the purposes of Monument" (R3). 4E: "An exchanged card has not been scored, (or melded, drawn, etc.) for the purposes of Special Achievements." Exchanges need not be symmetric (FAQ1). |
| **Splay** | See §4.1. |
| **Junk** (4E) | "Placed out of play, in a pile under the Junk card. If a deck is junked, junk each card currently in that deck" (R4). Junked cards are face down. Nobody may look at them, and only effects that mention the junk can affect them (R4 p4). "If base cards of that value are subsequently returned, the deck will no longer be empty" (CR4). Junking decks is a new way to accelerate toward the score-victory end. |
| **Remove** (3E, Fission only) | Set aside in the box. Fission removes all score piles, hands and boards. Only achievements remain. |
| **Top / Bottom** | Top = the fully visible card of a pile. With one card, it is both top and bottom. |
| **Value** | Age number. "If a card refers to the value of something you don't have … treat the value as 0" (R3/R4). "Choose a value": only 1–10 (3E, BGA-H) / 1–11 (4E). |
| **Highest / Lowest** | By value. "In the case of a tie, you can pick which of your cards are affected" (R3). "All the highest" = every card of the top value. "The three highest" = keep taking cards until there are three, with the owner choosing among ties (FAQ1). |
| **"All cards"** (4E) | "Effects that instruct you to do something to 'all cards' … affect one card at a time, and continue until no such cards remain" (R4). |
| **Available achievement** (4E) | "An achievement currently owned by no player. It can be one of the Standard Achievements … or one of the Special Achievements" (CR4). "Junk an available achievement of value 1 or 2" can only hit standard achievements, because special achievements have no value. |
| **Self-execute** (4E) | "Execute all the non-demand effects on that card. Demand effects are ignored, and you do not share non-demand effects, regardless of icon count. The card remains wherever it was, unless moved by the effects executed" (R4). 3E equivalent: "execute each of its non-demand effects. Do not share them." R3: "Do not share such effects, regardless of icon count. The effects can still impact other players (ex: Rocketry), just not by sharing." |
| **"This effect" / "this action"** (4E) | "This effect" = since the start of this specific execution of the effect. "This action" = since the current player started the current action (R4). 3E Democracy says "during this dogma action". |
| **Win / Lose** | See §7. "Lose" (4E): eliminated. All the player's cards are junked, they are skipped in turn order, and they no longer count for adjacency. |
| **Repeat this (dogma) effect** | Re-run the same effect for the **same executing player**. Keep going until the condition fails (FAQ1). |

### 4.1 Splaying (R3 p15, R4 p24–25, FAQ1)
- A color is exactly one of: unsplayed, left, right, up, aslant (4E only).
- Icons revealed on every **non-top** card in the pile. The top card always shows all its slots. From BGA-SRC `countVisibleIconsInPile`:
  - **Left:** bottom-right slot (1 icon).
  - **Right:** top-left and bottom-left (2 icons).
  - **Up:** bottom-left, bottom-middle, bottom-right (3 icons).
  - **Aslant:** all 4 slots.
  - Unsplayed: none. Hexagon images never count as icons.
- "If the color was already splayed, unsplay it before splaying it in the new direction" (splays do not compound).
- "If a color contains zero or one cards, it is always considered unsplayed — so if a splayed color is reduced to zero or one cards, it does not remember that it was previously splayed" (R3). 4E: "If a color contains zero or one card, it cannot be splayed … If a color is splayed, it cannot be splayed in the same direction again."
- The splay **persists** while the pile has ≥2 cards. Melds, tucks and transfers onto the pile continue it. Once the pile drops to ≤1 card, the splay is gone for good. A later meld does not restore it (FAQ1).
- A failed or no-op splay (0/1-card pile, or the same direction) **does not count as "doing something"** for the sharing bonus (FAQ1, RU p11).
- "Splay X left/right/up" targets only the named color(s). "Unsplay" (4E Empiricism) sets the pile to unsplayed.

---

## 5. Dogma execution (the core engine)

Sources: R3 p9–11, R4 p13–19, RU p10–11, 15, FAQ1 p5–8, BGA-H. HIGH unless marked.

### 5.1 Steps
1. **Choose a top card** on your board. (4E Parley option: a distant player's top card; see §5.11.) You cannot take a Dogma action with an empty board (BGA-H).
2. **Featured icon:** each effect is preceded by the featured icon. It is the same icon for every effect on a base card.
3. **Count and lock:** "At the start of a Dogma action, each player counts how many of the featured icon they have on their board. Each player that has **at least as many as you** is eligible to share … They are also immune to its demand effects" (R3). "Any opponent that has **fewer** than you is vulnerable" (R4). "Do not recount icons after each of the effects" (R3).
   - 4E LOCKING IN: "The list of effects to be executed and eligibility for sharing and vulnerability to demands are only determined once — at the start of the Dogma action. Even if the card is moved or covered up during the action, continue … No other aspect of the game or its cards is 'locked in', always evaluate boards, hands, icons, etc at the moment of effect execution."
4. **Execute each effect in printed order**, fully, before starting the next (R3: "Always complete an effect entirely before proceeding to the next effect").
   - **Demand effect:** "Starting to your left and going clockwise, each vulnerable opponent follows the instructions. Other opponents do nothing" (R4). The activating player does **not** execute the demand. "You/your" = the vulnerable player; "I/me/my" = the activating player.
   - **Non-demand effect:** "Before you execute a non-demand effect …, each player who is eligible to share must first do so. Starting to your left and going clockwise, each eligible player must follow the effect's instructions. After they are all done, you must perform them" (R4). The activating player always executes non-demands, whatever their own count. Each executor reads "you" as themselves.
   - Sharing is **mandatory** unless the text says "you may" (FAQ1).
5. **Sharing bonus:** after the whole Dogma action completes, the activating player takes **one** free Draw action if the condition in §5.3 holds. It draws from the **current** highest top card at that moment, which may have changed during the action.

### 5.2 Example of ordering (4 players, A activates, clockwise A→B→C→D)
A card has effects E1 (demand), E2 (non-demand), E3 (non-demand). B and D are vulnerable; C is eligible to share.
- E1: B executes, then D.
- E2: C executes, then A.
- E3: C executes, then A.
- Then A gets the free Draw if C "did something" in E2 or E3.

### 5.3 The sharing bonus: "did something", precisely
- **3E (R3 p11):** "This only occurs if an opponent's use of the shared effect caused something in the game to change. A change is one or more cards being drawn, revealed, melded, tucked, splayed, scored, exchanged, or moved."
- **4E (R4 p19):** "This only occurs if an opponent's use of the shared effect causes them to do something with a card. This includes anything (splay, meld, tuck, exchange, transfer, draw, achieve, etc.) **except for revealing a card, which does not count for sharing**." "You do not get a free Draw action due to vulnerable players' execution of demand effects."
- **FAQ1 (1st ed):** a "share" occurs if anything at all happens for the opponent, even if the game state ends up unchanged. Examples of a **non-share**: a declined "may" effect; trying to score/meld/tuck from an empty hand; splaying a 0/1-card pile or re-splaying in the same direction.
- **BGA-H:** a change that is later undone still counts. Example: returning three 6s and then drawing the same three 6s back counts.
- **Teams:** the bonus is not granted if the only sharer was your teammate (R3, BGA-SRC `getPlayerTeammate` check).
- **Only one** free draw per Dogma action, no matter how many opponents shared.
- **Engine definition (recommended):** set `sharedImpact = true` when a **non-demand** effect is being executed by a player who is not the activator and not the activator's teammate, and that execution performs any card movement (draw, meld, tuck, score, return, transfer, exchange with ≥1 card moving, junk, achieve/claim) or a **successful** splay/unsplay that changes a pile's splay state. In 3E, also count reveals. BGA-SRC does this through `markExecutingPlayer`/`sharing_bonus`, and only for the top-level card (nesting index 0).
- Edge: an opponent sharing a *nested* self-executed card's effects cannot happen, because self-execute is never shared.

### 5.4 Optional effects and conditionals
- "Effects or parts of effects preceded by 'you may' are optional. All others are mandatory, even if detrimental!" (R4). The FAQ1 adds that opponents sharing a "may" effect decide for themselves.
- **Golden Rule:** "Do as much as you can, ignore the rest" (R4). R3: "If you can only perform part of an effect, do as much as you can and ignore the rest. A demand requiring your three highest cards would take your entire hand if you only have two cards … An effect that exchanges your hand and score pile still takes place if one of the two is empty."
- **"If you do" (4E, R4 p19):** "For the condition to be satisfied, you must meet or have just met that condition, and what you did must have amounted to more than nothing. 'If you do' and 'If you don't' always refer to the previous sentence in an effect, in its entirety."
- BGA-H interpretation (3E), useful as defaults:
  - "You may [X], if you do [Y]": if you cannot fully do X (e.g. "return two cards" with 1 in hand), you must ignore the effect. If you do X, then Y is mandatory, as much as possible.
  - "[Do X]. If you do, [Y]": X is mandatory. If you did X only partially ("Score your top two red cards" with one red), **you do not get Y**. If you could do nothing, Y is skipped.
  - **Conflict:** 4E's "amounted to more than nothing" wording could be read as allowing Y after a partial X. **MEDIUM/LOW.** Recommendation: follow the BGA interpretation (Y only when X was fully performed, where "fully" means doing what the sentence asked with a legal target), and override per card where CR4 appendix notes say otherwise. List this as an open question for Asmadi (§10).
- "You may [do something] for every N …": if you opt in, you must do the full amount possible (BGA-H). You cannot stop partway.
- Choices when tied or ambiguous: the executing player chooses ("If any effect forces you to choose between multiple cards … you decide which one to use", R4). In demands, **the demanded player makes all choices** unless the card says "of my choice" (FAQ1).

### 5.5 Effects that reference other effects
- "If any card was transferred due to the demand" (Gunpowder, Mapmaking, The Pirate Code, Oars E2, Vaccination E2): the non-demand checks what happened during the demand effect **of this same Dogma action**, across **all** vulnerable players. Track a per-action record of demand outcomes.
- "Repeat this effect" inside a demand (Oars): the same vulnerable player repeats it until the condition fails. Then play moves to the next vulnerable player.
- "Democracy … so far during this action": needs a per-action counter per player. BGA resets `democracy_counter` each action.

### 5.6 Demands that affect the activating player
Cards moved "to my hand/score pile/board" go to the **activating** player, but it is the vulnerable player who executes. Example: Archery (vulnerable player draws a 1, then transfers their highest card to the activator's hand). Cards the demand gives the activator do **not** trigger the sharing bonus. Special achievements that result are handled per edition (§6.3).

### 5.7 Nested execution (self-execute / "execute … do not share")
- The nested card's **non-demand effects** run for the executing player only, in order, and fully, before the outer effect resumes.
- The outer card's locking (eligibility) is unaffected.
- 4E only: the **Chain Rule** (§5.12).
- 3E Self Service: "Execute each of the non-demand dogma effects of any other top card on your board. Do not share them."

### 5.8 Card moves mid-dogma
"If a card is removed from play mid dogma (covered, returned, …) you still complete all of the effects on it" (FAQ1; R4 Locking In).

### 5.9 Sequencing of special achievements inside dogma (3E)
"Dogma effects are always done in the order written on the card. This is especially important for claiming special achievements (for example, if a card is melded and its icons allow you to satisfy Empire, and then another card is melded on top of it as part of the dogma effect, you are allowed to claim Empire in between the melds)" (FAQ1). In 3E, conditions are therefore checked **after every atomic state change**. In 4E, only at the end of the action.

### 5.10 Verification and hidden information during effects
4E (R4 p19): "If execution of an effect involves the identity of cards that are hidden from other players but visible to you, you may need to verify. Any time another player would not know if you've accurately executed an effect based on what they can see, you must reveal the relevant cards." RU p13: "if a card specifies a player do something with hidden cards … and they cannot, they are required to reveal all necessary cards to prove it is impossible."
- A server enforces legality, so verification is not needed for correctness. Faithfully applying the rule would still **reveal the hand/score pile** in the log. BGA does this ("your hand will be revealed to everyone else in the game log"). This is a design decision (§10).

### 5.11 Parley (4E, non-team, 4+ players)
From R4 p32 / RU p18. Only relevant if 4-player free-for-all is supported.
- **Neighbors** are the players adjacent to your left and right. Everyone else is **distant**. In 4p, only the player **opposite** is distant (BGA-SRC `getPlayerIdsAffectedByDistanceRule`).
- The Parley cost is always **returning a card from your hand**.
  1. When choosing a card to Dogma, you may Parley to activate a **distant** player's top card. You use its featured icon and effects, but count icons **only on your own board**.
  2. A distant player who is eligible to share must Parley (when they are about to execute a shared effect for the first time) to share **for the whole action**. If they do not, they are ineligible for the whole action.
  3. A distant player who is vulnerable may Parley (when about to be forced to execute the demand) to become **immune**.
  - They may Parley for both 2 and 3 in the same action, paying a card for each.

### 5.12 Chain Rule (4E)
- R4 base: "If, while self-executing a card's effect, you would perform the keyword 'self-execute', first draw and achieve an 11, awarding yourself a Chain Achievement."
- RU v4.1 refines this: "If, while self-executing or super-executing a card's non-demand effect, you would perform the keyword 'self-execute' or 'super-execute', first draw and achieve an 11 … There is no limit (aside from the size of the 11 deck)."
- Achieving the 11 counts toward victory. Drawing it when the 11 deck is empty ⇒ a draw above 11 ⇒ **the game ends by score** (RU p17 note).
- Base cards that can chain: Satellites, Computers, Robotics, Software, Self Service, Near-Field Comm, Escapism.

---

## 6. Achievements

### 6.1 Win thresholds (HIGH: R3 p3, R4 p29, RU p17)
| Players | 3E | 4E |
|---|---|---|
| 2 | 6 | 6 |
| 3 | 5 | 5 |
| 4 (FFA) | 4 | 4 (with Parley) |
| 5 | n/a | 3 |
| 2v2 teams | 6 combined | 6 combined (`8 − teams`) |

Special and standard achievements both count. 4E Chain achievements also count.

### 6.2 Special achievements (exact text)

| Name | 3E condition (R3 p7, "Claim … immediately if") | 4E condition (R4 p5 / BGA-SRC 4E text, "Claim … at the end of any action if") | Card that claims it directly |
|---|---|---|---|
| **Monument** | "you tuck six or score six cards during a single turn." Note: "Transfered cards from other players do not count toward this achievement, nor does exchanging cards from your hand and score pile." | "you have at least four top cards with a DEMAND effect." | Masonry. 3E: "If you melded four or more cards in this way, claim the Monument achievement." 4E: "If you have exactly three red cards on your board, claim the Monument achievement." |
| **Empire** | "you have three or more icons of all six types" (Castle, Crown, Leaf, Bulb, Factory, Clock) | "at least three icons on your board of each of these six types" (Avatar is not required) | Construction: "If you are the only player with five top cards, claim the Empire achievement." |
| **World** | "twelve or more [Clock] on your board" | "at least twelve [Clock/Efficiency] on your board" | Translation: "If each top card on your board has a [Crown], claim the World achievement." |
| **Wonder** | "five colors on your board, and each is splayed either up or right" | "five colors splayed on your board, and each is splayed either right, up, or aslant" | Invention: 3E "If you have five colors splayed, each in any direction, claim the Wonder achievement." 4E "If you have five colors splayed, claim the Wonder achievement." |
| **Universe** | "five top cards, and each is of value 8 or higher" | "five top cards, and each is of value at least 8" | Astronomy: "If all non-purple top cards on your board are value 6 or higher, claim the Universe achievement." |

Rules on claiming:
- Claiming is **automatic**, free, and "does not use an action", and it "can even be claimed during another player's turn" (R4 p28). This applies to every player, not only the active one. Example: a sharing or demanded player meeting a condition claims it (FAQ1).
- **3E timing:** "The five special achievements are always available to be claimed. If you meet the conditions for one of them, take it **immediately**" (R3 p16). FAQ1: "special achievements are claimed instantaneously, as soon as you fulfill the requirements", including mid-action.
- **4E timing:** the condition is checked **at the end of each action**. BGA-SRC also checks at the end of the Artifacts free action, which is not relevant to the base game.
  - Direct claims from card effects ("claim the X achievement") happen as that effect executes.
  - BGA-SRC's 4E implementation checks the conditions only at end of action (`is_end_of_action_check`).
- **Monument 3E counting:** only the keywords **tuck** and **score** count. Transfer, exchange and meld do not. Tucking 3 and scoring 3 does not qualify (FAQ1).
  - "During a single turn" — BGA-SRC resets every player's counters **at each turn change**. Tucks/scores a player makes while sharing or being demanded on someone else's turn therefore count toward that turn. MEDIUM.
- **Simultaneous eligibility:** 3E: "the tie is broken in turn order going clockwise, with the current player winning ties" (R3 p16; FAQ1 agrees, including for multiple achievements at once). 4E: "the first such player in turn (clockwise) order **starting to the left of the current player** claims it" (R4 p28).
- Once claimed, a special achievement is gone for everyone. In 4E, an unclaimed one can be **junked** (Feudalism, Publications). Publications can also make a junked special achievement available again.
- A direct claim via a card only succeeds if the achievement is still available (BGA-SRC "Only continue if the achievement is claimable").

### 6.3 Claiming a standard achievement by effect
The base game has effects that "claim"/"achieve" (4E Chain Rule: "draw and achieve an 11"). BGA-H (3E): "Claim an/any achievement — Only applies to Standard Achievements. If told to claim an achievement of value X, you can only do so if a standard achievement of that specific value is available." For base-set effects this only matters for the 4E Chain Rule. MEDIUM.

---

## 7. Game end and victory

Sources: R3 p3, 8, 13, 17. R4 p29–30. RU p17. FAQ1 p4. HIGH.

1. **Achievement victory**
   - **3E:** "If you have enough achievements, you win immediately!" This applies even mid-dogma and even on another player's turn (BGA-H: "The game ends immediately (even during a dogma effect) when a player has claimed the required number of achievements"). FAQ1: "That player immediately wins. The game cannot end in a tie in this situation."
   - **4E:** "Winning via achievements is checked at the end of each action, after checking for Special Achievements. If more than one player has enough achievements to win, the player with the most achievements wins. If there is a tie, the first tied player to the left of the current player wins, in turn (clockwise) order." RU note: "There are situations where a player will have claimed enough achievements to win during an action … but before the action is completed a card higher than 11 would be drawn. These situations result in a Score Victory, and another player might even win!"
2. **Score victory (the deck runs out)**
   - 3E: "If nobody has won yet and a card higher than age 10 must be drawn (if the 10 pile runs out, or through some dogma effects), the game ends immediately. … The player with the highest current score wins. If tied, most achievements wins. If still tied, the game is a draw."
   - 4E: the same, with **age 11** as the last age ("attempting to draw a card higher than age 11"). Teams compare combined scores.
3. **Card-effect victory:** "Some allow you to win given a certain condition, which if satisfied ends the game immediately. Others let 'the single player with the most X' win. These also end the game immediately, but only if there is no tie for X. If there is a tie, the effect is ignored entirely" (R3). 4E: "that portion of the effect is ignored."
   - 3E win cards: Empiricism, Collaboration, A.I., Bioengineering, Globalization, Self Service (FAQ1 list).
   - 4E adds Astrogeology and Solar Sailing, and Space Traffic makes a player **lose**.
   - In a team game, a player's win is the team's win.
4. **Elimination (4E):** "If a player loses, all of their cards are junked and they no longer are part of the table for turn order or adjacency. If all players but one are eliminated, the remaining player wins immediately." Concession is treated as a loss. BGA-A: the achievement goal does not change when a player is eliminated.

**Mid-dogma game end:** the game ends at the instant of the triggering event. That event is: a draw above the last age, a card win condition, or (3E only) reaching the achievement count. No further effects, sharing executions or free draws happen. Final state = state at that moment. HIGH (every source says "immediately").

---

## 8. Hidden information (per-seat view filtering)

Sources: R3 p23 "Information", R4 p33 chart, RU p6 chart, FAQ1 p3, BGA-H. HIGH.

**R4 chart** (identical in RU):

| Zone | Owner sees | Others see |
|---|---|---|
| Hand | Front/Back | **Back only** (so its **count and each card's age** are visible) |
| Board | Front/Back | **Front/Back** (the whole board, including covered cards) |
| Score pile | Front/Back | **Back only** (count, each card's age, and so the total score) |
| Claimed achievements | **Back only** | Back only |
| Decks (supply) | Back | Back |
| Standard achievements (unclaimed) | Back | Back |
| Special achievements | Front/Back | Front/Back |
| Junk (4E) | Back | Back |

"The backs of cards are quite important though, as you can determine their value" (R4). R3: "You can always count and see the value of cards in each supply pile, each hand, and each score pile."

3E variant: groups choose whether "the identity of cards partially covered up on an opponent's board" and "the quantity of cards in an unsplayed color on an opponent's board" are public. Asmadi plays both hidden. 4E makes the board public. BGA shows all board cards in both editions. **Recommendation: make the board fully public.**

Per-seat payload the server should send:
- **Own hand:** full card identities. **Others' hands:** an ordered list of **ages** only, or a multiset of ages. Never ids.
- **Own score pile:** identities. **Others' score piles:** ages only. The total score is public, since it is derivable from the ages.
- **All boards:** full identities of every card in every pile, the splay state, and the derived icon counts per player (public, because the board is public).
- **Achievements:** for every player (including self), claimed standard achievements as **ages only**, and special achievements by name. Unclaimed standard achievements: ages only. **Never send a standard achievement's card id, even to its owner.**
- **Decks:** the count per age. The top card's age is implied by the deck. **Never** send identities or order.
- **Junk:** a count of cards per age (the backs show age). No identities.
- **Revealed cards:** the full identity to everyone at the moment of reveal. They remain in the log.
- **Transient:** a pending choice prompt goes only to the choosing seat. A demand that makes a player choose from their hidden cards must not leak the options to others.
- **Returned cards:** the card goes to the bottom of its deck. The returning player knows its identity, and so, if it was ever revealed, does everyone else. The server must keep the deck order secret.
- The event/game log must be filtered per seat, exactly like the state. Example: "B drew a [3]" for others versus "B drew Compass" for B.

---

## 9. Numbered tricky edge cases / rulings

1. **Sharing lock-in:** icon counts are taken once, at the start of the Dogma action. Losing icons during effect 1 does not stop an opponent sharing effect 2 (FAQ1 p8, R4 Locking In). HIGH
2. **Ties favor sharing:** "at least as many" icons means sharing/immune. Only strictly fewer is vulnerable. HIGH
3. **The activating player always executes non-demands**, last, after all sharers, even with 0 of the featured icon. HIGH
4. **Sharing can starve you:** sharers go first. If the last card of a deck is drawn by a sharer, the activator draws from the next age up. RU tips call this out explicitly ("your opponent will get the 1. You'll get a 2, and a share draw!"). HIGH
5. **Free Draw uses the post-dogma board** (the new highest top card). It is one Draw, even if several opponents shared. It is not granted for demands, for teammate-only sharing, or for declined "may" effects. In 4E, reveals do not count. HIGH
6. **A no-op splay** (0/1-card pile, or the same direction) is not "doing something" and cannot trigger the sharing bonus (FAQ1, RU p11). HIGH
7. **A splay is lost forever** once a pile drops to ≤1 card, including via transfer or return. A later meld does not restore it (FAQ1, R3). HIGH
8. **Transfer/exchange ≠ meld/score/draw.** It does not count for 3E Monument or for "if you meld/score…" wording. Transferred cards still count toward score, hand and board once they arrive. HIGH
9. **An empty exchange still happens** (for example, a hand with 0 cards exchanged with a score pile with 3). A demand for "your three highest" takes all you have if you hold fewer (R3). HIGH
10. **Draw above the last age ends the game immediately, mid-effect.** Remaining effects, sharing and the free draw are abandoned. Winner = highest score → most achievements → draw. In 3E this is "above 10"; in 4E, "above 11". Drawing past an **empty top pile** also counts (e.g. the 10 pile is empty in 3E and you draw a 10). HIGH
11. **Undefined values are 0.** For example, "draw a card two higher than your top purple" with no purple ⇒ draw a 2. Empty board ⇒ the Draw action draws a 1 (FAQ1, RU). HIGH
12. **Demand choices belong to the victim** unless the card says "of my choice" (Collaboration; 4E Statistics, Services, Near-Field Comm, Climatology). HIGH
13. **In 3E, special achievements trigger mid-effect** and can be claimed between two melds of the same effect (FAQ1 Empire example). **In 4E, only at end of action**, so a transient condition that appears and disappears within one action does **not** qualify in 4E. HIGH (derived from the explicit timing rules)
14. **Special achievement ties:** 3E — the current player wins. 4E — the first eligible player clockwise from the **left of** the current player wins, so the current player effectively loses ties. HIGH
15. **Achievement-win ties (4E):** most achievements, then the first tied player clockwise from the left of the current player. 3E: whoever reaches the threshold first wins instantly, so there are no ties. HIGH
16. **4E: an achievement-count win reached mid-action is not final** until the action ends. A later draw-above-11 in the same action converts the game to a score victory (RU p17). HIGH
17. **"The single player with the most X wins" is ignored on a tie** and the game continues (R3/R4). HIGH
18. **"If no/any cards were transferred due to the demand"** looks at the whole demand effect across all vulnerable players in this action. Oars' "repeat" loops per victim. MEDIUM-HIGH
19. **"You may X. If you do, Y" with insufficient cards for X:** you cannot opt in (BGA-H). "Do X. If you do, Y" with only a partial X: Y is skipped (BGA-H 3E interpretation). 4E wording ("amounted to more than nothing") is ambiguous here. MEDIUM
20. **Opting into "you may … for every N"** obliges you to do the full count possible. You cannot do less (BGA-H). MEDIUM
21. **Highest/lowest ties:** the executing player picks. "All the highest" = every card of the highest value. "Three highest" with ties = the owner picks among the tied cards (FAQ1). HIGH
22. **Returning multiple cards:** the returner chooses the bottom-of-deck order. Returning to an empty age re-creates that deck, so it is no longer "empty" for skipping (R3, CR4). HIGH
23. **Dogma on a card that does nothing is legal**, for example a demand-only card with nobody vulnerable. This is how you pass (R3). Meld needs a card in hand. Achieve needs eligibility. Draw is always legal. HIGH
24. **Standard-achievement eligibility requires both** score ≥ 5×age **and** a top card ≥ age. Points are not spent. You may skip lower ages (R3/R4). HIGH
25. **Special achievements can be claimed by non-active players** during demands or sharing (FAQ1, R4). HIGH
26. **Teams:** teammates are never vulnerable to your demands, and sharing only with a teammate gives no free draw. "Opponent" excludes the teammate. **4E: "other players" includes the teammate. 1st-ed FAQ: it excludes them.** You use only your own score to Achieve. Combined achievements win (R3/R4/FAQ1). HIGH for 4E, LOW for 3E on "other players"
27. **Execute/self-execute effects are never shared** but can still affect other players (e.g. Rocketry, Bioengineering). A self-executed card that says "you win" does win (FAQ1, R3). HIGH
28. **First-turn one-action rule** applies to the first player only (2–3p), or the first **two** players (4p; 4E 4+p). HIGH
29. **Alphabetical first-player comparison uses the English title including leading articles** ("The Wheel" < "Tools") (BGA-H). MEDIUM (only BGA states this explicitly)
30. **Card moved or covered mid-dogma:** execution continues with the locked effect list (R4, FAQ1). Everything else (icons, "top card" references, board contents) is evaluated live when each effect runs. HIGH
31. **4E junked decks:** a junked age is empty, so draws skip upward, and junking can end the game faster. Returning a base card to a junked age makes that deck non-empty again (CR4). HIGH
32. **Achievements can never be looked at**, not even your own claimed ones. Only the age (from the back) is known (R3, R4). HIGH
33. **3E Monument counts per turn, not per action.** Exchanges and transfers do not count. The count for a non-active player's tucks/scores on another player's turn is per BGA (reset at each turn change). MEDIUM
34. **Draw-and-X with several cards:** draw and resolve one card at a time, in order. This matters for tuck/meld ordering and for special achievement checks in 3E (FAQ1). HIGH

---

## 10. Open questions / decisions for planning

1. **Edition.** The recommendation is 4E (§1.5). This needs sign-off, because the friend group may know BGA's 3E.
2. **Scope for 4 players.** Implementing 4E Parley versus limiting v1 to 2p, 3p and 2v2 teams. Parley adds three optional return-a-card prompts, including one mid-action for distant players.
3. **Card icon data.** Asmadi publishes card *text* (CR4) but not icon layouts as data; the images are at `asmadigames.com/innovation/images/cards/BaseN.png`. The only machine-readable source is BGA-SRC `dbmodel.sql` (MIT license, 4E values by default, with 3E overrides for Software, Robotics, Self Service and The Internet in `innovation.game.php` setup). Plan: import it and spot-check against the card images.
4. **IP.** Card titles and effect text are Asmadi's copyrighted content; BGA is licensed. For a private link-shared hobby app, decide whether to reproduce the card text verbatim (a small risk for a private game), paraphrase it, or ask Asmadi (innovation@asmadigames.com). Do not use Asmadi art.
5. **"If you do" after a partial action** (4E wording versus the BGA 3E interpretation, edge case #19). Adopt the BGA semantics, override per card, and optionally email Asmadi.
6. **Verification reveals** (§5.10): should the log reveal a player's hand when they could not comply with a demand? The rules say yes. A server-enforced game doesn't need it for correctness, but it is what the physical game and BGA do. Recommendation: reveal, for rules fidelity.
7. **4E end-of-action check and the free Draw.** The rules say the free Draw happens "after the Dogma action ends". Is the special-achievement/win check run once after the Dogma, and again after the free Draw, or once after both? BGA runs it in `stInterPlayerTurn` after the whole action resolves. Only a draw above 11 can change state in between, and that ends the game anyway. Low impact. MEDIUM
8. **4E per-card appendix notes.** The CR4 site says "Card listings have Appendix notes as appropriate". The scrape of B001–B115 found no base-card appendix blocks, only keyword definitions. Re-check at implementation time.
9. **Discrepancies between BGA-SRC 4E text and CR4.** Examples: Self Service effect order, Stem Cells. When implementing 4E, **CR4 wins**.

---

## Appendix A — Base card list: 3rd Edition vs 4th Edition text

- Code, age, color and featured icon come from CR4 (4E). The **featured icon differs in 3E only for The Internet** (3E: Clock).
- `[N]` = a card of age N. `D:` = demand effect. `/` separates effects.
- Icon names use the 3E vocabulary: Castle = Authority, Crown = Prosperity, Leaf = Health, Bulb = Concept, Factory = Industry, Clock = Efficiency, Avatar (4E only).
- The 3E text comes from BGA-SRC `material.inc.php` (3rd-edition keys). The 4E text comes from the official CR4 reference.
- "Change" column: **Functional** = different game behavior. Minor functional = restructuring or keyword swaps with small behavioral impact. Wording/clarification = same behavior. **NEW** = 4E-only card.
- The **1st-edition** text differs from 3E only for the 9 cards in §1.2 (plus a wording-only change to Suburbia).

| Code | Card | Age | Color | Feat. | 3rd Edition text (BGA) | 4th Edition text (Asmadi) | 3E→4E change |
|---|---|---|---|---|---|---|---|
| B001 | Archery | 1 | Red | Castle | D: I DEMAND you draw a [1], then transfer the highest card in your hand to my hand! | D: I DEMAND you draw a [1], then transfer the highest card in your hand to my hand! / Junk an available achievement of value 1 or 2. | **Functional** |
| B002 | Metalworking | 1 | Red | Castle | Draw and reveal a [1]. If it has a [Castle], score it and repeat this dogma effect. Otherwise, keep it. | Draw and reveal a [1]. If it has [Castle], score it and repeat this effect. | Wording/clarification |
| B003 | Oars | 1 | Red | Castle | D: I DEMAND you transfer a card with a [Crown] from your hand to my score pile! If you do, draw a [1], and repeat this dogma effect! / If no cards were transferred due to this demand, draw a [1]. | D: I DEMAND you transfer a card with [Crown] from your hand to my score pile! If you do, draw a [1], and repeat this effect! / If no cards were transferred due to this demand, draw a [1]. | Wording/clarification |
| B004 | Agriculture | 1 | Yellow | Leaf | You may return a card from your hand. If you do, draw and score a card of value one higher than the card you returned. | You may return a card from your hand. If you do, draw and score a card of value one higher than the card you return. | Wording/clarification |
| B005 | Domestication | 1 | Yellow | Castle | Meld the lowest card in your hand. Draw a [1]. | Meld the lowest card in your hand. Draw a [1]. | Same |
| B006 | Masonry | 1 | Yellow | Castle | You may meld any number of cards from your hand, each with a [Castle]. If you melded four or more cards in this way, claim the Monument achievement. | You may meld any number of cards from your hand, each with [Castle]. / If you have exactly three red cards on your board, claim the Monument achievement. | **Functional** |
| B007 | Clothing | 1 | Green | Leaf | Meld a card from your hand of different color from any card on your board. / Draw and score a [1] for each color present on your board not present on any opponent's board. | Meld a card from your hand of a color not on your board. / Draw and score a [1] for every color present on your board that no opponent has on their board. | Wording/clarification |
| B008 | Sailing | 1 | Green | Crown | Draw and meld a [1]. | Draw and meld a [1]. | Same |
| B009 | The Wheel | 1 | Green | Castle | Draw two [1]. | Draw two [1]. | Same |
| B010 | Pottery | 1 | Blue | Leaf | You may return up to three cards from your hand. If you returned any cards, draw and score a card of value equal to the number of cards you returned. / Draw a [1]. | You may return up to three cards from your hand. If you return any, draw and score a card of value equal to the number of cards you return. / Draw a [1]. | Wording/clarification |
| B011 | Tools | 1 | Blue | Bulb | You may return three cards from your hand. If you do, draw and meld a [3]. / You may return a [3] from your hand. If you do, draw three [1]. | You may return three cards from your hand. If you do, draw and meld a [3]. / You may return a [3] from your hand. If you do, draw three [1]. | Same |
| B012 | Writing | 1 | Blue | Bulb | Draw a [2]. | Draw a [2]. | Same |
| B013 | City States | 1 | Purple | Crown | D: I DEMAND you transfer a top card with a [Castle] from your board to my board if you have at least four [Castle] on your board! If you do, draw a [1]! | D: I DEMAND you transfer a top card with [Castle] from your board to my board if you have at least four [Castle] on your board! If you do, draw a [1]! | Wording/clarification |
| B014 | Code of Laws | 1 | Purple | Crown | You may tuck a card from your hand of the same color as any card on your board. If you do, you may splay that color of your cards left. | You may tuck a card from your hand of the same color as any card on your board. If you do, you may splay that color of your cards left. | Same |
| B015 | Mysticism | 1 | Purple | Castle | Draw and reveal a [1]. If it is the same color as any card on your board, meld it and draw a [1]. | Draw and reveal a [1]. If it is the same color as any card on your board, meld it and draw a [1]. | Same |
| B016 | Construction | 2 | Red | Castle | D: I DEMAND you transfer two cards from your hand to my hand! Draw a [2]! / If you are the only player with five top cards, claim the Empire achievement. | D: I DEMAND you transfer two cards from your hand to my hand! Draw a [2]! / If you are the only player with five top cards, claim the Empire achievement. | Same |
| B017 | Road Building | 2 | Red | Castle | Meld one or two cards from your hand. If you melded two, you may transfer your top red card to another player board. If you do, transfer that player's top green card to your board. | Meld one or two cards from your hand. If you meld two, you may transfer your top red card to another player's board. If you do, meld that player's top green card. | Minor functional (meld instead of transfer) |
| B018 | Canal Building | 2 | Yellow | Crown | You may exchange all the highest cards in your hand with all the highest cards in your score pile. | You may choose to either exchange all the highest cards in your hand with all the highest cards in your score pile, or junk all cards in the [3] deck. | **Functional** |
| B019 | Fermenting | 2 | Yellow | Leaf | Draw a [2] for every color on your board with one or more [Leaf]. | Draw a [2] for every color on your board with [Leaf]. / You may tuck a green card from your hand. If you don't, junk all cards in the [2] deck, and junk Fermenting if it is a top card on any board. | **Functional** |
| B020 | Currency | 2 | Green | Crown | You may return any number of cards from your hand. If you do, draw and score a [2] for every different value of card you returned. | You may return any number of cards from your hand. If you do, draw and score a [2] for every different value of card you return. | Wording/clarification |
| B021 | Mapmaking | 2 | Green | Crown | D: I DEMAND you transfer a [1] from your score pile, if it has any, to my score pile! / If any card was transferred due to the demand, draw and score a [1]. | D: I DEMAND you transfer a [1] from your score pile to my score pile! / If any card was transferred due to the demand, draw and score a [1]. | Wording/clarification |
| B022 | Calendar | 2 | Blue | Leaf | If you have more cards in your score pile than in your hand, draw two [3]. | If you have more cards in your score pile than in your hand, draw two [3]. | Same |
| B023 | Mathematics | 2 | Blue | Bulb | You may return a card from your hand. If you do, draw and meld a card of value one higher than the card you returned. | You may return a card from your hand. If you do, draw and meld a card of value one higher than the card you return. | Wording/clarification |
| B024 | Monotheism | 2 | Purple | Castle | D: I DEMAND you transfer a top card on your board of different color from any card on my board to my score pile! If you do, draw and tuck a [1]! / Draw and tuck a [1]. | D: I DEMAND you transfer a top card on your board of a different color from every card on my board to my score pile! If you do, draw and tuck a [1]! / Draw and tuck a [1]. | Wording/clarification |
| B025 | Philosophy | 2 | Purple | Bulb | You may splay left any one color of your cards. / You may score a card from your hand. | You may splay left any one color of your cards. / You may score a card from your hand. | Same |
| B026 | Engineering | 3 | Red | Castle | D: I DEMAND you transfer all top cards with a [Castle] from your board to my score pile! / You may splay your red cards left. | D: I DEMAND you transfer a top card with [Castle] of each color from your board to my score pile! / You may splay your red cards left. | **Functional** |
| B027 | Optics | 3 | Red | Crown | Draw and meld a [3]. If it has a [Crown], draw and score a [4]. Otherwise, transfer a card from your score pile to the score pile of an opponent with fewer points than you. | Draw and meld a [3]. If it has [Crown], draw and score a [4]. Otherwise, transfer a card from your score pile to the score pile of an opponent with fewer points than you. | Wording/clarification |
| B028 | Machinery | 3 | Yellow | Leaf | D: I DEMAND you exchange all the cards in your hand with all the highest cards in my hand! / Score a card from your hand with a [Castle]. You may splay your red cards left. | D: I DEMAND you exchange all cards in your hand with all the highest cards in my hand! / Score a card from your hand with [Castle]. / You may splay your red cards left. | Minor functional (split into two effects) |
| B029 | Medicine | 3 | Yellow | Leaf | D: I DEMAND you exchange the highest card in your score pile with the lowest card in my score pile! | D: I DEMAND you exchange the highest card in your score pile with the lowest card in my score pile! / Junk an available achievement of value 3 or 4. | **Functional** |
| B030 | Compass | 3 | Green | Crown | D: I DEMAND you transfer a top non-green card with a [Leaf] from your board to my board, and then you transfer a top card without a [Leaf] from my board to your board! | D: I DEMAND you transfer a top non-green card with [Leaf] from your board to my board, and then meld a top card without [Leaf] from my board! | Minor functional (meld instead of transfer) |
| B031 | Paper | 3 | Green | Bulb | You may splay your green or blue cards left. / Draw a [4] for every color you have splayed left. | You may splay your green or blue cards left. / Score a top card with [Leaf] from your board. If you do, draw a [4] for every color you have splayed left. | **Functional** |
| B032 | Alchemy | 3 | Blue | Castle | Draw and reveal a [4] for every three [Castle] on your board. If any of the drawn cards are red, return the cards drawn and all cards in your hand. Otherwise, keep them. / Meld a card from your hand, then score a card from your hand. | Draw and reveal a [4] for every color on your board with [Castle]. If any of the drawn cards are red, return all cards from your hand. / Meld a card from your hand, then score a card from your hand. | **Functional** |
| B033 | Translation | 3 | Blue | Crown | You may meld all the cards in your score pile. If you meld one, you must meld them all. / If each top card on your board has a [Crown], claim the World achievement. | You may meld all cards in your score pile. / If each top card on your board has [Crown], claim the World achievement. | Wording/clarification |
| B034 | Education | 3 | Purple | Bulb | You may return the highest card from your score pile. If you do, draw a card of value two higher than the highest card remaining in your score pile. | You may return the highest card from your score pile. If you do, draw a card of value two higher than the highest card remaining in your score pile. | Same |
| B035 | Feudalism | 3 | Purple | Castle | D: I DEMAND you transfer a card with a [Castle] from your hand to my hand! If you do, unsplay that color of your cards! / You may splay your yellow or purple cards left. | D: I DEMAND you transfer a card with [Castle] from your hand to my hand! If you do, junk all available special achievements! / You may splay your yellow or purple cards left. If you do, draw a [3]. | **Functional** |
| B036 | Colonialism | 4 | Red | Factory | Draw and tuck a [3]. If it has a [Crown], repeat this dogma effect. | Draw and tuck a [3]. If it is green, junk all cards in the [5] deck. If it has [Crown], repeat this effect. | **Functional** |
| B037 | Gunpowder | 4 | Red | Factory | D: I DEMAND you transfer a top card with a [Castle] from your board to my score pile! / If any card was transfered due to the demand, draw and score a [2]. | D: I DEMAND you transfer a top card with [Castle] from your board to my score pile! / If any card was transferred due to the demand, draw and score a [2]. | Wording/clarification |
| B038 | Anatomy | 4 | Yellow | Leaf | D: I DEMAND you return a card from your score pile! If you do, return a top card of equal value from your board! | D: I DEMAND you return a card from your score pile! If you do, return a top card of equal value from your board! If you do, junk all cards in the [4] deck! | **Functional** |
| B039 | Perspective | 4 | Yellow | Bulb | You may return a card from your hand. If you do, score a card from your hand for every two [Bulb] on your board. | You may return a card from your hand. If you do, score a card from your hand for every color on your board with [Bulb]. | **Functional** |
| B040 | Invention | 4 | Green | Bulb | You may splay right any one color of your cards currently splayed left. If you do, draw and score a [4]. / If you have five colors splayed, each in any direction, claim the Wonder achievement. | You may choose a color you have splayed left and splay it right. If you do, draw and score a [4]. / If you have five colors splayed, claim the Wonder achievement. | Wording/clarification |
| B041 | Navigation | 4 | Green | Crown | D: I DEMAND you transfer a [2] or [3] from your score pile, if it has any, to my score pile! | D: I DEMAND you transfer a [2] or [3] from your score pile to my score pile! | Wording/clarification |
| B042 | Experimentation | 4 | Blue | Bulb | Draw and meld a [5]. | Draw and meld a [5]. | Same |
| B043 | Printing Press | 4 | Blue | Bulb | You may return a card from your score pile. If you do, draw a card of value two higher than the top purple card on your board. / You may splay your blue cards right. | You may return a card from your score pile. If you do, draw a card of value two higher than the top purple card on your board. / You may splay your blue cards right. | Same |
| B044 | Enterprise | 4 | Purple | Crown | D: I DEMAND you transfer a top non-purple card with a [Crown] from your board to my board! If you do, draw and meld a [4]! / You may splay your green cards right. | D: I DEMAND you transfer a top non-purple card with [Crown] from your board to my board! If you do, draw and meld a [4]! / You may splay your green cards right. | Wording/clarification |
| B045 | Reformation | 4 | Purple | Leaf | You may tuck a card from your hand for every two [Leaf] on your board. / You may tuck a card from your hand for every two [Leaf] on your board. | You may splay your yellow or purple cards right. / You may tuck a card from your hand for every splayed color on your board. | **Functional** |
| B046 | Coal | 5 | Red | Factory | Draw and tuck a [5]. / You may splay your red cards right. / You may score any one of your top cards. If you do, also score the card beneath it. | Draw and tuck a [5]. / You may splay your red cards right. / You may choose a color. If you do, score your top two cards of that color. | **Functional** |
| B047 | The Pirate Code | 5 | Red | Crown | D: I DEMAND you transfer two cards of value [4] or less from your score pile to my score pile! / If any cards were transferred due to the demand, score the lowest top card with a [Crown] from your board. | D: I DEMAND you transfer two cards of value 4 or less from your score pile to my score pile! / If any cards were transferred due to the demand, score the lowest top card with [Crown] from your board. | Wording/clarification |
| B048 | Statistics | 5 | Yellow | Leaf | D: I DEMAND you transfer all the highest cards in your score pile to your hand! / You may splay your yellow cards right. | D: I DEMAND you transfer all the cards of the value of my choice in your score pile to your hand! / You may splay your yellow cards right. | **Functional** |
| B049 | Steam Engine | 5 | Yellow | Factory | Draw and tuck two [4], then score your bottom yellow card. | Draw and tuck two [4]. Score your bottom yellow card. If it is Steam Engine, junk all cards in the [6] deck. | **Functional** |
| B050 | Banking | 5 | Green | Crown | D: I DEMAND you transfer a top non-green card with a [Factory] from your board to my board. If you do, draw and score a [5]! / You may splay your green cards right. | D: I DEMAND you transfer a top non-green card with [Factory] from your board to my board. If you do, draw and score a [5]! / You may splay your green cards right. | Wording/clarification |
| B051 | Measurement | 5 | Green | Bulb | You may reveal and return a card from your hand. If you do, splay that color of your cards right, and draw a card of value equal to the number of cards of that color on your board. | You may reveal and return a card from your hand. If you do, splay your cards of that card’s color right and draw a card of value equal to the number of cards of that color on your board. | Wording/clarification |
| B052 | Chemistry | 5 | Blue | Factory | You may splay your blue cards right. / Draw and score a card of value one higher than the highest top card on your board and then return a card from your score pile. | You may splay your blue cards right. / Draw and score a card of value one higher than the highest top card on your board and then return a card from your score pile. | Same |
| B053 | Physics | 5 | Blue | Bulb | Draw three [6] and reveal them. If two or more of the drawn cards are the same color, return the drawn cards and all cards in your hand. Otherwise, keep them. | Draw three [6] and reveal them. If at least two of the drawn cards are the same color, return all cards in your hand. | **Functional** |
| B054 | Astronomy | 5 | Purple | Bulb | Draw and reveal a [6]. If the card is green or blue, meld it and repeat this dogma effect. / If all non-purple top cards on your board are value [6] or higher, claim the Universe achievement. | Draw and reveal a [6]. If the card is green or blue, meld it and repeat this effect. / If all non-purple top cards on your board are value 6 or higher, claim the Universe achievement. | Wording/clarification |
| B055 | Societies | 5 | Purple | Crown | D: I DEMAND you transfer a top card with a [Bulb] higher than my top card of the same color from your board to my board! If you do, draw an [5]! | D: I DEMAND you transfer a top card with [Bulb] higher than my top card of the same color from your board to my board! If you do, draw a [5]! | Wording/clarification |
| B056 | Industrialization | 6 | Red | Factory | Draw and tuck a [6] for every color on your board with one or more [Factory]. / You may splay your red or purple cards right. | Draw and tuck three [6]. Then, if you are the single player with the most [Clock], return your top red card. / You may splay your red or purple cards right. | **Functional** |
| B057 | Machine Tools | 6 | Red | Factory | Draw and score a card of value equal to the highest card in your score pile. | Draw and score a card of value equal to the highest card in your score pile. | Same |
| B058 | Canning | 6 | Yellow | Factory | You may draw and tuck a [6]. If you do, score all your top cards without a [Factory]. / You may splay your yellow cards right. | You may draw and tuck a [6]. If you tuck a card, score a top card without [Factory] of each color on your board. / You may splay your yellow cards right. | Wording/clarification |
| B059 | Vaccination | 6 | Yellow | Leaf | D: I DEMAND you return all the lowest cards in your score pile! If you returned any, draw and meld a [6]! / If any card was returned as a result of the demand, draw and meld a [7]. | D: I DEMAND you choose a card in your score pile! Return all the cards from your score pile of its value! If you do, draw and meld a [6]! / If any card was returned as a result of the demand, draw and meld a [7]. | **Functional** |
| B060 | Classification | 6 | Green | Bulb | Reveal the color of a card in your hand. Take into your hand all cards of that color from all other player's hands. Then meld all cards of that color from your hand. | Reveal a card from your hand. Transfer to your hand all cards of that card's color from all opponents' hands. Then, meld all cards of that color from your hand. | Minor functional ("opponents" instead of "other players" (teams)) |
| B061 | Metric System | 6 | Green | Crown | If your green cards are splayed right, you may splay any one color of your cards right. / You may splay your green cards right. | If your green cards are splayed right, you may splay any one color of your cards right. / You may splay your green cards right. | Same |
| B062 | Atomic Theory | 6 | Blue | Bulb | You may splay your blue cards right. / Draw and meld a [7]. | You may splay your blue cards right. / Draw and meld a [7]. | Same |
| B063 | Encyclopedia | 6 | Blue | Crown | You may meld all the highest cards in your score pile. If you meld one of the highest, you must meld all of the highest. | Choose a value. You may meld all the cards of that value in your score pile. / You may junk an available achievement of value 5, 6, or 7. | **Functional** |
| B064 | Democracy | 6 | Purple | Bulb | You may return any number of cards from your hand. If you have returned more cards than any other player due to Democracy so far during this dogma action, draw and score an [8]. | You may return any number of cards from your hand. If you have returned more cards than any opponent due to Democracy so far during this action, draw and score an [8]. | Wording/clarification |
| B065 | Emancipation | 6 | Purple | Factory | D: I DEMAND you transfer a card from your hand to my score pile! If you do, draw a [6]! / You may splay your red or purple cards right. | D: I DEMAND you transfer a card from your hand to my score pile! If you do, draw a [6]! / You may splay your red or purple cards right. | Same |
| B066 | Combustion | 7 | Red | Crown | D: I DEMAND you transfer one card from your score pile to my score pile for every four [Crown] on my board! / Return your bottom red card. | D: I DEMAND you transfer one card from your score pile to my score pile for every color with [Crown] on my board! / Return your bottom red card. | **Functional** |
| B067 | Explosives | 7 | Red | Factory | D: I DEMAND you transfer the three highest cards from your hand to my hand! If you transferred any, and then have no card in hand, draw a [7]! | D: I DEMAND you transfer the three highest cards from your hand to my hand! If you transfer any, and have no cards in hand, draw a [7]! | Wording/clarification |
| B068 | Refrigeration | 7 | Yellow | Leaf | D: I DEMAND you return half (rounded down) of the cards in your hand! / You may score a card from your hand. | D: I DEMAND you return all but one of the cards in your hand! / You may score a card from your hand. | **Functional** |
| B069 | Sanitation | 7 | Yellow | Leaf | D: I DEMAND you exchange the two highest cards in your hand with the lowest card in my hand! | D: I DEMAND you exchange the two highest cards in your hand with the lowest card in my hand! / Choose [7] or [8]. Junk all cards in that deck. | **Functional** |
| B070 | Bicycle | 7 | Green | Crown | You may exchange all the cards in your hand with all the cards in your score pile. If you exchange one, you must exchange them all. | You may exchange all cards in your hand with all cards in your score pile. | Wording/clarification |
| B071 | Electricity | 7 | Green | Factory | Return all your top cards without a [Factory], then draw an [8] for each card you returned. | Return your top card of each color without [Factory], then draw an [8] for each card you return. | Wording/clarification |
| B072 | Evolution | 7 | Blue | Bulb | You may choose to either draw and score an [8] and then return a card from your score pile, or draw a card of value one higher than the highest card in your score pile. | You may choose to either draw and score an [8] and then return a card from your score pile, or draw a card of value one higher than the highest card in your score pile. | Same |
| B073 | Publications | 7 | Blue | Bulb | You may rearrange the order of one color of cards on your board. / You may splay your yellow or blue cards up. | You may splay your yellow or blue cards up. / You may junk an available special achievement or make a special achievement in the junk available. | **Functional** |
| B074 | Lighting | 7 | Purple | Leaf | You may tuck up to three cards from your hand. If you do, draw and score a [7] for every different value of card you tucked. | You may tuck up to three cards from your hand. If you do, draw and score a [7] for every different value of card you tuck. | Wording/clarification |
| B075 | Railroad | 7 | Purple | Clock | Return all cards from your hand, then draw three [6]. / You may splay up any one color of your cards currently splayed right. | Return all cards from your hand. / Draw three [6]. / You may splay up any one color of your cards currently splayed right. | Minor functional (split into two effects) |
| B076 | Flight | 8 | Red | Crown | If your red cards are splayed up, you may splay any one color of your cards up. / You may splay your red cards up. | If your red cards are splayed up, you may splay any one color of your cards up. / You may splay your red cards up. | Same |
| B077 | Mobility | 8 | Red | Factory | D: I DEMAND you transfer the two highest non-red top cards without a [Factory] from your board to my score pile! If you transferred any cards, draw an [8]! | D: I DEMAND you transfer your two highest non-red top cards without [Factory] of different colors to my score pile! If you transfer any cards, draw an [8]! | **Functional** |
| B078 | Antibiotics | 8 | Yellow | Leaf | You may return up to three cards from your hand. For every different value of card that you returned, draw two [8]. | You may return up to three cards from your hand. For every different value of card that you return, draw two [8]. | Wording/clarification |
| B079 | Skyscrapers | 8 | Yellow | Crown | D: I DEMAND you transfer a top non-yellow card with a [Clock] from your board to my board! If you do, score the card beneath it, and return all other cards from that pile! | D: I DEMAND you transfer a top non-yellow card with [Clock] from your board to mine! If you do, score your top card of that color, then return all cards of that color from your board, and transfer Skyscrapers to my hand if it is a top card! | **Functional** |
| B080 | Corporations | 8 | Green | Factory | D: I DEMAND you transfer a top non-green card with a [Factory] from your board to my score pile! If you do, draw and meld an [8]! / Draw and meld an [8]. | D: I DEMAND you transfer a top non-green card with [Factory] from your board to my score pile! If you do, draw and meld an [8]! / Draw and meld an [8]. | Wording/clarification |
| B081 | Mass Media | 8 | Green | Bulb | You may return a card from your hand. If you do, choose a value, and return all cards of that value from all score piles. / You may splay your purple cards up. | You may return a card from your hand. If you do, choose a value, and return all cards of that value from all score piles. / You may splay your purple cards up. | Same |
| B082 | Quantum Theory | 8 | Blue | Clock | You may return up to two cards from your hand. If you return two, draw a [10] and then draw and score a [10]. | You may return up to two cards from your hand. If you return two, draw a [10] and then draw and score a [10]. | Same |
| B083 | Rocketry | 8 | Blue | Clock | Return a card in any opponent's score pile for every two [Clock] on your board. | Return a card in any opponent's score pile for every color on your board with [Clock]. | **Functional** |
| B084 | Empiricism | 8 | Purple | Bulb | Choose two colors, then draw and reveal a [9]. If it is either of the colors you choose, meld it and you may splay your cards of that color up. / If you have twenty or more [Bulb] on your board, you win. | Choose two colors, then draw and reveal a [9]. If the drawn card is one of those colors, meld it and splay your cards of its color up, otherwise unsplay that color. / If you have at least twenty [Bulb] on your board, you win. | **Functional** |
| B085 | Socialism | 8 | Purple | Leaf | You may tuck all cards from your hand. If you tuck one, you must tuck them all. If you tucked at least one purple card, take all the lowest cards in each other player's hand into your hand. | You may tuck a top card from your board. If you do, tuck all cards from your hand. / You may junk an available achievement of value 8, 9, or 10. | **Functional** |
| B086 | Composites | 9 | Red | Factory | D: I DEMAND you transfer all but one card from your hand to my hand! Also transfer the highest card from your score pile to my score pile! | D: I DEMAND you transfer all but one card from your hand to my hand! Also transfer the highest card from your score pile to my score pile! | Same |
| B087 | Fission | 9 | Red | Clock | D: I DEMAND you draw a [10]! If it is red, remove all hands, boards, and score piles from the game! If this occurs, the dogma action is complete. / Return a top card other than Fission from any player's board. Draw a [10]. | D: I DEMAND you draw a [10]! If it is red, junk each player's non-achievement cards, and the Dogma action is complete! / Return a top card other than Fission from any player's board. Draw a [10]. | **Functional** |
| B088 | Ecology | 9 | Yellow | Bulb | You may return a card from your hand. If you do, score a card from your hand and draw two [10]. | You may return a card from your hand. If you do, score a card from your hand and draw two [10]. / You may junk all cards in the [10] deck. | **Functional** |
| B089 | Suburbia | 9 | Yellow | Leaf | You may tuck any number of cards from your hand. Draw and score a [1] for each card you tuck. | You may tuck any number of cards from your hand. Draw and score a [1] for each card you tuck. / You may junk all cards in the [9] deck. | **Functional** |
| B090 | Collaboration | 9 | Green | Crown | D: I DEMAND you draw two [9] and reveal them! Transfer the card of my choice to my board, and meld the other! / If you have ten or more green cards on your board, you win. | D: I DEMAND you draw two [9] and reveal them! Transfer the card of my choice to my board, and meld the other! / If you have at least ten green cards on your board, you win. | Wording/clarification |
| B091 | Satellites | 9 | Green | Clock | Return all cards from your hand, and draw three [8]. / You may splay your purple cards up. / Meld a card from your hand and then execute each of its non-demand dogma effects. Do not share them. | Return all cards from your hand. You may splay your purple cards up. / Draw three [8]. / Meld a card from your hand, then self-execute it. | Minor functional (effects re-split) |
| B092 | Computers | 9 | Blue | Clock | You may splay your red cards or your green cards up. / Draw and meld a [10], then execute each of its non-demand effects. Do not share them. | You may splay your red or green cards up. / Draw and meld a [10], then self-execute it. | Minor functional (self-execute (Chain rule applies)) |
| B093 | Genetics | 9 | Blue | Bulb | Draw and meld a [10]. Score all cards beneath it. | Draw and meld an [11]. Score all cards beneath it. | **Functional** |
| B094 | Services | 9 | Purple | Leaf | D: I DEMAND you transfer all the highest cards from your score pile to my hand! If you transferred any cards, then transfer a top card from my board without a [Leaf] to your hand! | D: I DEMAND you transfer all the cards of the value of my choice from your score pile to my hand! If you do, transfer a top card without [Leaf] from my board to your hand! | **Functional** |
| B095 | Specialization | 9 | Purple | Factory | Reveal a card from your hand. Take into your hand the top card of that color from all opponents' boards. / You may splay your yellow or blue cards up. | Reveal a card from your hand. Transfer to your hand the top card of that color from all opponents' boards. / You may splay your yellow or blue cards up. | Wording/clarification |
| B096 | Miniaturization | 10 | Red | Bulb | You may return a card from your hand. If you returned a [10], draw a [10] for every different value of card in your score pile. | Return a card from your hand. If you return a [10], draw a [10] for every different value of card in your score pile. If you return an [11], junk all cards in the [11] deck. | **Functional** |
| B097 | Robotics | 10 | Red | Factory | Score your top green card. Draw and meld a [10], then execute each of its non-demand dogma effects. Do not share them. | Score your top green card. / Draw and meld a [10]. If it has [Factory] or [Clock], self-execute it. | **Functional** |
| B098 | Globalization | 10 | Yellow | Factory | D: I DEMAND you return a top card with a [Leaf] on your board! / Draw and score a [6]. If no player has more [Leaf] than [Factory] on their board, the single player with the most points wins. | D: I DEMAND you return a top card with [Leaf] from your board! / Draw and meld an [11]. If no player has more [Leaf] than [Factory] on their board, the single player with the most points wins. | **Functional** |
| B099 | Stem Cells | 10 | Yellow | Leaf | You may score all cards from your hand. If you score one, you must score them all. | You may score all cards from your hand. / Draw an [11]. | **Functional** |
| B100 | Databases | 10 | Green | Clock | D: I DEMAND you return half (rounded up) of the cards in your score pile! | D: I DEMAND you return a number of cards from your score pile equal to the value of your highest achievement! | **Functional** |
| B101 | Self Service | 10 | Green | Crown | Execute each of the non-demand dogma effects of any other top card on your board. Do not share them. / If you have more achievements than each other player, you win. | If you have at least twice as many achievements as each opponent, you win. / Self-execute any top card other than Self Service on your board. | **Functional** |
| B102 | Bioengineering | 10 | Blue | Clock | Transfer a top card with a [Leaf] from any opponent's board to your score pile. / If any player has fewer than three [Leaf] on their board, the single player with the most [Leaf] on their board wins. | Score a top card with [Leaf] on any opponent's board. / If any player has fewer than two [Leaf] on their board, the single player with the most [Leaf] on their board wins. | **Functional** |
| B103 | Software | 10 | Blue | Clock | Draw and score a [10]. / Draw and meld two [10], then execute each of the second card's non dogma effects. Do not share them. | Draw and score a [10]. / Draw and meld two [9], then self-execute the second card. | **Functional** |
| B104 | A. I. | 10 | Purple | Bulb | Draw and score a [10]. / If Robotics and Software are top cards on any board, the single player with the lowest score wins. | Draw and score a [10]. / If Robotics and Software are top cards on any board, the single player with the lowest score wins. | Same |
| B105 | The Internet | 10 | Purple | Avatar | You may splay your green cards up. / Draw and score a [10]. / Draw and meld a [10] for every two [Clock] on your board. | You may splay your green cards up. / Draw and score a [10]. / Draw and meld two [10]. | **Functional** |
| B106 | Astrogeology | 11 | Red | Factory | — | Draw and reveal an [11]. Splay its color on your board aslant. If you do, transfer all but your top four cards of that color into your hand. / If you have at least eight cards in your hand, you win. | **NEW in 4E** |
| B107 | Fusion | 11 | Red | Clock | — | Score a top card of value 11 on your board. If you do, choose a value one or two lower than the scored card, then repeat this dogma effect using the chosen value. | **NEW in 4E** |
| B108 | Near-Field Comm | 11 | Yellow | Avatar | — | D: I DEMAND you transfer all the cards of the value of my choice from your score pile to my score pile! / Reveal and self-execute the highest card in your score pile. | **NEW in 4E** |
| B109 | Reclamation | 11 | Yellow | Leaf | — | Return your three bottom red cards. Draw and meld a card of value equal to half the total sum value of the returned cards, rounded up. If you return three cards, repeat this effect using the color of the melded card. | **NEW in 4E** |
| B110 | Hypersonics | 11 | Green | Factory | — | D: I DEMAND you return exactly two top cards of different colors from your board of the same value! If you do, return all cards of that value or less in your hand and score pile! | **NEW in 4E** |
| B111 | Space Traffic | 11 | Green | Crown | — | Draw and tuck an [11]. If you tuck directly under an [11], you lose. Otherwise, score all but your top five cards of the color of the tucked card, splay that color aslant, and if you do not have the highest score, repeat this effect. | **NEW in 4E** |
| B112 | Climatology | 11 | Blue | Leaf | — | D: I DEMAND you return two top cards from your board each with the icon of my choice other than [Leaf]! / Return a top card on your board. Return all cards in your score pile of equal or higher value than the returned card. | **NEW in 4E** |
| B113 | Solar Sailing | 11 | Blue | Bulb | — | Draw and meld an [11]. If its color is not splayed aslant on your board, return all but your top four cards of that color, and splay that color aslant. If there are at least six cards of that color on your board, you win. | **NEW in 4E** |
| B114 | Escapism | 11 | Purple | Avatar | — | Reveal and junk a card in your hand. Return from your hand all cards of value equal to the value of the junked card. Draw three cards of that value. Self-execute the junked card. | **NEW in 4E** |
| B115 | Whataboutism | 11 | Purple | Bulb | — | D: I DEMAND you transfer a top card with a demand effect of each color from your board to my board! If you transfer any cards, exchange all cards in your score pile with all cards in my score pile! | **NEW in 4E** |

