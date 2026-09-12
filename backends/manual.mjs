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
const refDir = path.join(outDir, "refs");
fs.mkdirSync(refDir, { recursive: true });
fs.copyFileSync(args.plan, path.join(outDir, "plan.json"));

// copy every referenced image next to the pack so the out folder is self-contained
function localRef(rel) {
  const name = path.basename(rel);
  const dst = path.join(refDir, name);
  if (!fs.existsSync(dst)) fs.copyFileSync(path.join(ROOT, rel), dst);
  return "refs/" + name;
}

let md = `# Prompt pack: ${plan.collection} / ${plan.set.name}\n\n${plan.set.theme || ""}\n\n`;
const howto = `How to use: open ChatGPT, Google AI Studio or any image generator. For each card attach the reference images from the <code>refs/</code> folder (shown below), paste the prompt, ask for a vertical 4:5 image. Generate 2-4 times, save the best files as <code>candidates/NN_name_k.png</code> (e.g. <code>01_bobber_1.png</code>), then run <code>node scripts/qa-template.mjs --set ${path.relative(ROOT, outDir).replaceAll("\\", "/")}</code> and <code>node scripts/assemble.mjs --set ...</code>.`;
md += howto.replace(/<\/?code>/g, "`") + "\n\n";
let html = `<!doctype html><meta charset="utf-8"><title>${plan.set.name} prompt pack</title><style>body{font:14px system-ui;margin:24px;max-width:1100px}article{border:1px solid #ccc;border-radius:8px;padding:16px;margin:16px 0}pre{white-space:pre-wrap;background:#f6f6f6;padding:12px;border-radius:6px}img{height:120px;margin:4px;border-radius:6px;border:1px solid #ddd}button{float:right;padding:6px 12px;cursor:pointer}button.done{background:#c8f7c5}p.howto{background:#fff8e1;padding:10px 14px;border-radius:8px}</style>
<script>
function copyPrompt(btn){
  const pre = btn.closest("article").querySelector("pre");
  const text = pre.textContent;
  const done = () => { btn.textContent = "copied"; btn.classList.add("done"); setTimeout(() => { btn.textContent = "copy prompt"; btn.classList.remove("done"); }, 1500); };
  const fallback = () => { const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); try { document.execCommand("copy"); done(); } catch (e) { alert("Select the text and press Ctrl+C"); } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}
</script><h1>${plan.collection} / ${plan.set.name}</h1><p>${plan.set.theme || ""}</p><p class="howto">${howto}</p>`;

for (const card of plan.cards) {
  const refs = pickRefs(card, { seed: card.id });
  const prompt = buildPrompt(card, refs);
  const base = cardBase(card);
  const allRefs = [...refs.characters, ...refs.style];
  const local = allRefs.map(localRef);
  md += `## ${base}  (category ${card.category}${card.category === 5 ? ", GOLD" : ""})\n\nReferences: ${local.map((r) => `\`${r}\``).join(", ") || "none"}\n\n\`\`\`\n${prompt}\n\`\`\`\n\n`;
  html += `<article><button onclick="copyPrompt(this)">copy prompt</button><h2>${base} <small>cat ${card.category}${card.category === 5 ? " GOLD" : ""}</small></h2><div>${local.map((r) => `<img src="${r}" title="${path.basename(r)}">`).join("")}</div><pre>${escape(prompt)}</pre></article>`;
}
fs.writeFileSync(path.join(outDir, "prompt-pack.md"), md);
fs.writeFileSync(path.join(outDir, "prompt-pack.html"), html);
console.log(`Prompt pack written: ${path.relative(ROOT, path.join(outDir, "prompt-pack.html"))}`);

function escape(s) { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
