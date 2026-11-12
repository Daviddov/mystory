/**
 * "Add a language" to a book: a second (or third) language version that lives
 * next to the book's own text, with its own narration. The book's own language,
 * its nikud and its narration are never touched.
 *
 *   translateToLanguage()  one AI call for the whole book -> title, summary and
 *                          one text per page, stored in Book.translation /
 *                          Book.extraTranslations and Page.translation /
 *                          Page.extraTranslations (see withBookVersion in types.ts).
 *   saveVersionText()      the same, from texts a person typed.
 *   narrateVersionPage()   narrates one page of a version with the TTS provider.
 *   removeVersion()        drops a version and its narration files.
 *
 * Like ./index.ts nothing here is "server-only" and the providers are passed in,
 * so the functions are unit tested. Callers authorise.
 */
import { createHash } from "node:crypto";
import type { TextProvider, TtsProvider } from "../ai/types";
import { withBookLock } from "../book-lock";
import { LANGUAGE_NAMES_EN, MACHINE_TRANSLATOR_CREDIT } from "../credits";
import { splitWords } from "../hebrew";
import type { MediaStore } from "../media/types";
import { bookMediaPath, bookMediaPrefix, extensionForContentType } from "../media/url";
import { isAllowedNarrationVoice } from "../narration/voices";
import { NotFoundError, type Repository } from "../repo/types";
import {
  bookLanguage,
  bookVersions,
  pageVersion,
  withBookVersion,
  withPageVersion,
  type AgeGroup,
  type BookLanguage,
  type BookTranslation,
  type BookWithPages,
  type Page,
  type PageTranslation,
} from "../types";
import { MAX_TRANSLATOR_NAME, TranslationError, TranslationOutputSchema, type TranslationOutput } from "./index";
import { getCcLicense } from "../importers/cc";

const SCRIPT: Record<BookLanguage, RegExp> = {
  he: /[א-ת]/,
  ar: /[؀-ۿ]/,
  en: /[A-Za-z]{2,}/,
};

const AGE_HINTS: Record<AgeGroup, string> = {
  "0-2": "babies and toddlers up to 2",
  "3-5": "children aged 3 to 5",
  "6-8": "children aged 6 to 8 who are starting to read by themselves",
};

export function versionSystemPrompt(from: BookLanguage, to: BookLanguage): string {
  const rtl = to === "he" || to === "ar";
  return `You translate picture books for small children from ${LANGUAGE_NAMES_EN[from]} into ${LANGUAGE_NAMES_EN[to]}. The translation will be read aloud by a parent at bedtime and shown under each illustration, so it has to sound like a book that was written in ${LANGUAGE_NAMES_EN[to]}, not like a translation.

You receive the whole book at once: the title, a short blurb and every page with its text. Translating it as a whole matters, because the same choices have to hold from the first page to the last.

How the ${LANGUAGE_NAMES_EN[to]} should read:
- Natural, warm, spoken language, the way a parent talks to a small child: short sentences and everyday words.${to === "he" ? " Write Hebrew without nikud." : ""}${to === "ar" ? " Write Arabic in simple Modern Standard Arabic that children understand, without diacritics unless needed to avoid ambiguity." : ""}
- Where the source rhymes or has a clear beat, the translation rhymes and has a beat too (rhythm matters more to a listening child than word-for-word accuracy), as long as the page still says the same thing. Where the source does not rhyme, do not add rhyme.
- A refrain or repeated line is translated once and repeated with the exact same wording every time.
- Names: decide once per character whether the name stays as it is (written in the script of ${LANGUAGE_NAMES_EN[to]}) or is lightly adapted, and keep that form on every page, in the title and in the blurb.
- Keep each character's grammatical gender consistent with the source.${rtl ? " Use the punctuation habits of the language." : ""}

Page structure is fixed, because every text is shown with one specific illustration:
- Return exactly one text for each page you were given, with the same page number, in the same order. Never merge, split, drop or move text between pages.
- Keep the line breaks of the source: each line of the page text is a separate line of the translation.

Also return "title" (the translated title, consistent with the names used in the text) and "summary" (one or two sentences for parents about what the book is about, without giving away the ending; based on the blurb when there is one).

Return only the structured result. Put nothing in the texts except the story itself: no notes, no alternatives, no transliteration, no page numbers.`;
}

