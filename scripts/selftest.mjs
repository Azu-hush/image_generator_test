#!/usr/bin/env node
// Offline self-test: exercises every script against a local mock of the three provider APIs.
// No real keys or network needed. Run: npm test  (or node scripts/selftest.mjs)
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { ROOT, validatePlan } from "../lib/plan.mjs";
import { buildPrompt } from "../lib/prompt.mjs";
import { pickRefs } from "../lib/refs.mjs";
import { resolveStage } from "../lib/config.mjs";

const OUT = path.join(ROOT, "out", "selftest");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const PLAN = path.join(ROOT, "examples", "summer_fishing.plan.json");
const planJson = JSON.parse(fs.readFileSync(PLAN, "utf8"));
// 1x1 transparent PNG
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let failures = 0, passes = 0;
const ok = (name, cond, detail = "") => { if (cond) { passes++; console.log(`  ok   ${name}`); } else { failures++; console.log(`  FAIL ${name} ${detail}`); } };

// ---------------------------------------------------------------- mock server
const hits = [];
let failOnce = new Set();
const server = http.createServer((req, res) => {
  let body = [];
  req.on("data", (c) => body.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(body);
    const url = req.url;
    hits.push({ url, len: raw.length, ct: req.headers["content-type"] || "", auth: req.headers.authorization || req.headers["x-api-key"] || req.headers["x-goog-api-key"] || "" });
    const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (failOnce.has(url)) { failOnce.delete(url); return send(500, { error: "flaky" }); }

    if (url === "/v1/messages") {                              // anthropic chat
      const j = JSON.parse(raw.toString());
      const text = wantsPlan(j) ? JSON.stringify(planJson) : qaAnswer();
      return send(200, { content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 } });
    }
    if (url === "/v1/chat/completions") {                      // openai chat
      const j = JSON.parse(raw.toString());
      const text = wantsPlan(j) ? JSON.stringify(planJson) : qaAnswer();
      return send(200, { choices: [{ message: { content: text } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
    }
    if (url.includes(":generateContent")) {                    // gemini chat or image
      const j = JSON.parse(raw.toString());
      const image = j.generationConfig?.responseModalities?.includes("IMAGE");
      if (image) return send(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_B64 } }] } }] });
      const text = wantsPlan(j) ? JSON.stringify(planJson) : qaAnswer();
      return send(200, { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } });
    }
    if (url === "/v1/images/edits") {                          // openai image
      const s = raw.toString("latin1");
      const images = (s.match(/name="image\[\]"/g) || []).length;
      const fidelity = (s.match(/name="input_fidelity"\r?\n\r?\n(\w+)/) || [])[1];
      hits.at(-1).images = images; hits.at(-1).fidelity = fidelity;
      return send(200, { data: [{ b64_json: PNG_B64 }], usage: { total_tokens: 1234 } });
    }
    send(404, { error: "unknown " + url });
  });
});
function wantsPlan(j) { return JSON.stringify(j).includes("Write the plan for this set now"); }
function qaAnswer() { return JSON.stringify({ scores: { centered: 2, category_match: 2, style_match: 1, no_text_or_artifacts: 2, readability: 2 }, pass: true, notes: "mock ok" }); }

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const env = {
  ...process.env,
  ANTHROPIC_API_KEY: "test-anthropic", OPENAI_API_KEY: "test-openai", GEMINI_API_KEY: "test-gemini",
  ANTHROPIC_BASE_URL: base, OPENAI_BASE_URL: base, GEMINI_BASE_URL: base,
  GEN_DELAY_MS: "0",
};
// async spawn: a synchronous spawn would block the event loop and starve the mock server
const run = (script, args, extraEnv = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(ROOT, script), ...args], { env: { ...env, ...extraEnv }, cwd: ROOT });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const timer = setTimeout(() => { child.kill(); out += "\n[timeout 60s]"; }, 60000);
  child.on("close", (code) => { clearTimeout(timer); resolve({ code, out }); });
});

