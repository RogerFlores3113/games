# Innovation (Carl Chudyk) — Card Layout, Splay Visibility, Board & Rendering Research

**Researched:** 2026-09-19
**Scope:** Base game only (3rd edition and 4th edition), for a faithful web UI where splayed piles show exactly the right icons.
**Overall confidence:** HIGH for card anatomy and splay visibility (read straight from the official rulebook diagrams and cross-checked against the BGA source code). MEDIUM for the digital-UI survey. MEDIUM-LOW for licensing (no published Asmadi fan policy was found).

---

## 0. Correction to the brief: base cards have 4 icon slots, not 6

The brief mentions a "3×2 / six-position grid". **That is wrong for the base game.** Every base card, in every edition, has **four** icon slots along its **left and bottom edges**. One of the four holds the hexagonal card image.

> "Icons: Each card has four slots along its left and bottom edge for icons… Card Image: One of the four icon slots on each card is instead filled with a hexagonal image depicting the innovation. It does not provide any benefit and effectively blocks one of the four slots." — 4th Ed. Base Rulebook p.8 (HIGH)

> "ICONS: Each card has four potential icon locations… CARD IMAGE: One of the four icons on each card is an image depicting the innovation. It does not provide any benefit." — 3rd Ed. Rulebook p.4 (HIGH)

The six-slot grid only appears on **Cities of Destiny** expansion cards. Those add a top-centre and a top-right slot. BGA models all cards with `spot_1..spot_6`, and spots 5 and 6 are `null` on base cards. This is probably where "six positions" came from. For the base game, model **exactly four slots**. If Cities ever gets added, the schema can grow to six.

---

## 1. Card face layout

### 1.1 Physical size and orientation
- **63.5 × 88 mm** (standard card size). The face is printed **landscape**, about 88 wide × 63.5 tall, so the aspect ratio is **≈ 1.386 : 1 (w:h)**. (HIGH: several sleeve-size sources, and the ratio measured from both rulebook diagrams comes out at 1.38–1.41.)
- **Backs are printed portrait** (63.5 wide × 88 tall). Supply piles, hands, score piles and achievements therefore look like portrait cards, while board cards are landscape. BGA copies this: its `"S recto"` back is 33×47 px (portrait) and its `"M card"` face is 182×126 px (landscape). (HIGH)

### 1.2 Slot naming (use these names in code)
BGA uses the same numbering (`innovation.js` `writeOverCard`):

| Slot | Position | BGA field |
|------|----------|-----------|
| **TL** | top-left | `spot_1` |
| **BL** | bottom-left | `spot_2` |
| **BC** | bottom-centre | `spot_3` |
| **BR** | bottom-right | `spot_4` |
| (TR) | top-right, Cities only | `spot_5` |
| (TC) | top-centre, Cities only | `spot_6` |

### 1.3 Proportional geometry (measured from official rulebook art)
Measurements are fractions of card width (x) and height (y), with the origin at the top-left. Each value is the average of the 3rd-ed "Emancipation" and 4th-ed "Medicine" anatomy diagrams, ±0.02.

```
 x→ 0.0      0.07      0.27  0.31                           0.85  0.95 1.0
 y  ┌──────────────────────────────────────────────────────────────────┐
0.05│  ┌────────┐       ┌───────────── TITLE ──────────────┐   (AGE)     │  ← 4E: card no. "B 029" in tiny text above the title's right end
    │  │        │       └──────────────────────────────────┘             │
0.21│  │   TL   │     ┌─────────────────────────────────────────────┐    │
    │  │        │     │ [ico] I DEMAND … (dark box)                  │    │
0.36│  └────────┘     │ [ico] non-demand effect (light box)          │    │
    │      ║ lattice│ [ico] …                                      │    │
0.62│      ║        └─────────────────────────────────────────────┘    │
0.65│  ┌────────┐ ═══════ ┌────────┐ ═══════ ┌────────┐                │
    │  │   BL   │  lattice│   BC   │         │   BR   │                │
0.92│  └────────┘         └────────┘         └────────┘                │
    └──────────────────────────────────────────────────────────────────┘
       0.07–0.27          0.40–0.60          0.72–0.94
```

