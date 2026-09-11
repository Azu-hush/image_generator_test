#!/usr/bin/env node
// node scripts/validate.mjs examples/fishing.plan.json
import { loadPlan } from "../lib/plan.mjs";

const file = process.argv[2];
if (!file) { console.error("usage: node scripts/validate.mjs <plan.json>"); process.exit(1); }
try {
  const plan = loadPlan(file);
  const cats = plan.cards.reduce((a, c) => ((a[c.category] = (a[c.category] || 0) + 1), a), {});
  console.log(`OK: ${plan.collection} / ${plan.set.name}, 10 cards, categories ${JSON.stringify(cats)}, gold ${plan.cards.filter((c) => c.category === 5).length}`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
