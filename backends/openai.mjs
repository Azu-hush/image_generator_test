#!/usr/bin/env node
// OpenAI image backend (POST /v1/images/edits with reference images as image[]).
//
//   node backends/openai.mjs --plan examples/summer_fishing.plan.json [--candidates 4] [--model gpt-image-2.5-flare] [--cards 1,2] [--force] [--dry-run]
//
// Needs OPENAI_API_KEY from https://platform.openai.com/api-keys with prepaid credits
// (a ChatGPT Plus subscription alone does not include API access).
// Without the key it is a dry run: prompts and request manifests are written, nothing is called.
import { runBackend, httpError, readRefBlobs } from "../lib/run.mjs";

const backend = {
  name: "openai",
  envKey: "OPENAI_API_KEY",
  defaultModel: "gpt-image-2.5-flare",
  docs: "docs/openai-api-key.ru.md",
  describeSize: (gen) => `${gen.openai_size || "864x960"} quality=${gen.openai_quality || "medium"}`,
  settings: (gen, card) => ({
    size: gen.openai_size || "864x960",             // 9:10, width/height divisible by 16; resized to 430x480 at assembly
    quality: gen.openai_quality || "medium",        // low | medium | high | xhigh | max
    output_format: "png",
    background: "opaque",
    input_fidelity: card?.category === 5 ? "high" : "low", // keep character designs exact on gold cards
  }),

  async generate({ model, prompt, refFiles, gen, apiKey, card }) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("n", "1");
    for (const [k, v] of Object.entries(backend.settings(gen, card))) form.append(k, v);
    for (const r of readRefBlobs(refFiles)) form.append("image[]", new Blob([r.buffer], { type: r.mime }), r.name);

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) throw httpError(res.status, await res.text());
    const json = await res.json();
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image in response: " + JSON.stringify(json).slice(0, 300));
    if (json.usage) process.stdout.write(`[${json.usage.total_tokens} tok] `);
    return Buffer.from(b64, "base64");
  },
};

await runBackend(backend);
