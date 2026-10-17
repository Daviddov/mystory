/**
 * Brings stories of the Sages from Ein Yaakov (the aggadah of the Babylonian
 * Talmud, collected by R. Yaakov ibn Habib) into scripts/originals/sources/ein-yaakov,
 * so the retellings in scripts/originals/chazal can be written from the source.
 * Texts come from the Sefaria API: the Hebrew/Aramaic "Daat" edition and
 * S.H. Glick's English (New York, 1916), both public domain.
 *
 *   npm run import:ein-yaakov                        fetch every passage in catalog.json not saved yet
 *   npm run import:ein-yaakov -- --force             fetch them all again
 *   npm run import:ein-yaakov -- --list Taanit       paragraph refs of a tractate, with their first words
 *   npm run import:ein-yaakov -- --find Taanit חרוב   paragraphs of a tractate containing a word (nikud ignored)
 *
 * A catalog entry is { slug, title, bavli, ref, glick? }: `ref` is "<Tractate> <chapter>:<paragraph>"
 * in Ein Yaakov, `glick` the same passage in "Ein Yaakov (Glick Edition)", whose paragraphs are
 * numbered differently (use --find with an English word and --glick to look it up).
 * Each passage is saved as <slug>.json. Retellings stay our own words; the source is for checking facts.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DIR = path.join(process.cwd(), "scripts", "originals", "sources", "ein-yaakov");
const API = "https://www.sefaria.org/api/v3/texts/";
const HEBREW_BOOK = "Ein Yaakov";
const GLICK_BOOK = "Ein Yaakov (Glick Edition)";

const CatalogSchema = z.array(
  z
    .object({
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      title: z.string().min(1),
      /** Where the story stands in the Talmud, e.g. "תענית כג ע״א". */
      bavli: z.string().min(1),
      ref: z.string().regex(/^[A-Za-z ]+ \d+:\d+(?:-\d+)?$/),
      glick: z.string().regex(/^[A-Za-z ]+ \d+:\d+(?:-\d+)?$/).optional(),
    })
    .strict(),
);
type CatalogEntry = z.infer<typeof CatalogSchema>[number];

interface Chapter {
  ref: string;
  paragraphs: string[];
  license: string;
  versionTitle: string;
  next: string | null;
}

export function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Removes nikud and cantillation, so a search ignores vowels. */
export function removeNikud(text: string): string {
  return text.replace(/[֑-ׇ]/g, "");
}

/** Sefaria drops a request now and then ("fetch failed", 429, 5xx): try a few times, slower each time. */
async function fetchWithRetry(url: string, attempts = 5): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) throw new Error(`${url}: HTTP ${response.status}`);
      if (attempt >= attempts) throw new Error(`${url}: HTTP ${response.status}`);
    } catch (err) {
      if (attempt >= attempts || (err instanceof Error && err.message.includes("HTTP 4"))) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}

async function fetchChapter(book: string, chapterRef: string, lang: "hebrew" | "english"): Promise<Chapter | null> {
  const url = `${API}${encodeURIComponent(`${book}, ${chapterRef}`)}?version=${lang}`;
  const response = await fetchWithRetry(url);
  const data = (await response.json()) as {
    ref?: string;
    next?: string | null;
    versions?: { text: unknown; license?: string; versionTitle?: string }[];
  };
  const version = data.versions?.[0];
  if (!version || !Array.isArray(version.text)) return null;
  return {
    ref: data.ref ?? chapterRef,
    paragraphs: (version.text as unknown[]).map((p) => (typeof p === "string" ? stripHtml(p) : "")),
    license: version.license ?? "unknown",
    versionTitle: version.versionTitle ?? "",
    next: data.next ?? null,
  };
}

/** "Taanit 3:19" or "Taanit 3:19-20" → the chapter "Taanit 3" and paragraph numbers (1-based). */
function splitRef(ref: string): { chapter: string; from: number; to: number } {
  const match = /^(.+ \d+):(\d+)(?:-(\d+))?$/.exec(ref);
  if (!match) throw new Error(`bad ref "${ref}"`);
  const from = Number(match[2]);
  return { chapter: match[1], from, to: match[3] ? Number(match[3]) : from };
}