export interface VersionSource {
  language: BookLanguage;
  title: string;
  summary: string;
  pages: { pageIndex: number; text: string }[];
}

/** The text that gets translated: the book's own language, pages without text are left out. */
export function versionSource(book: BookWithPages): VersionSource | null {
  const pages = book.pages
    .map((page, pageIndex) => ({ pageIndex, text: page.text.trim() }))
    .filter((page) => page.text.length > 0);
  if (pages.length === 0) return null;
  return { language: bookLanguage(book), title: book.title, summary: book.summary, pages };
}

export function versionUserPrompt(book: Pick<BookWithPages, "ageGroup">, source: VersionSource, to: BookLanguage): string {
  const payload = {
    title: source.title,
    blurb: source.summary || null,
    readers: AGE_HINTS[book.ageGroup],
    pageCount: source.pages.length,
    pages: source.pages.map((page, i) => ({ page: i + 1, text: page.text })),
  };
  return `Here is the book to translate into ${LANGUAGE_NAMES_EN[to]}. It has ${source.pages.length} pages; return exactly ${source.pages.length} page texts, numbered 1 to ${source.pages.length}.

<book>
${JSON.stringify(payload, null, 2)}
</book>`;
}

export function versionProblem(output: TranslationOutput, source: VersionSource, to: BookLanguage): string | null {
  const expected = source.pages.length;
  const script = SCRIPT[to];
  if (output.pages.length !== expected) return `You returned ${output.pages.length} page texts, but the book has exactly ${expected} pages.`;
  for (const [i, page] of output.pages.entries()) {
    if (page.page !== i + 1) return `Page texts must be numbered 1 to ${expected} in order; position ${i + 1} is numbered ${page.page}.`;
    if (page.text.trim() === "") return `The text of page ${i + 1} is empty.`;
    if (!script.test(page.text)) return `The text of page ${i + 1} is not in ${LANGUAGE_NAMES_EN[to]}.`;
  }
  if (!script.test(output.title)) return `The title is missing or not in ${LANGUAGE_NAMES_EN[to]}.`;
  return null;
}

export interface VersionDeps {
  repo: Repository;
  media?: Pick<MediaStore, "delete">;
}

export type AddVersionResult =
  | { status: "translated"; book: BookWithPages; isMock: false; language: BookLanguage; attempts: number; costUsd?: number }
  | { status: "mock"; book: BookWithPages; isMock: true; language: BookLanguage };

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function cleanTranslator(name: string | undefined): string {
  return (name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TRANSLATOR_NAME);
}

async function mustLoad(repo: Repository, bookId: string): Promise<BookWithPages> {
  const book = await repo.getBookById(bookId);
  if (!book) throw new NotFoundError(`book ${bookId}`);
  return book;
}

function assertTarget(book: BookWithPages, language: BookLanguage): void {
  if (language === bookLanguage(book)) {
    throw new TranslationError("already-hebrew", "הספר כבר כתוב בשפה הזאת. בחרו שפה אחרת.");
  }
  if (getCcLicense(book.license.trim())?.allowsAdaptation === false) {
    throw new TranslationError(
      "license-forbids",
      `הרישיון של הספר (${book.license.trim()}) אוסר יצירות נגזרות, ותרגום הוא יצירה נגזרת. אי אפשר לתרגם את הספר הזה.`,
    );
  }
}

