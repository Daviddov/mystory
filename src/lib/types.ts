/**
 * Shared domain model. Every book (manual, imported, AI generated) uses exactly
 * this shape, so one reader can display all of them.
 *
 * Media fields (coverImage, Page.image, Page.audio, Book.soundtrack) hold a
 * MEDIA PATH such as "books/<bookId>/page-1.svg" (see src/lib/media). Turn a
 * media path into a browser URL with mediaUrl() from "@/lib/media/url".
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const AGE_GROUPS = ["0-2", "3-5", "6-8"] as const;
export const AgeGroupSchema = z.enum(AGE_GROUPS);
export type AgeGroup = z.infer<typeof AgeGroupSchema>;

export const BOOK_STATUSES = ["draft", "private", "pending", "published"] as const;
export const BookStatusSchema = z.enum(BOOK_STATUSES);
export type BookStatus = z.infer<typeof BookStatusSchema>;

export const BOOK_ORIGINS = ["manual", "import", "ai"] as const;
export const BookOriginSchema = z.enum(BOOK_ORIGINS);
export type BookOrigin = z.infer<typeof BookOriginSchema>;

export const USER_ROLES = ["parent", "editor", "admin"] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const AUDIO_SOURCES = ["tts", "recorded", "mock"] as const;
export const AudioSourceSchema = z.enum(AUDIO_SOURCES);
export type AudioSource = z.infer<typeof AudioSourceSchema>;

/** Languages a book's text can be in. Only 'he' books may enter the public library. */
export const BOOK_LANGUAGES = ["he", "en"] as const;
export const BookLanguageSchema = z.enum(BOOK_LANGUAGES);
export type BookLanguage = z.infer<typeof BookLanguageSchema>;

/** Lowercase latin letters, digits and single dashes. Also used as a folder name. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SlugSchema = z.string().min(1).max(80).regex(SLUG_PATTERN, "invalid slug");

/** Opaque identifier: letters, digits, dash and underscore only (safe in paths and URLs). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const IdSchema = z.string().regex(ID_PATTERN, "invalid id");

const IsoDateSchema = z.string().min(1);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const WordTimingSchema = z.object({
  /** The word exactly as it appears in the narrated text (may include nikud). */
  word: z.string(),
  /** Seconds from the start of the page audio. */
  start: z.number().min(0),
  end: z.number().min(0),
});
export type WordTiming = z.infer<typeof WordTimingSchema>;

export const PageSchema = z.object({
  /** Zero-based position inside the book. Pages are always stored sorted and contiguous. */
  index: z.number().int().min(0),
  text: z.string(),
  /** Same text with Hebrew vocalization marks. */
  textNikud: z.string().optional(),
  /** Media path of the illustration. */
  image: z.string().optional(),
  /** Media path of the narration audio. */
  audio: z.string().optional(),
  wordTimings: z.array(WordTimingSchema).optional(),
  /** 'mock' means the audio is a silent demo placeholder and the UI must say so. */
  audioSource: AudioSourceSchema.optional(),
  /** The page text in the book's original language, kept next to a translation. */
  originalText: z.string().optional(),
  /** Description of the illustration (alternative text), in the language it was written in. */
  imageAlt: z.string().max(1000).optional(),
});
export type Page = z.infer<typeof PageSchema>;

// ---------------------------------------------------------------------------
// Book
// ---------------------------------------------------------------------------

/**
 * Credits beyond author and illustrator. Creative Commons books need them:
 * the license requires naming the people who made the book, the original
 * publisher and what was changed (e.g. a translation).
 */
export const BookCreditsSchema = z.object({
  /**
   * The people who made the book when the source lists them without roles
   * (Book Dash: "Created by A, B, C"). Shown as is; never split into roles by guessing.
   */
  creators: z.string().max(300).optional(),
  /** Title of the book in its original language, kept when the title is translated. */
  originalTitle: z.string().max(200).optional(),
  designer: z.string().max(200).optional(),
  editor: z.string().max(200).optional(),
  /** Who translated the book into its current language. */
  translator: z.string().max(200).optional(),
  /** Original publisher, e.g. "Book Dash". */
  publisher: z.string().max(200).optional(),
  publisherUrl: z.string().max(500).optional(),
  /** Media path of the publisher's logo. */
  publisherLogo: z.string().max(300).optional(),
  /** Attribution sentence required by the license, e.g. "Originally published by ...". */
  attributionLine: z.string().max(500).optional(),
  /** What was changed, e.g. "Translation into Hebrew by ...". */
  adaptation: z.string().max(500).optional(),
});
export type BookCredits = z.infer<typeof BookCreditsSchema>;

export const BookSchema = z.object({
  id: IdSchema,
  slug: SlugSchema,
  title: z.string().min(1).max(200),
  summary: z.string().max(2000),
  author: z.string().max(200),
  illustrator: z.string().max(200),
  /** Required for copyright tracking, e.g. "CC BY 4.0" or "כל הזכויות שמורות". */
  license: z.string().max(200),
  /** Where the book came from (URL or free text). */
  source: z.string().max(500),
  ageGroup: AgeGroupSchema,
  readingMinutes: z.number().min(1).max(240),
  /** Media path of the cover. Empty string when the book has no cover yet. */
  coverImage: z.string(),
  status: BookStatusSchema,
  /** User id of the creator. Seeded library books use SYSTEM_OWNER_ID. */
  ownerId: z.string(),
  /** Category slugs from taxonomy.ts. */
  categories: z.array(z.string()),
  /** Free tags (Hebrew labels, see tagSlug() in taxonomy.ts). */
  tags: z.array(z.string()),
  /** Discussion theme slugs from taxonomy.ts. */
  themes: z.array(z.string()),
  discussionQuestions: z.array(z.string()),
  /** Public share link token for a private book. */
  shareToken: z.string().optional(),
  origin: BookOriginSchema,
  viewCount: z.number().int().min(0),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  publishedAt: IsoDateSchema.optional(),
  /** Optional media path of background music played under the narration. */
  soundtrack: z.string().optional(),
  /** Optional note from an editor when a book is sent back from review. */
  reviewNote: z.string().optional(),
  /** Optional measured AI cost of producing this book, in USD. */
  costUsd: z.number().min(0).optional(),
  /** Language of `title`, `summary` and the page texts. Absent means 'he' (see bookLanguage()). */
  language: BookLanguageSchema.optional(),
  /** Language the book was written in, when it is (or will be) a translation. */
  originalLanguage: BookLanguageSchema.optional(),
  credits: BookCreditsSchema.optional(),
});
export type Book = z.infer<typeof BookSchema>;