console.log("\n== unit: plan / prompt / refs / config");
ok("example plans validate", validatePlan(planJson).length === 0);
const bad = structuredClone(planJson); bad.cards[1].bg_color = "turquoise"; bad.cards[2].category = 9;
ok("validator catches hue clash + bad category", validatePlan(bad).length >= 2);
const gold = planJson.cards.find((c) => c.category === 5);
const p5 = buildPrompt(gold, pickRefs(gold));
ok("gold prompt names characters and scene", /MAN \(/.test(p5) && p5.includes(gold.scene.replace(/\.$/, "")));
ok("prompt has no double periods", !/\.\./.test(p5));
const auto = pickRefs({ category: 5, characters: ["man", "pig"] });
ok("two characters both get refs (round-robin)", auto.characters.some((f) => f.includes("129_")) && auto.characters.some((f) => f.includes("100_")) && auto.characters.length <= 4, JSON.stringify(auto.characters));
ok("refs use forward slashes", !auto.characters.concat(auto.style).some((f) => f.includes("\\")));
ok("missing character reported", pickRefs({ category: 5, characters: ["sheep"] }).missing.includes("sheep"));
const r = resolveStage("qa", { cli: { provider: "gemini" } });
ok("stage resolution: cli provider wins with provider default model", r.provider === "gemini" && r.model === "gemini-3.8-flash" && r.source === "cli");
let threw = false; try { resolveStage("image", { cli: { provider: "anthropic" } }); } catch { threw = true; }
ok("stage resolution rejects unsupported provider", threw);

console.log("\n== scripts without keys (dry paths)");
const noKeys = { ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", GEMINI_API_KEY: "" };
let t = await run("backends/openai.mjs", ["--plan", PLAN, "--out", OUT, "--cards", "1,9"], noKeys);
ok("openai dry run without key", t.code === 0 && /DRY RUN/.test(t.out), t.out.slice(-200));
t = await run("scripts/plan.mjs", ["--collection", "Summer", "--set", "Selftest", "--out", "out/selftest/plans"], noKeys);
ok("planner exits 2 and writes prompt without key", t.code === 2 && fs.existsSync(path.join(OUT, "plans", "summer_selftest.prompt.md")), t.out.slice(-200));
t = await run("backends/manual.mjs", ["--plan", PLAN, "--out", OUT]);
const pack = path.join(OUT, "summer", "fishing", "prompt-pack.html");
ok("manual pack written with local refs", t.code === 0 && fs.existsSync(pack) && fs.readFileSync(pack, "utf8").includes('src="refs/') && fs.existsSync(path.join(OUT, "summer", "fishing", "refs")));

console.log("\n== scripts against mock APIs");
t = await run("backends/gemini.mjs", ["--plan", PLAN, "--out", OUT, "--cards", "1", "--candidates", "2"]);
const c1 = path.join(OUT, "summer", "fishing", "candidates", "01_bobber_1.png");
ok("gemini backend writes candidates", t.code === 0 && fs.existsSync(c1) && fs.existsSync(c1.replace("_1", "_2")), t.out.slice(-300));
ok("gemini request carried reference images", hits.filter((h) => h.url.includes("generateContent")).every((h) => h.len > 10000));

t = await run("backends/openai.mjs", ["--plan", PLAN, "--out", OUT, "--cards", "9", "--candidates", "1"]);
const c9 = path.join(OUT, "summer", "fishing", "candidates", "09_big_catch_1.png");
const oh = hits.find((h) => h.url === "/v1/images/edits");
ok("openai backend writes candidate", t.code === 0 && fs.existsSync(c9), t.out.slice(-300));
ok("openai multipart has image[] refs and high fidelity on gold", oh && oh.ct.startsWith("multipart/form-data") && oh.images >= 3 && oh.fidelity === "high", JSON.stringify(oh));
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, "summer", "fishing", "manifest.json"), "utf8"));
ok("manifest merges runs (--cards 1 then --cards 9)", manifest.length === 2 && manifest.map((m) => m.card.id).join() === "1,9", JSON.stringify(manifest.map((m) => m.card.id)));
ok("manifest candidate paths are posix", !JSON.stringify(manifest).includes("\\\\"));

