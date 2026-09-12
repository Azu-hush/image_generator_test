#!/usr/bin/env node
// Normalises candidate images to the card aspect (430:480) by a centred cover-crop.
// QA scripts and API backends call this automatically; run it by hand for manual-mode images
// or to force exact 430x480 output.
//
//   node scripts/fit.mjs --set out/summer/farm              # crop to aspect, keep resolution
//   node scripts/fit.mjs --set out/summer/farm --size card  # also downscale to exactly 430x480
//   node scripts/fit.mjs --file some.png [--out fitted.png] [--size card]
import path from "node:path";
import { parseArgs } from "../lib/run.mjs";
import { fitFile, fitSet } from "../lib/fit.mjs";

const args = parseArgs(process.argv.slice(2));
const exact = args.size === "card";

if (args.file) {
  const out = args.out || args.file.replace(/(\.\w+)$/, "_fit$1");
  const r = await fitFile(args.file, out, { exact });
  console.log(r.changed ? `${path.basename(args.file)}: ${r.from} -> ${r.to}  (${out})` : `${path.basename(args.file)}: already ${r.from}, nothing to do`);
} else if (args.set) {
  const r = await fitSet(path.resolve(args.set), { exact });
  if (r.missingSharp) process.exit(1);
  console.log(`Done: ${r.fitted} cropped, ${r.skipped} already at card aspect.`);
} else {
  console.error("usage: node scripts/fit.mjs --set <out/collection/set> [--size card] | --file <img> [--out <img>] [--size card]");
  process.exit(1);
}
