/**
 * What goes on paper. Shared by the print view (/print/[slug]) and the PDF
 * export so both show the same sheets in the same order. Client-safe.
 */
import { creditPeople, licenseDeedUrl, safeHttpUrl } from "../credits";
import { hasNikud } from "../hebrew";
import type { BookWithPages } from "../types";

export interface PrintablePage {
  /** 1-based number printed on the sheet. */
  number: number;
  text: string;
  /** Media path of the illustration, or undefined. */
  image?: string;
}

/** True when at least one page has a vocalized version of its text. */
export function bookHasNikud(book: Pick<BookWithPages, "pages">): boolean {
  return book.pages.some((page) => !!page.textNikud && hasNikud(page.textNikud));
}

/** Pages in reading order. With `nikud`, a page that has vocalized text uses it. */
export function printablePages(book: Pick<BookWithPages, "pages">, nikud: boolean): PrintablePage[] {
  return [...book.pages]
    .sort((a, b) => a.index - b.index)
    .map((page, i) => ({
      number: i + 1,
      text: (nikud && page.textNikud ? page.textNikud : page.text).trim(),
      image: page.image || undefined,
    }));
}

/**
 * Credit lines for the last sheet of the print view and of the PDF. Empty
 * fields are left out. A Creative Commons book gets everything its license
 * asks for in writing: the people, the attribution and adaptation statements,
 * the original publisher with its address, and the license with its deed.
 */
export function creditLines(
  book: Pick<BookWithPages, "author" | "illustrator" | "license" | "source"> &
    Partial<Pick<BookWithPages, "credits" | "language" | "originalLanguage">>,
): { label: string; value: string }[] {
  const credits = book.credits ?? {};
  // On paper an address is text, not a link. A trailing slash is dropped: at the end of a
  // left-to-right run inside a right-to-left line it would be drawn on the wrong side.
  const address = (url: string | undefined) => url?.replace(/\/+$/, "");
  const deed = address(licenseDeedUrl(book.license));
  const publisher = [credits.publisher?.trim(), address(safeHttpUrl(credits.publisherUrl))].filter(Boolean).join(", ");
  return [
    ...creditPeople(book).map((line) => ({ label: line.label, value: line.value })),
    { label: "פורסם במקור על ידי", value: publisher },
    { label: "ייחוס", value: credits.attributionLine ?? "" },
    { label: "שינויים מהמקור", value: credits.adaptation ?? "" },
    { label: "רישיון", value: deed ? `${book.license.trim()}, ${deed}` : book.license },
    { label: "מקור", value: book.source },
  ].filter((line) => line.value.trim() !== "");
}
