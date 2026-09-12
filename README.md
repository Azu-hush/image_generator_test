# card-art-generator

Turns a **set theme + producer notes** into **3–5 variants of a 10-card collectible set** for a mobile casual game.
Claude Code does the art direction, prompt writing and visual QA; an image API renders the pictures.
Two interchangeable backends: **Gemini** (`gemini-3.1-flash-image`) and **OpenAI** (`gpt-image-2.5-flare`), both with reference images.
Without an API key the whole pipeline runs in dry-run mode and produces copy-paste prompt packs instead of images.

Русская версия: [README.ru.md](README.ru.md). Work plan and log: [docs/PLAN.ru.md](docs/PLAN.ru.md). Miro board notes: [docs/MIRO.ru.md](docs/MIRO.ru.md).

```
theme + notes ──► planner (Claude, /card-set) ──► plan.json
plan.json     ──► prompt builder (templates by category 1-5 + refs)
              ──► backend: gemini.mjs (API)  |  manual.mjs (prompt pack)
candidates    ──► vision QA (Claude, qa/checklist.md) ──► qa.json
qa.json       ──► assemble.mjs ──► variants/variant_1..N + contact sheets
```

## Quick start

```bash
git clone https://github.com/Azu-hush/playrix_test.git card-art-generator && cd card-art-generator
npm run demo                 # validates the example plan, dry-runs the backend, writes a prompt pack
```

Then, to actually render images, pick a backend:

| Backend | Key | Guide | Command |
|---|---|---|---|
| Gemini | `GEMINI_API_KEY` (billing required, no free tier, ≈ $0.045/image) | [docs/gemini-api-key.ru.md](docs/gemini-api-key.ru.md) | `node backends/gemini.mjs --plan <plan>` |
| OpenAI | `OPENAI_API_KEY` (prepaid credits, ≈ $0.03–0.06/image) | [docs/openai-api-key.ru.md](docs/openai-api-key.ru.md) | `node backends/openai.mjs --plan <plan>` |

1. `setx GEMINI_API_KEY "..."` or `setx OPENAI_API_KEY "..."` (Windows) / `export ...`, restart the terminal.
2. `node backends/openai.mjs --plan examples/summer_fishing.plan.json` → 40 candidates in `out/summer/fishing/candidates/` (add `--candidates 2` for a cheaper first run).
3. `node scripts/qa-template.mjs --set out/summer/fishing` → score candidates in `qa.json` (Claude does it in the skill).
4. `node scripts/assemble.mjs --set out/summer/fishing --variants 3` → `out/summer/fishing/variants/index.html`.

Optional: `npm i sharp` to have variants cropped to the in-game card size 430 × 480.

## Using it as a Claude Code skill

Open the repo in Claude Code and type:

```
/card-set Summer "Fishing" "warm nostalgic mood, lots of turquoise, two gold cards, no dead fish"
```

The skill (`.claude/skills/card-set/SKILL.md`) plans the set, validates it, runs the backend, scores every candidate visually, assembles variants and reports. To use it in another project copy the `.claude/skills/card-set` folder (and this repo's `styleguide/`, `prompts/`, `data/`) there.

## Repository layout

| Path | What |
|---|---|
| `styleguide/` | visual style, category rules, character sheet |
| `prompts/` | prompt templates: base style, categories 1–5, negative, reference note, planner system prompt |
| `schema/set-plan.schema.json` | plan format (10 cards, categories, colors, refs) |
| `examples/` | `summer_coolness_remake` (benchmark vs. existing cards) and `summer_fishing` (new set, 2 gold) |
| `lib/` | plan validation, prompt builder, reference picker, shared backend runner |
| `backends/gemini.mjs` | Gemini `generateContent` image backend with reference images, retries, dry run |
| `backends/openai.mjs` | OpenAI `/v1/images/edits` backend (`gpt-image-2.5-flare`, refs as `image[]`, `input_fidelity: high` on gold cards) |
| `backends/manual.mjs` | prompt pack (MD + HTML with copy buttons) for manual generation |
| `scripts/` | `validate`, `qa-template`, `assemble` |
| `qa/checklist.md` | scoring rubric used by the vision QA step |
| `data/` | reference cards (`cards/`), catalog `cards.csv`, set list `sets.csv`, category example strips |
| `docs/` | API key guide, work plan, Miro board notes |

## Plan format (short)

```json
{ "collection": "Summer",
  "set": { "name": "Fishing", "theme": "...", "producer_notes": "...", "gold_count": 2 },
  "generation": { "candidates_per_card": 4, "variants": 3, "aspect_ratio": "4:5", "image_size": "1K", "model": "gemini-3.1-flash-image" },
  "cards": [ { "id": 1, "name": "Bobber", "category": 1, "object": "...", "bg_color": "turquoise", "bg_pattern": "radial light rays", "refs": ["data/cards/029_..."] },
             { "id": 9, "name": "Big Catch", "category": 5, "characters": ["man","pig"], "scene": "...", "environment": "...", "bg_color": "turquoise" } ] }
```

Categories: 1 floating object on a flat patterned background · 2 object on a plain floor · 3 object on a realistic surface with a plain backdrop · 4 object in a simplified environment · 5 gold story card with 1–2 characters.

## Cost

`gemini-3.1-flash-image` at 1K ≈ $0.045 per image; `gpt-image-2.5-flare` at medium quality ≈ $0.03–0.06. A set with 4 candidates per card ≈ $1.5–2.5; a 16-set collection with 3 variants ≈ $25–40. Neither API uses your prompts or images for training on paid usage.

## License

MIT for the code and prompts. Reference card images in `data/` belong to their game studio and are included for style reference only.
