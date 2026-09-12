#!/usr/bin/env node
// Rebuilds docs/card-art-generator-brief.pdf from docs/brief/index.html with headless Edge or Chrome.
//   node scripts/brief.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "../lib/plan.mjs";

const html = path.join(ROOT, "docs", "brief", "index.html");
const pdf = path.join(ROOT, "docs", "card-art-generator-brief.pdf");
const candidates = [
  process.env.BROWSER_BIN,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean);
const bin = candidates.find((c) => fs.existsSync(c));
if (!bin) { console.error("No Edge/Chrome found. Set BROWSER_BIN to a Chromium binary."); process.exit(1); }
const url = "file:///" + html.replaceAll("\\", "/");
const r = spawnSync(bin, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=15000", `--print-to-pdf=${pdf}`, url], { encoding: "utf8" });
if (!fs.existsSync(pdf)) { console.error(r.stderr || r.stdout); process.exit(1); }
console.log(`PDF written: ${path.relative(ROOT, pdf)} (${Math.round(fs.statSync(pdf).size / 1024)} KB)`);
