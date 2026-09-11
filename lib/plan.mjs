// Plan loading + lightweight validation (no external deps).
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

export const DEFAULTS = {
  candidates_per_card: 4,
  variants: 3,
  aspect_ratio: "4:5",
  image_size: "1K",
  model: "gemini-3.1-flash-image",
};

export function loadPlan(file) {
  const plan = JSON.parse(fs.readFileSync(file, "utf8"));
  plan.generation = { ...DEFAULTS, ...(plan.generation || {}) };
  const errors = validatePlan(plan);
  if (errors.length) {
    throw new Error("Plan is invalid:\n  - " + errors.join("\n  - "));
  }
  return plan;
}

export function validatePlan(plan) {
  const e = [];
  if (!plan.collection) e.push("collection is required");
  if (!plan.set?.name) e.push("set.name is required");
  if (!Array.isArray(plan.cards)) return [...e, "cards must be an array"];
  if (plan.cards.length !== 10) e.push(`cards must contain exactly 10 items (got ${plan.cards.length})`);

  const ids = new Set();
  const names = new Set();
  const cats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let prevHue = null;
  for (const c of plan.cards) {
    const tag = `card ${c.id ?? "?"} (${c.name ?? "unnamed"})`;
    if (!Number.isInteger(c.id) || c.id < 1 || c.id > 10) e.push(`${tag}: id must be 1..10`);
    if (ids.has(c.id)) e.push(`${tag}: duplicate id`);
    ids.add(c.id);
    if (!c.name) e.push(`${tag}: name is required`);
    if (names.has((c.name || "").toLowerCase())) e.push(`${tag}: duplicate name`);
    names.add((c.name || "").toLowerCase());
    if (![1, 2, 3, 4, 5].includes(c.category)) e.push(`${tag}: category must be 1..5`);
    else cats[c.category]++;
    if (!c.object) e.push(`${tag}: object description is required`);
    if (!c.bg_color) e.push(`${tag}: bg_color is required`);
    if (c.category === 5) {
      if (!c.characters?.length) e.push(`${tag}: gold card needs characters`);
      if (c.characters?.length > 2) e.push(`${tag}: max 2 characters`);
      if (!c.scene) e.push(`${tag}: gold card needs a scene`);
      if (!c.environment) e.push(`${tag}: gold card needs an environment`);
    }
    if (c.category === 4 && !c.environment) e.push(`${tag}: category 4 needs an environment`);
    if ((c.category === 2 || c.category === 3) && !c.surface) e.push(`${tag}: category ${c.category} needs a surface`);
    if (c.category <= 3 && !c.bg_pattern) e.push(`${tag}: category ${c.category} needs a bg_pattern`);
    const hue = (c.bg_color || "").toLowerCase().split(/\s+/).pop();
    if (prevHue && hue === prevHue) e.push(`${tag}: same background hue as previous card (${hue})`);
    prevHue = hue;
    for (const r of c.refs || []) {
      if (!fs.existsSync(path.join(ROOT, r))) e.push(`${tag}: reference not found: ${r}`);
    }
  }
  const objectCards = plan.cards.filter((c) => c.category !== 5).length;
  if (objectCards > 0) {
    for (const k of [1, 2, 3, 4]) if (cats[k] === 0 && objectCards >= 4) e.push(`no cards of category ${k}; every set must mix categories 1-4`);
  }
  return e;
}

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function cardBase(card) {
  return `${String(card.id).padStart(2, "0")}_${slug(card.name)}`;
}
