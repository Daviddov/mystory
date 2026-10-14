/**
 * Image prompts for the original stories (scripts/originals), ready to send to an
 * image model such as Gemini.
 *
 *   npm run illustration-prompts            validate and write the prompts
 *   npm run illustration-prompts -- --check only validate
 *
 * The art direction of a story lives in scripts/originals/illustrations/<folder>/<name>.json,
 * next to the story scripts/originals/<folder>/<name>.json: its characters and one scene
 * per page. The series style and rules are in illustrations/style.json. Every prompt
 * written to illustrations/prompts/<folder>-<name>.md is self-contained (style, rules,
 * scene and the full description of each character in it), so the pages can be sent
 * one by one and still look alike. Send the character sheet first when the model
 * keeps a conversation.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const ROOT = path.join(process.cwd(), "scripts", "originals");
const ART = path.join(ROOT, "illustrations");
const OUT = path.join(ART, "prompts");
const FOLDERS = ["parasha", "chazal"] as const;

const StyleSchema = z.object({
  aspectRatio: z.string(),
  styles: z.record(z.string(), z.string()),
  rules: z.array(z.string()),
});

const SceneSchema = z
  .object({
    /** The scene in English: who does what, where, the mood and the light. */
    prompt: z.string().trim().min(40).max(1200),
    /** Names from `characters` who appear in the picture. */
    characters: z.array(z.string()).max(8),
  })
  .strict();

const ArtSchema = z
  .object({
    style: z.enum(["biblical", "sages", "modern"]),
    characters: z
      .array(z.object({ name: z.string().trim().min(1).max(60), description: z.string().trim().min(30).max(600) }).strict())
      .min(1)
      .max(12),
    cover: SceneSchema,
    pages: z.array(SceneSchema),
  })
  .strict();
type Art = z.infer<typeof ArtSchema>;

function scenePrompt(art: Art, scene: z.infer<typeof SceneSchema>, style: z.infer<typeof StyleSchema>, what: string): string {
  const cast = scene.characters.map((name) => {
    const character = art.characters.find((entry) => entry.name === name);
    return `- ${name}: ${character?.description}`;
  });
  return [
    `${what}. ${style.styles[art.style]}`,
    `Format: ${style.aspectRatio}.`,
    "",
    `Scene: ${scene.prompt}`,
    ...(cast.length > 0 ? ["", "Characters in this picture (keep exactly this look):", ...cast] : []),
    "",
    `Rules: ${style.rules.join(" ")}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const style = StyleSchema.parse(JSON.parse(await readFile(path.join(ART, "style.json"), "utf8")));
  const problems: string[] = [];
  const done: { id: string; markdown: string; pages: number }[] = [];
  const missing: string[] = [];

  for (const folder of FOLDERS) {
    const stories = (await readdir(path.join(ROOT, folder))).filter((file) => file.endsWith(".json")).sort();
    for (const file of stories) {
      const id = `${folder}-${file.replace(/\.json$/, "")}`;
      const story = JSON.parse(await readFile(path.join(ROOT, folder, file), "utf8")) as { title: string; pages: { text: string }[] };
      let raw: string;
      try {
        raw = await readFile(path.join(ART, folder, file), "utf8");
      } catch {
        missing.push(id);
        continue;
      }
      const parsed = ArtSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        problems.push(`${id}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
        continue;
      }
      const art = parsed.data;
      if (art.pages.length !== story.pages.length) problems.push(`${id}: ${art.pages.length} scenes for ${story.pages.length} pages`);
      const names = new Set(art.characters.map((character) => character.name));
      for (const [i, scene] of [art.cover, ...art.pages].entries()) {
        for (const name of scene.characters) if (!names.has(name)) problems.push(`${id}: ${i === 0 ? "cover" : `page ${i}`} names unknown character "${name}"`);
      }

      const sections = [
        `# ${story.title}`,
        `Book: ${id} · ${story.pages.length} pages · style: ${art.style}`,
        "",
        "## Character sheet (send first)",
        "",
        "```text",
        [
          `Character reference sheet for a children's picture book. ${style.styles[art.style]}`,
          "Show each character full-body from the front and in three-quarter view, on a plain light background, side by side, no text or labels.",
          "",
          ...art.characters.map((character) => `- ${character.name}: ${character.description}`),
          "",
          `Rules: ${style.rules.join(" ")}`,
        ].join("\n"),
        "```",
        "",
        "## Cover",
        "",
        "```text",
        scenePrompt(art, art.cover, style, "Cover illustration of a children's picture book (no title or text)"),
        "```",
        ...art.pages.flatMap((scene, i) => [
          "",
          `## Page ${i + 1}`,
          "",
          `> ${(story.pages[i]?.text ?? "").replace(/\n/g, " ")}`,
          "",
          "```text",
          scenePrompt(art, scene, style, `Illustration for page ${i + 1} of a children's picture book`),
          "```",
        ]),
        "",
      ];
      done.push({ id, markdown: sections.join("\n"), pages: art.pages.length });
    }
  }

  if (problems.length > 0) {
    console.error(`invalid illustration files:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${done.length} stories with art direction (${done.reduce((sum, entry) => sum + entry.pages + 1, 0)} pictures), ${missing.length} without`);
  if (check) return;
  await mkdir(OUT, { recursive: true });
  for (const entry of done) await writeFile(path.join(OUT, `${entry.id}.md`), entry.markdown, "utf8");
  console.log(`prompts written to ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
