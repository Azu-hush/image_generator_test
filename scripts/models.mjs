#!/usr/bin/env node
// Prints the model catalog per stage with prices, the currently resolved choice and whether its key is present.
//   node scripts/models.mjs [--stage planner|image|qa]
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/plan.mjs";
import { resolveStage, apiKeyFor, STAGES } from "../lib/config.mjs";
import { parseArgs } from "../lib/run.mjs";

const args = parseArgs(process.argv.slice(2));
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "models.json"), "utf8")).stages;
const stages = args.stage ? [args.stage] : STAGES;

for (const s of stages) {
  const cur = resolveStage(s);
  const key = apiKeyFor(cur.provider) ? "key: yes" : "key: MISSING";
  console.log(`\n== ${s.toUpperCase()}  current: ${cur.provider}/${cur.model} (${cur.source}, ${key})  unit: ${cat[s].unit}`);
  for (const m of cat[s].models) {
    const price = s === "image" ? `$${m.per_image.toFixed(3)}/img  (${m.range})` : `$${m.input}/${m.output} per 1M  ≈ $${(m.est_per_set ?? m.est_per_candidate).toFixed(3)} ${s === "planner" ? "per set" : "per candidate"}`;
    const mark = m.provider === cur.provider && m.model === cur.model ? "*" : " ";
    console.log(` ${mark} ${(m.provider + "/" + m.model).padEnd(38)} ${"★".repeat(m.quality_for_task).padEnd(5)} ${price.padEnd(44)} ${m.note}`);
  }
}
console.log(`\nOverride: --provider/--model flags on scripts, CARDGEN_<STAGE>_PROVIDER/_MODEL env, or edit config.json. Producer wishes like "картинки через Gemini" are parsed by the /card-set skill.`);