| Element | x range | y range | Notes |
|---|---|---|---|
| TL icon | 0.07–0.27 | 0.06–0.36 | a square about 20% of card width, about 28% of card height |
| BL icon | 0.07–0.27 | 0.64–0.92 | |
| BC icon | 0.40–0.60 | 0.64–0.92 | horizontally centred |
| BR icon | 0.72–0.94 | 0.64–0.92 | |
| Title | 0.30–0.80 (3E) / 0.27–0.97 (4E) | 0.07–0.20 | All caps. 3E: a white-bordered dark label. 4E: a dark full-width bar running to the right edge, with the value shape inside it |
| Age / value | 0.85–0.95 | 0.08–0.20 | Number inside a colour-specific shape (see 1.4) |
| Dogma effects | 0.30–0.95 | 0.21–0.62 | Stacked boxes, each led by a small **featured icon**. Demand = dark box, non-demand = light box |
| Card number (4E only) | ~0.80–0.92 | ~0.02–0.06 | e.g. `B 029` (set letter + number) |
| Lattice | runs between slots along the left column and bottom row | | A colour-specific decorative "track" joining the four slots. Purely cosmetic |

BGA's CSS gives the same geometry at 182×126 px: 36 px icons, 7 px inset from top, bottom, left and right, and the centre icon at `left:72px`. (HIGH)

**The hexagon image** fills whichever slot it occupies. It can be in **any** of the four slots: TL on Mathematics and Lighting, BR on Emancipation and Medicine, BC or BR on others. It is drawn as a black hexagon with a monochrome/duotone illustration. Icon tiles are drawn as squares.

### 1.4 Colour identity and 3rd vs 4th edition differences

| Aspect | 3rd edition (2014–2024, what BGA "Third edition" shows) | 4th edition (2025; base game = "B" set of Innovation Ultimate) |
|---|---|---|
| Ages | 1–10 (105 cards) | **1–11** (adds age 11, "Prudence") |
| Icon types | 6: castle(tower), crown, leaf, lightbulb, factory, clock | **7**: those 6 plus an "avatar/person" icon on age 10–11 cards. Age bands: castle 1–3, factory 4–11, clock 7–11, avatar 10–11, leaf/bulb/crown all ages |
| Splay directions | left, right, up | left, right, up, **aslant** (reveals all 4 slots, see §2) |
| Background | full-bleed colour with a checker texture and a lattice | the same idea, plus a faint architectural line drawing. Icons are "simpler and larger" (Board Game Quest review) |
| Value marker | number in a small dark rounded shape | number inside a **colour-coded shape**: blue = circle, green = square, purple = diamond, red = octagon, yellow = sunburst. The lattice pattern also differs by colour (circles, squares, diamonds, octagons, stars). This is colour-blind-friendly redundancy (4E rulebook p.9) |
| Title | dark label box beside the value | full-width dark bar with the value shape at its right end |
| Card number | none | `B 0xx` printed top-right |
| Back | portrait; big stylised age numeral, a period figure, the age name, and the achievement cost (5×age) in a small circle; tan/sepia for the base set | portrait; big serif age numeral at top, an architectural etching, and a bottom bar with "N AGE-NAME" plus the 5×age cost circle; base set is brown/sepia, and each expansion has a tint and set glyph |
| Splay rule nuance | a 0–1-card pile "is always considered unsplayed" | "If a color contains zero or one card, it **cannot be splayed**", and "if a color is splayed, it **cannot be splayed in the same direction again**" |

1st/2nd edition (2010–2013) used the same four-slot left+bottom layout with a black-and-white hexagon image (1st ed "Rules of Play v1.1" card-layout diagram). No layout change matters for the UI. (HIGH)

**Official icon tile colours** (useful even when icons are redrawn): leaf = white leaf on **dark green**, lightbulb = pale bulb on **purple**, crown = gold crown on **yellow**, castle = pale tower on **grey**, factory = pink factory on **dark red**, clock = clock face on **blue**, avatar (4E) = figure on **light blue**. (HIGH, from both rulebooks)

---

## 2. Splay mechanics and exactly which slots count

