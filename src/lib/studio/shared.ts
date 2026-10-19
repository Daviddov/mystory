/**
 * Studio rules shared by the browser editor and the /api/studio routes.
 * Client-safe: no Node or server-only imports.
 */
import { z } from "zod";
import { countWords, hasNikud, splitWords, timingWordsMatch } from "../hebrew";
import { BOOK_LIMITS } from "../limits";
import { CATEGORY_SLUGS, THEME_SLUGS } from "../taxonomy";
import {
  AgeGroupSchema,
  AudioSourceSchema,
  WordTimingSchema,
  type BookStatus,
  type BookWithPages,
  type Page,
} from "../types";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** From the shared BOOK_LIMITS, which the importers use too (see src/lib/limits.ts). */
export const MAX_PAGES = BOOK_LIMITS.pages;
export const MAX_PAGE_TEXT = BOOK_LIMITS.pageTextChars;
export const MAX_TAGS = 15;
export const MAX_TAG_LENGTH = 30;
export const MAX_CATEGORIES = 5;
export const MAX_THEMES = 6;
export const MAX_QUESTIONS = 10;
export const MAX_QUESTION_LENGTH = 300;
/** Hero description (see BookHeroSchema). */
export const MAX_HERO_DESCRIPTION = 1000;
/** Optional art direction typed for one page illustration. */
export const MAX_ILLUSTRATION_NOTE = 300;
/** Illustration style used when the book's hero does not name one (a STORY_STYLES slug). */
export const DEFAULT_ILLUSTRATION_STYLE = "watercolor";

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
/** Upper bound on stored files per book, so one account cannot fill the disk through one book. */
export const MAX_MEDIA_FILES_PER_BOOK = 400;
/** Longest browser recording for one page, in seconds. */
export const MAX_RECORDING_SECONDS = 300;

export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif";
export const AUDIO_ACCEPT = "audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm,audio/aac,.mp3,.wav,.ogg,.m4a,.webm";

export const UPLOAD_KINDS = ["image", "cover", "audio"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<BookStatus, string> = {
  draft: "טיוטה",
  private: "פרטי",
  pending: "ממתין לאישור",
  published: "פורסם",
};

export const STATUS_TONES: Record<BookStatus, "neutral" | "secondary" | "warning" | "success"> = {
  draft: "neutral",
  private: "secondary",
  pending: "warning",
  published: "success",
};

/** Statuses the owner of a book may choose. 'published' is reserved for editors. */
export const OWNER_STATUSES = ["draft", "private", "pending"] as const;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const trimmed = (max: number) => z.string().trim().max(max);

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter((v) => v.length > 0)));
}

export const CreateBookSchema = z.strictObject({
  title: z.string().trim().min(1, "חסר שם לספר").max(200),
  ageGroup: AgeGroupSchema.optional(),
  author: trimmed(200).optional(),
});
export type CreateBookInput = z.infer<typeof CreateBookSchema>;

/**
 * Metadata the owner may edit. Strict on purpose: status, slug, ownerId,
 * shareToken, viewCount and the rest can never be patched through this schema.
 */
export const BookMetaPatchSchema = z.strictObject({
  title: z.string().trim().min(1, "חסר שם לספר").max(200).optional(),
  summary: trimmed(2000).optional(),
  author: trimmed(200).optional(),
  illustrator: trimmed(200).optional(),
  license: trimmed(200).optional(),
  source: trimmed(500).optional(),
  ageGroup: AgeGroupSchema.optional(),
  categories: z
    .array(z.string().refine((slug) => CATEGORY_SLUGS.includes(slug), "קטגוריה לא מוכרת"))
    .max(MAX_CATEGORIES)
    .transform(uniqueStrings)
    .optional(),
  tags: z.array(z.string().trim().min(1).max(MAX_TAG_LENGTH)).max(MAX_TAGS).transform(uniqueStrings).optional(),
  themes: z
    .array(z.string().refine((slug) => THEME_SLUGS.includes(slug), "נושא לא מוכר"))
    .max(MAX_THEMES)
    .transform(uniqueStrings)
    .optional(),
  discussionQuestions: z
    .array(z.string().trim().max(MAX_QUESTION_LENGTH))
    .max(MAX_QUESTIONS)
    .transform((list) => list.filter((q) => q.length > 0))
    .optional(),
  /** "" removes the cover. Otherwise a media path inside the book's own folder (checked on the server). */
  coverImage: z.string().max(300).optional(),
  /**
   * The whole credits block (it replaces the stored one). Empty fields are
   * removed. The publisher logo is a stored file and is never set from here:
   * the server keeps the one the book already has.
   */
  credits: z
    .strictObject({
      originalTitle: trimmed(200).optional(),
      creators: trimmed(300).optional(),
      designer: trimmed(200).optional(),
      editor: trimmed(200).optional(),
      translator: trimmed(200).optional(),
      publisher: trimmed(200).optional(),
      /** Free text while it is being typed; it is shown as a link only when it is an http(s) URL. */
      publisherUrl: trimmed(500).optional(),
      attributionLine: trimmed(500).optional(),
      adaptation: trimmed(500).optional(),
      /** Accepted so a stored credits block can be sent back as is; the server ignores it. */
      publisherLogo: z.string().max(300).optional(),
    })
    .optional(),
  /**
   * The whole hero block (it replaces the stored one); null removes it. The
   * image is a media path inside the book's own folder (checked on the server).
   */
  hero: z
    .strictObject({
      description: trimmed(MAX_HERO_DESCRIPTION),
      style: trimmed(100).optional(),
      image: z.string().max(300).optional(),
      styleNotes: trimmed(600).optional(),
      packs: z.array(z.string().max(40)).max(8).optional(),
      narrationStyle: z.string().max(40).optional(),
      narrationNotes: trimmed(300).optional(),
      narrationVoice: z.string().max(64).optional(),
      animationMotion: z.string().max(40).optional(),
      animationNotes: trimmed(400).optional(),
    })
    .nullable()
    .optional(),
});
export type BookMetaPatch = z.infer<typeof BookMetaPatchSchema>;