async function fetchPassage(book: string, ref: string, lang: "hebrew" | "english") {
  const { chapter, from, to } = splitRef(ref);
  const found = await fetchChapter(book, chapter, lang);
  if (!found) throw new Error(`${book}, ${chapter}: no ${lang} text on Sefaria`);
  const paragraphs = found.paragraphs.slice(from - 1, to);
  if (paragraphs.length !== to - from + 1 || paragraphs.some((p) => p === "")) {
    throw new Error(`${book}, ${ref}: the chapter has only ${found.paragraphs.length} paragraphs`);
  }
  return { text: paragraphs.join("\n\n"), license: found.license, versionTitle: found.versionTitle };
}

/** Walks a tractate chapter by chapter until Sefaria's `next` leaves it. */
async function* tractate(book: string, name: string, lang: "hebrew" | "english") {
  let chapterRef: string | null = `${name} 1`;
  while (chapterRef) {
    const chapter = await fetchChapter(book, chapterRef, lang);
    if (!chapter) return;
    yield chapter;
    const next: string | null = chapter.next ? chapter.next.replace(`${book}, `, "") : null;
    chapterRef = next && next.startsWith(`${name} `) ? next.replace(/:\d+$/, "") : null;
  }
}

async function save(entry: CatalogEntry): Promise<void> {
  const hebrew = await fetchPassage(HEBREW_BOOK, entry.ref, "hebrew");
  const english = entry.glick ? await fetchPassage(GLICK_BOOK, entry.glick, "english") : null;
  const sefaria = (book: string, ref: string) => `https://www.sefaria.org/${encodeURIComponent(`${book}, ${ref}`).replace(/%20/g, "_")}`;
  const passage = {
    title: entry.title,
    bavli: `תלמוד בבלי, ${entry.bavli}`,
    einYaakov: { ref: `${HEBREW_BOOK}, ${entry.ref}`, url: sefaria(HEBREW_BOOK, entry.ref), version: hebrew.versionTitle, license: hebrew.license },
    hebrew: hebrew.text,
    hebrewPlain: removeNikud(hebrew.text),
    english: english
      ? { ref: `${GLICK_BOOK}, ${entry.glick}`, url: sefaria(GLICK_BOOK, entry.glick!), version: english.versionTitle, license: english.license, text: english.text }
      : null,
  };
  await writeFile(path.join(DIR, `${entry.slug}.json`), `${JSON.stringify(passage, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const english = args.includes("--glick");
  const rest = args.filter((arg) => arg !== "--glick");
  const book = english ? GLICK_BOOK : HEBREW_BOOK;
  const lang = english ? "english" : "hebrew";

  if (rest[0] === "--list" || rest[0] === "--find") {
    const [mode, name, ...words] = rest;
    if (!name) throw new Error(`${mode} needs a tractate name, e.g. Taanit`);
    const needle = removeNikud(words.join(" ")).toLowerCase();
    if (mode === "--find" && !needle) throw new Error("--find needs a word to look for");
    for await (const chapter of tractate(book, name, lang)) {
      chapter.paragraphs.forEach((paragraph, index) => {
        const plain = removeNikud(paragraph);
        if (mode === "--find" && !plain.toLowerCase().includes(needle)) return;
        console.log(`${chapter.ref.replace(`${book}, `, "")}:${index + 1}  ${plain.slice(0, 110).replace(/\s+/g, " ")}`);
      });
    }
    return;
  }

  const force = rest.includes("--force");
  for (const arg of rest) if (arg !== "--force") throw new Error(`unknown option ${arg}`);
  const catalog = CatalogSchema.parse(JSON.parse(await readFile(path.join(DIR, "catalog.json"), "utf8")));
  await mkdir(DIR, { recursive: true });
  let saved = 0;
  for (const entry of catalog) {
    const exists = await readFile(path.join(DIR, `${entry.slug}.json`)).then(() => true, () => false);
    if (exists && !force) continue;
    await save(entry);
    saved += 1;
    console.log(`saved ${entry.slug} (${entry.ref})`);
  }
  console.log(`${saved} saved, ${catalog.length - saved} already there`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
