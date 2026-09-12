#!/usr/bin/env node
// Planner as a script: any supported text model writes the set plan.
//
//   node scripts/plan.mjs --collection Summer --set "Camping" --notes "warm colors, one gold card with the rooster" [--gold 1]
//        [--provider anthropic|openai|gemini] [--model id] [--out plans]
//
// Without the provider's API key it prints the full planner prompt to plans/<name>.prompt.md so Claude
// (inside the /card-set skill) or a human can write the plan instead.
import fs from "node:fs";
import path from "node:path";
import { ROOT, validatePlan, slug, DEFAULTS } from "../lib/plan.mjs";
import { resolveStage, describeStage } from "../lib/config.mjs";
import { chat, parseJson } from "../lib/llm.mjs";
import { parseArgs } from "../lib/run.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.collection || !args.set) die('usage: node scripts/plan.mjs --collection <name> --set <theme> [--notes "..."] [--gold N] [--provider p] [--model m]');

const stage = resolveStage("planner", { cli: { provider: args.provider, model: args.model } });
const gold = args.gold != null ? +args.gold : 1;
const outDir = path.join(ROOT, args.out || "plans");
fs.mkdirSync(outDir, { recursive: true });
const base = `${slug(args.collection)}_${slug(args.set)}`;

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const system = [
  read("prompts/planner_system.md"),
  "\n\n# Style guide\n", read("styleguide/style.md"),
  "\n\n# Category rules\n", read("styleguide/categories.md"),
  "\n\n# Characters\n", read("styleguide/characters.md"),
].join("");

const catalog = loadCatalog();
const usedSets = fs.existsSync(path.join(ROOT, "data/sets.csv")) ? read("data/sets.csv") : "";
const schema = read("schema/set-plan.schema.json");

const user = `Collection theme: ${args.collection}
Set theme: ${args.set}
Producer notes: ${args.notes || "none"}
Gold cards required: ${gold}

Sets and card names already used in this collection (do not repeat objects or set themes):
${usedSets}

Reference catalog (use these exact paths in "refs", 2-3 same-category files per object card; for gold cards use the *_gold.png files of the involved characters):
${catalog}

JSON schema of the answer:
${schema}

Write the plan for this set now.`;

console.log(describeStage("planner", stage));
let plan, attempt = 0, feedback = "";
while (attempt < 2) {
  attempt++;
  let text;
  try {
    ({ text } = await chat({ provider: stage.provider, model: stage.model, system, user: user + feedback, json: true, maxTokens: 12000 }));
  } catch (e) {
    if (e.code === "NO_KEY") {
      const pf = path.join(outDir, `${base}.prompt.md`);
      fs.writeFileSync(pf, `# Planner prompt (${stage.provider}/${stage.model} key missing)\n\n## System\n\n${system}\n\n## User\n\n${user}\n`);
      console.log(`${e.message}. Planner prompt written to ${path.relative(ROOT, pf)}; let Claude in the skill write the plan, or set the key and rerun.`);
      process.exit(2);
    }
    throw e;
  }
  plan = parseJson(text);
  plan.generation = { ...DEFAULTS, ...(plan.generation || {}) };
  plan.set = { ...(plan.set || {}), producer_notes: args.notes || plan.set?.producer_notes || "", gold_count: gold };
  plan.meta = { planner: { provider: stage.provider, model: stage.model }, generated_at: new Date().toISOString() };
  // drop hallucinated reference paths; pickRefs() fills gaps automatically
  for (const c of plan.cards || []) {
    if (Array.isArray(c.refs)) {
      const bad = c.refs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
      if (bad.length) { console.log(`  card ${c.id}: dropped ${bad.length} unknown ref(s)`); c.refs = c.refs.filter((r) => !bad.includes(r)); }
    }
  }
  const errors = validatePlan(plan);
  if (!errors.length) break;
  console.log(`attempt ${attempt}: ${errors.length} validation error(s)`);
  feedback = `\n\nYour previous answer had these validation errors, fix them and return the full corrected JSON:\n- ${errors.join("\n- ")}`;
  if (attempt === 2) { console.error(errors.join("\n")); die("plan still invalid after retry"); }
}

const file = path.join(outDir, `${base}.plan.json`);
fs.writeFileSync(file, JSON.stringify(plan, null, 2) + "\n");
console.log(`Plan written: ${path.relative(ROOT, file)}`);
console.log(`\n${"#".padEnd(3)} ${"Name".padEnd(14)} ${"Cat".padEnd(4)} ${"Background".padEnd(18)} Object / scene`);
for (const c of plan.cards) console.log(`${String(c.id).padEnd(3)} ${c.name.padEnd(14)} ${String(c.category).padEnd(4)} ${(c.bg_color || "").padEnd(18)} ${(c.category === 5 ? c.scene : c.object).slice(0, 80)}`);

function loadCatalog() {
  const csv = path.join(ROOT, "data/cards.csv");
  if (!fs.existsSync(csv)) return "(no catalog)";
  const dir = path.join(ROOT, "data/cards");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const [head, ...rows] = fs.readFileSync(csv, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  const byCat = {};
  for (const r of rows) {
    const o = Object.fromEntries(cols.map((c, i) => [c, r.split(",")[i]]));
    const f = files.find((x) => x.startsWith(String(o.id).padStart(3, "0") + "_"));
    if (!f) continue;
    (byCat[o.category] ||= []).push(`data/cards/${f} (${o.set}: ${o.name}${o.characters ? ", characters: " + o.characters : ""})`);
  }
  return Object.entries(byCat).map(([k, v]) => `category ${k}:\n  ${v.join("\n  ")}`).join("\n");
}
function die(m) { console.error(m); process.exit(1); }
