---
name: card-set
description: Generate a 10-card collectible set (3-5 variants) for the mobile-game card collection from a set theme and producer notes. Use when the user asks to create, plan, generate, QA or assemble a card set / набор карточек / сет.
---

# /card-set — produce a card set end to end

You are the art director and QA. Image generation is done by `backends/gemini.mjs` (Gemini API) or, without a key, by the producer through `backends/manual.mjs` prompt packs.

Arguments: `/card-set <collection> "<set theme>" "<producer notes>"`. If the set theme is missing, propose 3 themes not yet in `data/sets.csv` and ask.

## Step 1 — Plan

1. Read `styleguide/style.md`, `styleguide/categories.md`, `styleguide/characters.md`, `prompts/planner_system.md`.
2. Read `data/sets.csv` (used set and card names) and `data/cards.csv` (reference catalog).
3. Write the plan JSON to `plans/<collection>_<set>.plan.json` following `schema/set-plan.schema.json` and the planner rules. Default gold count is 1 (grand set: 10). Fill `refs` with 2–3 same-category files from `data/cards/` and character refs for gold cards.
4. Run `node scripts/validate.mjs <plan>` and fix until it prints OK.
5. Show the producer a compact table (id, name, category, bg color, one-line object) and the gold scene(s). Continue unless they object.

## Step 2 — Generate

- Pick the backend by the key that exists in the environment (check with `node -e "console.log(!!process.env.OPENAI_API_KEY, !!process.env.GEMINI_API_KEY)"`, never print the values):
  `node backends/openai.mjs --plan <plan>` or `node backends/gemini.mjs --plan <plan>`.
  Without any key this is a dry run: prompts land in `out/<collection>/<set>/prompts/`. Tell the user and also run `node backends/manual.mjs --plan <plan>` so they get `prompt-pack.html` for manual generation.
- With a key: default is 4 candidates per card (≈ $1.5–2.5 per set). For a first test use `--candidates 2`. Do not raise `--candidates` above 6 without asking.
- Regenerate a single card: `node backends/<backend>.mjs --plan <plan> --cards 7 --force`. Put the fix instruction from QA notes into that card's `object` field first.

## Step 3 — QA (vision)

1. `node scripts/qa-template.mjs --set out/<collection>/<set>` creates `qa.json` and `qa-sheet.html`.
2. Look at every candidate image with the Read tool, compare with `data/rules/category_N_examples.png` and the refs, and score it per `qa/checklist.md`. Write scores, `pass` and a one-sentence `notes` into `qa.json`.
3. Any card with zero passing candidates: fix the plan text and regenerate that card (max 2 retries), then re-score.

## Step 4 — Assemble

- `node scripts/assemble.mjs --set out/<collection>/<set> --variants 3` builds `variants/variant_N/` (430×480 PNGs when `sharp` is installed) and contact sheets.
- Open `variants/index.html` yourself (Read the contact sheets) and run the set-level checks from the checklist: hue variety, pattern variety, categories present, producer notes honoured. Swap candidates between variants if a variant looks monotonous.

## Step 5 — Report

Reply with: set table, where the variants are, per-card QA pass rate, cards that needed retries and why, cost estimate (images × price), and 2–3 suggestions for the producer. Keep it short.

Never print or paste the API key. Never commit `out/`.
