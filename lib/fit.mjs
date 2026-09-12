// Card-aspect normalisation shared by scripts/fit.mjs, scripts/qa.mjs, scripts/qa-template.mjs and lib/run.mjs.
// Centre-crops an image to 430:480; optionally downsizes to exactly 430x480. Files already within
// tolerance are left untouched. Originals are kept once in <set>/candidates_src/.
import fs from "node:fs";
import path from "node:path";

export const CARD_W = 430, CARD_H = 480, CARD_ASPECT = CARD_W / CARD_H;
const TOLERANCE = 0.01; // 1 % aspect difference is accepted as-is

let sharpMod = null;
export async function getSharp() {
  if (sharpMod !== null) return sharpMod;
  try { sharpMod = (await import("sharp")).default; } catch { sharpMod = false; }
  return sharpMod;
}

export async function fitFile(src, dst, { exact = false } = {}) {
  const sharp = await getSharp();
  if (!sharp) throw new Error("sharp is not installed: run `npm install` in the project folder");
  const img = sharp(src);
  const meta = await img.metadata();
  const aspectOk = Math.abs(meta.width / meta.height - CARD_ASPECT) <= TOLERANCE;
  const sizeOk = meta.width === CARD_W && meta.height === CARD_H;
  if (aspectOk && (!exact || sizeOk)) return { changed: false, from: `${meta.width}x${meta.height}`, to: `${meta.width}x${meta.height}` };
  let w = meta.width, h = meta.height;
  if (w / h > CARD_ASPECT) w = Math.round(h * CARD_ASPECT); else h = Math.round(w / CARD_ASPECT);
  const left = Math.round((meta.width - w) / 2), top = Math.round((meta.height - h) / 2);
  let pipe = img.extract({ left, top, width: w, height: h });
  if (exact) pipe = pipe.resize(CARD_W, CARD_H);
  await pipe.png().toFile(dst);
  return { changed: true, from: `${meta.width}x${meta.height}`, to: exact ? `${CARD_W}x${CARD_H}` : `${w}x${h}` };
}

/**
 * Normalise every candidate of a set in place. Returns { fitted, skipped, files: [{file, from, to}] }.
 * quiet: no per-file logging. Never throws when sharp is missing: returns { missingSharp: true }.
 */
export async function fitSet(setDir, { exact = false, quiet = false, log = console.log } = {}) {
  const candDir = path.join(setDir, "candidates");
  const srcDir = path.join(setDir, "candidates_src");
  const files = fs.existsSync(candDir) ? fs.readdirSync(candDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)) : [];
  const result = { fitted: 0, skipped: 0, files: [] };
  if (!files.length) return result;
  if (!(await getSharp())) { result.missingSharp = true; if (!quiet) log("  (sharp not installed, candidates not normalised: npm install)"); return result; }
  for (const f of files) {
    const src = path.join(candDir, f);
    const pngName = f.replace(/\.(jpe?g|webp)$/i, ".png");
    const tmp = path.join(candDir, pngName + ".tmp");
    const r = await fitFile(src, tmp, { exact });
    if (!r.changed) { result.skipped++; continue; }
    fs.mkdirSync(srcDir, { recursive: true });
    const keep = path.join(srcDir, f);
    if (!fs.existsSync(keep)) fs.copyFileSync(src, keep);
    fs.renameSync(tmp, path.join(candDir, pngName));
    if (pngName !== f) fs.unlinkSync(src);
    result.fitted++;
    result.files.push({ file: pngName, from: r.from, to: r.to });
    if (!quiet) log(`  fit ${f}: ${r.from} -> ${r.to}`);
  }
  if (!quiet && result.fitted) log(`  ${result.fitted} candidate(s) cropped to card aspect; originals in candidates_src/`);
  return result;
}