/** Stores texts as the version in `language`. A page whose text did not change keeps its narration. */
async function storeVersion(
  deps: VersionDeps,
  bookId: string,
  language: BookLanguage,
  texts: { title: string; summary?: string; pages: Map<number, string>; translator: string },
  guard?: (fresh: BookWithPages) => void,
): Promise<BookWithPages> {
  const dropped: string[] = [];
  const saved = await withBookLock(bookId, async () => {
    const fresh = await mustLoad(deps.repo, bookId);
    guard?.(fresh);
    const old = bookVersions(fresh).find((v) => v.language === language);
    const version: BookTranslation = {
      ...old,
      language,
      title: texts.title.slice(0, 200),
      ...(texts.summary ? { summary: texts.summary.slice(0, 2000) } : {}),
      translator: texts.translator,
    };
    const versions = withBookVersion(fresh, version);
    const pages: Page[] = fresh.pages.map((page, i) => {
      const text = texts.pages.get(i);
      const before = pageVersion(versions, page, language);
      if (text === undefined || text === "") {
        if (before?.audio) dropped.push(before.audio);
        return withPageVersion(versions, page, language, undefined);
      }
      if (before && before.text === text) return page;
      if (before?.audio) dropped.push(before.audio);
      return withPageVersion(versions, page, language, { text });
    });
    await deps.repo.replacePages(bookId, pages);
    const updated = await deps.repo.updateBook(bookId, versions);
    return { ...updated, pages: pages.map((page, index) => ({ ...page, index })) } satisfies BookWithPages;
  });
  if (deps.media) {
    for (const path of dropped) await deps.media.delete(path).catch((err: unknown) => console.warn("[versions] old narration not deleted", path, err));
  }
  return saved;
}

/** Translates the whole book into `language` with the text provider and stores it as a version. */
export async function translateToLanguage(
  deps: VersionDeps & { text: TextProvider },
  bookId: string,
  language: BookLanguage,
  options: { translator?: string } = {},
): Promise<AddVersionResult> {
  const book = await mustLoad(deps.repo, bookId);
  assertTarget(book, language);
  const source = versionSource(book);
  if (!source) throw new TranslationError("nothing-to-translate", "אין בספר טקסט שאפשר לתרגם.");
  if (deps.text.isMock) return { status: "mock", book, isMock: true, language };

  const system = versionSystemPrompt(source.language, language);
  const basePrompt = versionUserPrompt(book, source, language);
  const sourceChars = source.pages.reduce((sum, page) => sum + page.text.length, 0);
  const maxTokens = Math.min(32000, Math.max(8000, Math.ceil(sourceChars * 1.5) + 4000));

  let output: TranslationOutput | null = null;
  let problem: string | null = null;
  let attempts = 0;
  let costUsd: number | undefined;
  while (attempts < 2 && output === null) {
    attempts += 1;
    const prompt =
      problem === null
        ? basePrompt
        : `${basePrompt}\n\nYour previous answer could not be used: ${problem} Translate the book again and return exactly ${source.pages.length} page texts, numbered 1 to ${source.pages.length}.`;
    let result;
    try {
      result = await deps.text.generate({ system, prompt, schema: TranslationOutputSchema, schemaName: "book_version", maxTokens });
    } catch (err) {
      throw new TranslationError(
        "provider",
        "שירות התרגום לא הצליח לתרגם את הספר. הספר לא השתנה. נסו שוב בעוד רגע.",
        undefined,
        err instanceof Error ? err.message : String(err),
      );
    }
    if (result.isMock) return { status: "mock", book, isMock: true, language };
    if (result.usage?.costUsd !== undefined) costUsd = (costUsd ?? 0) + result.usage.costUsd;
    problem = versionProblem(result.data, source, language);
    if (problem === null) output = result.data;
  }
  if (output === null) {
    throw new TranslationError(
      "page-mismatch",
      "התרגום שהתקבל לא תאם את עמודי הספר, גם בניסיון שני. הספר לא השתנה. נסו שוב.",
      undefined,
      problem ?? undefined,
    );
  }
  const translated = output;
  const pages = new Map(source.pages.map((page, i) => [page.pageIndex, normalizeText(translated.pages[i].text)]));
  const saved = await storeVersion(
    deps,
    bookId,
    language,
    {
      title: normalizeText(translated.title).replace(/\n/g, " "),
      summary: normalizeText(translated.summary).replace(/\n/g, " "),
      pages,
      translator: cleanTranslator(options.translator) || MACHINE_TRANSLATOR_CREDIT,
    },
    (fresh) => {
      const freshSource = versionSource(fresh);
      if (!freshSource || JSON.stringify(freshSource.pages) !== JSON.stringify(source.pages)) {
        throw new TranslationError("changed-meanwhile", "הספר השתנה בזמן התרגום, ולכן התרגום לא נשמר. נסו לתרגם שוב.");
      }
    },
  );
  if (costUsd !== undefined) {
    await deps.repo.updateBook(bookId, { costUsd: (saved.costUsd ?? 0) + costUsd }).catch(() => undefined);
  }
  return { status: "translated", book: saved, isMock: false, language, attempts, ...(costUsd !== undefined ? { costUsd } : {}) };
}

