#!/usr/bin/env node
// Gemini image backend (generateContent with reference images).
//
//   node backends/gemini.mjs --plan examples/summer_fishing.plan.json [--candidates 4] [--model gemini-3.1-flash-image] [--cards 1,2] [--force] [--dry-run]
//
// Needs GEMINI_API_KEY with billing enabled (image models have no free tier).
// Without the key it is a dry run: prompts and request manifests are written, nothing is called.
import { runBackend, httpError, readRefBlobs } from "../lib/run.mjs";
import { BASE } from "../lib/llm.mjs";

const backend = {
  name: "gemini",
  envKey: "GEMINI_API_KEY",
  defaultModel: "gemini-3.1-flash-image",
  docs: "docs/gemini-api-key.ru.md",
  describeSize: (gen) => `${gen.aspect_ratio} ${gen.image_size}`,
  settings: (gen) => ({ responseModalities: ["IMAGE"], imageConfig: { aspectRatio: gen.aspect_ratio, imageSize: gen.image_size } }),

  async generate({ model, prompt, refFiles, gen, apiKey }) {
    const parts = readRefBlobs(refFiles).map((r) => ({ inlineData: { mimeType: r.mime, data: r.buffer.toString("base64") } }));
    const body = { contents: [{ role: "user", parts: [...parts, { text: prompt }] }], generationConfig: backend.settings(gen) };
    const res = await fetch(`${BASE.gemini()}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw httpError(res.status, await res.text());
    const json = await res.json();
    if (json.promptFeedback?.blockReason) throw new Error(`blocked: ${json.promptFeedback.blockReason}`);
    const img = (json.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!img) throw new Error("no image in response: " + JSON.stringify(json).slice(0, 300));
    return Buffer.from(img.inlineData.data, "base64");
  },
};

await runBackend(backend);
