// Writes prompts/<id>.json for every sprite: the PixelLab call that made it,
// with the exact parameters sent, and the integer scale fetch-art.mjs applied.
// Rerunning a spec's call reproduces the style. Specs not in this table are
// deleted.
//
//   node apps/web/art/expedition/make-prompts.mjs
import fs from "node:fs";

const dir = new URL("./prompts/", import.meta.url);

const backdrop = (description) => ({
  tool: "create_image_pixflux",
  params: { description, width: 320, height: 180, view: "side", outline: "lineless", shading: "medium shading", no_background: false },
  scale: 2,
});

const ICON_BATCH = {
  tool: "create_1_direction_object",
  params: {
    name: "expedition icons",
    description: "jungle expedition item icon, warm night palette, single-pixel dark outline, simple shading, transparent background",
    size: 16,
    view: "sidescroller",
  },
};

/** Batch order: `batch_index` is the frame each icon was taken from. The
 * batch's first ten frames were gear icons, since retired. */
const FIRST_ICON_FRAME = 10;
const ICONS = [
  ["marker-camp", "tiny canvas tent"],
  ["marker-cleared", "tiny canvas tent with a green flag beside it"],
  ["marker-boss", "dark storm cloud with a yellow lightning bolt"],
  ["temple", "tiny overgrown stone jungle temple"],
  ["crew-token", "brown explorer's wide-brim hat"],
  ["seat-pack", "canvas backpack with a rolled bedroll on top"],
  ["crate", "wooden supply crate with rope ties"],
  ["leader-sun", "small golden sun emblem"],
  ["icon-whisper", "green leaf with a curling speech swirl"],
  ["icon-tricks", "small stack of playing cards"],
];

/** The second icon batch: one per character base power, upgrade and item,
 * in catalogue order. `frame` is the batch candidate chosen by eye. */
const SOURCE_BATCH = {
  ...ICON_BATCH,
  params: { description: ICON_BATCH.params.description, size: 16, view: "sidescroller" },
  object_id: "540589d3-84e0-49f2-80e5-4fc599074fd9",
};

const SOURCE_ICONS = [
  ["cartographer", "pencil over a card", 5],
  ["trained-monkey", "small monkey holding a card", 18],
  ["pack-mule", "mule head with a pack", 19],
  ["parrot", "red parrot in profile", 20],
  ["trail-map", "folded map with a dotted path", 21],
  ["rain-poncho", "yellow poncho", 22],
  ["smoke-signal", "smoke puffs over a fire", 23],
  ["whetstone", "grey stone with a spark", 24],
  ["puffball", "puffball mushroom with spores", 25],
  ["bait", "banana on a string", 26],
  ["camouflage", "leafy cloak", 27],
  ["rope-ladder", "rope ladder", 28],
  ["heavy-pack", "bulging backpack", 29],
  ["mosquito-net", "net with a mosquito", 30],
];

/** The third icon batch, for the nine characters: one 64-frame set styled
 * on the scout (since retired), parrot and whetstone icons. `frame` is the candidate
 * chosen by eye; the descriptions say what each frame shows. */
const NINE_BATCH = {
  ...ICON_BATCH,
  params: { description: ICON_BATCH.params.description, size: 16, view: "sidescroller", style_images: ["sources/scout.png", "sources/parrot.png", "sources/whetstone.png"] },
  object_id: "b28dd46a-a2bf-4964-af7a-f55e90287cdf",
};

/** The first Magician hat read dark on dark in the kit chip, so it was redrawn
 * in its own batch with a brighter description. */
const MAGICIAN_ICON = {
  ...NINE_BATCH,
  params: {
    description: "bright purple magician top hat with a white band and a white-tipped wand, sparkles, light colours that read on a dark background",
    view: "sidescroller",
    style_images: ["sources/parrot.png"],
  },
  object_id: "9b89e75e-6f87-4516-a5ce-284ca42e24a7",
  batch_index: 0,
  scale: 1,
};