### 2.1 The rule
> "To splay a color, take the top card and slide it in the direction indicated, revealing one icon if splaying left, two icons if splaying right, and three icons if splaying up. If there are more than two cards, repeat the process so that all cards in the color are splayed." — 3E p.15
> 4E p.24 adds: "…and four icons if splayed aslant."

Each card in the pile is offset from the one below it. The **top card is fully visible**. Every covered card shows only the strip left uncovered by the card above it.

### 2.2 Visibility table (the core of this document)

| Splay | Top card moves… | Covered cards expose their… | Slots that COUNT on each non-top card | # |
|---|---|---|---|---|
| **Unsplayed** | — (squared stack) | nothing | none | 0 |
| **Left** | left | **right edge** | **BR** | 1 |
| **Right** | right | **left edge** | **TL, BL** | 2 |
| **Up** | up | **bottom strip** | **BL, BC, BR** | 3 |
| **Aslant** (4E only) | up and right (diagonal) | **left edge + bottom strip** | **TL, BL, BC, BR** | 4 |

- The **top card always counts all four of its slots**, in every splay state. Confirmed by BGA's `countVisibleIconsInPile`: the top card uses `getAllIcons`, and covered cards use `getVisibleIconsWhenSplayed(card, dir)`. (HIGH)
- **The hexagon image counts as no icon**, in any slot and in any splay. BGA represents it as icon `0` and never matches it against a resource. Rulebook: "does not provide any benefit". (HIGH) So a splay can expose a slot that holds the hexagon and gain nothing. Example: a left splay over a card whose BR is the hexagon adds 0.
- A left splay also exposes the covered card's age number and a sliver of its title and dogma text (see the 3E splay diagram), but **only BR counts**. Age and text are never "icons".
- BGA's `getVisibleIconsWhenSplayed` confirms the mapping in code: left `[spot_4 (+spot_5 for Cities)]`, right `[spot_1, spot_2]`, up `[spot_2, spot_3, spot_4]`, aslant `[spot_1..spot_4]`. (HIGH)

### 2.3 ASCII diagrams (3 cards; `###` marks the covered part)

Card slots: `TL` is top-left, and `BL BC BR` is the bottom row. `(H)` marks where a hexagon might sit.

**Unsplayed:** only the top card is visible.
```
┌────────────────────────┐
│[TL]  TITLE          (n)│
│      dogma text...     │
│[BL]      [BC]      [BR]│   ← top card: TL BL BC BR all count
└────────────────────────┘
```

