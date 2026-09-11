#!/usr/bin/env node
// Creates out/<collection>/<set>/qa.json listing every candidate with empty scores,
// plus qa-sheet.html to review them side by side. Claude (or a human) fills the scores.
//
//   node scripts/qa-template.mjs --set out/summer/fishing
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
if (!args.set) { console.error("usage: node scripts/qa-template.mjs --set <out/collection/set>"); process.exit(1); }

const setDir = path.resolve(args.set);
const plan = JSON.parse(fs.readFileSync(path.join(setDir, "plan.json"), "utf8"));
const candDir = path.join(setDir, "candidates");
const files = fs.existsSync(candDir) ? fs.readdirSync(candDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort() : [];
const qaFile = path.join(setDir, "qa.json");
const existing = fs.existsSync(qaFile) ? JSON.parse(fs.readFileSync(qaFile, "utf8")) : { items: [] };
const byFile = new Map(existing.items.map((i) => [i.file, i]));

const items = files.map((f) => {
  const id = +f.slice(0, 2);
  const card = plan.cards.find((c) => c.id === id);
  return byFile.get(f) || {
    file: f, card_id: id, card_name: card?.name, category: card?.category,
    scores: { centered: null, category_match: null, style_match: null, no_text_or_artifacts: null, readability: null, character_match: card?.category === 5 ? null : undefined },
    pass: null, notes: "",
  };
});
fs.writeFileSync(qaFile, JSON.stringify({ set: plan.set.name, scale: "0-2 per criterion (0 fail, 1 acceptable, 2 good); pass = no zeros", items }, null, 2));

const groups = plan.cards.map((c) => ({ card: c, files: files.filter((f) => +f.slice(0, 2) === c.id) }));
let html = `<!doctype html><meta charset="utf-8"><title>QA ${plan.set.name}</title><style>body{font:13px system-ui;margin:20px}section{margin-bottom:28px}h2{margin:0 0 6px}div.row{display:flex;gap:10px;flex-wrap:wrap}figure{margin:0;text-align:center}img{width:215px;height:240px;object-fit:cover;border-radius:8px;border:1px solid #ccc}figcaption{font-size:11px;color:#555}</style><h1>QA sheet: ${plan.collection} / ${plan.set.name}</h1>`;
for (const g of groups) {
  html += `<section><h2>${String(g.card.id).padStart(2, "0")} ${g.card.name} <small>cat ${g.card.category}${g.card.category === 5 ? " GOLD" : ""} · ${g.card.bg_color}</small></h2><div class="row">${g.files.map((f) => `<figure><img src="candidates/${f}"><figcaption>${f}</figcaption></figure>`).join("") || "<em>no candidates yet</em>"}</div></section>`;
}
fs.writeFileSync(path.join(setDir, "qa-sheet.html"), html);
console.log(`qa.json: ${items.length} candidates listed; qa-sheet.html written in ${setDir}`);
