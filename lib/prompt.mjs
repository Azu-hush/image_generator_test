// Builds the final text prompt for one card from the templates in /prompts.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./plan.mjs";

const read = (f) => fs.readFileSync(path.join(ROOT, "prompts", f), "utf8").trim();

const CHARACTER_DESC = parseCharacters();

function parseCharacters() {
  const md = fs.readFileSync(path.join(ROOT, "styleguide", "characters.md"), "utf8");
  const out = {};
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*`(\w+)`\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k] != null && vars[k] !== "" ? String(vars[k]) : defaultFor(k);
    return v.replace(/\.\s*$/, ""); // templates add their own punctuation
  });
}

function defaultFor(key) {
  return {
    bg_pattern: "a plain soft gradient",
    surface: "smooth matte",
    props: "none",
    environment_details: "a few large soft shapes",
    environment: "simple outdoor place",
  }[key] ?? "";
}

export function buildPrompt(card, refInfo = { style: [], characters: [] }) {
  const base = read("base_style.txt");
  const negative = read("negative.txt");
  const cat = read(`category_${card.category}.txt`);

  const vars = { ...card };
  if (card.category === 5) {
    vars.characters = (card.characters || [])
      .map((k) => `${k.toUpperCase()} (${CHARACTER_DESC[k] || k})`)
      .join(" and ");
  }
  let body = fill(cat, vars);
  if (card.category === 5 && card.object) body += ` Props and details: ${card.object}`;

  let refNote = "";
  if (refInfo.style.length || refInfo.characters.length) {
    const parts = [];
    if (refInfo.characters.length) parts.push(`Images 1-${refInfo.characters.length} are CHARACTER design references and must be reproduced exactly.`);
    if (refInfo.style.length) {
      const from = refInfo.characters.length + 1;
      const to = refInfo.characters.length + refInfo.style.length;
      parts.push(`Image${to > from ? `s ${from}-${to} are` : ` ${from} is`} a STYLE reference only.`);
    }
    refNote = fill(read("reference_note.txt"), { ref_note: parts.join(" ") });
  }

  return [base, body, refNote, negative].filter(Boolean).join("\n\n");
}
