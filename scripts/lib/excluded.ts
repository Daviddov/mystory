/**
 * Books a content review removed from the library, which an import of a whole
 * catalogue (--all) must not bring back. scripts/import-excluded.json maps the
 * book id to { title, reason, removed }. StoryWeaver keeps its own list in
 * scripts/storyweaver-excluded.json. Naming a book explicitly still imports it.
 */
import fs from "node:fs";
import path from "node:path";

export const EXCLUDED_FILE = path.join(__dirname, "..", "import-excluded.json");

export function excludedBookIds(): Set<string> {
  if (!fs.existsSync(EXCLUDED_FILE)) return new Set();
  return new Set(Object.keys(JSON.parse(fs.readFileSync(EXCLUDED_FILE, "utf8")) as Record<string, unknown>));
}

/** Leaves out the excluded books and says how many, when there are any. */
export function withoutExcluded<T>(targets: T[], bookId: (target: T) => string): T[] {
  const excluded = excludedBookIds();
  const kept = targets.filter((target) => !excluded.has(bookId(target)));
  if (kept.length < targets.length) {
    console.log(`excluded: ${targets.length - kept.length} removed after a content review (${path.relative(process.cwd(), EXCLUDED_FILE)})`);
  }
  return kept;
}
