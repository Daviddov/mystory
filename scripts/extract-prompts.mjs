// Usage: node scripts/extract-prompts.mjs <book-id> [out.json]
// Reads scripts/originals/illustrations/prompts/<book-id>.md and prints / writes
// [{name: "sheet"|"cover"|"page-NN", prompt}] in the order they should be sent.
import { readFileSync, writeFileSync } from "node:fs";
const [id, out] = process.argv.slice(2);
const md = readFileSync(`scripts/originals/illustrations/prompts/${id.replace(/^(parasha|chazal)-/, "$1-")}.md`, "utf8");
const items = [];
for (const m of md.matchAll(/^## (Character sheet.*|Cover|Page (\d+))\n[\s\S]*?```text\n([\s\S]*?)\n```/gm)) {
  const name = m[2] ? `page-${String(m[2]).padStart(2, "0")}` : m[1].startsWith("Cover") ? "cover" : "sheet";
  items.push({ name, prompt: m[3].replace(/\s*\n\s*/g, " ").trim() });
}
const json = JSON.stringify(items, null, 1);
if (out) writeFileSync(out, json); else console.log(json);
console.error(`${id}: ${items.length} prompts (${items.map((i) => i.name).join(" ")})`);
