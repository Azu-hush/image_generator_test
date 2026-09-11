# Visual style guide — collectible card art

Derived from 160 cards of the "Summer" collection (see `data/cards.csv`) and the category rules board.

## Rendering style

- Stylized 3D cartoon render, mobile casual-game look ("toy" aesthetic).
- Soft rounded shapes, chunky simplified proportions, no thin fragile parts.
- Clean smooth surfaces: matte plastic, soft rubber, polished wood, glossy glass. Light bevels on edges.
- Bright saturated candy palette. Every card has one dominant background hue that contrasts with the object.
- Soft studio lighting from the upper left, gentle ambient occlusion, soft contact shadow under the object.
- Crisp readable silhouette at thumbnail size (cards are shown ~150 px wide in the game).
- Slight 3/4 view from a little above eye level for most objects; front view for flat objects (clock, fan, window).

## Composition

- One hero object, centered, filling 60–75 % of the frame height. Nothing cut off.
- Vertical portrait, final card image is 430 × 480 px (≈ 9:10). Generate at 4:5 and crop, or at 1:1 and crop the sides.
- No text, letters, numbers, logos, brands, watermarks, frames, borders or UI. Symbols are OK only as icons (anchor, house, fork-and-knife, pi pattern).
- No small clutter: a maximum of 2–3 secondary props, all large and simple.

## Backgrounds (by category)

| Cat | Object placement | Background |
|---|---|---|
| 1 | floating in the air, no ground | flat color + simple pattern: radial light rays, concentric circles, vertical stripes, wavy lines, repeating simple icon, cloud sky |
| 2 | standing on a plain flat floor | plain vertical backdrop, single color gradient or simple pattern, floor same hue as backdrop |
| 3 | standing on / built into a realistic simple surface (wooden table, deck, stone floor, grass, asphalt, tiles, brick wall) | plain vertical backdrop: gradient, rays, stripes, wallpaper, curtain, brick |
| 4 | placed in a realistic simplified environment, still central | soft low-detail environment: park, backyard, room with window, sky with clouds, road, seaside |
| 5 (gold) | 1–2 characters acting a simple ironic scene, centered, large | category-4 environment that supports the joke |

Every set mixes all four object categories regardless of rarity. Typical split for 10 cards: 3 × cat 1, 2 × cat 2, 3 × cat 3, 1–2 × cat 4, plus gold cards as required.

## Set harmony

- Background hues across the 10 cards should vary: no two neighbouring cards with the same dominant hue.
- Patterns should vary too (not three ray backgrounds in a row).
- Objects are iconic and instantly readable for the set theme; avoid near duplicates (e.g. two kinds of drinks).
- Names are 1–2 English words, title case.

## Characters (gold cards)

See `characters.md`. Characters keep their exact design across all cards. Maximum 2 characters per card.
Scenes are short, ironic, emotionally exaggerated, understandable without text: "cow on a jet ski yelling into a walkie-talkie", "pig struggles to load one more bag onto an overloaded van".
