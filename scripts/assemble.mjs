#!/usr/bin/env node
// Assembles N set variants from scored candidates and renders contact sheets.
// Variant 1 takes the best candidate of every card, variant 2 the second best, etc.
// Cards with fewer passing candidates fall back to their best one.
// If sharp is installed (npm i sharp) the images are also cropped to 430x480.
//
//   node scripts/assemble.mjs --set out/summer/fishing [--variants 3]
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
if (!args.set) { console.error("usage: node scripts/assemble.mjs --set <out/collection/set> [--variants N]"); process.exit(1); }

const setDir = path.resolve(args.set);
const plan = JSON.parse(fs.readFileSync(path.join(setDir, "plan.json"), "utf8"));
const variants = +(args.variants || plan.generation?.variants || 3);
const qa = fs.existsSync(path.join(setDir, "qa.json")) ? JSON.parse(fs.readFileSync(path.join(setDir, "qa.json"), "utf8")) : null;
const candDir = path.join(setDir, "candidates");
const all = fs.existsSync(candDir) ? fs.readdirSync(candDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)) : [];
if (!all.length) { console.error("No candidates in " + candDir); process.exit(1); }

const score = (f) => {
  const item = qa?.items.find((i) => i.file === f);
  if (!item) return { total: 0, pass: true };
  const vals = Object.values(item.scores).filter((v) => typeof v === "number");
  return { total: vals.reduce((a, b) => a + b, 0), pass: item.pass !== false && !vals.includes(0) };
};

let sharp = null;
try { sharp = (await import("sharp")).default; } catch { console.log("sharp not installed: variants keep the generated size (npm i sharp to crop to 430x480)"); }

const summary = [];
for (let v = 1; v <= variants; v++) {
  const vDir = path.join(setDir, "variants", `variant_${v}`);
  fs.mkdirSync(vDir, { recursive: true });
  const picks = [];
  for (const card of plan.cards) {
    const prefix = String(card.id).padStart(2, "0") + "_";
    const ranked = all.filter((f) => f.startsWith(prefix)).map((f) => ({ f, ...score(f) })).sort((a, b) => b.total - a.total);
    const passing = ranked.filter((r) => r.pass);
    const pool = passing.length ? passing : ranked;
    if (!pool.length) { picks.push({ card, file: null }); continue; }
    const pick = pool[Math.min(v - 1, pool.length - 1)];
    const outName = `${prefix}${card.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.png`;
    const src = path.join(candDir, pick.f);
    const dst = path.join(vDir, outName);
    if (sharp) await sharp(src).resize(430, 480, { fit: "cover", position: "centre" }).png().toFile(dst);
    else fs.copyFileSync(src, dst);
    picks.push({ card, file: outName, from: pick.f, score: pick.total, fallback: !passing.length });
  }
  fs.writeFileSync(path.join(vDir, "contact-sheet.html"), sheet(plan, picks, `Variant ${v}`));
  summary.push({ variant: v, picks: picks.map((p) => ({ id: p.card.id, name: p.card.name, file: p.file, from: p.from, score: p.score, fallback: p.fallback })) });
}
fs.writeFileSync(path.join(setDir, "variants", "summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(setDir, "variants", "index.html"), `<!doctype html><meta charset="utf-8"><title>${plan.set.name} variants</title><style>body{font:14px system-ui;margin:20px}iframe{width:100%;height:520px;border:0;margin-bottom:20px}</style><h1>${plan.collection} / ${plan.set.name}</h1>${summary.map((s) => `<iframe src="variant_${s.variant}/contact-sheet.html"></iframe>`).join("")}`);
console.log(`Assembled ${variants} variants into ${path.relative(process.cwd(), path.join(setDir, "variants"))}. Open variants/index.html`);

function sheet(plan, picks, title) {
  return `<!doctype html><meta charset="utf-8"><title>${plan.set.name} ${title}</title><style>body{font:13px system-ui;margin:16px;background:#1d3b2a;color:#fff}h1{font-size:18px}div.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;max-width:1000px}figure{margin:0;text-align:center}img{width:100%;aspect-ratio:430/480;object-fit:cover;border-radius:10px;border:3px solid #cfd8dc}.gold img{border-color:#f5c542}figcaption{font-size:12px;margin-top:4px}</style><h1>${plan.collection} / ${plan.set.name} · ${title}</h1><div class="grid">${picks.map((p) => `<figure class="${p.card.category === 5 ? "gold" : ""}">${p.file ? `<img src="${p.file}">` : "<div style='aspect-ratio:430/480;background:#333'></div>"}<figcaption>${p.card.name}${p.fallback ? " ⚠" : ""}</figcaption></figure>`).join("")}</div>`;
}
