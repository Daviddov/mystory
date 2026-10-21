/**
 * Credit rules shared by the book page, the reader, the print view, the PDF
 * and the studio. Client-safe.
 *
 * A Creative Commons book must show who made it, who published it first,
 * under which license, and what was changed (e.g. "translated into Hebrew by").
 */
import type { Book, BookLanguage } from "./types";

export type CreditBook = Pick<
  Book,
  "author" | "illustrator" | "license" | "source" | "credits" | "language" | "originalLanguage"
>;

export const LANGUAGE_NAMES_HE: Record<BookLanguage, string> = { he: "עברית", en: "אנגלית" };
export const LANGUAGE_NAMES_EN: Record<BookLanguage, string> = { he: "Hebrew", en: "English" };

/** The translator credit of a translation when no other person was named. */
export const MACHINE_TRANSLATOR_CREDIT = "Dov Bar";

/**
 * The public deed of a Creative Commons license named like "CC BY 4.0",
 * "CC BY-NC-SA 4.0" or "CC0 1.0"; undefined for anything else.
 */
export function licenseDeedUrl(license: string): string | undefined {
  const normalized = license.trim().toUpperCase().replace(/\s+/g, " ");
  if (/^CC0( 1\.0)?( \(.*\))?$/.test(normalized)) return "https://creativecommons.org/publicdomain/zero/1.0/";
  const match = /^CC (BY(?:-NC)?(?:-ND|-SA)?) (\d\.\d)$/.exec(normalized);
  if (!match) return undefined;
  return `https://creativecommons.org/licenses/${match[1].toLowerCase()}/${match[2]}/`;
}

export function isCreativeCommons(license: string): boolean {
  return /^CC(0|\s+BY)/i.test(license.trim());
}

/** An http(s) URL, or undefined. Free-text sources and unsafe schemes are never turned into links. */
export function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** The adaptation statement of a translation, in the wording Book Dash asks for. */
export function adaptationLine(language: BookLanguage, translator: string): string {
  return `Translation into ${LANGUAGE_NAMES_EN[language]} by ${translator}`;
}

export type CreditRole = "author" | "illustrator" | "designer" | "editor";

export const CREDIT_ROLE_LABELS: Record<CreditRole, string> = {
  author: "כתיבה",
  illustrator: "איור",
  designer: "עיצוב",
  editor: "עריכה",
};

/**
 * Roles a book from an outside publisher should credit but does not yet.
 * Empty for books that are not such imports. Book Dash asks for all four; its
 * repository only gives one list of names, so imports start with all four
 * missing and a person fills them in.
 */
export function missingCreditRoles(book: Pick<Book, "author" | "illustrator" | "credits">): CreditRole[] {
  if (!book.credits?.publisher?.trim()) return [];
  const missing: CreditRole[] = [];
  if (!book.author.trim()) missing.push("author");
  if (!book.illustrator.trim()) missing.push("illustrator");
  if (!book.credits.designer?.trim()) missing.push("designer");
  if (!book.credits.editor?.trim()) missing.push("editor");
  return missing;
}

export interface CreditLine {
  key: string;
  label: string;
  value: string;
  /** True for values kept in their original (usually English) wording. */
  ltr?: boolean;
}

/**
 * The people and statements to print, in order. Empty fields are left out.
 * License, source and publisher links are separate (see BookCredits).
 */
export function creditPeople(book: CreditBook): CreditLine[] {
  const credits = book.credits ?? {};
  const lines: CreditLine[] = [
    { key: "author", label: CREDIT_ROLE_LABELS.author, value: book.author },
    { key: "illustrator", label: CREDIT_ROLE_LABELS.illustrator, value: book.illustrator },
    { key: "designer", label: CREDIT_ROLE_LABELS.designer, value: credits.designer ?? "" },
    { key: "editor", label: CREDIT_ROLE_LABELS.editor, value: credits.editor ?? "" },
    { key: "creators", label: "יוצרי הספר", value: credits.creators ?? "" },
    { key: "originalTitle", label: "השם המקורי של הספר", value: credits.originalTitle ?? "", ltr: true },
    {
      key: "translator",
      label: (book.language ?? "he") === "he" ? "תרגום לעברית" : "תרגום",
      value: credits.translator ?? "",
    },
  ];
  return lines.filter((line) => line.value.trim() !== "");
}

/** Attribution and adaptation statements, in the wording the license holder asked for. */
export function creditStatements(book: CreditBook): string[] {
  return [book.credits?.attributionLine ?? "", book.credits?.adaptation ?? ""].filter((line) => line.trim() !== "");
}