/** Saves texts a person typed (one per page, "" for none) as the version in `language`. */
export async function saveVersionText(
  deps: VersionDeps,
  bookId: string,
  language: BookLanguage,
  input: { title: string; summary?: string; pages: string[]; translator?: string },
): Promise<BookWithPages> {
  const book = await mustLoad(deps.repo, bookId);
  assertTarget(book, language);
  if (input.pages.length !== book.pages.length) {
    throw new TranslationError("page-mismatch", `צריך טקסט אחד לכל עמוד (${book.pages.length}), התקבלו ${input.pages.length}.`);
  }
  const script = SCRIPT[language];
  const bad = input.pages.flatMap((text, i) => (text.trim() && !script.test(text) ? [i] : []));
  if (bad.length > 0) {
    throw new TranslationError("not-hebrew", `עמוד ${bad.map((i) => i + 1).join(", ")} לא כתוב בשפה שנבחרה.`, bad);
  }
  if (!script.test(input.title)) throw new TranslationError("not-hebrew", "שם הספר לא כתוב בשפה שנבחרה.");
  return storeVersion(deps, bookId, language, {
    title: normalizeText(input.title).replace(/\n/g, " "),
    summary: normalizeText(input.summary ?? "").replace(/\n/g, " "),
    pages: new Map(input.pages.map((text, i) => [i, normalizeText(text)])),
    translator: cleanTranslator(input.translator),
  });
}

/** Removes the version in `language`, with its narration files. */
export async function removeVersion(deps: VersionDeps, bookId: string, language: BookLanguage): Promise<BookWithPages> {
  const dropped: string[] = [];
  const saved = await withBookLock(bookId, async () => {
    const fresh = await mustLoad(deps.repo, bookId);
    if (!bookVersions(fresh).some((v) => v.language === language)) return fresh;
    const remaining = bookVersions(fresh).filter((v) => v.language !== language);
    // The slots are rebuilt: the first remaining version takes Book.translation, so its pages move too.
    const [first, ...rest] = remaining;
    const rebuilt = fresh.pages.map((page) => {
      const audio = pageVersion(fresh, page, language)?.audio;
      if (audio) dropped.push(audio);
      const { translation: _t, extraTranslations: _e, ...bare } = page;
      let next: Page = bare;
      for (const v of remaining) {
        const mine = pageVersion(fresh, page, v.language);
        if (mine) next = withPageVersion({ translation: first }, next, v.language, mine);
      }
      return next;
    });
    await deps.repo.replacePages(bookId, rebuilt);
    const updated = await deps.repo.updateBook(bookId, {
      translation: first,
      extraTranslations: rest.length > 0 ? rest : undefined,
    });
    return { ...updated, pages: rebuilt.map((page, index) => ({ ...page, index })) } satisfies BookWithPages;
  });
  if (deps.media) {
    for (const path of dropped) {
      if (path.startsWith(`${bookMediaPrefix(bookId)}/`)) await deps.media.delete(path).catch(() => undefined);
    }
  }
  return saved;
}