const optionalPath = z
  .string()
  .max(300)
  .optional()
  .transform((value) => (value ? value : undefined));

export const StudioPageSchema = z.strictObject({
  /** Ignored: the position in the array is the index. Accepted so a stored Page can be sent back as is. */
  index: z.number().optional(),
  text: z.string().max(MAX_PAGE_TEXT),
  textNikud: z
    .string()
    .max(BOOK_LIMITS.pageNikudChars)
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value : undefined)),
  image: optionalPath,
  audio: optionalPath,
  wordTimings: z.array(WordTimingSchema).max(4000).optional(),
  audioSource: AudioSourceSchema.optional(),
  /** The page text in the original language of a translated book. */
  originalText: z
    .string()
    .max(MAX_PAGE_TEXT * 2)
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value : undefined)),
  /** Description of the illustration. */
  imageAlt: z
    .string()
    .max(1000)
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
});

export const PagesPayloadSchema = z.strictObject({
  pages: z.array(StudioPageSchema).max(MAX_PAGES, `אפשר עד ${MAX_PAGES} עמודים בספר`),
});
/** The input shape: optional fields may be left out (the parsed output is assignable to it). */
export type PagesPayload = z.input<typeof PagesPayloadSchema>;

export const StatusChangeSchema = z.strictObject({
  status: z.enum(["draft", "private", "pending", "published"]),
});

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/**
 * Cleans pages before they are stored: contiguous indexes, no audio metadata
 * without audio, and no word timings that no longer match the text.
 */
export function sanitizePages(pages: PagesPayload["pages"]): Page[] {
  return pages.map((raw, index) => {
    const page: Page = { index, text: raw.text };
    if (raw.textNikud) page.textNikud = raw.textNikud;
    if (raw.image) page.image = raw.image;
    if (raw.originalText) page.originalText = raw.originalText;
    if (raw.imageAlt) page.imageAlt = raw.imageAlt;
    if (raw.audio) {
      page.audio = raw.audio;
      if (raw.audioSource) page.audioSource = raw.audioSource;
      if (raw.wordTimings && raw.wordTimings.length > 0 && timingsBelongToText(raw.wordTimings, raw)) {
        page.wordTimings = raw.wordTimings;
      }
    }
    return page;
  });
}

/**
 * True when the timings were made for these words. The words themselves are
 * compared, not only their number. Vowel points are ignored here, so removing
 * or adding nikud alone does not throw away the highlighting.
 */
function timingsBelongToText(
  timings: readonly { word: string }[],
  page: { text: string; textNikud?: string },
): boolean {
  return (
    timingWordsMatch(timings, page.text, { ignoreNikud: true }) ||
    (!!page.textNikud && timingWordsMatch(timings, page.textNikud, { ignoreNikud: true }))
  );
}

/** True when the vocalized text has a different number of words than the plain text. */
export function nikudWordMismatch(page: Pick<Page, "text" | "textNikud">): boolean {
  if (!page.textNikud || page.textNikud.trim().length === 0) return false;
  return countWords(page.text) !== countWords(page.textNikud);
}

/**
 * True when a page has synthesized narration whose word timings no longer fit
 * the text (the text was edited after narrating, even when the number of words
 * stayed the same). A changed vocalization counts too: it changes what should
 * be heard. Recorded audio has no timings, so this cannot detect a stale
 * recording.
 */
