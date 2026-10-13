/**
 * Translation of an imported book into Hebrew.
 *
 * translateBook() sends the WHOLE book to the text provider in ONE call, so
 * rhyme, repeated refrains and names come out consistent across pages, and
 * asks for a structured answer: a Hebrew title, a summary and exactly one text
 * per page. The page count is validated; a wrong answer is retried once and
 * then refused. Nothing is stored unless the answer is complete.
 *
 * Without a real text provider nothing is translated and nothing is stored:
 * the result says `status: "mock"` and the UI shows a MockNotice. A mock never
 * writes placeholder Hebrew into a book.
 *
 * acceptManualTranslation() is the path without AI: a person typed the Hebrew
 * next to the original, and marks the book as translated.
 *
 * Callers authorise (see /api/studio/books/[id]/translate). No "server-only"
 * import, and the providers are passed in, so the functions are unit tested.
 */
import { z } from "zod";
import type { TextProvider } from "../ai/types";
import { withBookLock } from "../book-lock";
import { adaptationLine, LANGUAGE_NAMES_EN, MACHINE_TRANSLATOR_CREDIT } from "../credits";
import { estimateReadingMinutes } from "../hebrew";
import { getCcLicense } from "../importers/cc";
import type { MediaStore } from "../media/types";
import { bookMediaPrefix } from "../media/url";
import { NotFoundError, type Repository } from "../repo/types";
import { bookLanguage, type AgeGroup, type BookCredits, type BookLanguage, type BookWithPages, type Page } from "../types";

export const MAX_TRANSLATOR_NAME = 200;

const HEBREW_LETTER = /[א-ת]/;
const LATIN_WORD = /[A-Za-z]{2,}/g;

export function hasHebrewLetters(text: string): boolean {
  return HEBREW_LETTER.test(text);
}

export type TranslationErrorCode =
  | "nothing-to-translate"
  | "already-hebrew"
  | "page-mismatch"
  | "not-hebrew"
  | "translator-required"
  | "changed-meanwhile"
  | "license-forbids"
  | "provider";

/** A refused or failed translation. `message` is Hebrew and safe to show the user. */
export class TranslationError extends Error {
  constructor(
    readonly code: TranslationErrorCode,
    message: string,
    /** Zero-based pages the problem is about, when it is about pages. */
    readonly pageIndexes?: number[],
    /** Technical detail for the server log (never shown). */
    readonly detail?: string,
  ) {
    super(message);
    this.name = "TranslationError";
  }
}

// ---------------------------------------------------------------------------
// What gets translated
// ---------------------------------------------------------------------------

export interface TranslationSource {
  language: BookLanguage;
  title: string;
  summary: string;
  /** Only pages that have text in the original language; `pageIndex` points into book.pages. */
  pages: { pageIndex: number; text: string; imageAlt?: string }[];
}

/**
 * The original-language text of a book, or null when there is nothing to
 * translate. For a book that was already translated the stored originalText
 * is used, so translating again starts from the source, not from the Hebrew.
 */
export function translationSource(book: BookWithPages): TranslationSource | null {
  const language = bookLanguage(book);
  const original = book.originalLanguage ?? (language !== "he" ? language : undefined);
  if (!original || original === "he") return null;
  const untranslated = language === original;
  const pages = book.pages
    .map((page, pageIndex) => ({
      pageIndex,
      text: (page.originalText ?? (untranslated ? page.text : "")).trim(),
      ...(page.imageAlt ? { imageAlt: page.imageAlt } : {}),
    }))
    .filter((page) => page.text.length > 0);
  if (pages.length === 0) return null;
  return {
    language: original,
    title: untranslated ? book.title : (book.credits?.originalTitle ?? book.title),
    summary: untranslated ? book.summary : "",
    pages,
  };
}

/** True when the studio should offer translation tools for this book. */
export function isTranslatable(book: Pick<BookWithPages, "originalLanguage" | "language">): boolean {
  const original = book.originalLanguage ?? bookLanguage(book);
  return original !== "he";
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const TranslationOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  pages: z.array(
    z.object({
      /** The page number from the request, 1-based. */
      page: z.number().int(),
      text: z.string(),
    }),
  ),
});
export type TranslationOutput = z.infer<typeof TranslationOutputSchema>;

const AGE_HINTS: Record<AgeGroup, string> = {
  "0-2": "babies and toddlers up to 2",
  "3-5": "children aged 3 to 5",
  "6-8": "children aged 6 to 8 who are starting to read by themselves",
};

