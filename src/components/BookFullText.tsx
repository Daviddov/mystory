import { BookOpenText } from "lucide-react";
import { mediaUrl } from "@/lib/media/url";
import { pageDisplayText } from "@/lib/reader/logic";
import { plainText } from "@/lib/seo";
import type { BookWithPages } from "@/lib/types";

/**
 * The whole story as plain HTML on the book's page: every page's text (with
 * nikud when the book has it) and illustration. Readers get a quick way to
 * read it all at once, and search engines get the story itself, which the
 * reader only shows one page at a time. Collapsed by default; its content is
 * in the HTML either way.
 */
export function BookFullText({ book }: { book: BookWithPages }) {
  const pages = book.pages.filter((page) => page.text.trim() || page.image);
  if (pages.length === 0) return null;
  const title = plainText(book.title);
  return (
    <details className="group rounded-xl border border-border bg-surface p-5 sm:p-8">
      <summary className="flex cursor-pointer list-none items-center gap-3 text-2xl font-bold sm:text-3xl [&::-webkit-details-marker]:hidden">
        <BookOpenText aria-hidden="true" className="size-7 shrink-0 text-secondary" />
        <h2>הסיפור המלא: {book.title}</h2>
        <span aria-hidden="true" className="ms-auto text-base font-semibold text-muted group-open:hidden">
          לפתוח
        </span>
      </summary>
      <ol className="mt-6 flex flex-col gap-8">
        {pages.map((page, index) => {
          const image = mediaUrl(page.image, book.updatedAt);
          const text = pageDisplayText(page, true).trim();
          return (
            <li key={index} className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              {image ? (
                <img
                  src={image}
                  alt={plainText(page.imageAlt) || `איור לעמוד ${index + 1} בסיפור ${title}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full rounded-lg bg-surface-2 object-contain sm:w-64 sm:shrink-0"
                />
              ) : null}
              {text ? (
                <p className="story-text whitespace-pre-line" dir="auto">
                  {text}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