const NINE_ICONS = [
  ["jd", "tourist's baseball cap", 0],
  ["jd.blend-in", "eyes peering out of a leafy bush", 8],
  ["jd.free-spirit", "white feather", 9],
  ["jd.rule-breaker", "rule book with a broken chain", 10],
  ["leader", "red megaphone", 5],
  ["leader.open-ears", "cupped ear", 25],
  ["leader.delegate", "open hand passing a speech bubble", 26],
  ["leader.momentum", "rising arrow with a star", 27],
  ["explorer", "brass compass", 4],
  ["explorer.second-wind", "gust of wind", 22],
  ["explorer.true-form", "framed card with a red mark", 23],
  ["explorer.reshape", "hand shaping a card", 24],
  ["businessman", "leather briefcase", 1],
  ["businessman.cash-out", "pouch spilling gold coins", 34],
  ["businessman.pop-up-shop", "market stall with a striped awning", 11],
  ["businessman.buyout", "pile of gold coins", 12],
  ["businessman.haggle", "price tag on a string", 13],
  ["pack-rat", "overstuffed backpack with goggles", 7],
  ["pack-rat.quartermaster", "two hands passing a bundle", 31],
  ["pack-rat.pack-animal", "pack mule", 32],
  ["pack-rat.sturdy-straps", "coiled leather strap", 33],
  ["cartographer.redraw", "red book with a quill", 35],
  ["cartographer.survey", "framed map with a lens", 20],
  ["cartographer.treasure-map", "treasure map with a red cross", 21],
  ["pocket-glass", "magnifying glass", 47],
  ["message-bottle", "corked bottle with a note", 61],
  ["first-aid-kit", "red first aid kit", 50],
  ["signal-flare", "red signal flare", 62],
  ["magician.double-act", "two theatre masks", 14],
  ["magician.misdirection", "white glove pointing", 15],
  ["magician.switcheroo", "card with two swapping arrows", 16],
  ["perfumist", "pink perfume bottle with a bulb", 3],
  ["perfumist.turncoat", "pink rose", 17],
  ["perfumist.upside-down", "card with an arrow and a 1", 18],
  ["perfumist.smelling-salts", "green bottle of salts", 19],
  ["hermit", "hooded hermit with a staff", 6],
  ["hermit.burden", "heavy sack", 28],
  ["hermit.first-pick", "hand raising one finger", 29],
  ["hermit.alms", "hand letting a coin fall", 30],
];

/** Seated silhouettes behind the stump, one per character. */
const CREW = [
  ["cartographer", "dark silhouette of a cartographer sitting cross-legged facing the viewer, holding a large unrolled map open in both hands, a long map tube slung across the back over one shoulder, almost black shape with a thin warm orange firelight rim light on one side, no glowing eyes, isolated sprite on plain background", 11, "b5819dd6"],
];

/** The nine characters' silhouettes, natively transparent and used as
 * downloaded. The Cartographer keeps its silhouette above. */
