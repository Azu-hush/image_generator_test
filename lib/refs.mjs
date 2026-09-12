// Picks reference images for a card: explicit card.refs first, otherwise
// same-category style references from data/cards.csv and character references
// from styleguide/characters.md.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./plan.mjs";

const rel = (...p) => path.posix.join(...p.map((x) => x.replaceAll("\\", "/")));

const LIMITS = { style: 3, characters: 4 };

function loadCatalog() {
  const csv = path.join(ROOT, "data", "cards.csv");
  if (!fs.existsSync(csv)) return [];
  const [head, ...rows] = fs.readFileSync(csv, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  const dir = path.join(ROOT, "data", "cards");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  return rows.map((r) => {
    const v = r.split(",");
    const o = Object.fromEntries(cols.map((c, i) => [c, v[i]]));
    const prefix = String(o.id).padStart(3, "0") + "_";
    const f = files.find((x) => x.startsWith(prefix));
    return { ...o, id: +o.id, category: +o.category, file: f ? rel("data", "cards", f) : null };
  }).filter((o) => o.file);
}

function characterRefs() {
  const md = fs.readFileSync(path.join(ROOT, "styleguide", "characters.md"), "utf8");
  const dir = path.join(ROOT, "data", "cards");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const out = {};
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*`(\w+)`\s*\|.+?\|\s*(.+?)\s*\|$/);
    if (!m) continue;
    const names = [...m[2].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
    out[m[1]] = names.map((n) => files.find((f) => f.startsWith(n))).filter(Boolean).map((f) => rel("data", "cards", f));
  }
  return out;
}

export function pickRefs(card, { seed = 0 } = {}) {
  if (card.refs?.length) {
    const chars = card.refs.filter((r) => /_gold\.png$/i.test(r));
    const style = card.refs.filter((r) => !/_gold\.png$/i.test(r));
    return { characters: card.category === 5 ? chars.slice(0, LIMITS.characters) : [], style: style.slice(0, LIMITS.style) };
  }
  const catalog = loadCatalog();
  let style = catalog.filter((c) => c.category === card.category).map((c) => c.file);
  // deterministic rotation so different candidates can see different refs
  if (style.length) style = [...style.slice(seed % style.length), ...style.slice(0, seed % style.length)];
  const characters = [];
  const missing = [];
  if (card.category === 5) {
    const map = characterRefs();
    const lists = (card.characters || []).map((k) => { const l = map[k] || []; if (!l.length) missing.push(k); return [...l]; });
    // round-robin so every character gets at least one reference within the limit
    while (characters.length < LIMITS.characters && lists.some((l) => l.length)) {
      for (const l of lists) { const f = l.shift(); if (f && !characters.includes(f) && characters.length < LIMITS.characters) characters.push(f); }
    }
  }
  return { characters, style: style.slice(0, card.category === 5 ? 1 : LIMITS.style), missing };
}

export function refsToParts(refInfo) {
  const files = [...refInfo.characters, ...refInfo.style];
  return files.map((rel) => {
    const abs = path.join(ROOT, rel);
    const data = fs.readFileSync(abs).toString("base64");
    const mime = rel.toLowerCase().endsWith(".jpg") || rel.toLowerCase().endsWith(".jpeg") ? "image/jpeg" : "image/png";
    return { inlineData: { mimeType: mime, data } };
  });
}
