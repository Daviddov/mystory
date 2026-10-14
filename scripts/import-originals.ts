/**
 * Creates the original stories written for the site as DRAFTS without pictures:
 * the weekly Torah portion (scripts/originals/parasha) and stories of the Sages
 * retold for children (scripts/originals/chazal). One JSON file per story.
 *
 *   npm run import:originals              create the stories that are not in the library yet
 *   npm run import:originals -- --force   also rewrite the ones already there (never a published one)
 *   npm run import:originals -- --check   only validate the files
 *
 * The book id is "<folder>-<file name>", e.g. "parasha-noach". Editors read the
 * drafts, add illustrations and publish them from the studio.
 *
 * Storage follows the site: Supabase when its env vars are set, otherwise the
 * local data directory (DATA_DIR or ./data).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { countWords, estimateReadingMinutes } from "../src/lib/hebrew";
import { BOOK_LIMITS } from "../src/lib/limits";
import { LocalRepository } from "../src/lib/repo/local";
import type { Repository } from "../src/lib/repo/types";
import { MAX_CATEGORIES, MAX_TAGS, MAX_THEMES } from "../src/lib/studio/shared";
import { CATEGORY_SLUGS, THEME_SLUGS } from "../src/lib/taxonomy";
import { SYSTEM_OWNER_ID } from "../src/lib/types";

const ROOT = path.join(process.cwd(), "scripts", "originals");
const FOLDERS = ["parasha", "chazal"] as const;

const AUTHOR = "מערכת הסיפור שלי";
const LICENSE = "CC BY 4.0";
const SOURCE = "סיפור מקורי שנכתב במיוחד לאתר, בעזרת בינה מלאכותית";

export const OriginalStorySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(10).max(2000),
    ageGroup: z.enum(["0-2", "3-5", "6-8"]),
    categories: z.array(z.string().refine((slug) => CATEGORY_SLUGS.includes(slug), "unknown category")).min(1).max(MAX_CATEGORIES),
    themes: z.array(z.string().refine((slug) => THEME_SLUGS.includes(slug), "unknown theme")).max(MAX_THEMES),
    tags: z.array(z.string().trim().min(1).max(40)).max(MAX_TAGS),
    discussionQuestions: z.array(z.string().trim().min(5).max(300)).min(2).max(6),
    /** Where the story comes from: "בראשית ו-ט" or "תלמוד בבלי, יומא לה ע\"ב". */
    basedOn: z.string().trim().min(2).max(200),
    pages: z.array(z.object({ text: z.string().trim().min(1).max(BOOK_LIMITS.pageTextChars) }).strict()).min(4).max(30),
  })
  .strict();
export type OriginalStory = z.infer<typeof OriginalStorySchema>;

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

async function openRepo(): Promise<{ repo: Repository; label: string }> {
  if (env("NEXT_PUBLIC_SUPABASE_URL") && env("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    const { createSupabaseRepository } = await import("../src/lib/repo/supabase");
    return { repo: await createSupabaseRepository(), label: `Supabase (${env("NEXT_PUBLIC_SUPABASE_URL")})` };
  }
  const dataDirOverride = env("DATA_DIR");
  const root = dataDirOverride ? path.resolve(dataDirOverride) : path.join(process.cwd(), "data");
  return { repo: new LocalRepository(root), label: root };
}

async function loadStories(): Promise<{ id: string; folder: string; story: OriginalStory }[]> {
  const stories: { id: string; folder: string; story: OriginalStory }[] = [];
  const problems: string[] = [];
  for (const folder of FOLDERS) {
    const files = (await readdir(path.join(ROOT, folder)).catch(() => [] as string[])).filter((file) => file.endsWith(".json")).sort();
    for (const file of files) {
      const name = file.replace(/\.json$/, "");
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
        problems.push(`${folder}/${file}: the file name must be a latin slug`);
        continue;
      }
      try {
        const parsed = OriginalStorySchema.safeParse(JSON.parse(await readFile(path.join(ROOT, folder, file), "utf8")));
        if (!parsed.success) problems.push(`${folder}/${file}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
        else stories.push({ id: `${folder}-${name}`, folder, story: parsed.data });
      } catch (err) {
        problems.push(`${folder}/${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  if (problems.length > 0) throw new Error(`invalid story files:\n  ${problems.join("\n  ")}`);
  return stories;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const check = args.includes("--check");
  for (const arg of args) if (!["--force", "--check"].includes(arg)) throw new Error(`unknown option ${arg}`);

  const stories = await loadStories();
  for (const folder of FOLDERS) {
    const mine = stories.filter((entry) => entry.folder === folder);
    const words = mine.map((entry) => entry.story.pages.reduce((sum, page) => sum + countWords(page.text), 0));
    console.log(`${folder}: ${mine.length} stories${words.length > 0 ? `, ${Math.min(...words)}-${Math.max(...words)} words each` : ""}`);
  }
  if (check) return;

  const { repo, label } = await openRepo();
  console.log(`storage: ${label}`);
  let created = 0;
  let replaced = 0;
  let skipped = 0;
  for (const { id, story } of stories) {
    const existing = await repo.getBookById(id);
    if (existing && (!force || existing.status !== "draft")) {
      skipped += 1;
      continue;
    }
    if (existing) await repo.deleteBook(id);
    await repo.createBook({
      id,
      ownerId: SYSTEM_OWNER_ID,
      status: "draft",
      origin: "manual",
      title: story.title,
      summary: story.summary,
      author: AUTHOR,
      illustrator: "",
      license: LICENSE,
      source: `${SOURCE}. מבוסס על ${story.basedOn}`,
      ageGroup: story.ageGroup,
      language: "he",
      categories: story.categories,
      themes: story.themes,
      tags: story.tags,
      discussionQuestions: story.discussionQuestions,
      coverImage: "",
      readingMinutes: estimateReadingMinutes(story.pages.map((page) => page.text)),
      pages: story.pages.map((page, index) => ({ index, text: page.text })),
    });
    if (existing) replaced += 1;
    else created += 1;
  }
  console.log(`${created} created, ${replaced} replaced, ${skipped} already in the library`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
