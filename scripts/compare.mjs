#!/usr/bin/env node
// Runs the same plan through several image backends/models and builds a side-by-side sheet.
//
//   node scripts/compare.mjs --plan examples/summer_coolness_remake.plan.json --backends openai,gemini:gemini-3-pro-image [--candidates 1] [--cards 1,3,7]
//
// Each entry is "<backend>" or "<backend>:<model>". Output: out/compare/<collection>_<set>/index.html
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadPlan, slug, cardBase, ROOT } from "../lib/plan.mjs";
import { parseArgs } from "../lib/run.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.plan || !args.backends) { console.error("usage: node scripts/compare.mjs --plan <plan.json> --backends openai,gemini[:model] [--candidates 1] [--cards 1,2]"); process.exit(1); }

const plan = loadPlan(args.plan);
const entries = String(args.backends).split(",").map((s) => { const [backend, model] = s.split(":"); return { backend: backend.trim(), model: model?.trim() }; });
const candidates = args.candidates || "1";
const cmpDir = path.join(ROOT, "out", "compare", `${slug(plan.collection)}_${slug(plan.set.name)}`);
fs.mkdirSync(cmpDir, { recursive: true });

const runs = [];
for (const e of entries) {
  const script = path.join(ROOT, "backends", `${e.backend}.mjs`);
  if (!fs.existsSync(script)) { console.error(`no backend ${e.backend}`); continue; }
  const label = e.model ? `${e.backend}_${slug(e.model)}` : e.backend;
  const outRoot = path.join(cmpDir, label);
  const argv = [script, "--plan", args.plan, "--out", outRoot, "--candidates", String(candidates)];
  if (e.model) argv.push("--model", e.model);
  if (args.cards) argv.push("--cards", String(args.cards));
  console.log(`\n== ${label}`);
  const r = spawnSync(process.execPath, argv, { stdio: "inherit" });
  const setDir = path.join(outRoot, slug(plan.collection), slug(plan.set.name));
  const manifest = fs.existsSync(path.join(setDir, "manifest.json")) ? JSON.parse(fs.readFileSync(path.join(setDir, "manifest.json"), "utf8")) : [];
  runs.push({ label, model: manifest[0]?.model || e.model || "?", setDir, ok: r.status === 0 });
}

const only = args.cards ? new Set(String(args.cards).split(",").map(Number)) : null;
const rel = (p) => path.relative(cmpDir, p).replaceAll("\\", "/");
let html = `<!doctype html><meta charset="utf-8"><title>Compare ${plan.set.name}</title><style>body{font:13px system-ui;margin:20px;background:#1d3b2a;color:#fff}table{border-collapse:collapse}th,td{padding:6px;text-align:center;vertical-align:top}th{font-weight:600}img{width:172px;height:192px;object-fit:cover;border-radius:8px;border:2px solid #cfd8dc;display:block}td.name{text-align:left;font-weight:600;min-width:110px}small{color:#cfd8dc;font-weight:400}.empty{width:172px;height:192px;border-radius:8px;background:#2a4a38;display:grid;place-items:center;color:#9fb5a8}</style><h1>${plan.collection} / ${plan.set.name}: backend comparison</h1><table><tr><th>Card</th><th>Reference<br><small>first ref from plan</small></th>${runs.map((r) => `<th>${r.label}<br><small>${r.model}</small></th>`).join("")}</tr>`;
for (const card of plan.cards) {
  if (only && !only.has(card.id)) continue;
  const base = cardBase(card);
  const ref = card.refs?.[0] && fs.existsSync(path.join(ROOT, card.refs[0])) ? `<img src="${rel(path.join(ROOT, card.refs[0]))}">` : `<div class="empty">no ref</div>`;
  html += `<tr><td class="name">${String(card.id).padStart(2, "0")} ${card.name}<br><small>cat ${card.category}${card.category === 5 ? " gold" : ""}</small></td><td>${ref}</td>`;
  for (const r of runs) {
    const f = path.join(r.setDir, "candidates", `${base}_1.png`);
    html += `<td>${fs.existsSync(f) ? `<img src="${rel(f)}">` : `<div class="empty">${r.ok ? "no image" : "failed"}</div>`}</td>`;
  }
  html += "</tr>";
}
html += "</table>";
fs.writeFileSync(path.join(cmpDir, "index.html"), html);
fs.writeFileSync(path.join(cmpDir, "runs.json"), JSON.stringify(runs, null, 2));
console.log(`\nComparison sheet: ${path.relative(ROOT, path.join(cmpDir, "index.html"))}`);
