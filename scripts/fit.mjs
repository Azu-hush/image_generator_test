#!/usr/bin/env node
// Normalises candidate images to the card aspect (430:480) by a centred cover-crop.
// Generators return 4:5, 2:3 or 1:1; this makes every candidate comparable before QA
// and identical in shape to the in-game card.
//
//   node scripts/fit.mjs --set out/summer/farm            # crop to aspect, keep source resolution, write candidates/*.png in place (originals to candidates_src/)
//   node scripts/fit.mjs --set out/summer/farm --size card  # also downscale to exactly 430x480
//   node scripts/fit.mjs --file some.png --out fitted.png   # single file
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "../lib/run.mjs";

const CARD_W = 430, CARD_H = 480;
const args = parseArgs(process.argv.slice(2));
let sharp;
try { sharp = (await import("sharp")).default; } catch { console.error("sharp is not installed: run `npm install` in the project folder"); process.exit(1); }

async function fit(src, dst, exact) {
  const img = sharp(src);
  const meta = await img.metadata();
  const target = CARD_W / CARD_H;
  let w = meta.width, h = meta.height;
  if (w / h > target) w = Math.round(h * target); else h = Math.round(w / target);
  const left = Math.round((meta.width - w) / 2), top = Math.round((meta.height - h) / 2);
  let pipe = img.extract({ left, top, width: w, height: h });
  if (exact) pipe = pipe.resize(CARD_W, CARD_H);
  await pipe.png().toFile(dst);
  return { from: `${meta.width}x${meta.height}`, to: exact ? `${CARD_W}x${CARD_H}` : `${w}x${h}` };
}

if (args.file) {
  const out = args.out || args.file.replace(/(\.\w+)$/, "_fit$1");
  const r = await fit(args.file, out, args.size === "card");
  console.log(`${path.basename(args.file)}: ${r.from} -> ${r.to}  (${out})`);
} else if (args.set) {
  const setDir = path.resolve(args.set);
  const candDir = path.join(setDir, "candidates");
  const srcDir = path.join(setDir, "candidates_src");
  const files = fs.existsSync(candDir) ? fs.readdirSync(candDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)) : [];
  if (!files.length) { console.error("no candidates in " + candDir); process.exit(1); }
  fs.mkdirSync(srcDir, { recursive: true });
  let n = 0;
  for (const f of files) {
    const src = path.join(candDir, f);
    const keep = path.join(srcDir, f);
    if (!fs.existsSync(keep)) fs.copyFileSync(src, keep);          // originals kept once
    const tmp = src + ".tmp.png";
    const r = await fit(keep, tmp, args.size === "card");
    fs.renameSync(tmp, src.replace(/\.(jpe?g|webp)$/i, ".png"));
    if (!/\.png$/i.test(src)) fs.unlinkSync(src);
    console.log(`  ${f}: ${r.from} -> ${r.to}`);
    n++;
  }
  console.log(`Fitted ${n} candidates in ${path.relative(process.cwd(), candDir)}; originals in candidates_src/`);
} else {
  console.error("usage: node scripts/fit.mjs --set <out/collection/set> [--size card] | --file <img> [--out <img>] [--size card]");
  process.exit(1);
}
