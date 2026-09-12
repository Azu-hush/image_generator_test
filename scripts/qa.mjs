#!/usr/bin/env node
// Vision QA as a script: any supported vision model scores every candidate against qa/checklist.md.
//
//   node scripts/qa.mjs --set out/summer/fishing [--provider anthropic|openai|gemini] [--model id] [--cards 1,2] [--force]
//
// Writes/updates <set>/qa.json in the same format as scripts/qa-template.mjs, so scripts/assemble.mjs works unchanged.
// Without the provider's key it exits with code 2 and leaves qa.json for Claude (in the skill) to fill by hand.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/plan.mjs";
import { resolveStage, describeStage } from "../lib/config.mjs";
import { chat, parseJson } from "../lib/llm.mjs";
import { parseArgs } from "../lib/run.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.set) { console.error("usage: node scripts/qa.mjs --set <out/collection/set> [--provider p] [--model m] [--cards 1,2] [--force]"); process.exit(1); }

const setDir = path.resolve(args.set);
const plan = JSON.parse(fs.readFileSync(path.join(setDir, "plan.json"), "utf8"));
const stage = resolveStage("qa", { cli: { provider: args.provider, model: args.model }, plan });
const candDir = path.join(setDir, "candidates");
const files = fs.existsSync(candDir) ? fs.readdirSync(candDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort() : [];
if (!files.length) { console.error("no candidates in " + candDir); process.exit(1); }
const only = args.cards ? new Set(String(args.cards).split(",").map(Number)) : null;

const qaFile = path.join(setDir, "qa.json");
const qa = fs.existsSync(qaFile) ? JSON.parse(fs.readFileSync(qaFile, "utf8")) : { set: plan.set.name, items: [] };
qa.scale = "0-2 per criterion (0 fail, 1 acceptable, 2 good); pass = no zeros";
qa.judge = { provider: stage.provider, model: stage.model, at: new Date().toISOString() };
const byFile = new Map(qa.items.map((i) => [i.file, i]));

const checklist = fs.readFileSync(path.join(ROOT, "qa/checklist.md"), "utf8");
const categories = fs.readFileSync(path.join(ROOT, "styleguide/categories.md"), "utf8");
const system = `You are the art QA lead for a mobile casual game. Score generated collectible-card images strictly against the checklist. Be harsh on text, logos, extra objects and category violations. Return JSON only.\n\n${checklist}\n\n${categories}`;

console.log(describeStage("qa", stage) + `, ${files.length} candidates`);
let done = 0, spentIn = 0, spentOut = 0;
for (const f of files) {
  const id = +f.slice(0, 2);
  if (only && !only.has(id)) continue;
  const existing = byFile.get(f);
  if (existing && existing.pass !== null && !args.force) continue;
  const card = plan.cards.find((c) => c.id === id);
  if (!card) continue;

  const images = [path.join(candDir, f)];
  const exampleStrip = path.join(ROOT, `data/rules/category_${card.category}_examples.png`);
  if (fs.existsSync(exampleStrip)) images.push(exampleStrip);
  for (const r of (card.refs || []).slice(0, 2)) if (fs.existsSync(path.join(ROOT, r))) images.push(r);

  const user = `Image 1 is the CANDIDATE to score. Image 2 is the official example strip for category ${card.category}. ${images.length > 2 ? `Images 3-${images.length} are reference cards from the same collection (style${card.category === 5 ? " and character designs" : ""}).` : ""}

Card spec:
${JSON.stringify({ name: card.name, category: card.category, gold: card.category === 5, object: card.object, bg_color: card.bg_color, bg_pattern: card.bg_pattern, surface: card.surface, environment: card.environment, characters: card.characters, scene: card.scene }, null, 2)}

Return JSON: {"scores": {"centered": 0-2, "category_match": 0-2, "style_match": 0-2, "no_text_or_artifacts": 0-2, "readability": 0-2${card.category === 5 ? ', "character_match": 0-2' : ""}}, "pass": boolean, "notes": "one sentence: what to fix if regenerated"}`;

  process.stdout.write(`  ${f} ... `);
  try {
    const { text, usage } = await chat({ provider: stage.provider, model: stage.model, system, user, images, json: true, maxTokens: 600 });
    const r = parseJson(text);
    const scores = r.scores || {};
    const vals = Object.values(scores).filter((v) => typeof v === "number");
    const pass = typeof r.pass === "boolean" ? r.pass && !vals.includes(0) : !vals.includes(0);
    const item = { file: f, card_id: id, card_name: card.name, category: card.category, scores, pass, notes: String(r.notes || "").slice(0, 300), judge: `${stage.provider}/${stage.model}` };
    if (existing) Object.assign(existing, item); else qa.items.push(item);
    spentIn += usage.input || 0; spentOut += usage.output || 0; done++;
    console.log(`${pass ? "PASS" : "fail"} ${vals.join("")} ${item.notes ? "· " + item.notes.slice(0, 70) : ""}`);
  } catch (e) {
    if (e.code === "NO_KEY") { console.log(`\n${e.message}. Fill qa.json manually or in the /card-set skill (Claude scores the images itself).`); process.exit(2); }
    console.log("FAILED: " + e.message.split("\n")[0].slice(0, 160));
  }
  fs.writeFileSync(qaFile, JSON.stringify(qa, null, 2));
}
qa.items.sort((a, b) => a.file.localeCompare(b.file));
fs.writeFileSync(qaFile, JSON.stringify(qa, null, 2));

const perCard = plan.cards.map((c) => { const its = qa.items.filter((i) => i.card_id === c.id); return `${String(c.id).padStart(2, "0")} ${c.name.padEnd(14)} ${its.filter((i) => i.pass).length}/${its.length} pass`; });
console.log(`\n${perCard.join("\n")}\nScored ${done} candidates, ~${spentIn} in / ${spentOut} out tokens. Next: node scripts/assemble.mjs --set "${args.set}"`);
