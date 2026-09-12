// Per-stage model resolution.
// Precedence (highest first): CLI flags > plan.generation > env CARDGEN_<STAGE>_PROVIDER/_MODEL > config.json > built-in defaults.
// Producer wishes ("картинки через Gemini") are turned into CLI flags by the /card-set skill.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./plan.mjs";

export const STAGES = ["planner", "image", "qa"];

export const PROVIDER_DEFAULTS = {
  planner: { anthropic: "claude-opus-5", openai: "gpt-5.6-terra", gemini: "gemini-3.8-flash" },
  qa:      { anthropic: "claude-sonnet-5", openai: "gpt-5.6-terra", gemini: "gemini-3.8-flash" },
  image:   { openai: "gpt-image-2.5-flare", gemini: "gemini-3.1-flash-image" },
};

export const ENV_KEYS = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };

const BUILTIN = {
  planner: { provider: "anthropic", model: "claude-opus-5" },
  image:   { provider: "openai", model: "gpt-image-2.5-flare" },
  qa:      { provider: "anthropic", model: "claude-sonnet-5" },
};

export function loadConfig() {
  const file = path.join(ROOT, "config.json");
  let user = {};
  if (fs.existsSync(file)) {
    try { user = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new Error(`config.json is not valid JSON: ${e.message}`); }
  }
  const out = {};
  for (const s of STAGES) out[s] = { ...BUILTIN[s], ...(user[s] || {}) };
  return out;
}

/**
 * resolveStage("qa", { cli: { provider, model }, plan })
 * Returns { provider, model, source } where source says which layer decided.
 */
export function resolveStage(stage, { cli = {}, plan = null } = {}) {
  if (!STAGES.includes(stage)) throw new Error(`unknown stage ${stage}`);
  const cfg = loadConfig()[stage];
  const env = {
    provider: process.env[`CARDGEN_${stage.toUpperCase()}_PROVIDER`],
    model: process.env[`CARDGEN_${stage.toUpperCase()}_MODEL`],
  };
  const fromPlan = planLayer(stage, plan);

  const layers = [
    ["cli", cli], ["plan", fromPlan], ["env", env], ["config", cfg],
  ];
  let provider = null, model = null, source = "config";
  for (const [name, l] of layers) {
    if (!provider && l?.provider) { provider = l.provider; source = name; }
  }
  for (const [name, l] of layers) {
    // a model only counts if it belongs to the chosen provider's layer or the layer names no provider
    if (!model && l?.model && (!l.provider || l.provider === provider)) { model = l.model; if (name !== source && source === "config") source = name; }
  }
  if (!provider) provider = BUILTIN[stage].provider;
  if (!model) model = PROVIDER_DEFAULTS[stage][provider] || BUILTIN[stage].model;
  if (!PROVIDER_DEFAULTS[stage][provider]) throw new Error(`stage ${stage}: provider "${provider}" is not supported (use ${Object.keys(PROVIDER_DEFAULTS[stage]).join(", ")})`);
  return { provider, model, source };
}

function planLayer(stage, plan) {
  const g = plan?.generation;
  if (!g) return {};
  if (stage === "image") return { provider: g.backend, model: g.model };
  const s = g[stage];
  return s ? { provider: s.provider, model: s.model } : {};
}

export function apiKeyFor(provider) {
  return process.env[ENV_KEYS[provider]] || null;
}

export function describeStage(stage, r) {
  return `${stage}: ${r.provider}/${r.model} (${r.source})`;
}
