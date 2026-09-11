# QA checklist for generated cards

Score every candidate 0–2 per criterion (0 = fail, 1 = acceptable, 2 = good). A candidate passes only with no zeros. Write results into `out/<collection>/<set>/qa.json` (created by `scripts/qa-template.mjs`).

| Criterion | 2 | 1 | 0 |
|---|---|---|---|
| `centered` | hero object centered, fills ~60–75 % of height, nothing cut | slightly off-center or small/large | cut off, tiny, or off to a side |
| `category_match` | placement and background exactly follow the card's category (see `styleguide/categories.md`) | minor deviation (e.g. cat 1 with a faint floor shadow) | wrong category (cat 1 object standing on a table, cat 4 with a flat background) |
| `style_match` | toy-like 3D cartoon, chunky shapes, candy colors, soft light like the references | mostly right, slightly too realistic or too flat | photoreal, painterly, dark, or 2D flat vector |
| `no_text_or_artifacts` | no text, logos, frames, extra objects, deformed geometry | tiny artifact that could be retouched | visible text/logo, extra objects, broken shapes |
| `readability` | instantly recognizable at 150 px thumbnail | recognizable with a second look | unclear what the object is |
| `character_match` (gold only) | characters identical to references: proportions, colors, face, outfit style; emotion reads clearly | small drift (different shirt, missing glasses) | different character, more than 2 characters, unreadable emotion |

Set-level checks (after picking variants):

- Background hues vary across the 10 cards; no two neighbours share a hue.
- Not more than 3 cards with the same pattern type.
- All four object categories are present.
- Producer notes are respected.

Notes field: write one short sentence on what to fix if the card is regenerated (this becomes the extra instruction for the retry).