export function translationSystemPrompt(sourceLanguage: BookLanguage): string {
  return `You translate picture books for small children from ${LANGUAGE_NAMES_EN[sourceLanguage]} into Hebrew. The translation will be read aloud by a parent at bedtime and shown under each illustration in a children's reading app, so it has to sound like a book that was written in Hebrew, not like a translation.

You receive the whole book at once: the title, a short blurb, and every page with its text and a description of its illustration. Translating the book as a whole matters, because the same choices have to hold from the first page to the last.

How the Hebrew should read:
- Natural, warm, spoken modern Hebrew, the way an Israeli parent talks to a small child. Short sentences and everyday words. Prefer the word a child knows over the dictionary-correct one. Avoid constructions that only exist because the source language has them.
- Write without nikud. The app adds vocalization in a separate step.
- Where the source rhymes or has a clear beat, the Hebrew rhymes and has a beat too. Rhyme and rhythm matter more to a listening child than word-for-word accuracy, so you may reshape a line to get them, as long as the page still says what its picture shows and the story stays the same. Where the source does not rhyme, do not add rhyme.
- A refrain or a repeated line is part of the fun of a picture book. When the source repeats a line, translate it once and repeat that exact Hebrew wording every time, changing only what the source changes.
- Names: decide once per character whether the name stays as it is, written in Hebrew letters, or gets a light Hebrew adaptation (for example a title such as "Mr" becoming "מר", or an animal's descriptive name being translated), and use that same form on every page, in the title and in the blurb. Keep the places, foods and animals of the original setting; these books come from South Africa and should still feel like it.
- Hebrew marks grammatical gender. Take each character's gender from the text and from the illustration descriptions, and keep it consistent. When you address the child who is listening, choose wording that works for any child where you can.
- Sound words and exclamations become what a Hebrew-speaking child would say or hear.
- Use Hebrew punctuation habits: quotation marks ("...") for speech, a maqaf only where Hebrew needs one.

Page structure is fixed, because every text is shown with one specific illustration:
- Return exactly one Hebrew text for each page you were given, with the same page number, in the same order. Never merge two pages, split a page, drop a page, or move a sentence to a neighbouring page, even when that would read better.
- Inside a page, keep the line breaks of the source: each line of the page text is a separate line of the Hebrew, separated by a newline.
- The illustration descriptions are context for you (who is in the picture, what happens). Do not translate them and do not add what they say to the page text.

Also return:
- "title": the Hebrew title of the book, consistent with the names used in the text.
- "summary": one or two Hebrew sentences for parents about what the book is about, without giving away the ending. Base it on the blurb when there is one.

Return only the structured result. Put nothing in the texts except the story itself: no notes, no alternatives, no transliteration, no page numbers.`;
}

export function translationUserPrompt(book: Pick<BookWithPages, "ageGroup">, source: TranslationSource): string {
  const payload = {
    title: source.title,
    blurb: source.summary || null,
    readers: AGE_HINTS[book.ageGroup],
    pageCount: source.pages.length,
    pages: source.pages.map((page, i) => ({
      page: i + 1,
      illustration: page.imageAlt ?? null,
      text: page.text,
    })),
  };
  return `Here is the book to translate into Hebrew. It has ${source.pages.length} pages; return exactly ${source.pages.length} page texts, numbered 1 to ${source.pages.length}.

<book>
${JSON.stringify(payload, null, 2)}
</book>`;
}

/** Why a model answer cannot be used, or null when it can. English: it is sent back to the model on the retry. */
export function translationProblem(output: TranslationOutput, source: TranslationSource): string | null {
  const expected = source.pages.length;
  if (output.pages.length !== expected) {
    return `You returned ${output.pages.length} page texts, but the book has exactly ${expected} pages.`;
  }
  for (const [i, page] of output.pages.entries()) {
    if (page.page !== i + 1) return `Page texts must be numbered 1 to ${expected} in order; position ${i + 1} is numbered ${page.page}.`;
    if (page.text.trim() === "") return `The text of page ${i + 1} is empty.`;
    if (!hasHebrewLetters(page.text)) return `The text of page ${i + 1} is not in Hebrew.`;
  }
  if (!hasHebrewLetters(output.title)) return "The title is missing or not in Hebrew.";
  return null;
}

// ---------------------------------------------------------------------------
// Translate
// ---------------------------------------------------------------------------

export interface TranslationDeps {
  repo: Repository;
  text: TextProvider;
  /** When given, narration files that the translation makes obsolete are deleted. */
  media?: Pick<MediaStore, "delete">;
}