const NINE_CREW = [
  ["jd", "dark silhouette of an ordinary tourist sitting cross-legged facing the viewer, baseball cap, t-shirt, a camera hanging on a strap around the neck, almost black shape with a thin warm orange firelight rim light on one side, no face details, isolated sprite on plain background", 7, "a796eb43-bbaf-47fd-9ff2-58a274a7bca3"],
  ["explorer", "dark silhouette of a jungle explorer sitting cross-legged facing the viewer, pith helmet, a coiled rope over one shoulder, holding a compass up in one hand, almost black shape with a thin warm orange firelight rim light on one side, no face details, isolated sprite on plain background", 7, "d424936a-4ab5-4a3a-8181-45675ed48d63"],
  ["businessman", "dark silhouette of a wealthy businessman sitting cross-legged facing the viewer, bowler hat, suit with tie, holding a big leather briefcase upright on his lap with both hands, a gold coin glinting, almost black shape with a thin warm orange firelight rim light on one side, no face details, isolated sprite on plain background", 11, "3234e29a-aacd-4c87-90ce-26870d519656"],
  ["pack-rat", "dark silhouette of a porter sitting cross-legged facing the viewer, carrying an enormous overstuffed backpack piled high with pots, rolled blankets and a lantern dangling off it, almost black shape with a thin warm orange firelight rim light on one side, no face details, isolated sprite on plain background", 7, "b5605be2-a09d-4c0b-8800-8ae6523c95e6"],
  ["magician", "dark silhouette of a stage magician sitting cross-legged facing the viewer, tall top hat and a flowing cape, holding a fan of playing cards up in one hand, almost black shape with a thin warm orange firelight rim light on one side, no face details, isolated sprite on plain background", 7, "b668fa13-5e9d-479a-8187-37df31930f73"],
  ["perfumist", "dark silhouette of a perfumer sitting cross-legged facing the viewer, long hair tied up with a flower, holding up a round perfume bottle with a squeeze bulb, a faint pink mist puff rising from it, almost black shape with a thin warm orange firelight rim light on one side, no face details, isolated sprite on plain background", 7, "4c3e4f23-fe74-45ec-aa58-9ccf1f776e1a"],
  ["hermit", "dark silhouette of a hooded hermit monk sitting cross-legged in meditation facing the viewer, deep hood and long robe, hands resting together in the lap, a tall walking staff leaning beside, almost black shape with a thin warm orange firelight rim light on one side, no face details, isolated sprite on plain background", 7, "ce9e7f77-c878-4a3c-824a-9cb19f6a6dd6"],
  ["leader", "dark silhouette of an expedition leader sitting cross-legged facing the viewer, wide-brim hat, raising a megaphone to the mouth with one hand, almost black shape with a thin warm orange firelight rim light on one side, no face details, isolated sprite on plain background", 7, "2fe92e81-3308-421b-a7af-6cc8dd4e870a"],
];
const crewSpec = (description, seed, job, note) => ({
  tool: "create_image_pixflux",
  params: {
    description,
    width: 64,
    height: 80,
    view: "side",
    outline: "lineless",
    shading: "basic shading",
    no_background: true,
    seed,
  },
  job,
  scale: 1,
  note,
});

const MASCOT = {
  tool: "create_1_direction_object",
  params: {
    name: "red panda mascot",
    description:
      "cute red panda camp mascot sitting upright facing the viewer, rusty red fur, white face markings, bushy ringed tail curled beside it, single-pixel dark outline, simple shading, transparent background",
    size: 32,
    view: "sidescroller",
  },
  candidate_used: 7,
};

const mascotStrip = (display_name, description) => ({
  ...MASCOT,
  animation: { tool: "animate_object", model: "v3", display_name, description, frame_count: 4, keep_first_frame: false },
  scale: 1,
});

/** One sprite per animal and disaster boss, drawn on the table from unit 8:
 * [id, width, height, seed, job, description, extra params?]. */
