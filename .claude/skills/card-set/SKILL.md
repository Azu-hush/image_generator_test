---
name: card-set
description: Generate a 10-card collectible set (3-5 variants) for the mobile-game card collection from a set theme and producer notes. Use when the user asks to create, plan, generate, QA or assemble a card set / набор карточек / сет, or to switch models per stage.
---

# /card-set — produce a card set end to end

You are the art director and QA lead. Three stages have a model behind them and each can be switched: **planner** (text), **image** (generation), **qa** (vision). Defaults live in `config.json`; the catalog with prices is `models.json` (`node scripts/models.mjs`).

Arguments: `/card-set <collection> "<set theme>" "<producer notes>"`. If the set theme is missing, propose 3 themes not yet in `data/sets.csv` and ask.

## Step 0 — Resolve models from the producer notes

Read the notes for model wishes and turn them into flags. Examples:
- "картинки через Gemini" / "images on Gemini Pro" → image backend `gemini`, model `gemini-3-pro-image` if "pro" is mentioned.
- "план на GPT", "planner: openai" → `--provider openai` for `scripts/plan.mjs`.
- "проверку через Gemini", "QA cheap" → `--provider gemini` for `scripts/qa.mjs` (cheap → `gemini-3.5-flash-lite` or `gpt-5.6-luna`).
- "дешевле" / "cheapest" → the lowest-price row per stage in `models.json`; "максимальное качество" → the 5-star rows.
- A bare model id (e.g. `gpt-image-1-mini`) → that stage's `--model`.
Anything not mentioned keeps `config.json`. Check which keys exist without printing values:
`node -e "console.log({anthropic:!!process.env.ANTHROPIC_API_KEY, openai:!!process.env.OPENAI_API_KEY, gemini:!!process.env.GEMINI_API_KEY})"`.
If the chosen provider has no key: planner and QA fall back to **you** doing the work in this session; image falls back to dry run + `backends/manual.mjs`. Say so in the report. Always state the final `stage: provider/model` table before generating.

## Step 1 — Plan

Preferred: `node scripts/plan.mjs --collection <c> --set "<theme>" --notes "<notes>" --gold <n> [--provider p] [--model m]` → `plans/<c>_<set>.plan.json`. Default gold count 1, grand set 10.
Fallback (exit code 2, no key): read the prompt it wrote to `plans/<name>.prompt.md` plus `styleguide/*.md`, `prompts/planner_system.md`, `data/sets.csv`, `data/cards.csv`, and write the plan JSON yourself following `schema/set-plan.schema.json`; set `meta.planner` to `{ "provider": "claude-code", "model": "in-session" }`.
Then `node scripts/validate.mjs <plan>` until OK. Show the producer a compact table (id, name, category, bg color, one-line object) and the gold scene(s). Continue unless they object.

## Step 2 — Generate

`node backends/<openai|gemini>.mjs --plan <plan> [--model m]` — 4 candidates per card by default (≈ $1.5–2.7 per set). For a first test use `--candidates 2`. Never raise `--candidates` above 6 without asking.
No key → dry run writes prompts; also run `node backends/manual.mjs --plan <plan>` and hand over `prompt-pack.html`.
Mixed strategy on request ("дорогая для золотых, дешёвая для объектов"): run the expensive backend with `--cards <gold ids>` and the cheap one with the rest into the same out folder.
Regenerate one card: put the QA note into that card's `object` field, then `--cards 7 --force`.
Compare generators: `node scripts/compare.mjs --plan <plan> --backends openai,gemini:gemini-3-pro-image --cards 1,3,7,10` → `out/compare/<set>/index.html`.

## Step 3 — QA

Preferred: `node scripts/qa.mjs --set out/<c>/<set> [--provider p] [--model m]` → scores into `qa.json` with `judge` recorded.
Fallback (exit 2): `node scripts/qa-template.mjs --set ...`, then look at every candidate with the Read tool, compare with `data/rules/category_N_examples.png` and the refs, score per `qa/checklist.md`, write scores/pass/notes into `qa.json`, set `judge` to `claude-code/in-session`.
Any card with zero passing candidates: fix the plan text, regenerate that card (max 2 retries), re-score.

## Step 4 — Assemble

`node scripts/assemble.mjs --set out/<c>/<set> --variants 3` → `variants/variant_N/` and contact sheets. Read the sheets and run the set-level checks: hue variety, pattern variety, all four object categories present, producer notes honoured. Swap candidates between variants if one looks monotonous.

## Step 5 — Report

Reply with: the stage/provider/model table actually used, set table, where the variants are, per-card QA pass rate, cards that needed retries and why, cost estimate (images × price from `models.json` + planner/QA estimates), and 2–3 suggestions. Keep it short.

Never print or paste API keys. Never commit `out/` or `plans/` (both are in `.gitignore`).