export interface TranslateOptions {
  /** Who is credited as translator. Empty: the site, marked as machine translation. */
  translator?: string;
}

export type TranslateResult =
  | {
      status: "translated";
      book: BookWithPages;
      isMock: false;
      /** Number of provider calls (2 when the first answer had the wrong page count). */
      attempts: number;
      costUsd?: number;
    }
  | {
      /** No translation service is configured: the book was NOT changed. */
      status: "mock";
      book: BookWithPages;
      isMock: true;
    };

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function withTranslator(credits: BookCredits | undefined, translator: string): BookCredits {
  return { ...(credits ?? {}), translator, adaptation: adaptationLine("he", translator) };
}

function cleanTranslator(name: string | undefined): string {
  return (name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TRANSLATOR_NAME);
}

async function mustLoad(repo: Repository, bookId: string): Promise<BookWithPages> {
  const book = await repo.getBookById(bookId);
  if (!book) throw new NotFoundError(`book ${bookId}`);
  return book;
}

/** A "no derivatives" license (CC BY-ND, CC BY-NC-ND) does not allow a translation. */
function assertLicenseAllowsTranslation(book: Pick<BookWithPages, "license">): void {
  if (getCcLicense(book.license.trim())?.allowsAdaptation === false) {
    throw new TranslationError(
      "license-forbids",
      `הרישיון של הספר (${book.license.trim()}) אוסר יצירות נגזרות, ותרגום הוא יצירה נגזרת. אי אפשר לתרגם את הספר הזה.`,
    );
  }
}

/**
 * Translates a book into Hebrew and stores the result: Hebrew text, title and
 * summary, language 'he', the source kept in originalText / credits, and the
 * translator credit. Nikud and narration of the old text are removed, since
 * they no longer match; run them again on the Hebrew.
 */
export async function translateBook(
  deps: TranslationDeps,
  bookId: string,
  options: TranslateOptions = {},
): Promise<TranslateResult> {
  const book = await mustLoad(deps.repo, bookId);
  assertLicenseAllowsTranslation(book);
  const source = translationSource(book);
  if (!source) {
    throw new TranslationError("nothing-to-translate", "אין בספר טקסט בשפת המקור שאפשר לתרגם.");
  }

  // No translation service: say so and leave the book exactly as it is.
  if (deps.text.isMock) return { status: "mock", book, isMock: true };

  const system = translationSystemPrompt(source.language);
  const basePrompt = translationUserPrompt(book, source);
  // Hebrew for a picture book is short, but leave room for long story pages.
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
        : `${basePrompt}\n\nYour previous answer could not be used: ${problem} Translate the book again and return exactly ${source.pages.length} page texts, numbered 1 to ${source.pages.length}, one for each page above.`;
    let result;
    try {
      result = await deps.text.generate({
        system,
        prompt,
        schema: TranslationOutputSchema,
        schemaName: "book_translation",
        maxTokens,
      });
    } catch (err) {
      throw new TranslationError(
        "provider",
        "שירות התרגום לא הצליח לתרגם את הספר. הספר לא השתנה. נסו שוב בעוד רגע.",
        undefined,
        err instanceof Error ? err.message : String(err),
      );
    }
    // A provider that answers with placeholder data must never reach a book.
    if (result.isMock) return { status: "mock", book, isMock: true };
    if (result.usage?.costUsd !== undefined) costUsd = (costUsd ?? 0) + result.usage.costUsd;
    problem = translationProblem(result.data, source);
    if (problem === null) output = result.data;
  }
  if (output === null) {
    throw new TranslationError(
      "page-mismatch",
      "התרגום שהתקבל לא תאם את עמודי הספר (מספר העמודים או התוכן שלהם), גם בניסיון שני. הספר לא השתנה. נסו שוב.",
      undefined,
      problem ?? undefined,
    );
  }
  const translated = output;

  const translator = cleanTranslator(options.translator) || MACHINE_TRANSLATOR_CREDIT;
  const droppedAudio: string[] = [];

  const saved = await withBookLock(bookId, async () => {
    const fresh = await mustLoad(deps.repo, bookId);
    // The model worked on a snapshot: refuse to overwrite a book that changed under it.
    const freshSource = translationSource(fresh);
    if (
      fresh.pages.length !== book.pages.length ||
      !freshSource ||
      JSON.stringify(freshSource.pages) !== JSON.stringify(source.pages)
    ) {
      throw new TranslationError("changed-meanwhile", "הספר השתנה בזמן התרגום, ולכן התרגום לא נשמר. נסו לתרגם שוב.");
    }

    const byPage = new Map(source.pages.map((page, i) => [page.pageIndex, { source: page.text, hebrew: translated.pages[i].text }]));
    const pages: Page[] = fresh.pages.map((page, pageIndex) => {
      const entry = byPage.get(pageIndex);
      if (!entry) return page;
      // Vocalization, narration and word timings belonged to the previous text.
      const { textNikud: _nikud, audio, wordTimings: _timings, audioSource: _audioSource, ...rest } = page;
      if (audio && audio.startsWith(`${bookMediaPrefix(bookId)}/`)) droppedAudio.push(audio);
      return { ...rest, text: normalizeText(entry.hebrew), originalText: entry.source };
    });

    await deps.repo.replacePages(bookId, pages);
    const summary = normalizeText(translated.summary).replace(/\n/g, " ").slice(0, 2000);
    const updated = await deps.repo.updateBook(bookId, {
      title: normalizeText(translated.title).replace(/\n/g, " ").slice(0, 200),
      // An empty summary from the model keeps the old one rather than erasing it.
      ...(summary ? { summary } : {}),
      language: "he",
      originalLanguage: source.language,
      readingMinutes: estimateReadingMinutes(pages.map((page) => page.text)),
      credits: withTranslator(
        { ...(fresh.credits ?? {}), originalTitle: fresh.credits?.originalTitle ?? source.title },
        translator,
      ),
      ...(costUsd !== undefined ? { costUsd: (fresh.costUsd ?? 0) + costUsd } : {}),
    });
    return { ...updated, pages: pages.map((page, index) => ({ ...page, index })) } satisfies BookWithPages;
  });

  if (deps.media) {
    for (const path of droppedAudio) {
      await deps.media.delete(path).catch((err: unknown) => console.warn("[translation] could not delete old narration", path, err));
    }
  }
  return { status: "translated", book: saved, isMock: false, attempts, ...(costUsd !== undefined ? { costUsd } : {}) };
}

