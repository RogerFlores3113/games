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
  ["lantern", "hanging brass oil lantern glowing warm"],
];

/** The second icon batch: one per character base power, upgrade and item,
 * in catalogue order. `frame` is the batch candidate chosen by eye. */
const SOURCE_BATCH = {
  ...ICON_BATCH,
  params: { description: ICON_BATCH.params.description, size: 16, view: "sidescroller" },
  object_id: "540589d3-84e0-49f2-80e5-4fc599074fd9",
};

const SOURCE_ICONS = [
  ["scout", "brass spyglass, diagonal"],
  ["guide", "machete blade"],
  ["botanist", "green vial with a leaf"],
  ["medic", "rolled white bandage"],
  ["signaller", "hourglass drum"],
  ["cartographer", "pencil over a card"],
  ["scout.keen-eye", "eye with a gold glint"],
  ["scout.eavesdrop", "cupped ear with a sound arc"],
  ["guide.pathfinder", "two boot prints"],
  ["guide.howler-call", "howler monkey head, mouth open"],
  ["botanist.greenhouse", "glass dome over a sprout"],
  ["botanist.antidote", "stoppered blue bottle"],
  ["medic.rally", "raised hand holding a card"],
  ["medic.field-kit", "small crate with a green leaf"],
  ["signaller.loud-call", "conch shell"],
  ["signaller.call-and-response", "two speech arcs facing each other"],
  ["cartographer.detour", "bent arrow"],
  ["cartographer.landmark", "flag on a stone cairn"],
  ["trained-monkey", "small monkey holding a card"],
  ["pack-mule", "mule head with a pack"],
  ["parrot", "red parrot in profile"],
  ["trail-map", "folded map with a dotted path"],
  ["rain-poncho", "yellow poncho"],
  ["smoke-signal", "smoke puffs over a fire"],
  ["whetstone", "grey stone with a spark"],
  ["puffball", "puffball mushroom with spores"],
  ["bait", "banana on a string"],
  ["camouflage", "leafy cloak"],
  ["rope-ladder", "rope ladder"],
  ["heavy-pack", "bulging backpack"],
  ["mosquito-net", "net with a mosquito"],
];
const SOURCE_FRAMES = [0, 43, 2, 44, 4, 5, 6, 7, 62, 40, ...Array.from({ length: 21 }, (_, i) => 10 + i)];

/** Seated silhouettes behind the stump, one per character. */
const CREW = [
  ["scout", "spyglass raised to one eye", 7, "096975a2"],
  ["guide", "machete held high", 7, "c606e1d6"],
  ["botanist", "wide straw hat with a flower", 7, "7c44a336"],
  ["medic", "shoulder satchel with a rolled bandage", 11, "23711889"],
  ["signaller", "talking drum slung at the hip", 11, "e2526109"],
  ["cartographer", "map tube across the back", 11, "b5819dd6"],
];
const crewSpec = (prop, seed, job) => ({
  tool: "create_image_pixflux",
  params: {
    width: 64,
    height: 80,
    view: "side",
    outline: "lineless",
    shading: "basic shading",
    no_background: true,
    seed,
  },
  prop,
  job,
  scale: 1,
  note: "the full description text was not recorded; each asked for a seated dark explorer silhouette carrying `prop`. Alpha thresholded and grey halos stripped locally; drawn bottom-centred",
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
  "stump-table": {
    tool: "create_image_pixflux",
    params: {
      width: 384,
      height: 176,
      view: "high top-down",
      no_background: true,
    },
    job: "a030638f-1d4e-4aaf-b2d2-8c4cf2d4bcde",
    scale: 1,
    note: "the description text was not recorded (a tree-stump table with roots and glowing mushrooms). Keyed offline with `fetch-art.mjs ... --matte`; the flat top spans x 78..322, y 12..85",
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
  "backpack-open": {
    tool: "create_image_pixflux",
    params: {
      description:
        "an open explorer's canvas backpack filling the whole frame, seen from above, flap pulled back revealing large empty compartments inside, brown leather straps and brass buckles, isolated on transparent background, no text",
      width: 96,
      height: 64,
      view: "high top-down",
      outline: "single color outline",
      shading: "medium shading",
      no_background: true,
      text_guidance_scale: 10,
    },
    scale: 1,
  },
  campfire: {
    tool: "create_1_direction_object",
    params: {
      name: "campfire",
      description:
        "small crackling campfire on a ring of grey stones with crossed logs, bright orange and gold flames, warm night palette, single-pixel dark outline, transparent background",
      size: 32,
      view: "sidescroller",
    },
    frames_used: [56, 57, 59, 60],
    note: "four candidates from the one set, played as a flicker strip",
    scale: 1,
  },
  "mascot-panda": mascotStrip("idle", "idle: gentle breathing, tail swishing slowly, a slow blink"),
  "mascot-cheer": mascotStrip("cheer", "cheer: hops up happily with both paws raised in the air, then lands"),
  "mascot-flop": mascotStrip("flop", "flop: sighs and flops over sadly onto its back, paws up"),
  ...Object.fromEntries(
    ICONS.map(([id, item], i) => [id, { ...ICON_BATCH, item_description: item, batch_index: FIRST_ICON_FRAME + i, scale: 1 }]),
  ),
  ...Object.fromEntries(
    SOURCE_ICONS.map(([id, item], i) => [`source-${id}`, { ...SOURCE_BATCH, item_description: item, batch_index: SOURCE_FRAMES[i], scale: 1 }]),
  ),
  ...Object.fromEntries(CREW.map(([id, prop, seed, job]) => [`crew-${id}`, crewSpec(prop, seed, job)])),
  "icon-tricks": {
    tool: "hand-drawn",
    script: "apps/web/art/expedition/draw-icon-tricks.mjs",
    note: "neither the batch candidate nor a 64-candidate retry read as a card stack",
  },
};

for (const file of fs.readdirSync(dir)) {
  if (file.endsWith(".json") && !(file.slice(0, -5) in specs)) fs.rmSync(new URL(file, dir));
}
for (const [id, spec] of Object.entries(specs)) {
  fs.writeFileSync(new URL(`${id}.json`, dir), JSON.stringify({ id, ...spec }, null, 2) + "\n");
}
console.log(`${Object.keys(specs).length} prompt specs written`);
