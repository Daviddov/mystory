import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, Clock, Headphones, Printer } from "lucide-react";
import { cache, type ReactNode } from "react";
import { BookCredits } from "@/components/BookCredits";
import { BookFullText } from "@/components/BookFullText";
import { JsonLd } from "@/components/JsonLd";
import { BookRow } from "@/components/BookRow";
import { FavoriteButtonSlot } from "@/components/library/FavoriteButtonSlot";
import { PageHeading } from "@/components/library/PageHeading";
import { getRecommendations } from "@/components/library/queries";
import { MockNotice } from "@/components/MockNotice";
import { FavoriteButton } from "@/components/personal/FavoriteButton";
import { StarRating } from "@/components/personal/StarRating";
import { OfflineDownloadButton } from "@/components/pwa/OfflineDownloadButton";
import { ShareButtons } from "@/components/ShareButtons";
import { ButtonLink, Card, Chip } from "@/components/ui";
import { canViewBook } from "@/lib/auth";
import { isCreativeCommons, LANGUAGE_NAMES_HE } from "@/lib/credits";
import { mediaUrl } from "@/lib/media/url";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { absoluteUrl, plainText } from "@/lib/seo";
import {
  getAgeGroup,
  getCategory,
  getReadingTimeBucket,
  getTheme,
  readingTimeBucket,
  readingTimeLabel,
} from "@/lib/taxonomy";
import { bookLanguage, SLUG_PATTERN, type BookStatus, type BookWithPages, type User } from "@/lib/types";

/**
 * The book page, shared by two routes:
 *   - /book/[slug] (./page.tsx): static and cached, for everyone signed out.
 *     It always renders with viewer = null, so it can only ever show a
 *     published book, and its cached HTML holds nothing personal.
 *   - /live/book/[slug] (src/app/live): rendered per request with the signed-in
 *     viewer, so owners and editors can preview unpublished books and readers
 *     see their saved favorite. src/proxy.ts sends signed-in visitors there.
 */

/**
 * The book, or null when it does not exist OR the viewer may not see it.
 * Used by both the page and its metadata, so a private title never leaks.
 */
const loadVisibleBook = cache(async (slug: string, viewer: User | null): Promise<BookWithPages | null> => {
  if (!SLUG_PATTERN.test(slug)) return null;
  const repo = await getRepo();
  const book = await repo.getBookBySlug(slug);
  if (!book) return null;
  if (book.status !== "published" && !canViewBook(book, viewer)) return null;
  return book;
});

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const STATUS_NOTES: Record<Exclude<BookStatus, "published">, string> = {
  draft: "זאת טיוטה. רק מי שיצר אותה ועורכי האתר רואים את העמוד הזה.",
  private: "זה ספר פרטי. הוא לא מופיע בספרייה, ורק מי שיצר אותו ועורכי האתר רואים את העמוד הזה.",
  pending: "הספר ממתין לאישור עורך, ועדיין לא מופיע בספרייה.",
};