const BOSSES = [
  ["tiger", 112, 96, 11, "34b2d6e7-b963-4421-9c81-505fb6334328",
    "fierce orange jungle tiger crouching ready to pounce, facing the viewer at three-quarter angle, black stripes, glowing amber eyes, warm night firelight, isolated sprite on plain background"],
  ["rats", 112, 80, 11, "d66cb5c9-79dd-4fd3-978e-ebe189e5d9a9",
    "pack of three scruffy grey jungle rats huddled together, one standing on hind legs sniffing, long pink tails, beady red eyes, warm night firelight, isolated sprite on plain background"],
  ["snake", 96, 96, 11, "bbf6cee1-b871-4eac-b999-598db9c2049f",
    "large green jungle python coiled up with its head raised high, mouth open showing fangs, forked tongue, yellow diamond pattern scales, warm night firelight, isolated sprite on plain background"],
  ["crocodile", 160, 64, 11, "a1bb18f7-306e-40f9-bb45-e7311ac07aaf",
    "big dark green crocodile lying low with its long toothy jaws open, side view facing right, bumpy scaled back and tail, yellow eyes, warm night firelight, isolated sprite on plain background"],
  ["capybara", 96, 80, 11, "0732ce68-8fbc-4f69-a3c1-fca3afea0e37",
    "calm round brown capybara sitting peacefully facing the viewer, eyes half closed, a small orange on its head, friendly and serene, warm night firelight, isolated sprite on plain background"],
  ["beaver", 96, 96, 23, "40c8d861-60b3-4d09-816b-573433b64602",
    "busy brown beaver standing on its hind legs hugging a gnawed wooden log, big orange front teeth, flat paddle tail, small dam of sticks at its feet, warm night firelight, isolated sprite on plain background"],
  ["tornado", 96, 112, 11, "4ae9d920-f4b4-48dd-b644-7b7b3a4c294b",
    "swirling grey tornado funnel twister with leaves and twigs caught in it, wide at the top narrow at the bottom, isolated sprite on plain background"],
  ["earthquake", 128, 80, 11, "89d8d851-456f-4a65-b8d8-eff9413270ee",
    "earthquake: a jagged glowing crack splitting brown rocky ground with tumbling boulders and dust clouds, isolated sprite on plain background"],
  ["wildfire", 144, 96, 31, "ce6cb5a7-061c-4e15-85d2-9cc620387cbc",
    "wildfire spreading through jungle: several burning palm trees and bushes in a row with tall wild orange flames and thick black smoke billowing up, no campfire, no logs, isolated sprite on plain background"],
  ["meteor", 112, 112, 11, "9fa8e4f0-e50b-4aae-9ade-bfb8602d800f",
    "meteor shower: three flaming meteors streaking diagonally downward with long fiery orange tails, rocky glowing cores, isolated sprite on plain background"],
  ["blood-moon", 96, 96, 11, "258ae4a8-3c50-45a8-8f3e-429c3ba2ec21",
    "blood moon: a huge glowing deep red full moon with dark craters and a faint crimson halo, wisps of dark cloud across its lower edge, isolated sprite on plain background"],
  ["locusts", 128, 96, 47, "722a08b6-c27f-4157-9956-b3bba44d4b1e",
    "five large flying grasshoppers in a loose group, each clearly drawn with long jumping hind legs, antennae and spread brown wings, yellow-green bodies, isolated sprite on plain background", { detail: "highly detailed" }],
  ["monsoon", 112, 112, 11, "238c1702-3cc9-41f2-9f20-b39d7712f660",
    "monsoon: a dark heavy storm cloud pouring sheets of blue rain into a rising swirling river wave below, isolated sprite on plain background"],
];
const bossSpec = ([, width, height, seed, job, description, extra = {}]) => ({
  tool: "create_image_pixflux",
  params: {
    description,
    width,
    height,
    view: "side",
    outline: "single color black outline",
    shading: "medium shading",
    ...extra,
    no_background: true,
    seed,
  },
  job,
  scale: 1,
  note: "natively transparent; fetched with `fetch-art.mjs boss-<id> bosses/<id>.png https://api.pixellab.ai/mcp/images/<job>/download 1`",
});

/** Each location's backdrop, fetched at scale 2 to locations/bg-<id>.png.
 * The Jungle keeps bg-jungle-night. */
const LOCATIONS = {
  "bg-desert": { ...backdrop(
    "side view backdrop of a sandy desert oasis edge at night: rolling dunes, a few dry palms and cacti framing the left and right edges, starry blue-black sky with a moon, calm flat sand filling the centre and bottom with no objects, no people, no text",
  ), job: "6f464938-55b5-4151-876b-c61c5a8e2de7" },
  "bg-cave": { ...backdrop(
    "side view backdrop inside a dark cave: rocky walls and hanging stalactites framing the left, right and top edges, faint blue glowing crystals, a little torchlight, calm dark stone floor filling the centre and bottom with no objects, no people, no text",
  ), job: "3a152b2f-422a-48cc-a8f1-8d693cefbf17" },
  "bg-magma": { ...backdrop(
    "side view backdrop of a volcanic magma pool at night: black basalt rocks framing the left and right edges, glowing orange lava streams and a bubbling lava pool in the distance, red smoky sky, calm dark rock ground filling the centre and bottom with no objects, no people, no text",
  ), job: "9a18e06a-b38a-40ee-9275-ac77eabc561a" },
  "bg-clifftop": { ...backdrop(
    "side view backdrop of a windswept jungle clifftop at night: a sheer rocky cliff edge on the right dropping to a misty valley of treetops far below, a few bent trees on the left edge, wide open starry sky with clouds, calm grassy rock ground filling the centre and bottom with no objects, no people, no text",
  ), job: "38114b84-10e1-4843-9739-0af6a04b5b72" },
  "bg-clearing": { ...backdrop(
    "side view backdrop of an open grassy jungle clearing at night: short soft grass and wildflowers, distant tree line along the horizon, large open starry sky with a bright moon, fireflies, calm flat grass filling the centre and bottom with no objects, no people, no text",
  ), job: "6583aa14-7a93-431d-ba61-9dbbdbfb372f" },
  "bg-temple": { ...backdrop(
    "side view backdrop inside an ancient jungle temple chamber at night: carved stone pillars and vine-covered walls framing the left and right edges, glowing golden sun glyphs carved above, flickering torches, a stone floor of square pressure plate tiles filling the centre and bottom with no objects, no people, no text",
  ), job: "82638f20-7863-4ed8-b98a-6312500ccbaa" },
};

