/**
 * /print/<slug>: the book laid out for paper. One spread per A4 landscape
 * sheet: the illustration on the right and the text on the left, a cover
 * sheet first and a closing sheet with discussion questions and credits.
 *
 *   ?nikud=1   print the vocalized text where a page has it
 *   ?token=…   access to a private book through its share link
 *
 * The same sheets can be downloaded as a file from /api/pdf/<slug>.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Download } from "lucide-react";
import { ButtonLink, Chip } from "@/components/ui";
import { canViewBook, getCurrentUser } from "@/lib/auth";
import { mediaUrl } from "@/lib/media/url";
import { bookHasNikud, creditLines, printablePages } from "@/lib/pdf/printable";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { ageGroupLabel, readingTimeLabel } from "@/lib/taxonomy";
import { SLUG_PATTERN, type BookWithPages } from "@/lib/types";
import { PRINT_CSS } from "./print-css";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

interface PrintPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function loadBook(slug: string, token: string | undefined): Promise<BookWithPages | null> {
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) return null;
  const repo = await getRepo();
  const book = await repo.getBookBySlug(slug);
  if (!book) return null;
  const user = await getCurrentUser();
  return canViewBook(book, user, token) ? book : null;
}

export async function generateMetadata({ params, searchParams }: PrintPageProps): Promise<Metadata> {
  const { slug } = await params;
  const token = first((await searchParams).token);
  const book = await loadBook(slug, token);
  return {
    title: book ? `הדפסה: ${book.title}` : "הדפסת ספר",
    // The print view duplicates the book page; keep it out of search results.
    robots: { index: false, follow: false },
  };
}

/** Text size by length: short picture-book lines are large, long pages are smaller. */
function textSizeClass(text: string): string {
  const length = text.length;
  if (length <= 45) return "is-xl";
  if (length <= 110) return "is-lg";
  if (length <= 260) return "is-md";
  if (length <= 480) return "is-sm";
  return "is-xs";
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
}

export default async function PrintPage({ params, searchParams }: PrintPageProps) {
  const { slug } = await params;
  const search = await searchParams;
  const token = first(search.token)?.slice(0, 200);
  const book = await loadBook(slug, token);
  if (!book) notFound();

  const canUseNikud = bookHasNikud(book);
  const nikud = canUseNikud && first(search.nikud) === "1";
  const pages = printablePages(book, nikud);
  const questions = book.discussionQuestions.filter((q) => q.trim() !== "");
  const credits = creditLines(book);
  const version = book.updatedAt;

  const backHref = book.status === "published" ? routes.book(book.slug) : token ? routes.share(token) : routes.studio();
  // Pictures of an unpublished book load only for its owner, the staff, or with the share token.
  const mediaToken = book.status === "published" ? undefined : token;
  const pdfHref = `/api/pdf/${book.slug}${query({ nikud: nikud ? "1" : undefined, token })}`;
  const selfHref = (withNikud: boolean) => `${routes.print(book.slug)}${query({ nikud: withNikud ? "1" : undefined, token })}`;
  const sheetCount = pages.length + 2;

  return (
    <main data-immersive className="print-root container-page flex flex-col gap-6 py-6">
      {/* A constant stylesheet (no user input), injected as-is so quotes in it are not escaped. */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <header className="print-toolbar flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href={backHref} variant="ghost">
            <ArrowRight aria-hidden="true" className="size-5" />
            חזרה לספר
          </ButtonLink>
        </div>
        <div>
          <h1 className="text-3xl font-bold">הדפסת הספר: {book.title}</h1>
          <p className="mt-2 max-w-2xl leading-relaxed text-muted">
            {sheetCount} דפים בגודל A4 לרוחב: כריכה, עמוד סיפור בכל דף, ודף סיום עם שאלות לשיחה. בחלון ההדפסה כדאי לבחור
            כיוון &quot;לרוחב&quot; ולבטל כותרות עליונות ותחתונות.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PrintButton />
          <ButtonLink href={pdfHref} variant="secondary" prefetch={false} download>
            <Download aria-hidden="true" className="size-5" />
            הורדת קובץ PDF
          </ButtonLink>
          {canUseNikud ? (
            <div role="group" aria-label="ניקוד" className="flex items-center gap-2">
              <Chip href={selfHref(true)} selected={nikud}>
                עם ניקוד
              </Chip>
              <Chip href={selfHref(false)} selected={!nikud}>
                בלי ניקוד
              </Chip>
            </div>
          ) : null}
        </div>
        <h2 className="sr-only">תצוגה מקדימה של הדפים</h2>
      </header>

      <ol className="print-sheets" aria-label="דפי הספר">
        <li className="print-sheet" aria-label="כריכה">
          <div className={`print-sheet-inner${book.coverImage ? "" : " is-single"}`}>
            {book.coverImage ? (
              <div className="print-art">
                <img src={mediaUrl(book.coverImage, version, mediaToken)} alt={`כריכת הספר ${book.title}`} />
              </div>
            ) : null}
            <div className="print-copy">
              <p className="print-title">{book.title}</p>
              {book.author ? <p className="print-meta">מאת {book.author}</p> : null}
              {book.illustrator && book.illustrator !== book.author ? (
                <p className="print-meta">איורים: {book.illustrator}</p>
              ) : null}
              <p className="print-meta print-muted">
                {ageGroupLabel(book.ageGroup)}, {readingTimeLabel(book.readingMinutes)} קריאה
              </p>
              {book.summary ? <p className="print-summary">{book.summary}</p> : null}
            </div>
          </div>
          <p className="print-folio">הסיפור שלי</p>
        </li>

        {pages.map((page) => (
          <li key={page.number} className="print-sheet" aria-label={`עמוד ${page.number}`}>
            <div className={`print-sheet-inner${page.image ? "" : " is-single"}`}>
              {page.image ? (
                <div className="print-art">
                  <img src={mediaUrl(page.image, version, mediaToken)} alt={`איור לעמוד ${page.number}`} loading="lazy" />
                </div>
              ) : null}
              <div className="print-copy">
                <p className={`print-story ${textSizeClass(page.text)}`}>{page.text}</p>
              </div>
            </div>
            <p className="print-folio" aria-hidden="true">
              {page.number}
            </p>
          </li>
        ))}

        <li className="print-sheet" aria-label="דף סיום">
          <div className="print-sheet-inner is-single">
            <div className="print-copy">
              <p className="print-title">הסוף</p>
              {questions.length > 0 ? (
                <>
                  <p className="print-heading">שאלות לשיחה</p>
                  <ol className="print-questions">
                    {questions.map((question, i) => (
                      <li key={i}>{question}</li>
                    ))}
                  </ol>
                </>
              ) : null}
              <dl className="print-credits">
                <div>
                  <dt>שם הספר</dt>
                  <dd>{book.title}</dd>
                </div>
                {credits.map((line) => (
                  <div key={line.label}>
                    <dt>{line.label}</dt>
                    <dd>{line.value}</dd>
                  </div>
                ))}
              </dl>
              {book.credits?.publisherLogo ? (
                <img
                  className="print-credit-logo"
                  src={mediaUrl(book.credits.publisherLogo, version, mediaToken)}
                  alt={`הלוגו של ${book.credits.publisher ?? "המוציא לאור"}`}
                />
              ) : null}
            </div>
          </div>
          <p className="print-folio">הסיפור שלי</p>
        </li>
      </ol>
    </main>
  );
}
