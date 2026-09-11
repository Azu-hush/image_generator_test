#!/usr/bin/env node
// Manual backend: writes a prompt pack (Markdown + HTML) that a producer can
// paste into Google AI Studio, ChatGPT, Midjourney or any other generator.
//
//   node backends/manual.mjs --plan examples/fishing.plan.json [--out out]
import fs from "node:fs";
import path from "node:path";
import { loadPlan, cardBase, slug, ROOT } from "../lib/plan.mjs";
import { buildPrompt } from "../lib/prompt.mjs";
import { pickRefs } from "../lib/refs.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true] : []).filter(Boolean));
if (!args.plan) { console.error("usage: node backends/manual.mjs --plan <plan.json> [--out out]"); process.exit(1); }

const plan = loadPlan(args.plan);
const outDir = path.join(args.out || path.join(ROOT, "out"), slug(plan.collection), slug(plan.set.name));
fs.mkdirSync(outDir, { recursive: true });

let md = `# Prompt pack: ${plan.collection} / ${plan.set.name}\n\n${plan.set.theme || ""}\n\n`;
md += `How to use: open https://aistudio.google.com, pick an image model (Nano Banana), attach the reference images listed for the card, paste the prompt, set aspect ratio 4:5. Generate 3-4 times, save the best to \`candidates/NN_name_k.png\`, then run \`node scripts/qa-template.mjs\`.\n\n`;
let html = `<!doctype html><meta charset="utf-8"><title>${plan.set.name} prompt pack</title><style>body{font:14px system-ui;margin:24px;max-width:1100px}article{border:1px solid #ccc;border-radius:8px;padding:16px;margin:16px 0}pre{white-space:pre-wrap;background:#f6f6f6;padding:12px;border-radius:6px}img{height:120px;margin:4px;border-radius:6px}button{float:right}</style><h1>${plan.collection} / ${plan.set.name}</h1><p>${plan.set.theme || ""}</p>`;

for (const card of plan.cards) {
  const refs = pickRefs(card);
  const prompt = buildPrompt(card, refs);
  const base = cardBase(card);
  const allRefs = [...refs.characters, ...refs.style];
  md += `## ${base}  (category ${card.category}${card.category === 5 ? ", GOLD" : ""})\n\nReferences: ${allRefs.map((r) => `\`${r}\``).join(", ") || "none"}\n\n\`\`\`\n${prompt}\n\`\`\`\n\n`;
  const rel = (r) => path.relative(outDir, path.join(ROOT, r)).replaceAll("\\", "/");
  html += `<article><button onclick="navigator.clipboard.writeText(this.nextElementSibling.nextElementSibling.textContent)">copy prompt</button><h2>${base} <small>cat ${card.category}${card.category === 5 ? " GOLD" : ""}</small></h2><div>${allRefs.map((r) => `<img src="${rel(r)}" title="${r}">`).join("")}</div><pre>${escape(prompt)}</pre></article>`;
}
fs.writeFileSync(path.join(outDir, "prompt-pack.md"), md);
fs.writeFileSync(path.join(outDir, "prompt-pack.html"), html);
console.log(`Prompt pack written: ${path.relative(ROOT, path.join(outDir, "prompt-pack.html"))}`);

function escape(s) { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