/** Each location's card table, rising from the foot of the camp scene:
 * [location, job, description]. The Jungle's stump is the style source;
 * four tables are img2img from it at strength 80. Fetched at scale 2 to
 * tables/table-<id>.png. */
const STUMP_JOB = "0fad0915-6d5e-4bb4-8ed4-981f2088ef60";
const TABLES = [
  ["jungle", STUMP_JOB, "giant ancient jungle tree stump used as a card table, seen from slightly above, a wide flat sawn top with growth rings at the top of the image, thick gnarled bark trunk widening downward and running straight off the bottom edge of the image, moss and small glowing orange mushrooms on the bark, isolated object on plain background"],
  ["clifftop", "1ae665ad-6254-43fb-bd81-c36f8f876706", "a wide flat grey granite stone slab card table on a clifftop, seen from slightly above, wide weathered flat top with cracks and lichen, thick rough rock body running straight down off the bottom edge of the image, isolated object on plain background", true],
  ["magma", "f296d351-6b7d-47e8-9139-68c655c414ce", "a wide black basalt pillar card table beside lava, seen from slightly above, wide flat dark hexagonal stone top with faint glowing orange cracks, columnar basalt body running straight down off the bottom edge of the image, isolated object on plain background", true],
  ["clearing", "fc425eca-f3f2-4300-8654-e0d2ffc1f62d", "a wide oval patch of bare packed brown dirt on grassy ground used as a card table, seen from above, flat smooth dirt in the middle with a few pebbles and twigs, short grass tufts ringing the edges, the patch continuing off the bottom edge of the image, isolated on plain background", false, { outline: "lineless" }],
  ["desert", "d9e28a67-d009-46a1-b31d-8815c33c4226", "a wide flat-topped orange sandstone rock card table in the desert, seen from slightly above, wide smooth wind-worn flat top, layered striped sandstone body running straight down off the bottom edge of the image, a little sand drifted at its base, isolated object on plain background", true],
  ["cave", "01744ed0-7587-48c1-99aa-557d34785f71", "a huge flat dark blue-grey boulder card table inside a cave, seen from slightly above, wide flat damp top with a few tiny glowing blue crystals, rounded rough rock body running straight down off the bottom edge of the image, isolated object on plain background", true],
  ["temple", "b689e96c-271a-47e0-bec9-865679ef1692", "ancient carved stone temple altar used as a card table, seen from slightly above, a wide flat grey stone top with a carved golden sun emblem border at the top of the image, carved glyph panels and vines on the sides widening downward and running straight off the bottom edge of the image, isolated object on plain background"],
];
const tableSpec = ([, job, description, fromStump = false, extra = {}]) => ({
  tool: "create_image_pixflux",
  params: {
    description,
    ...(fromStump ? { init_image_url: `https://api.pixellab.ai/mcp/images/${STUMP_JOB}/download`, init_image_strength: 80 } : { width: 208, height: 112 }),
    view: "high top-down",
    outline: "single color black outline",
    shading: "detailed shading",
    ...extra,
    no_background: true,
    seed: 5,
  },
  job,
  scale: 2,
  note: fromStump ? "208x112 like its init image; natively transparent" : "natively transparent",
});