export async function bookMetadata(slug: string, viewer: User | null): Promise<Metadata> {
  const book = await loadVisibleBook(slug, viewer);
  if (!book) return { title: "הספר לא נמצא", robots: { index: false } };
  const age = getAgeGroup(book.ageGroup);
  // Search engines match text without nikud: people type titles without vowel points.
  const title = plainText(book.title);
  const hasAudio = book.pages.some((page) => !!page.audio);
  const description =
    plainText(book.summary, 155) ||
    `${title}: סיפור לילדים ל${age?.label ?? "כל הגילים"}, ${readingTimeLabel(book.readingMinutes)} קריאה${hasAudio ? ", עם הקראה" : ""}.`;
  return {
    title: `${title}: סיפור לילדים${hasAudio ? " עם הקראה" : ""}`,
    description,
    authors: book.author ? [{ name: book.author }] : undefined,
    alternates: { canonical: routes.book(book.slug) },
    robots: book.status === "published" ? undefined : { index: false, follow: false },
    // The share image is drawn from the cover by ./opengraph-image.ts (PNG, 1200x630).
    openGraph: {
      title,
      description,
      type: "book",
      locale: "he_IL",
      siteName: "הסיפור שלי",
      url: routes.book(book.slug),
      authors: book.author ? [book.author] : undefined,
      tags: book.tags,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="break-words text-lg">{children}</dd>
    </div>
  );
}

export async function BookView({ slug, viewer: user }: { slug: string; viewer: User | null }) {
  const book = await loadVisibleBook(slug, user);
  if (!book) notFound();

  const repo = await getRepo();
  const [similar, isFavorite, ratingSummary, myRating] = await Promise.all([
    getRecommendations(book),
    user ? repo.isFavorite(user.id, book.id).catch(() => false) : Promise.resolve(false),
    repo.getRatingSummary(book.id).catch(() => ({ average: 0, count: 0 })),
    // Only on the per-request route: the cached page has no viewer, so it never holds anyone's rating.
    user ? repo.getRating(user.id, book.id).catch(() => null) : Promise.resolve(null),
  ]);

  const cover = mediaUrl(book.coverImage, book.updatedAt);
  const age = getAgeGroup(book.ageGroup);
  const timeBucket = getReadingTimeBucket(readingTimeBucket(book.readingMinutes));
  const narratedPages = book.pages.filter((page) => !!page.audio);
  const hasAudio = narratedPages.length > 0;
  const hasMockAudio = narratedPages.some((page) => page.audioSource === "mock");
  const hasPages = book.pages.length > 0;
  const sourceUrl = book.source ? httpUrl(book.source) : null;
  const categories = book.categories.flatMap((slug) => getCategory(slug) ?? []);
  const themes = book.themes.flatMap((slug) => getTheme(slug) ?? []);
  const tags = book.tags.map((tag) => tag.trim()).filter(Boolean);
  const questions = book.discussionQuestions.map((question) => question.trim()).filter(Boolean);
  const readHref = routes.read(book.slug);
  const language = bookLanguage(book);
  // Books from an outside publisher and Creative Commons books get the full credit block.
  const showCredits = !!book.credits || isCreativeCommons(book.license);
  const bookPath = routes.book(book.slug);
  // "3-5" -> [3, 5]
  const ageRange = book.ageGroup.split("-").map(Number);

  const jsonLd =
    book.status === "published"
      ? {
          "@context": "https://schema.org",
          "@type": "Book",
          "@id": `${absoluteUrl(bookPath)}#book`,
          name: plainText(book.title),
          description: plainText(book.summary) || undefined,
          inLanguage: "he",
          url: absoluteUrl(bookPath),
          image: absoluteUrl(cover),
          author: book.author ? { "@type": "Person", name: book.author } : undefined,
          illustrator: book.illustrator ? { "@type": "Person", name: book.illustrator } : undefined,
          translator: book.credits?.translator ? { "@type": "Person", name: book.credits.translator } : undefined,
          bookFormat: "https://schema.org/EBook",
          audience: { "@type": "PeopleAudience", suggestedMinAge: ageRange[0], suggestedMaxAge: ageRange[1] },
          timeRequired: `PT${Math.max(1, book.readingMinutes)}M`,
          // Narrated books can be listened to with the text highlighted as it is read.
          accessMode: hasAudio ? ["textual", "visual", "auditory"] : ["textual", "visual"],
          accessibilityFeature: hasAudio ? ["synchronizedAudioText"] : undefined,
          genre: categories.length > 0 ? categories.map((category) => category.label) : undefined,
          about: themes.length > 0 ? themes.map((theme) => ({ "@type": "Thing", name: theme.label })) : undefined,
          publisher: { "@type": "Organization", name: "הסיפור שלי", url: absoluteUrl(routes.home()) },
          license: book.license || undefined,
          numberOfPages: book.pages.length || undefined,
          typicalAgeRange: book.ageGroup,
          datePublished: book.publishedAt,
          dateModified: book.updatedAt,
          keywords: tags.length > 0 ? tags.join(", ") : undefined,
          isAccessibleForFree: true,
        }
      : null;

  return (
    <main className="container-page flex flex-col gap-10 py-6 sm:py-10">
      {jsonLd ? <JsonLd data={jsonLd} /> : null}

      {book.status !== "published" ? (
        <p role="note" className="rounded-md bg-warning-soft px-4 py-3 text-base">
          {STATUS_NOTES[book.status]}
        </p>
      ) : null}

      {language !== "he" ? (
        <p role="note" className="rounded-md bg-warning-soft px-4 py-3 text-base">
          הספר הזה עדיין ב{LANGUAGE_NAMES_HE[language]} ולא תורגם לעברית. הוא לא יכול להתפרסם בספרייה עד שיתורגם.
        </p>
      ) : null}

      <article className="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr] md:gap-10 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="mx-auto w-full max-w-64 md:max-w-none">
          <div className="aspect-[3/4] overflow-hidden rounded-xl border border-border bg-surface-2 shadow-pop">
            {cover ? (
              <img
                src={cover}
                alt={`כריכת הספר ${book.title}`}
                width={600}
                height={800}
                fetchPriority="high"
                decoding="async"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-8xl" aria-hidden="true">
                📖
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <PageHeading
            title={book.title}
            structuredData={book.status === "published"}
            crumbs={[
              { label: "כל הספרים", href: routes.books() },
              ...(age ? [{ label: age.label, href: routes.age(age.slug) }] : []),
              { label: book.title },
            ]}
          >
            {!book.author && !book.illustrator && book.credits?.creators ? (
              <p className="text-lg text-muted">
                יוצרי הספר: <bdi>{book.credits.creators}</bdi>
              </p>
            ) : null}
            {book.author || book.illustrator ? (
              <p className="text-lg text-muted">
                {book.author ? <span>כתיבה: {book.author}</span> : null}
                {book.author && book.illustrator ? <span aria-hidden="true"> · </span> : null}
                {book.illustrator ? <span>איור: {book.illustrator}</span> : null}
              </p>
            ) : null}
            <ul className="flex flex-wrap gap-2">
              {age ? (
                <li>
                  <Chip href={routes.age(age.slug)} icon={age.emoji} tone="accent">
                    {age.label}
                  </Chip>
                </li>
              ) : null}
              <li>
                <Chip
                  href={timeBucket ? routes.time(timeBucket.slug) : undefined}
                  icon={<Clock className="size-4" />}
                  tone="secondary"
                  size="md"
                >
                  {readingTimeLabel(book.readingMinutes)} קריאה
                </Chip>
              </li>
              {hasPages ? (
                <li>
                  <Chip size="md">{book.pages.length} עמודים</Chip>
                </li>
              ) : null}
            </ul>
          </PageHeading>

          {book.summary ? <p className="max-w-2xl text-xl leading-relaxed">{book.summary}</p> : null}

          <div className="flex flex-col gap-3">
            {hasPages ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <ButtonLink
                  href={readHref}
                  size="lg"
                  className="min-h-16 w-full px-10 text-2xl sm:w-auto"
                  data-testid="read-button"
                >
                  <BookOpen aria-hidden="true" className="size-7" />
                  בואו נקרא
                </ButtonLink>
                {hasAudio ? (
                  <ButtonLink
                    href={routes.read(book.slug, undefined, true)}
                    variant="secondary"
                    size="lg"
                    className="w-full sm:w-auto"
                  >
                    <Headphones aria-hidden="true" />
                    האזנה לסיפור
                  </ButtonLink>
                ) : null}
              </div>
            ) : (
              <p role="note" className="rounded-md bg-surface-2 px-4 py-3 text-lg">
                לספר הזה עוד אין עמודים, ולכן אי אפשר לקרוא אותו עדיין.
              </p>
            )}
            {hasPages && !hasAudio ? (
              <p className="flex items-center gap-2 text-muted">
                <Headphones aria-hidden="true" className="size-5 shrink-0" />
                לספר הזה עוד אין הקראה. אפשר לקרוא אותו יחד בקול.
              </p>
            ) : null}
            {hasMockAudio ? <MockNotice kind="tts" /> : null}
            <div className="flex flex-wrap items-start gap-3">
              {user ? (
                <FavoriteButtonSlot
                  bookId={book.id}
                  initialFavorite={isFavorite}
                  signedIn
                  loginHref={routes.login(bookPath)}
                />
              ) : (
                // Signed-out readers keep favorites on this device; they move into the account at sign-in.
                <FavoriteButton bookId={book.id} title={book.title} variant="label" />
              )}
              {hasPages ? (
                <>
                  <ButtonLink href={routes.print(book.slug)} variant="outline">
                    <Printer aria-hidden="true" className="size-5" />
                    הדפסה ו-PDF
                  </ButtonLink>
                  <OfflineDownloadButton bookId={book.id} title={book.title} />
                </>
              ) : null}
            </div>
            <StarRating
              bookId={book.id}
              initialAverage={ratingSummary.average}
              initialCount={ratingSummary.count}
              initialMine={myRating?.stars ?? null}
              signedIn={!!user}
              loginHref={routes.login(bookPath)}
            />
            {book.status === "published" ? <ShareButtons url={absoluteUrl(bookPath) ?? bookPath} title={plainText(book.title)} /> : null}
          </div>
        </div>
      </article>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="book-facts-title" className="flex flex-col gap-4">
          <h2 id="book-facts-title" className="text-2xl font-bold">
            פרטי הספר
          </h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {book.author ? <Fact label="כתיבה">{book.author}</Fact> : null}
            {book.illustrator ? <Fact label="איור">{book.illustrator}</Fact> : null}
            {age ? <Fact label="גיל מומלץ">{age.label}</Fact> : null}
            <Fact label="זמן קריאה">{readingTimeLabel(book.readingMinutes)}</Fact>
            <Fact label="רישיון">{book.license || "לא צוין"}</Fact>
            <Fact label="מקור">
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  rel="noopener noreferrer nofollow"
                  target="_blank"
                  dir="ltr"
                  className="break-all font-semibold text-secondary underline underline-offset-4"
                >
                  {sourceUrl}
                </a>
              ) : (
                book.source || "לא צוין"
              )}
            </Fact>
          </dl>
          {book.origin === "ai" ? (
            <p className="rounded-md bg-surface-2 px-4 py-3 text-base">
              <span aria-hidden="true">✨ </span>
              הספר הזה נוצר בעזרת בינה מלאכותית.
            </p>
          ) : null}
        </Card>

        {categories.length + themes.length + tags.length > 0 ? (
          <Card as="section" aria-labelledby="book-topics-title" className="flex flex-col gap-4">
            <h2 id="book-topics-title" className="text-2xl font-bold">
              על מה הספר
            </h2>
            {categories.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted">קטגוריות</h3>
                <ul className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <li key={category.slug}>
                      <Chip href={routes.category(category.slug)} icon={category.emoji} tone="primary">
                        {category.label}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {themes.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted">נושאים לשיחה</h3>
                <ul className="flex flex-wrap gap-2">
                  {themes.map((theme) => (
                    <li key={theme.slug}>
                      <Chip href={routes.theme(theme.slug)} icon={theme.emoji} tone="secondary">
                        {theme.label}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {tags.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted">תגיות</h3>
                <ul className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <li key={tag}>
                      <Chip href={routes.tag(tag)}>{tag}</Chip>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>

      {hasPages ? <BookFullText book={book} /> : null}

      {showCredits ? <BookCredits book={book} /> : null}

      {questions.length > 0 ? (
        <section aria-labelledby="book-questions-title" className="flex flex-col gap-4 rounded-xl bg-accent-soft p-5 sm:p-8">
          <h2 id="book-questions-title" className="text-2xl font-bold sm:text-3xl">
            <span aria-hidden="true">💬 </span>
            שאלות לשיחה אחרי הסיפור
          </h2>
          <ol className="flex flex-col gap-3">
            {questions.map((question, index) => (
              <li key={index} className="flex items-start gap-3 text-lg leading-relaxed sm:text-xl">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-accent-foreground"
                >
                  {index + 1}
                </span>
                <span>{question}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <BookRow
        title="עוד ספרים כאלה"
        emoji="📚"
        books={similar}
        href={age ? routes.age(age.slug) : routes.books()}
        hrefLabel={age ? `עוד ספרים ל${age.label}` : "לכל הספרים"}
      />
    </main>
  );
}
