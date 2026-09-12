// Minimal text+vision chat adapter over raw HTTP for three providers.
// Kept dependency-free on purpose: the whole tool runs with plain Node 20+.
//   const { text, usage } = await chat({ provider, model, system, user, images: ["data/cards/x.png"], json: true });
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./plan.mjs";
import { apiKeyFor, ENV_KEYS } from "./config.mjs";

export const BASE = {
  anthropic: () => process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
  openai: () => process.env.OPENAI_BASE_URL || "https://api.openai.com",
  gemini: () => process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com",
};

export async function chat({ provider, model, system = "", user, images = [], json = false, maxTokens = 8000 }) {
  const apiKey = apiKeyFor(provider);
  if (!apiKey) { const e = new Error(`${ENV_KEYS[provider]} is not set`); e.code = "NO_KEY"; throw e; }
  const imgs = images.map(readImage);
  const fn = { anthropic, openai, gemini }[provider];
  if (!fn) throw new Error(`unknown provider ${provider}`);
  const res = await withRetries(() => fn({ apiKey, model, system, user, imgs, json, maxTokens }));
  return res;
}

export function parseJson(text) {
  let t = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error("model did not return JSON: " + t.slice(0, 200));
}

function readImage(rel) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const mime = /\.jpe?g$/i.test(rel) ? "image/jpeg" : /\.webp$/i.test(rel) ? "image/webp" : "image/png";
  return { mime, b64: fs.readFileSync(abs).toString("base64") };
}

async function anthropic({ apiKey, model, system, user, imgs, json, maxTokens }) {
  const content = [
    ...imgs.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.b64 } })),
    { type: "text", text: json ? user + "\n\nReturn only valid JSON, no prose." : user },
  ];
  const res = await fetch(`${BASE.anthropic()}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw httpError(res.status, await res.text());
  const j = await res.json();
  if (j.stop_reason === "refusal") throw new Error(`refusal: ${j.stop_details?.category || ""} ${j.stop_details?.explanation || ""}`);
  const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { text, usage: { input: j.usage?.input_tokens, output: j.usage?.output_tokens } };
}

async function openai({ apiKey, model, system, user, imgs, json, maxTokens }) {
  const content = [
    ...imgs.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.b64}`, detail: "high" } })),
    { type: "text", text: user },
  ];
  const body = {
    model,
    messages: [{ role: "system", content: system }, { role: "user", content }],
    max_completion_tokens: maxTokens,
  };
  if (json) body.response_format = { type: "json_object" };
  const res = await fetch(`${BASE.openai()}/v1/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body),
  });
  if (!res.ok) throw httpError(res.status, await res.text());
  const j = await res.json();
  return { text: j.choices?.[0]?.message?.content || "", usage: { input: j.usage?.prompt_tokens, output: j.usage?.completion_tokens } };
}

async function gemini({ apiKey, model, system, user, imgs, json, maxTokens }) {
  const parts = [...imgs.map((i) => ({ inlineData: { mimeType: i.mime, data: i.b64 } })), { text: user }];
  const body = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) },
  };
  const res = await fetch(`${BASE.gemini()}/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body),
  });
  if (!res.ok) throw httpError(res.status, await res.text());
  const j = await res.json();
  if (j.promptFeedback?.blockReason) throw new Error(`blocked: ${j.promptFeedback.blockReason}`);
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  return { text, usage: { input: j.usageMetadata?.promptTokenCount, output: j.usageMetadata?.candidatesTokenCount } };
}

function httpError(status, text) {
  const e = new Error(`HTTP ${status}: ${String(text).slice(0, 500)}`);
  e.retryable = status === 429 || status >= 500;
  return e;
}
async function withRetries(fn, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); } catch (e) { last = e; if (!e.retryable) throw e; await new Promise((r) => setTimeout(r, 2000 * i * i)); }
  }
  throw last;
}