/** The HUD coin and the glove cursors: one 1-direction object with seven
 * item descriptions; `batch_index` is the frame used. Cursors are fetched
 * at scale 2 (32x32), the coin at scale 1. */
const UI_BATCH = {
  tool: "create_1_direction_object",
  params: {
    name: "hud coin and glove cursors",
    description: "jungle expedition UI icon, warm palette, single-pixel dark outline, simple shading, transparent background",
    view: "sidescroller",
    size: 16,
  },
  object_id: "3c480778-3727-4448-ab5d-4a84ba869bc8",
};
const UI_ICONS = [
  ["coin", "shiny round gold coin seen face on, a raised rim and a bold vertical line stamped down the middle, bright highlights", 0, 1],
  ["cursor-pointer", "tan leather explorer glove with the index finger pointing up and to the left, mouse cursor", 2, 2],
  ["cursor-grab", "tan leather explorer glove open palm facing the viewer, fingers spread, mouse cursor", 3, 2],
  ["cursor-grabbing", "tan leather explorer glove clenched into a grabbing fist, mouse cursor", 5, 2],
  ["cursor-not-allowed", "tan leather explorer glove with a small red no-entry circle beside it, mouse cursor", 6, 2],
  ["cursor-default", "tan leather explorer glove pointing up and to the left, plain arrow-like silhouette, mouse cursor", 7, 2],
];

