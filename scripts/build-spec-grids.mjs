// Usage: node scripts/build-spec-grids.mjs <spec.json> [out.json] [--size=9|4]
// Same output as build-grid-prompts.mjs ([{names, grid, prompt}]) but for a picture-book spec
// (.claude/skills/ai-picture-book/references/spec-example.json): cover + pages, nine panels per
// sheet by default (ChatGPT, ElevenLabs), --size=4 for 2x2 sheets (Gemini, AI Studio).
import { readFileSync, writeFileSync } from "node:fs";
const [specPath, out] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SIZE = Number((process.argv.find((a) => a.startsWith("--size=")) ?? "--size=9").slice(7));
const spec = JSON.parse(readFileSync(specPath, "utf8"));
// House rule (user, 2026-10-17): in every Jewish story each man and boy always has his head covered.
const HEAD_RULE =
  "HEAD COVERING RULE for every panel: every man and every boy (including sons, servants, neighbors and children) " +
  "ALWAYS has his head covered, never bare: a kippah (skullcap), a hat or cap, or a tallit over the head. " +
  "This overrides any mention of hair in a character description (the hair may show beneath the covering). " +
  "Women and girls keep their head scarves or coverings as described. ";
const style = spec.style;
const common = HEAD_RULE + "Keep every character exactly the same in every panel where they appear: " + spec.characters.map((c) => c.replace(/\.$/, "")).join("; ") + ". ";
const scenes = [
  { name: "cover", scene: spec.coverScene },
  ...spec.pages.map((p, i) => ({ name: `page-${String(i + 1).padStart(2, "0")}`, scene: p.scene })),
];
const groups = [];
for (let i = 0; i < scenes.length; i += SIZE) groups.push(scenes.slice(i, i + SIZE));
// Avoid a lonely last panel: merge a 1-picture tail into the previous group's overflow by shifting one picture.
if (!process.env.KEEP_LONE && groups.length > 1 && groups.at(-1).length === 1) groups.at(-1).unshift(groups.at(-2).pop());
// A 3-picture tail would be drawn as 2 + one wide panel (hard to cut to 4:3): add a spare 4th panel instead (name _extra, ignored on import).
if (groups.at(-1).length === 3) groups.at(-1).push({ name: "_extra", scene: groups.at(-1)[2].scene + " (a second take of this same scene from a slightly different angle)" });
const gemini = SIZE <= 4;
const result = groups.map((g, gi) => {
  const n = g.length;
  const cols = n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const grid = n === 1 ? "1x1" : `${cols}x${rows}`;
  const panels = g.map((s, i) => `${i + 1} ${s.name === "cover" ? "BOOK COVER: " : ""}${s.scene}`).join(" ");
  if (n === 1) {
    const intro = `${gi === 0 ? "Create an image" : "Great, one more picture, same style"}: ONE single picture for a children's picture book, landscape 4:3, no text, letters or numbers anywhere. ` + (gi === 0 ? `Style: ${style} ` : "Same style. ");
    return { names: g.map((s) => s.name), grid, prompt: intro + common + `Scene: ${g[0].scene}` };
  }
  const shape = n === 3
    ? "a grid of 3 SEPARATE illustrations: the top row has two equal panels side by side and the bottom row has ONE panel spanning the full width"
    : `a ${grid} grid of ${n} SEPARATE illustrations (${cols} columns, ${rows} rows)`;
  const intro =
    (gi === 0 ? `Create ONE single ${gemini ? "image, 4:3 aspect ratio" : "landscape image"}: ${shape} for a children's picture book, ` : `Great, the same again: ONE single ${gemini ? "image, 4:3 aspect ratio" : "landscape image"}, ${shape}, `) +
    `${gemini ? "all panels exactly the same size and perfectly aligned, " : ""}plain white gutters between and around the panels, no frames, no captions, no text, letters or numbers anywhere. ` +
    (gi === 0 ? `Style: ${style} ` : "Same style. ");
  return { names: g.map((s) => s.name), grid, prompt: intro + common + "Panels in reading order: " + panels };
});
const json = JSON.stringify(result, null, 1);
if (out) writeFileSync(out, json); else console.log(json);
console.error(`${spec.id}: ${scenes.length} pictures in ${result.length} grids`);