export function narrationStale(page: Pick<Page, "text" | "textNikud" | "audio" | "wordTimings">): boolean {
  if (!page.audio || !page.wordTimings || page.wordTimings.length === 0) return false;
  if (timingWordsMatch(page.wordTimings, page.text)) return false;
  return !(page.textNikud && timingWordsMatch(page.wordTimings, page.textNikud));
}

/** Splits a pasted story into page texts: one page per paragraph (blank line), or per line when there are none. */
export function splitStoryIntoPages(story: string): string[] {
  const normalized = story.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const byParagraph = normalized
    .split(/\n\s*\n+/)
    .map((part) => part.replace(/\s*\n\s*/g, " ").trim())
    .filter((part) => part.length > 0);
  if (byParagraph.length > 1) return byParagraph.slice(0, MAX_PAGES);
  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_PAGES);
}

/** Natural filename order ("page2" before "page10"), used when several images are dropped at once. */
export function sortByFileName<T extends { name: string }>(files: readonly T[]): T[] {
  const collator = new Intl.Collator(["he", "en"], { numeric: true, sensitivity: "base" });
  return [...files].sort((a, b) => collator.compare(a.name, b.name));
}

/** A page with neither text nor picture. */
export function isBlankPage(page: Pick<Page, "text" | "image" | "audio" | "textNikud">): boolean {
  return page.text.trim().length === 0 && !page.image && !page.audio && !page.textNikud;
}

// ---------------------------------------------------------------------------
// Publication checklist
// ---------------------------------------------------------------------------

export interface PublishProblem {
  code: string;
  message: string;
  /** Zero-based page the problem belongs to, when it is about one page. */
  pageIndex?: number;
}

type PublishCheckBook = Pick<
  BookWithPages,
  "title" | "summary" | "license" | "author" | "categories" | "pages" | "language" | "originalLanguage" | "credits"
>;

/** Shown wherever an untranslated book is refused: the public library is Hebrew only. */
export const NOT_HEBREW_MESSAGE =
  "הספר עדיין לא בעברית. הספרייה הציבורית היא בעברית בלבד: תרגמו את הספר ואשרו את התרגום לפני ההגשה.";

/** Everything that must be fixed before a book can be submitted for publication. Empty when it is ready. */
export function publishProblems(book: PublishCheckBook): PublishProblem[] {
  const problems: PublishProblem[] = [];
  if ((book.language ?? "he") !== "he") problems.push({ code: "language", message: NOT_HEBREW_MESSAGE });
  else if (book.originalLanguage && book.originalLanguage !== "he" && !book.credits?.translator?.trim()) {
    // A published adaptation must say who made it (required by the Creative Commons licenses).
    problems.push({ code: "translator", message: "חסר שם המתרגם או המתרגמת (בלשונית פרטי הספר)" });
  }
  if (book.title.trim().length === 0) problems.push({ code: "title", message: "חסר שם לספר" });
  if (book.summary.trim().length === 0) problems.push({ code: "summary", message: "חסר תקציר" });
  if (book.author.trim().length === 0) problems.push({ code: "author", message: "חסר שם המחבר או המחברת" });
  if (book.license.trim().length === 0) {
    problems.push({ code: "license", message: "חסר רישיון (למשל: כל הזכויות שמורות, או CC BY 4.0)" });
  }
  if (book.categories.length === 0) problems.push({ code: "categories", message: "צריך לבחור לפחות קטגוריה אחת" });
  if (book.pages.length === 0) problems.push({ code: "pages", message: "בספר אין עמודים" });
  book.pages.forEach((page, pageIndex) => {
    if (page.text.trim().length === 0 && !page.image) {
      problems.push({ code: "blank-page", message: `עמוד ${pageIndex + 1} ריק`, pageIndex });
    }
    if (nikudWordMismatch(page)) {
      problems.push({
        code: "nikud-mismatch",
        message: `בעמוד ${pageIndex + 1} מספר המילים בטקסט המנוקד שונה מהטקסט הרגיל`,
        pageIndex,
      });
    }
    if (narrationStale(page)) {
      problems.push({
        code: "narration-stale",
        message: `בעמוד ${pageIndex + 1} הטקסט השתנה אחרי ההקראה. צריך להקריא את העמוד מחדש או להסיר את ההקראה.`,
        pageIndex,
      });
    }
  });
  if (book.pages.length > 0 && book.pages.every((page) => page.text.trim().length === 0)) {
    problems.push({ code: "no-text", message: "אין טקסט באף עמוד" });
  }
  return problems;
}

/** Words of the text a reader hears: the vocalized text when it exists, otherwise the plain text. */
export function narratedWords(page: Pick<Page, "text" | "textNikud">): string[] {
  return splitWords(page.textNikud && hasNikud(page.textNikud) ? page.textNikud : page.text);
}