const specs = {
  "bg-jungle-night": backdrop(
    "side view backdrop of a dense jungle clearing at night: canopy silhouettes and hanging vines framing the left, right and top edges, a few stars and a thin moon in a blue-black sky, calm dark mossy ground filling the centre and bottom with no objects. Night jungle, deep greens, blue-black sky, moss browns, no people, no text",
  ),
  "bg-fireside": backdrop(
    "side view of a quiet jungle clearing at night around a central campfire glow, fallen logs to sit on, packs and bedrolls resting nearby, dark canopy framing the top edge, warm orange firelight on the ground, deep greens and blue-black sky, no people, no text",
  ),
  "bg-temple-dawn": backdrop(
    "full-bleed scene filling the entire frame edge to edge: an ancient overgrown stone jungle temple rising from the jungle at dawn, golden sunrise light breaking through the canopy, vines on the stone steps, triumphant warm mood, no borders, no black bars, no people, no text",
  ),
  "bg-trail-dusk": backdrop(
    "an abandoned jungle campsite at dusk, a cold empty fire pit and a fallen tent, the trail fading into dark trees, purple and deep blue dusk sky, wistful mood, no people, no text",
  ),
  // The home page tile, the start page and the room lobby (HTML, outside
  // the sprite folder). Made in the PixelLab Creator; the description is
  // the start of each prompt as the gallery listing shows it.
  "title-trail": {
    tool: "create_image_pixflux",
    params: { description: "side view title backdrop of a jungle exp…", width: 320, height: 180 },
    scale: 2,
    gallery: "8af56d45-9cbe-58a7-9394-0945aa5643b6",
    file: "title/bg-title-trail.png",
  },
  "title-basecamp": {
    tool: "create_image_pixflux",
    params: { description: "side view backdrop of an expedition base…", width: 320, height: 180 },
    scale: 2,
    gallery: "d64fe364-5449-5ec3-bdd8-eef4c31dce69",
    file: "title/bg-basecamp.png",
  },
  // The scene-transition sign. A raw-image job; `job` fetches it again.
  signboard: {
    tool: "create_image_pixflux",
    params: {
      description:
        "blank rectangular wooden signboard made of horizontal weathered planks with a dark carved border and iron corner brackets, two iron chains rising straight up from the top left and top right corners to the top edge of the image, front view, empty plank face with no text, isolated sprite on plain background",
      width: 192,
      height: 128,
    },
    job: "47469044-62b1-4704-90c8-2ec737aa770e",
    scale: 1,
    note: "natively transparent; used as downloaded",
  },
  // The item bar's backpack button and the inventory window's leather. Raw
  // image jobs; `job` fetches each again.
  "backpack-icon": {
    tool: "create_image_pixflux",
    params: {
      description:
        "small brown leather explorer backpack icon with a buckled flap and a rolled bedroll on top, front view, game inventory icon, isolated sprite on plain background",
      width: 32,
      height: 32,
    },
    job: "bece17b3-f8b8-4ed6-a17b-bf1578860dc0",
    scale: 1,
    note: "natively transparent; used as downloaded",
  },
  "leather-panel": {
    tool: "create_image_pixflux",
    params: {
      description:
        "flat rectangular panel of worn tan and chocolate brown saddle leather, the inside of an old explorer's backpack, stitched border seam around the edge, brass rivets in the corners, subtle scuffs and grain, evenly lit, no objects, no text, fills the whole image",
      width: 256,
      height: 192,
    },
    job: "0144adcc-1fa2-473e-9513-2a990e753833",
    scale: 1,
    note: "the off-white backdrop round its edge keyed out (fetch-art --matte); drawn at 1x as the inventory window, its slot patches drawn over it in code",
  },
  "trail-map": {
    tool: "create_image_pixflux",
    params: {
      description:
        "a long horizontal strip of aged tan parchment paper, slightly darker worn edges, filled edge to edge with parchment texture, a faint winding dotted trail line across the middle from left to right, no figures, no people, no silhouettes, no text, no white areas",
      width: 284,
      height: 32,
      outline: "lineless",
      shading: "flat shading",
      no_background: false,
      text_guidance_scale: 10,
    },
    scale: 2,
  },
  "mascot-panda": mascotStrip("idle", "idle: gentle breathing, tail swishing slowly, a slow blink"),
  "mascot-cheer": mascotStrip("cheer", "cheer: hops up happily with both paws raised in the air, then lands"),
  "mascot-flop": mascotStrip("flop", "flop: sighs and flops over sadly onto its back, paws up"),
  ...Object.fromEntries(
    ICONS.map(([id, item], i) => [id, { ...ICON_BATCH, item_description: item, batch_index: FIRST_ICON_FRAME + i, scale: 1 }]),
  ),
  ...Object.fromEntries(SOURCE_ICONS.map(([id, item, frame]) => [`source-${id}`, { ...SOURCE_BATCH, item_description: item, batch_index: frame, scale: 1 }])),
  ...Object.fromEntries(NINE_ICONS.map(([id, item, frame]) => [`source-${id}`, { ...NINE_BATCH, item_description: item, batch_index: frame, scale: 1 }])),
  "source-magician": MAGICIAN_ICON,
  ...LOCATIONS,
  ...Object.fromEntries(TABLES.map((table) => [`table-${table[0]}`, tableSpec(table)])),
  ...Object.fromEntries(UI_ICONS.map(([id, item, frame, scale]) => [id, { ...UI_BATCH, item_description: item, batch_index: frame, scale }])),
  ...Object.fromEntries(BOSSES.map((boss) => [`boss-${boss[0]}`, bossSpec(boss)])),
  ...Object.fromEntries(CREW.map(([id, description, seed, job]) => [`crew-${id}`, crewSpec(description, seed, job, "alpha thresholded and grey halos stripped locally; drawn bottom-centred on a 64x80 canvas")])),
  ...Object.fromEntries(NINE_CREW.map(([id, description, seed, job]) => [`crew-${id}`, crewSpec(description, seed, job, "natively transparent; used as downloaded")])),
  "icon-tricks": {
    tool: "hand-drawn",
    script: "apps/web/art/expedition/draw-icon-tricks.mjs",
    note: "neither the batch candidate nor a 64-candidate retry read as a card stack",
  },
  "marker-animal": {
    tool: "hand-drawn",
    script: "apps/web/art/expedition/draw-marker-animal.mjs",
    note: "a paw print in the markers' outline and size, telling an animal boss camp from the disaster's storm cloud",
  },
};

for (const file of fs.readdirSync(dir)) {
  if (file.endsWith(".json") && !(file.slice(0, -5) in specs)) fs.rmSync(new URL(file, dir));
}
for (const [id, spec] of Object.entries(specs)) {
  fs.writeFileSync(new URL(`${id}.json`, dir), JSON.stringify({ id, ...spec }, null, 2) + "\n");
}
console.log(`${Object.keys(specs).length} prompt specs written`);
