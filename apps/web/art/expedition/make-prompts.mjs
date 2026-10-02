import fs from "node:fs";

const STYLE =
  "pixel art, night jungle expedition, warm campfire light, limited palette of deep greens, blue-black sky, firelight orange and gold, moss and bark browns, single-pixel dark outline, simple shading, no dithering noise, no people, no text, no watermark";

const assets = [
  ["bg-jungle-night", "create_image_pixflux", 640, 360, "side view backdrop of a dense jungle clearing at night: canopy silhouettes and hanging vines framing the edges, a few stars and a thin moon in a blue-black sky, calm dark mossy ground in the centre with room for a table"],
  ["stump-table", "create_map_object", 368, 128, "a huge oval tree-stump tabletop seen from above at a low angle, visible growth rings, mossy bark rim, transparent background"],
  ["campfire", "create_map_object", 32, 32, "a small crackling campfire on a ring of stones, bright orange and gold flames, transparent background", { frames: 4, animate: "flames flicker" }],
  ["lantern", "create_map_object", 16, 32, "a hanging brass oil lantern on a short rope, warm glow, transparent background"],
  ["firefly", "create_map_object", 4, 4, "a single glowing yellow-green firefly dot, transparent background", { frames: 2, animate: "blink" }],
  ["mascot-panda", "create_character", 32, 32, "a cute red panda camp mascot sitting, bushy striped tail, side view, transparent background", { frames: 4, animate: "idle" }],
  ["mascot-cheer", "animate_character", 32, 32, "the red panda mascot hopping and cheering with paws up", { frames: 4, from: "mascot-panda" }],
  ["mascot-flop", "animate_character", 32, 32, "the red panda mascot flopping over sadly onto its back", { frames: 4, from: "mascot-panda" }],
  ["crate", "create_map_object", 12, 10, "a small wooden supply crate with rope ties, transparent background"],
  ["seat-pack", "create_map_object", 24, 24, "an explorer's canvas backpack with a rolled bedroll strapped on top, transparent background"],
  ["leader-sun", "create_map_object", 10, 10, "a tiny golden sun emblem, transparent background"],
  ["icon-whisper", "create_map_object", 12, 12, "a green leaf with a small curling speech swirl, icon, transparent background"],
  ["icon-tricks", "create_map_object", 10, 10, "a small neat stack of playing cards seen from the side, icon, transparent background"],
  ["gear-chatter", "create_map_object", 16, 16, "a brass signal whistle on a cord, icon, transparent background"],
  ["gear-peek", "create_map_object", 16, 16, "a brass collapsible spyglass, icon, transparent background"],
  ["gear-broadcast", "create_map_object", 16, 16, "a red signal flare stick with a spark at the tip, icon, transparent background"],
  ["gear-ghost", "create_map_object", 16, 16, "a folded green and brown camouflage net, icon, transparent background"],
  ["gear-reroll", "create_map_object", 16, 16, "an old brass compass with an open lid, icon, transparent background"],
  ["gear-pickpocket", "create_map_object", 16, 16, "a small mischievous capuchin monkey holding a card, icon, transparent background"],
  ["gear-commandeer", "create_map_object", 16, 16, "a jungle machete with a worn wooden handle, icon, transparent background"],
  ["gear-jam", "create_map_object", 16, 16, "a folded yellow rain poncho, icon, transparent background"],
  ["gear-reassign", "create_map_object", 16, 16, "a rolled parchment trail map with a red dotted path, icon, transparent background"],
  ["gear-overclock", "create_map_object", 16, 16, "a corked glass bottle of glowing green energy tonic, icon, transparent background"],
  ["bg-fireside", "create_image_pixflux", 640, 360, "side view of a quiet jungle clearing at night around a central campfire, fallen logs to sit on, packs and bedrolls resting nearby, canopy framing the top"],
  ["trail-map", "create_image_pixflux", 568, 64, "a long horizontal strip of aged parchment showing a winding dotted jungle trail from left to right ending at a small temple, with room for six camp markers along it"],
  ["marker-camp", "create_map_object", 16, 16, "a tiny tent marker for a map, icon, transparent background"],
  ["marker-cleared", "create_map_object", 16, 16, "a tiny tent with a small green flag planted beside it, map marker icon, transparent background"],
  ["marker-boss", "create_map_object", 16, 16, "a tiny dark storm cloud with a lightning bolt, map marker icon, transparent background"],
  ["temple", "create_map_object", 16, 16, "a tiny overgrown stone jungle temple, map marker icon, transparent background"],
  ["crew-token", "create_map_object", 16, 16, "a tiny explorer's pith helmet seen from the front, map token icon, transparent background"],
  ["backpack-open", "create_map_object", 96, 64, "an open explorer's backpack seen from above with empty compartments, transparent background"],
  ["bg-temple-dawn", "create_image_pixflux", 640, 360, "an ancient overgrown stone temple rising from the jungle at dawn, golden light breaking through the canopy, triumphant mood"],
  ["bg-trail-dusk", "create_image_pixflux", 640, 360, "an abandoned jungle campsite at dusk, a cold fire pit and a fallen tent, the trail fading into dark trees, wistful mood"],
];

for (const [id, tool, w, h, description, extra = {}] of assets) {
  const spec = { id, tool, size: { w, h }, description, style: STYLE, ...extra };
  fs.writeFileSync(new URL(`./prompts/${id}.json`, import.meta.url), JSON.stringify(spec, null, 2) + "\n");
}
console.log(`${assets.length} prompt specs written`);