failOnce.add("/v1/models/gemini-3.1-flash-image:generateContent");
t = await run("backends/gemini.mjs", ["--plan", PLAN, "--out", OUT, "--cards", "2", "--candidates", "1"]);
ok("backend retries after HTTP 500", t.code === 0 && fs.existsSync(path.join(OUT, "summer", "fishing", "candidates", "02_tackle_box_1.png")) && /ok/.test(t.out), t.out.slice(-200));

const setDir = path.join(OUT, "summer", "fishing");
{
  const sharp = (await import("sharp")).default;
  const odd = path.join(setDir, "candidates", "03_rod_1.jpg");
  await sharp({ create: { width: 600, height: 900, channels: 3, background: "#ffcc00" } }).jpeg().toFile(odd);
  t = await run("scripts/qa-template.mjs", ["--set", setDir]);
  const fitted = path.join(setDir, "candidates", "03_rod_1.png");
  const meta = fs.existsSync(fitted) ? await sharp(fitted).metadata() : null;
  ok("qa auto-fits odd aspect candidates to 430:480", t.code === 0 && meta && Math.abs(meta.width / meta.height - 430 / 480) < 0.01 && !fs.existsSync(odd) && fs.existsSync(path.join(setDir, "candidates_src", "03_rod_1.jpg")), t.out.slice(-200));
}
for (const prov of ["anthropic", "openai", "gemini"]) {
  t = await run("scripts/qa.mjs", ["--set", setDir, "--provider", prov, "--force"]);
  const qa = JSON.parse(fs.readFileSync(path.join(setDir, "qa.json"), "utf8"));
  ok(`qa via ${prov} scores all candidates`, t.code === 0 && qa.items.length === 5 && qa.items.every((i) => i.pass === true && i.judge.startsWith(prov)), t.out.slice(-300));
}

for (const prov of ["anthropic", "openai", "gemini"]) {
  t = await run("scripts/plan.mjs", ["--collection", "Summer", "--set", "Fishing", "--notes", "mock", "--gold", "2", "--provider", prov, "--out", "out/selftest/plans"]);
  const pf = path.join(OUT, "plans", "summer_fishing.plan.json");
  const p = fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, "utf8")) : null;
  ok(`planner via ${prov} writes valid plan with meta`, t.code === 0 && p && validatePlan(p).length === 0 && p.meta?.planner?.provider === prov, t.out.slice(-300));
}

t = await run("scripts/assemble.mjs", ["--set", setDir, "--variants", "2"]);
const summary = JSON.parse(fs.readFileSync(path.join(setDir, "variants", "summary.json"), "utf8"));
ok("assemble builds variants from scored candidates", t.code === 0 && summary.length === 2 && fs.existsSync(path.join(setDir, "variants", "variant_1", "01_bobber.png")), t.out.slice(-200));

t = await run("scripts/compare.mjs", ["--plan", PLAN, "--backends", "openai,gemini:gemini-3-pro-image", "--cards", "1", "--candidates", "1"]);
const cmp = path.join(ROOT, "out", "compare", "summer_fishing", "index.html");
ok("compare renders side-by-side sheet", t.code === 0 && fs.existsSync(cmp) && fs.readFileSync(cmp, "utf8").includes("gemini-3-pro-image"), t.out.slice(-200));

t = await run("scripts/models.mjs", ["--stage", "qa"]);
ok("models catalog prints", t.code === 0 && /claude-sonnet-5/.test(t.out));
t = await run("scripts/validate.mjs", [PLAN]);
ok("validate script OK", t.code === 0 && /^OK/.test(t.out));

server.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
