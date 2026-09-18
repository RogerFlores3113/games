# Background image credits

## city-night.webp

Superseded by `city-fireworks.webp` (06.2 UAT gap 9 — the owner asked for a city-on-the-water-
with-fireworks image instead of a plain city-at-night skyline). This record is kept for
historical reference; the file itself is deleted from `public/backgrounds/` once `globals.css`
no longer references it.

Source URL: https://commons.wikimedia.org/wiki/File:DFC_4635_Pattaya_lights_sparkle_under_a_clear_night_sky_-_the_city_glowing_with_life_from_street_level_to_skyline.jpg
Author: PattayaPatrol
Author URL: https://www.flickr.com/people/PattayaPatrol/
License: CC BY-SA 4.0 (Creative Commons Attribution-ShareAlike 4.0 International)
License URL: https://creativecommons.org/licenses/by-sa/4.0/
License grant (quoted): "Share — copy and redistribute the material in any medium or format for any purpose, even commercially." (from the license deed's "You are free to:" section; the deed's "Under the following terms:" section additionally requires attribution and ShareAlike, both honored by this credit file)
Retrieved: 2026-09-17
Modifications: resized to 1920px wide, re-encoded as WebP

Verified via the Wikimedia Commons API (`action=query&prop=imageinfo&iiprop=extmetadata`) against
https://commons.wikimedia.org/wiki/File:DFC_4635_Pattaya_lights_sparkle_under_a_clear_night_sky_-_the_city_glowing_with_life_from_street_level_to_skyline.jpg,
which returned `LicenseShortName: CC BY-SA 4.0`, `AttributionRequired: true`, and `Artist` linking to the Flickr
profile above. Original photo depicts Pattaya, Thailand at night from an elevated viewpoint — dark sky, no
readable text, no identifiable people.

## wood-board.webp

Source URL: https://commons.wikimedia.org/wiki/File:Oberfl%C3%A4che_Wohnzimmertisch.JPG
Author: Martin Lorenz (Wikimedia Commons username Rosenmulde)
Author URL: https://commons.wikimedia.org/wiki/User:Rosenmulde
License: CC BY-SA 3.0 (Creative Commons Attribution-ShareAlike 3.0 Unported)
License URL: https://creativecommons.org/licenses/by-sa/3.0/
License grant (quoted): "Share — copy and redistribute the material in any medium or format for any purpose, even commercially." (from the license deed's "You are free to:" section; the deed's "Under the following terms:" section additionally requires attribution and ShareAlike, both honored by this credit file)
Retrieved: 2026-09-17
Modifications: resized to 1920px wide, re-encoded as WebP quality 80 (118,082 bytes)

Verified via the Wikimedia Commons API (`action=query&prop=imageinfo&iiprop=extmetadata`) against
https://commons.wikimedia.org/wiki/File:Oberfl%C3%A4che_Wohnzimmertisch.JPG ("surface of a living-room
table" — German title), which returned `LicenseShortName: CC BY-SA 3.0`, `LicenseUrl:
https://creativecommons.org/licenses/by-sa/3.0`, and `Artist` linking to user Rosenmulde (Martin Lorenz).
Original photo (5184x3456) is a top-down close-up of a walnut-toned wooden table surface: even plank grain,
warm dark-brown colour, no objects, no text, no people — reads as a real board-game-table surface rather
than a generated texture, which is the owner's explicit requirement (06.2 UAT gap 2).

## city-fireworks.webp

Source URL: https://commons.wikimedia.org/wiki/File:Hong_Kong_firework_show.jpg
Author: Dennis Wong
Author URL: https://www.flickr.com/people/hk_traveler/
License: CC BY 2.0 (Creative Commons Attribution 2.0 Generic)
License URL: https://creativecommons.org/licenses/by/2.0/
License grant (quoted): "Share — copy and redistribute the material in any medium or format for any purpose, even commercially." (from the license deed's "You are free to:" section; the deed's "Under the following terms:" section additionally requires attribution, honored by this credit file)
Retrieved: 2026-09-17
Modifications: fetched via Wikimedia's own 1920px-wide thumbnail rendition (the upload.wikimedia.org
original-file endpoint was rate-limiting this session's IP; the pre-rendered 1920px thumbnail is served
from the same Commons infrastructure and covered by the same file's licence), re-encoded as WebP quality 80
(239,162 bytes)

Verified via the Wikimedia Commons API (`action=query&prop=imageinfo&iiprop=extmetadata`) against
https://commons.wikimedia.org/wiki/File:Hong_Kong_firework_show.jpg, which returned `LicenseShortName: CC
BY 2.0`, `LicenseUrl: https://creativecommons.org/licenses/by/2.0`, and `Artist: Dennis Wong`. Original
photo is a wide night shot of Victoria Harbour, Hong Kong: a lit waterfront skyline with the harbour visible
in the foreground and a large multi-burst fireworks display over the water — exactly "a city on the water,
with fireworks going off in the background" per the owner's literal wording (06.2 UAT gap 9). A few distant
illuminated building signs (e.g. "AXA", "CCBI") are legible at full resolution as an unavoidable feature of
a real skyline photograph; there is no overlaid caption, watermark, or date burned into the image, and no
identifiable people.

## wood-tile.webp

- Source: supplied directly by the project owner (pasted into the build session on 2026-09-17)
- Author: unknown — **provenance not verified**
- License: unknown — the owner directed its use and takes responsibility for the rights
- Retrieved: 2026-09-17
- Modifications: re-encoded from PNG (800x600) to WebP quality 85
- Purpose: dark walnut grain tiled across the board surface, replacing the CSS-generated texture the owner rejected and the lighter walnut photo in wood-board.webp
- Note: if this repository is ever made public, replace this with a file whose license is recorded, or have the owner supply the source and license so this entry can be completed.
