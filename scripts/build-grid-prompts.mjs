// Usage: node scripts/build-grid-prompts.mjs <book-id> [out.json]
// Builds ChatGPT/Gemini "3x3 grid" prompts for a book from scripts/originals/illustrations/prompts/<id>.md:
// cover + pages in reading order, nine panels per image. Output: [{names:[...], prompt}].
import { readFileSync, writeFileSync } from "node:fs";
const [id, out] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
// --size=4 builds 2x2 sheets (for Gemini, whose images are smaller); default 9 = 3x3 sheets (ChatGPT).
const SIZE = Number((process.argv.find((a) => a.startsWith("--size=")) ?? "--size=9").slice(7));
const md = readFileSync(`scripts/originals/illustrations/prompts/${id}.md`, "utf8");
const blocks = [...md.matchAll(/^## (Character sheet.*|Cover|Page (\d+))\n[\s\S]*?```text\n([\s\S]*?)\n```/gm)].map((m) => ({
  name: m[2] ? `page-${String(m[2]).padStart(2, "0")}` : m[1].startsWith("Cover") ? "cover" : "sheet",
  text: m[3].replace(/\s*\n\s*/g, " ").trim(),
}));
// House rule (user, 2026-10-17): in every Jewish story each man and boy always has his head covered.
const HEAD_RULE =
  "HEAD COVERING RULE for every panel: every man and every boy (including sons, shepherds, servants, neighbors and children) " +
  "ALWAYS has his head covered, never bare: a kippah (skullcap) in modern or sages-era scenes, a tallit worn over the head, " +
  "or in ancient scenes the hood or corner of his robe/cloak drawn over his head or a head-cloth tied with a cord. " +
  "This overrides any mention of hair in a character description (the hair may show beneath the covering). " +
  "Women and girls keep their head scarves or coverings as described. ";
const sheet = blocks.find((b) => b.name === "sheet").text;
const style = sheet.match(/children's picture book\. (.*?) Show each character/)?.[1] ?? "";
const chars = [...sheet.matchAll(/ - ([^:]+): (.*?)(?= - [A-Z][^:]{1,40}: | Rules:|$)/g)].map((m) => `${m[1]}: ${m[2].replace(/\.$/, "")}`);
const scenes = blocks.filter((b) => b.name !== "sheet").map((b) => ({
  name: b.name,
  scene: (b.text.match(/Scene: (.*?)(?: Characters in this picture| Rules:|$)/)?.[1] ?? "").trim(),
}));
const groups = [];
for (let i = 0; i < scenes.length; i += SIZE) groups.push(scenes.slice(i, i + SIZE));
const result = groups.map((g, gi) => {
  const gemini = SIZE <= 4; // Gemini: smaller, 16:9 by default, so ask for 4:3 and equal panels explicitly
  const n = g.length;
  const cols = n <= 4 ? 2 : 3; // a short last group gets a 2x2 sheet (bigger panels)
  const rows = Math.ceil(n / cols);
  const grid = n === 1 ? "1x1" : `${cols}x${rows}`;
  const panels = g.map((s, i) => `${i + 1} ${s.name === "cover" ? "BOOK COVER: " : ""}${s.scene}`).join(" ");
  const common =
    HEAD_RULE + `Keep every character exactly the same in every panel where they appear: ` + chars.join("; ") + `. `;
  let intro;
  if (n === 1) {
    intro = `${gi === 0 ? "Create an image" : "Great, one more picture, same style"}: ONE single picture for a children's picture book, landscape 4:3, no text, letters or numbers anywhere. ` + (gi === 0 ? `Style: ${style} ` : "Same style. ");
    return { names: g.map((s) => s.name), grid, prompt: intro + common + `Scene: ${g[0].scene}` };
  }
  const shape = n === 3
    ? "a grid of 3 SEPARATE illustrations: the top row has two equal panels side by side and the bottom row has ONE panel spanning the full width"
    : `a ${grid} grid of ${n} SEPARATE illustrations (${cols} columns, ${rows} rows)`;
  intro =
    (gi === 0 ? `Create ONE single ${gemini ? "image, 4:3 aspect ratio" : "landscape image"}: ${shape} for a children's picture book, ` : `Great, the same again: ONE single ${gemini ? "image, 4:3 aspect ratio" : "landscape image"}, ${shape}, `) +
    `${gemini ? "all panels exactly the same size and perfectly aligned, " : ""}plain white gutters between and around the panels, no frames, no captions, no text, letters or numbers anywhere. ` +
    (gi === 0 ? `Style: ${style} ` : "Same style. ");
  return { names: g.map((s) => s.name), grid, prompt: intro + common + `Panels in reading order: ` + panels };
});
const json = JSON.stringify(result, null, 1);
if (out) writeFileSync(out, json); else console.log(json);
console.error(`${id}: ${scenes.length} pictures in ${result.length} grids; characters: ${chars.length}`);
