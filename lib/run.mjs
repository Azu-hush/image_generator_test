// Shared runner for image backends. A backend supplies:
//   { name, envKey, defaultModel, docs, generate({ model, prompt, refFiles, gen, apiKey, card }) -> Buffer }
// The runner handles CLI args, plan loading, prompt building, reference picking,
// output folders, dry-run mode, retries bookkeeping and the manifest.
import fs from "node:fs";
import path from "node:path";
import { loadPlan, cardBase, slug, ROOT } from "./plan.mjs";
import { buildPrompt } from "./prompt.mjs";
import { pickRefs } from "./refs.mjs";

export async function runBackend(backend, argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.plan) die(`usage: node backends/${backend.name}.mjs --plan <plan.json> [--out out] [--candidates N] [--model id] [--cards 1,2] [--force] [--dry-run]`);

  const plan = loadPlan(args.plan);
  const gen = plan.generation;
  const planModel = !gen.backend || gen.backend === backend.name ? gen.model : null;
  const model = args.model || planModel || backend.defaultModel;
  const candidates = +(args.candidates || gen.candidates_per_card);
  const only = args.cards ? new Set(String(args.cards).split(",").map(Number)) : null;
  const apiKey = process.env[backend.envKey];
  const dryRun = !!args["dry-run"] || !apiKey;

  const outDir = path.join(args.out || path.join(ROOT, "out"), slug(plan.collection), slug(plan.set.name));
  const dirs = { prompts: path.join(outDir, "prompts"), requests: path.join(outDir, "requests"), candidates: path.join(outDir, "candidates") };
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(args.plan, path.join(outDir, "plan.json"));

  if (dryRun) console.log(apiKey ? "DRY RUN: --dry-run given, no API calls." : `DRY RUN: ${backend.envKey} is not set, no API calls. See ${backend.docs}`);
  console.log(`Backend: ${backend.name}  set: ${plan.collection} / ${plan.set.name}  model=${model}  candidates=${candidates}  size=${backend.describeSize(gen)}`);

  const manifest = [];
  let calls = 0;
  const t0 = Date.now();
  for (const card of plan.cards) {
    if (only && !only.has(card.id)) continue;
    const base = cardBase(card);
    const refs = pickRefs(card);
    const refFiles = [...refs.characters, ...refs.style];
    const prompt = buildPrompt(card, refs);
    fs.writeFileSync(path.join(dirs.prompts, `${base}.txt`), prompt);
    const req = { backend: backend.name, model, card: { id: card.id, name: card.name, category: card.category, gold: card.category === 5 }, references: refFiles, settings: backend.settings(gen, card), prompt };
    fs.writeFileSync(path.join(dirs.requests, `${base}.json`), JSON.stringify(req, null, 2));
    const entry = { ...req, candidates: [] };
    manifest.push(entry);

    for (let k = 1; k <= candidates; k++) {
      const file = path.join(dirs.candidates, `${base}_${k}.png`);
      if (fs.existsSync(file) && !args.force) { entry.candidates.push(path.relative(ROOT, file)); continue; }
      if (dryRun) continue;
      process.stdout.write(`  ${base} candidate ${k}/${candidates} ... `);
      try {
        const png = await withRetries(() => backend.generate({ model, prompt, refFiles, gen, apiKey, card }));
        fs.writeFileSync(file, png);
        entry.candidates.push(path.relative(ROOT, file));
        calls++;
        console.log("ok");
      } catch (err) {
        console.log("FAILED: " + String(err.message).split("\n")[0].slice(0, 200));
        fs.appendFileSync(path.join(outDir, "errors.log"), `${new Date().toISOString()} ${backend.name} ${base}_${k}: ${err.message}\n`);
      }
      await sleep(+(process.env.GEN_DELAY_MS || 1500));
    }
  }
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  if (dryRun) console.log(`Wrote ${manifest.length} prompts to ${path.relative(ROOT, dirs.prompts)}. Set ${backend.envKey} and rerun to generate ${manifest.length * candidates} images.`);
  else console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s. ${calls} images generated into ${path.relative(ROOT, dirs.candidates)}. Next: node scripts/qa-template.mjs --set "${path.relative(process.cwd(), outDir)}"`);
}

export async function withRetries(fn, attempts = 4) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!e.retryable) throw e;
      await sleep(2000 * i * i);
    }
  }
  throw last;
}

export function httpError(status, text) {
  const e = new Error(`HTTP ${status}: ${String(text).slice(0, 600)}`);
  e.retryable = status === 429 || status >= 500;
  return e;
}

export function readRefBlobs(refFiles) {
  return refFiles.map((rel) => {
    const abs = path.join(ROOT, rel);
    const mime = /\.jpe?g$/i.test(rel) ? "image/jpeg" : "image/png";
    return { name: path.basename(rel), mime, buffer: fs.readFileSync(abs) };
  });
}

export function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const k = a.slice(2); o[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true; }
  }
  return o;
}
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function die(msg) { console.error(msg); process.exit(1); }