**Splayed LEFT** (each card sits one strip to the LEFT of the card below it, so the covered card's right edge shows):
```
┌────────────────────────┬────┬────┐
│[TL]  TITLE (top)    (n)│ (n)│ (n)│
│      dogma text...     │ ...│ ...│
│[BL]      [BC]      [BR]│[BR]│[BR]│  ← covered cards: BR only
└────────────────────────┴────┴────┘
  top card                 c2   c3 (bottom)
```

**Splayed RIGHT** (the covered cards' left edges show):
```
┌────┬────┬────────────────────────┐
│[TL]│[TL]│[TL]  TITLE (top)    (n)│
│    │    │      dogma text...     │
│[BL]│[BL]│[BL]      [BC]      [BR]│  ← covered cards: TL + BL
└────┴────┴────────────────────────┘
  c3   c2   top card
```

**Splayed UP** (the covered cards' bottom strips show below the top card):
```
┌────────────────────────┐
│[TL]  TITLE (top)    (n)│
│      dogma text...     │
│[BL]      [BC]      [BR]│  ← top card: all 4
├────────────────────────┤
│[BL]      [BC]      [BR]│  ← c2: BL BC BR
├────────────────────────┤
│[BL]      [BC]      [BR]│  ← c3 (bottom): BL BC BR
└────────────────────────┘
```

**Splayed ASLANT** (4E; each card sits up and to the right of the one below it, so an L-shape of each covered card shows):
```
          ┌────────────────────────┐
          │[TL]  TITLE (top)    (n)│
     ┌────┤      dogma text...     │
     │[TL]│[BL]      [BC]      [BR]│   ← top: all 4
┌────┤    ├────────────────────────┘
│[TL]│[BL]│[BC]      [BR]          ← c2: TL BL BC BR (L-shaped strip)
│    ├────┴──────────────────┘
│[BL]│[BC]      [BR]               ← c3: TL BL BC BR
└────┴───────────────────┘
```

### 2.4 Counting icons on a board
For each icon type `k` (castle, crown, leaf, bulb, factory, clock; plus avatar in 4E):

```
count(player, k) = Σ over the 5 colour piles P of:
     countIn(allSlots(top(P)), k)
   + Σ over covered cards c in P of countIn(visibleSlots(c, splay(P)), k)

visibleSlots(c, none)   = []
visibleSlots(c, left)   = [c.BR]
visibleSlots(c, right)  = [c.TL, c.BL]
visibleSlots(c, up)     = [c.BL, c.BC, c.BR]
visibleSlots(c, aslant) = [c.TL, c.BL, c.BC, c.BR]
# a slot holding HEX never matches any k
```

- A pile with 0 or 1 cards is always unsplayed (3E), or cannot be splayed (4E). Either way only the top card counts.
- **How changing the splay changes the count.** Re-splaying first unsplays and then splays in the new direction, so the count for pile P becomes `top(P) icons + Σ visibleSlots(c, newDir)`. The change is not additive across directions: going from left to right hides BR and exposes TL+BL. Adding a card (meld or tuck) to a splayed pile continues the splay. A meld puts the new card on top, so the old top card is now covered and contributes only its visible slots. A tuck adds a covered card at the bottom that contributes its visible slots. Removing cards down to 1 resets the splay.
- The featured icon for a Dogma is the card's most frequent icon. Sharing and demand eligibility compare these board totals. Totals are "locked in" at the start of the Dogma action (4E p.14).
- **Worked example** (from the 3E p.15 diagram): Blue is splayed right with three cards. The top card is Mathematics (TL=hex, BL=bulb, BC=crown, BR=bulb). The two covered cards are hex/bulb and bulb/bulb in TL/BL. Blue contributes bulbs 2 (top) + 1 + 2 = 5, and crown 1.

---

## 3. Card backs and hidden information

**What a back reveals:** the **age (value)**, the age name, the achievement cost (5×age), and in 4E/Ultimate the **set** (base or expansion, by tint and glyph). It does **not** reveal colour, title or icons. (HIGH, from both BGA back sprite sheets and the 4E rulebook: "The backs of cards are quite important though, as you can determine their value and set!")

Implication for the server's `toPlayerView`: for any face-down card, send `{ age, set }` and nothing else. Don't send an opaque id that stays stable across zones either, or players could track cards through the id. This matches the Hanabi per-seat filtering constraint.

**Official "Can I look?" table (4E base, p.6):**

| Zone | Yours | Others |
|---|---|---|
| Hand | front + back | **back only** (so count and ages are public) |
| Board | front + back | front + back (covered cards may be inspected) |
| Score pile | front + back | back only (so each card's value is public) |
| Claimed achievements | **back only** | back only |
| Supply decks | back | back |
| Standard (available) achievements | back | back (nobody ever sees their faces) |
| Special achievements | front + back | front + back |

**3rd-edition nuance (3E p.20):** "You can always count and see the value of cards in each supply pile, each hand, and each score pile." Whether the **identities of covered cards on an opponent's board** and the **number of cards in an opponent's unsplayed pile** are public is left to "decide with your group". 4E settles it: board = front+back for everyone. **Recommendation:** follow 4E. Show opponents' pile counts and let anyone inspect a pile's cards. This is also simpler to implement.

---

## 4. Table layout conventions

### 4.1 Physical
- **Supply:** ten piles (eleven in 4E) arranged "like a clock" in a ring, with the **standard achievements** in the centre (one face-down card from each of ages 1–9 in 3E, ages 1–10 in 4E) and the **5 special achievements** beside it (3E: Monument, Empire, World, Wonder, Universe). 4E adds a **Junk** pile/info card. (3E p.6, 1st-ed rules, 4E p.4)
- **Per player:** a **reference card** in front of the player. The **score pile** is tucked face-down under its **left** edge and **achievements** under its **right** edge. (4E adds forecast along the top edge and secrets along the bottom edge, but those are Echoes/Unseen expansions.) The **board** of up to **5 colour piles** sits above or beside it, one pile per colour, with a colour's cards never mixed. The **hand** is held. (HIGH)
- Rulebook images arrange the board as a row of five piles, or 3+2 in the Fig. 2 thumbnail. The rules don't mandate a colour order. The 4E layout page lists the colours alphabetically (blue, green, purple, red, yellow). I did not verify BGA's display order. **Pick one fixed order and keep it identical for every player** so piles can be compared at a glance.

### 4.2 Digital implementations surveyed

**Board Game Arena — Innovation** (the de facto online home; officially licensed; code MIT-licensed at `github.com/micahstairs/bga-innovation`; supports 3E and 4E art)
- Faces are **composed at runtime**, not flat card scans. A colour background sprite gets absolutely positioned icon tiles (a 36 px sprite at the M size), plus a hexagon image sprite, plus HTML title, age and dogma text with inline icon glyphs (`writeOverCard`). Validated pattern: data plus a layout template, not 105 card images. (HIGH)
- **Sizes:** board and hand faces are 182×126. Opponent hands, score piles, achievements and decks are drawn as tiny portrait backs (33×47) that show only the age. Large tooltip cards are 456×316.
- **Splay rendering:** each covered card is offset by 52 px in "expanded" mode or 3 px in "compact" mode. Left splay is anchored right and grows leftward, right splay grows rightward, up splay grows upward, and aslant offsets on both axes. When a splayed pile would exceed the player-panel width, the code first shrinks the overlap, then shrinks it even for cards with visible echo effects. So long left/right splays **collide with the available width**, and 52 px strips stop fitting. (HIGH, from code)
- **Splay indicator:** a small arrow glyph under each pile, rotated 45° for aslant, with a tooltip "This stack is splayed ${direction}". (HIGH)
- **Icon counts:** a per-player row of the 6 (or 7) icon tiles with counts, in the player panel. When choosing a card to Dogma, a **"simulated resource table"** shows how your counts would change (more/less/equal colouring). A good pattern for a splay-choice preview. (HIGH)
- **Display toggles:** "compact vs expanded" splay mode, a "view full" mode that fans every card of a pile vertically so all of them can be read, a "Browse all cards" button, a "simplified card back" preference, and a "Card appearance: third/fourth edition" preference. (HIGH from code and help page)
- **Known pain points** (MEDIUM: inferred from code comments and my own knowledge of player feedback, not a single cited thread). Wide splayed piles overflow the panel on small screens. In compact mode the icons can't be read and players rely on the count table. Covered cards are hard to read without hovering. The text is small at M size. There is a lot of tooltip-hovering. BGA had to add the icon-count table and splay arrows precisely because reading the icons off a compacted board is error-prone.

**Online Innovation — innovation.isotropic.org** (by "dougz", the isotropic Dominion author; 3E-era, Echoes/Figures/Cities drafts; now old and mostly idle)
- The screenshot (`innovation.isotropic.org/faq/screenshot.png`) shows a **minimalist, fully data-driven** rendering with no card art. Each card is a coloured rectangle with the **title + age** at top right and the **TL icon beside it**. Below that is a row of the **3 bottom slots** (a hexagon shown as a black hex), then the dogma text with a small featured-icon glyph. **Opponent cards collapse to title + icons only** (the text is hidden).
- **Splays** appear as a tiny annotation on the top card: `◄ (1)` or `(2)`, meaning the direction arrow plus the number of covered cards. **The covered cards themselves are not drawn at all.** The splay is abstracted into the icon totals.
- **Icon totals** sit per player at the right edge: six small colour-coded tiles with numbers (castle, leaf, bulb, crown, factory, clock).
- **Score** shows as `score: 12 [1 1 1 1 1 1 1 2 3]`, listing your own score cards' values. An opponent's shows as `score: 1 [1]`. Hand ages show as small numbered black squares for opponents. **Achievements** are small numbered tan squares, with special achievements as abbreviations (`Uni Wnd Wor Emp Mon`). **Supply** is a vertical stack of small back-stacks labelled 1–10 on the left edge. A "show text" checkbox toggles dogma text. (HIGH, from the screenshot)
- The lesson: an abstract representation (top card + splay arrow + count) is **perfectly playable** and far more compact than drawing every strip. Players care most about (a) the top cards, (b) the per-icon totals, and (c) the splay direction.

**Others (LOW relevance):** `github.com/jrdek/innovation` ("readable implementation", 2025), `github.com/johnchampaign/innovation-csharp` (C#/WPF fan project, active 2026), `github.com/jsparkes/innovation` (.NET port, 2022), `github.com/cmilando/splaynet` (splay-probability Flask app). Tabletop Simulator and Yucata have also hosted Innovation. None has UI worth copying beyond what BGA and isotropic show.

### 4.3 Recommended UI patterns (synthesis)
1. **A per-player icon-count strip** is mandatory: six (seven in 4E) coloured icon tiles with numbers, always visible, for every player. It's the thing players actually read, since every Dogma turns on these comparisons.
2. **Show a Dogma preview** when hovering a top card: its featured icon, your count against each opponent's, and who shares or is vulnerable. This removes the "count everyone's castles" chore.
3. **A splay preview** when an effect offers a splay choice: show the before→after counts, as in BGA's simulated resource table.
4. **Two render modes per pile.** (a) *Compact*: the top card at full size, plus visible strips of covered cards drawn as **only the counted slots** (e.g. a 20%-wide column of TL/BL for a right splay), capped at about 4 strips with a "+n" overflow badge. (b) *Expanded/inspect*: click the pile to open a vertical list of every card in it. Draw strips with the true geometry (BR-only column for left, TL/BL column for right, bottom row for up), so a friend who knows the physical game recognises it instantly.
5. **A splay indicator on every pile of 2+ cards**: an arrow (←, →, ↑, ↗) plus the card count, on the top card or below the pile.
6. **Show hidden zones as portrait backs with the age numeral** (hand, score pile, achievements, supply), with counts. Score total should be public per the rules.
7. **Mobile:** stack each player's board as a 5-column grid of *top cards only*, plus the count strip. Keep splay strips for your own board and the inspect view. Wide left/right splays are exactly where BGA overflows.

---

## 5. Art and licensing

- **Rights holder:** Asmadi Games (publisher, Chris Cieslik), with design by Carl Chudyk. BGA runs under a publisher licence. The BGA repo's **MIT licence covers its code only**. The `img/` sprites are Asmadi artwork and **must not be copied**. (HIGH on the facts, MEDIUM on the interpretation)
- **No published Asmadi fan-content or online-implementation policy was found** (searched their site, BGG and the web). Treat the official card art, card-back art, hexagon illustrations and trade dress as all-rights-reserved. (MEDIUM-LOW that no policy exists. It may be posted somewhere I didn't find.)
- **Game mechanics are not copyrightable.** Card **titles** are short names and effectively unprotectable individually. **Dogma text** is creative expression, although it is heavily functional. Reproducing all 105 (or 115) effect texts verbatim is technically copying. For a private, no-accounts, friends-only link that's the norm among fan implementations and low risk, but not zero. If this ever becomes public or popular, **email innovation@asmadigames.com** (the address in the 4E rulebook) for a blessing. Asmadi has historically let isotropic and BGA operate. "Innovation" is also a trademark, so don't brand the site as the official game.
- **Open icon sources for the 6 (7) resource icons:**
  - **Lucide** (ISC licence, already React-friendly): `castle`, `crown`, `leaf`, `lightbulb`, `factory`, `clock`, and `person-standing`/`user-round` for the 4E avatar. Consistent stroke style that tints easily. (HIGH that these icons exist and the licence is permissive)
  - **game-icons.net** (CC BY 3.0, attribution required): `castle`, `crown`, `oak-leaf`, `light-bulb`, `factory`, `stopwatch`/`clockwork`. Filled silhouettes that read closer to the board-game look.
  - **Hexagon images:** don't reproduce them. Use a **black hexagon with the card's age numeral or a simple generic glyph** (or a Lucide icon related to the title, e.g. `pi` for Mathematics, `sailboat` for Sailing). It carries no rules meaning, so it only has to read as "not an icon".
- **Recommended rendering route:**
  1. The **card data model** is `{ id, age, color, title, slots: [TL, BL, BC, BR] (each 'castle'|'crown'|'leaf'|'bulb'|'factory'|'clock'|'avatar'|'hex'), featuredIcon, effects: [{ kind: 'demand'|'nondemand', text }] }`. Write the data by hand from the 3E card list. The rules engine and the renderer share `slots`.
  2. **One `<Card>` component**: a CSS grid or absolutely positioned layout using the §1.3 proportions on a 1.386:1 box. Icon tiles are rounded squares filled with the official tile colours (§1.4), each holding a white Lucide or game-icons glyph. The hexagon is an SVG `polygon`. The title is a dark label, and the value sits in a colour-coded shape (use the 4E circle/square/diamond/octagon/sunburst, which is free colour-blind redundancy). Draw the dogma boxes as dark or light rounded rects led by a small featured-icon glyph. The background is a flat colour with an optional CSS-pattern lattice. **No scanned art.**
  3. **Strip rendering for covered cards** reuses the same component clipped with `overflow:hidden` to the visible region: the right ~26% for left splay, the left ~30% for right splay, the bottom ~36% for up splay, the left + bottom L for aslant. This guarantees the strip shows exactly the counted slots, because the geometry is the rule.
  4. **Card backs:** a portrait rectangle in sepia with a large serif age numeral and the age name (Prehistory, Classical, Medieval, Renaissance, Exploration, Enlightenment, Romance, Modern, Postmodern, Information; 4E renames age 4 "Discovery" and adds 11 "Prudence"). Original typography, no figure art.
  5. **Edition:** implement the **3rd edition** rules and card list as v1. It has 105 cards, 6 icons and no aslant, it's the BGA default and what most friends know, and the full card list is widely documented. Keep `aslant` and a 7th icon in the enum so 4E can be added later without schema changes.

---

## 6. Sources

| Source | Used for | Confidence |
|---|---|---|
| Innovation 3rd Ed. rulebook — https://asmadigames.com/rules/Innovation_Rules.pdf (pp.4 anatomy, 6 setup, 15 splaying, 20 hidden info) | anatomy, splay diagrams, hidden info | HIGH |
| Innovation 4th Ed. Base rulebook — https://asmadigames.com/rules/Inno4E_Base_Rulebook_Spreads.pdf (pp.4 setup, 6 Can-I-Look, 8–9 card layout, 24–25 splaying incl. aslant) | 4E layout, aslant, value shapes | HIGH |
| Innovation Ultimate rulebook v0.9 — https://www.asmadigames.com/innovation/InnoUlt_Rulebook_v0_9.pdf (p.6–7 Card Layout, Card Icons, age bands) | icon types and age bands, reference-card zones | HIGH |
| 1st-ed "Rules of Play v1.1" — https://asmadigames.com/innovation/InnovationRulesWeb.pdf | early layout, clock-ring supply | HIGH |
| Asmadi card reference — https://asmadigames.com/innovation/ | 4E/Ultimate rulebook links | HIGH |
| BGA Innovation source (MIT) — https://github.com/micahstairs/bga-innovation (`innovation.js`: `getVisibleIconsWhenSplayed`, `countVisibleIconsInPile`, `refreshSplay`, `writeOverCard`; `innovation.scss` icon CSS; `img/*card_backs_portrait.jpg`) | slot mapping, counting, splay rendering, back designs | HIGH |
| BGA game page — https://en.boardgamearena.com/gamepanel?game=innovation ; help — https://en.doc.boardgamearena.com/Gamehelpinnovation | UI features (icon counts, splay arrows) | HIGH |
| isotropic Online Innovation — https://innovation.isotropic.org/ , FAQ + screenshot https://innovation.isotropic.org/faq/screenshot.png | abstract UI pattern | HIGH (screenshot), MEDIUM (authorship "dougz", seen in the log) |
| Board Game Quest Innovation Ultimate review — https://www.boardgamequest.com/innovation-ultimate-and-expansion-review/ | 4E visual changes | MEDIUM |
| Sleeve size — https://www.sleeveyourgames.com/sleeves/5405/innovation , https://boardgamegeek.com/thread/2001972/innovation-3rd-edition-cards | 63.5×88 mm | HIGH |
| BGG gallery and forums (https://boardgamegeek.com/boardgame/63888/innovation) | returned 403 to the fetcher, not directly read | — |