/** The language of a book's text; books stored before the field existed are Hebrew. */
export function bookLanguage(book: Pick<Book, "language">): BookLanguage {
  return book.language ?? "he";
}

/** True for a book whose text is not Hebrew yet (an imported book waiting for translation). */
export function needsTranslation(book: Pick<Book, "language">): boolean {
  return bookLanguage(book) !== "he";
}

export const BookWithPagesSchema = BookSchema.extend({
  pages: z.array(PageSchema),
});
export type BookWithPages = z.infer<typeof BookWithPagesSchema>;

export const SYSTEM_OWNER_ID = "system";

// ---------------------------------------------------------------------------
// Collection, settings
// ---------------------------------------------------------------------------

export const CollectionSchema = z.object({
  id: IdSchema,
  slug: SlugSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  /** Ordered list of book ids. */
  bookIds: z.array(z.string()),
  /** Optional season / holiday key, e.g. "winter", "hanukkah". */
  season: z.string().optional(),
});
export type Collection = z.infer<typeof CollectionSchema>;

export const SiteSettingsSchema = z.object({
  bookOfTheWeekId: z.string().optional(),
  updatedAt: IsoDateSchema.optional(),
});
export type SiteSettings = z.infer<typeof SiteSettingsSchema>;

// ---------------------------------------------------------------------------
// Users and per-user state
// ---------------------------------------------------------------------------

export const UserSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  role: UserRoleSchema,
  createdAt: IsoDateSchema.optional(),
});
export type User = z.infer<typeof UserSchema>;

export const FavoriteSchema = z.object({
  userId: z.string(),
  bookId: z.string(),
  createdAt: IsoDateSchema,
});
export type Favorite = z.infer<typeof FavoriteSchema>;

export const ProgressSchema = z.object({
  userId: z.string(),
  bookId: z.string(),
  /** Zero-based index of the last page the reader reached. */
  pageIndex: z.number().int().min(0),
  completed: z.boolean(),
  updatedAt: IsoDateSchema,
});
export type Progress = z.infer<typeof ProgressSchema>;

// ---------------------------------------------------------------------------
// Family recordings: a reader's own narration of a book
// ---------------------------------------------------------------------------

/**
 * private  - only the person who recorded it (and staff) can hear it
 * pending  - sent for sharing, waiting in the admin queue
 * approved - offered to every reader as another narration version
 * A rejected recording goes back to private with a reviewNote.
 */
export const RECORDING_STATUSES = ["private", "pending", "approved"] as const;
export const RecordingStatusSchema = z.enum(RECORDING_STATUSES);
export type RecordingStatus = z.infer<typeof RecordingStatusSchema>;

export const RECORDING_TITLE_MAX = 60;

export const RecordingPageSchema = z.object({
  /** Zero-based page index in the book. */
  index: z.number().int().min(0),
  /** Media path under books/<bookId>/rec/<recordingId>/. */
  audio: z.string().min(1),
});
export type RecordingPage = z.infer<typeof RecordingPageSchema>;

export const RecordingSchema = z.object({
  id: IdSchema,
  bookId: IdSchema,
  userId: z.string().min(1),
  /** Shown in the reader's voice picker, e.g. "הקול של אבא". */
  title: z.string().trim().min(1).max(RECORDING_TITLE_MAX),
  status: RecordingStatusSchema,
  reviewNote: z.string().max(1000).optional(),
  /** Sorted by index, at most one entry per page. */
  pages: z.array(RecordingPageSchema),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  submittedAt: IsoDateSchema.optional(),
});
export type Recording = z.infer<typeof RecordingSchema>;

// ---------------------------------------------------------------------------
// AI generation jobs
// ---------------------------------------------------------------------------

export const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
export const JobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const GenerationJobSchema = z.object({
  id: IdSchema,
  ownerId: z.string(),
  status: JobStatusSchema,
  /** Machine name of the current pipeline step, e.g. "outline", "illustrations". */
  step: z.string(),
  /** 0..100 */
  progress: z.number().min(0).max(100),
  bookId: z.string().optional(),
  error: z.string().optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema.optional(),
  /** 'wizard' for a parent-initiated book, 'daily' for the scheduled daily story. */
  kind: z.enum(["wizard", "daily"]).optional(),
  /** The wizard input that started the job (never contains the child photo). */
  input: z.record(z.string(), z.unknown()).optional(),
  /** Human readable Hebrew status line shown while waiting. */
  message: z.string().optional(),
  /** True when at least one mock provider produced part of the result. */
  usedMock: z.boolean().optional(),
  costUsd: z.number().min(0).optional(),
});
export type GenerationJob = z.infer<typeof GenerationJobSchema>;
