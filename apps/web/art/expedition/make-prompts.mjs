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

/** Batch order: `batch_index` is the frame each icon was taken from. */
const ICONS = [
  ["gear-chatter", "brass signal whistle on a cord"],
  ["gear-peek", "brass collapsible spyglass"],
  ["gear-broadcast", "red signal flare stick with a spark at the tip"],
  ["gear-ghost", "folded green and brown camouflage net"],
  ["gear-reroll", "old brass compass with open lid"],
  ["gear-pickpocket", "small brown capuchin monkey"],
  ["gear-commandeer", "jungle machete with wooden handle"],
  ["gear-jam", "folded yellow rain poncho"],
  ["gear-reassign", "rolled parchment map with red dotted path"],
  ["gear-overclock", "corked glass bottle of glowing green tonic"],
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
      description:
        "a huge oval tree-stump tabletop seen from above at a low angle, flat wide oval top showing visible concentric growth rings in warm brown wood, mossy bark rim around the edge, isolated on transparent background, no people, no text",
      width: 368,
      height: 128,
      view: "high top-down",
      outline: "single color outline",
      shading: "medium shading",
      no_background: true,
    },
    scale: 1,
    note: "came back on a flat grey backdrop despite no_background; ArtDef.matte keys it out at load",
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
    ICONS.map(([id, item], batch_index) => [id, { ...ICON_BATCH, item_description: item, batch_index, scale: 1 }]),
  ),
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