export interface NarrateVersionResult {
  status: "narrated" | "skipped" | "stale";
  isMock: boolean;
  book: BookWithPages;
  audio?: string;
  durationSeconds?: number;
}

/** Narrates one page (zero-based) of the version in `language`. Skipped when it already has real narration. */
export async function narrateVersionPage(
  deps: { repo: Repository; media: MediaStore; tts: TtsProvider },
  bookId: string,
  language: BookLanguage,
  pageIndex: number,
  options: { voice?: string; style?: string; force?: boolean } = {},
): Promise<NarrateVersionResult> {
  const book = await mustLoad(deps.repo, bookId);
  const page = book.pages[pageIndex];
  if (!page) throw new NotFoundError(`page ${pageIndex} of book ${bookId}`);
  const version = pageVersion(book, page, language);
  if (!version?.text) return { status: "skipped", isMock: deps.tts.isMock, book };
  const demo = version.audioSource === "mock";
  if (version.audio && !options.force && !(demo && !deps.tts.isMock)) return { status: "skipped", isMock: deps.tts.isMock, book };
  if (version.audio && version.audioSource === "recorded" && !options.force) return { status: "skipped", isMock: deps.tts.isMock, book };

  const heroVoice = book.hero?.narrationVoice;
  const voice = options.voice ?? (heroVoice && isAllowedNarrationVoice(heroVoice) ? heroVoice : undefined);
  const style = options.style ?? book.hero?.narrationStyle;
  const speech = await deps.tts.synthesize(version.text, {
    ...(voice ? { voice } : {}),
    ...(style ? { style } : {}),
    ...(book.hero?.narrationNotes ? { notes: book.hero.narrationNotes } : {}),
  });
  const words = splitWords(version.text);
  if (speech.wordTimings.length !== words.length) {
    throw new Error(`TTS provider "${deps.tts.name}" returned ${speech.wordTimings.length} word timings for ${words.length} words`);
  }
  if (speech.audio.byteLength === 0) throw new Error(`TTS provider "${deps.tts.name}" returned empty audio`);
  const hash = createHash("sha256").update(speech.audio).digest("hex").slice(0, 10);
  const name = `narration-${language}-${String(pageIndex + 1).padStart(2, "0")}-${hash}.${extensionForContentType(speech.contentType)}`;
  const audioPath = bookMediaPath(bookId, name);
  await deps.media.put(audioPath, speech.audio, speech.contentType);
  const next: PageTranslation = {
    text: version.text,
    audio: audioPath,
    wordTimings: speech.wordTimings.map((t, i) => ({ word: words[i], start: t.start, end: Math.max(t.start, t.end) })),
    audioSource: speech.isMock ? "mock" : "tts",
  };

  return withBookLock(bookId, async (): Promise<NarrateVersionResult> => {
    const fresh = await mustLoad(deps.repo, bookId);
    const current = fresh.pages[pageIndex];
    if (!current || pageVersion(fresh, current, language)?.text !== version.text) {
      await deps.media.delete(audioPath).catch(() => undefined);
      return { status: "stale", isMock: speech.isMock, book: fresh };
    }
    const pages = fresh.pages.map((p, i) => (i === pageIndex ? withPageVersion(fresh, p, language, next) : p));
    const saved = await deps.repo.replacePages(bookId, pages);
    if (version.audio && version.audio !== audioPath) await deps.media.delete(version.audio).catch(() => undefined);
    return { status: "narrated", isMock: speech.isMock, book: saved, audio: audioPath, durationSeconds: speech.durationSeconds };
  });
}
