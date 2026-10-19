/** Editor state shapes. Client-safe. */
import type { Book, BookWithPages, Page } from "@/lib/types";

/** A page in the editor: the stored fields plus browser-only state that is never sent to the server. */
export interface EditorPage extends Omit<Page, "index"> {
  /** Stable identity for React and drag-and-drop (pages have no id of their own). */
  key: string;
  /** Local blob URL of a picture that was just chosen, shown while and after it uploads. */
  preview?: string;
  uploading?: boolean;
  uploadError?: string;
}

export type EditorMeta = Pick<
  Book,
  | "title"
  | "summary"
  | "author"
  | "illustrator"
  | "license"
  | "source"
  | "ageGroup"
  | "categories"
  | "tags"
  | "themes"
  | "discussionQuestions"
  | "coverImage"
  | "credits"
  | "hero"
>;

/** Fields only the server changes. */
export type ServerInfo = Pick<
  Book,
  "id" | "slug" | "status" | "shareToken" | "reviewNote" | "updatedAt" | "publishedAt" | "readingMinutes" | "language" | "originalLanguage"
>;

let keyCounter = 0;
export function newPageKey(): string {
  keyCounter += 1;
  return `p${Date.now().toString(36)}-${keyCounter}`;
}

export function toEditorPage(page: Page): EditorPage {
  const { index: _index, ...rest } = page;
  return { ...rest, key: newPageKey() };
}

export function toServerPages(pages: EditorPage[]): Omit<Page, "index">[] {
  return pages.map(({ key: _key, preview: _preview, uploading: _uploading, uploadError: _uploadError, ...rest }) => rest);
}

export function pickMeta(book: Book): EditorMeta {
  return {
    title: book.title,
    summary: book.summary,
    author: book.author,
    illustrator: book.illustrator,
    license: book.license,
    source: book.source,
    ageGroup: book.ageGroup,
    categories: book.categories,
    tags: book.tags,
    themes: book.themes,
    discussionQuestions: book.discussionQuestions,
    coverImage: book.coverImage,
    credits: book.credits,
    hero: book.hero,
  };
}

export function pickInfo(book: Book): ServerInfo {
  return {
    id: book.id,
    slug: book.slug,
    status: book.status,
    shareToken: book.shareToken,
    reviewNote: book.reviewNote,
    updatedAt: book.updatedAt,
    publishedAt: book.publishedAt,
    readingMinutes: book.readingMinutes,
    language: book.language,
    originalLanguage: book.originalLanguage,
  };
}

/** The book as the reader would get it right now, for the live preview. */
export function composeBook(base: BookWithPages, meta: EditorMeta, info: ServerInfo, pages: EditorPage[]): BookWithPages {
  return {
    ...base,
    ...meta,
    ...info,
    title: meta.title.trim() || base.title,
    pages: pages.map((page, index) => ({
      index,
      text: page.text,
      textNikud: page.textNikud,
      // A picture that is still uploading is shown from its local blob URL.
      image: page.image ?? page.preview,
      audio: page.audio,
      wordTimings: page.wordTimings,
      audioSource: page.audioSource,
      originalText: page.originalText,
      imageAlt: page.imageAlt,
    })),
  };
}

export interface EditorNotice {
  tone: "success" | "error" | "info";
  text: string;
  /** Shows the matching "demo mode" notice under the text. */
  mock?: "nikud" | "tts" | "translation" | "image" | "text" | "video";
}

/** How complete the book details are (stage 8 of the workbench). */
export interface DetailsStatus {
  done: number;
  total: number;
  /** Hebrew names of the details still missing. */
  missing: string[];
}