// ---------------------------------------------------------------------------
// Manual translation
// ---------------------------------------------------------------------------

/** Pages (zero-based) that have source text but whose text is not Hebrew yet. */
export function untranslatedPages(book: BookWithPages): number[] {
  const source = translationSource(book);
  if (!source) return [];
  return source.pages
    .filter((page) => {
      const text = book.pages[page.pageIndex].text;
      if (!hasHebrewLetters(text)) return true;
      // Mostly Latin words with a Hebrew word or two is still an untranslated page.
      const latin = (text.match(LATIN_WORD) ?? []).length;
      const hebrew = (text.match(/[א-ת]{2,}/g) ?? []).length;
      return latin > hebrew;
    })
    .map((page) => page.pageIndex);
}

/**
 * Marks a book that a person translated by hand as Hebrew. Every page that
 * has source text must now be in Hebrew, and so must the title; the
 * translator's name is required (nobody else can be credited for it).
 */
export async function acceptManualTranslation(
  deps: Pick<TranslationDeps, "repo">,
  bookId: string,
  options: TranslateOptions,
): Promise<BookWithPages> {
  return withBookLock(bookId, async () => {
    const book = await mustLoad(deps.repo, bookId);
    assertLicenseAllowsTranslation(book);
    const language = bookLanguage(book);
    if (language === "he") {
      throw new TranslationError("already-hebrew", "הספר כבר מסומן כספר בעברית.");
    }
    const translator = cleanTranslator(options.translator);
    if (!translator) {
      throw new TranslationError("translator-required", "כתבו את שם המתרגם או המתרגמת לפני אישור התרגום.");
    }
    const missing = untranslatedPages(book);
    if (missing.length > 0) {
      const numbers = missing.map((index) => index + 1).join(", ");
      throw new TranslationError(
        "not-hebrew",
        missing.length === 1 ? `עמוד ${numbers} עדיין לא תורגם לעברית.` : `העמודים ${numbers} עדיין לא תורגמו לעברית.`,
        missing,
      );
    }
    if (!hasHebrewLetters(book.title)) {
      throw new TranslationError("not-hebrew", "שם הספר עדיין לא בעברית (בלשונית פרטי הספר).");
    }

    const updated = await deps.repo.updateBook(bookId, {
      language: "he",
      originalLanguage: book.originalLanguage ?? language,
      credits: withTranslator(book.credits, translator),
    });
    return { ...updated, pages: book.pages };
  });
}
