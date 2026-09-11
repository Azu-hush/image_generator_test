#!/usr/bin/env node
// Gemini image backend.
//
//   node backends/gemini.mjs --plan examples/fishing.plan.json [--out out] [--candidates 4]
//        [--model gemini-3.1-flash-image] [--cards 1,2,3] [--dry-run]
//
// Without GEMINI_API_KEY (or with --dry-run) it writes prompts + request manifests
// and exits 0, so the whole pipeline can be rehearsed before the key exists.
import fs from "node:fs";
import path from "node:path";
import { loadPlan, cardBase, slug, ROOT } from "../lib/plan.mjs";
import { buildPrompt } from "../lib/prompt.mjs";
import { pickRefs, refsToParts } from "../lib/refs.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.plan) die("usage: node backends/gemini.mjs --plan <plan.json> [--out out] [--candidates N] [--model id] [--cards 1,2] [--dry-run]");

const plan = loadPlan(args.plan);
const gen = plan.generation;
const model = args.model || gen.model;
const candidates = +(args.candidates || gen.candidates_per_card);
const only = args.cards ? new Set(String(args.cards).split(",").map(Number)) : null;
const apiKey = process.env.GEMINI_API_KEY;
const dryRun = args["dry-run"] || !apiKey;

const outDir = path.join(args.out || path.join(ROOT, "out"), slug(plan.collection), slug(plan.set.name));
const dirs = {
  prompts: path.join(outDir, "prompts"),
  requests: path.join(outDir, "requests"),
  candidates: path.join(outDir, "candidates"),
};
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
fs.copyFileSync(args.plan, path.join(outDir, "plan.json"));

if (dryRun) {
  console.log(apiKey ? "DRY RUN: --dry-run given, no API calls." : "DRY RUN: GEMINI_API_KEY is not set, no API calls. See docs/gemini-api-key.ru.md");
}
console.log(`Set: ${plan.collection} / ${plan.set.name}  model=${model}  candidates=${candidates}  aspect=${gen.aspect_ratio} size=${gen.image_size}`);

const manifest = [];
let calls = 0;
for (const card of plan.cards) {
  if (only && !only.has(card.id)) continue;
  const base = cardBase(card);
  const refs = pickRefs(card);
  const prompt = buildPrompt(card, refs);
  fs.writeFileSync(path.join(dirs.prompts, `${base}.txt`), prompt);
  const req = {
    model,
    card: { id: card.id, name: card.name, category: card.category, gold: card.category === 5 },
    references: [...refs.characters, ...refs.style],
    generationConfig: imageConfig(gen),
    prompt,
  };
  fs.writeFileSync(path.join(dirs.requests, `${base}.json`), JSON.stringify(req, null, 2));
  manifest.push({ ...req, candidates: [] });

  for (let k = 1; k <= candidates; k++) {
    const file = path.join(dirs.candidates, `${base}_${k}.png`);
    if (fs.existsSync(file) && !args.force) { manifest.at(-1).candidates.push(path.relative(ROOT, file)); continue; }
    if (dryRun) continue;
    process.stdout.write(`  ${base} candidate ${k}/${candidates} ... `);
    try {
      const png = await generate({ model, prompt, parts: refsToParts(refs), config: imageConfig(gen), apiKey });
      fs.writeFileSync(file, png);
      manifest.at(-1).candidates.push(path.relative(ROOT, file));
      calls++;
      console.log("ok");
    } catch (err) {
      console.log("FAILED: " + err.message.split("\n")[0]);
      fs.appendFileSync(path.join(outDir, "errors.log"), `${new Date().toISOString()} ${base}_${k}: ${err.message}\n`);
    }
    await sleep(+(process.env.GEMINI_DELAY_MS || 1500));
  }
}
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(dryRun
  ? `Wrote ${manifest.length} prompts to ${path.relative(ROOT, dirs.prompts)}. Set GEMINI_API_KEY and rerun to generate ${manifest.length * candidates} images.`
  : `Done. ${calls} images generated into ${path.relative(ROOT, dirs.candidates)}. Next: node scripts/qa-template.mjs --set "${outDir}"`);

// ---------------------------------------------------------------------------

function imageConfig(gen) {
  return {
    responseModalities: ["IMAGE"],
    imageConfig: { aspectRatio: gen.aspect_ratio, imageSize: gen.image_size },
  };
}

async function generate({ model, prompt, parts, config, apiKey }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = { contents: [{ role: "user", parts: [...parts, { text: prompt }] }], generationConfig: config };
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      await sleep(2000 * attempt * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 600)}`);
    const json = await res.json();
    if (json.promptFeedback?.blockReason) throw new Error(`blocked: ${json.promptFeedback.blockReason}`);
    const img = (json.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!img) throw new Error("no image in response: " + JSON.stringify(json).slice(0, 300));
    return Buffer.from(img.inlineData.data, "base64");
  }
  throw lastErr;
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      o[k] = v;
    }
  }
  return o;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function die(msg) { console.error(msg); process.exit(1); }
