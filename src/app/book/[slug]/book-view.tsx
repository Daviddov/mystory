import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, Clock, Headphones, Printer } from "lucide-react";
import { cache, type ReactNode } from "react";
import { BookCredits } from "@/components/BookCredits";
import { BookFullText } from "@/components/BookFullText";
import { JsonLd } from "@/components/JsonLd";
import { BookRow } from "@/components/BookRow";
import { FavoriteButtonSlot } from "@/components/library/FavoriteButtonSlot";
import { PlaylistButton } from "@/components/listen/PlaylistButton";
import { ReadToggleButton } from "@/components/library/ReadToggleButton";
import { PageHeading } from "@/components/library/PageHeading";
import { getRecommendations } from "@/components/library/queries";
import { MockNotice } from "@/components/MockNotice";
import { BookComments } from "@/components/personal/BookComments";
import { FavoriteButton } from "@/components/personal/FavoriteButton";
import { StarRating } from "@/components/personal/StarRating";
import { OfflineDownloadButton } from "@/components/pwa/OfflineDownloadButton";
import { ShareButtons } from "@/components/ShareButtons";
import { BookVideoButton } from "@/components/video/BookVideoButton";
import { ButtonLink, Card, Chip } from "@/components/ui";
import { canViewBook } from "@/lib/auth";
import { toCommentView } from "@/lib/comments";
import { isCreativeCommons } from "@/lib/credits";
import { hasNikud } from "@/lib/hebrew";
import { ageGroupsText, readingTimeText } from "@/lib/i18n/labels";
import { taxonomyText } from "@/lib/i18n/messages";
import { READER_MESSAGES } from "@/lib/i18n/reader";
import { getLocale } from "@/lib/i18n/server";
import { mediaUrl } from "@/lib/media/url";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { absoluteUrl, plainText } from "@/lib/seo";
import {
  ageGroupsLabel,
  ageSpan,
  getAgeGroup,
  getCategory,
  getReadingTimeBucket,
  getTheme,
  readingTimeBucket,
  readingTimeLabel,
} from "@/lib/taxonomy";
import {
  bookAgeGroups,
  bookLanguage,
  needsTranslation,
  SLUG_PATTERN,
  textDirection,
  type Book,
  type BookStatus,
  type BookWithPages,
  type User,
} from "@/lib/types";
import { localizeTitle } from "@/lib/i18n/metadata";

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

/** The book's English version, when it has one (its title and summary). */
function englishVersion(book: Book) {
  return [book.translation, ...(book.extraTranslations ?? [])].find((version) => version?.language === "en");
}

/** English description of a book page: its English summary when it has one, else what the book is. */
function bookDescriptionEn(book: Book, title: string, kindEn: string): string {
  const summary = englishVersion(book)?.summary?.replace(/\s+/g, " ").trim();
  if (summary) return summary.length <= 155 ? summary : `${summary.slice(0, 154).trimEnd()}…`;
  const minutes = book.readingMinutes > 0 ? `, a ${book.readingMinutes}-minute read` : "";
  return `${title}: ${kindEn}${minutes}. Free to read online at My Story.`;
}

export async function bookMetadata(slug: string, viewer: User | null): Promise<Metadata> {
  const book = await loadVisibleBook(slug, viewer);
  if (!book) return localizeTitle({ title: "הספר לא נמצא", robots: { index: false } });
  const age = getAgeGroup(book.ageGroup);
  const agesLabel = ageGroupsLabel(bookAgeGroups(book));
  // Search engines match text without nikud: people type titles without vowel points.
  const title = plainText(book.title);
  const hasAudio = book.pages.some((page) => !!page.audio);
  const voweled = book.pages.some((page) => hasNikud(page.text));
  // "סיפור ילדים לקריאה", "...להאזנה", "...עם ניקוד": the phrases parents search with.
  const kind = `סיפור ילדים לקריאה${hasAudio ? " ולהאזנה" : ""}${voweled ? " עם ניקוד" : ""}`;
  const details = `${kind} ל${age ? agesLabel : "כל הגילים"}, ${readingTimeLabel(book.readingMinutes)} קריאה.`;
  const summary = plainText(book.summary, 155).replace(/[.…!?\s]+$/, "");
  // A short summary leaves room for the details; a long one is the description on its own.
  const description = !summary
    ? `${title}: ${details}`
    : summary.length <= 90
      ? `${summary}. ${details}`
      : plainText(book.summary, 155);
  const titleEn = plainText(englishVersion(book)?.title) || title;
  const kindEn = `a children's story to read${hasAudio ? " and listen to" : ""}${voweled ? " with nikud" : ""}`;
  return localizeTitle({
    title: `${title}: ${kind}`,
    description,
    authors: book.author ? [{ name: book.author }] : undefined,
    alternates: { canonical: routes.book(book.slug) },
    robots: book.status === "published" ? undefined : { index: false, follow: false },
    // The share image is drawn from the cover by ./opengraph-image.ts (PNG, 1200x630).
    openGraph: {
      title,
      description,
      type: "book",
      locale: bookLanguage(book) === "ar" ? "ar_AR" : "he_IL",
      siteName: "הסיפור שלי",
      url: routes.book(book.slug),
      authors: book.author ? [book.author] : undefined,
      tags: book.tags,
    },
    twitter: { card: "summary_large_image", title, description },
  }, `${titleEn}: ${kindEn}`, bookDescriptionEn(book, titleEn, kindEn));
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
  // Empty on the static route (force-static sees no cookies), which is always Hebrew; English
  // visitors are sent to the per-request twin by src/proxy.ts.
  const locale = await getLocale();
  const t = READER_MESSAGES[locale].book;

  const repo = await getRepo();
  const [similar, isFavorite, inPlaylist, myProgress, ratingSummary, myRating, comments] = await Promise.all([
    getRecommendations(book),
    user ? repo.isFavorite(user.id, book.id).catch(() => false) : Promise.resolve(false),
    user
      ? repo.listPlaylist(user.id).then((items) => items.some((item) => item.bookId === book.id), () => false)
      : Promise.resolve(false),
    user ? repo.getProgress(user.id, book.id).catch(() => null) : Promise.resolve(null),
    repo.getRatingSummary(book.id).catch(() => ({ average: 0, count: 0 })),
    // Only on the per-request route: the cached page has no viewer, so it never holds anyone's rating.
    user ? repo.getRating(user.id, book.id).catch(() => null) : Promise.resolve(null),
    repo.listComments(book.id).catch(() => []),
  ]);

  const cover = mediaUrl(book.coverImage, book.updatedAt);
  const age = getAgeGroup(book.ageGroup);
  const ageGroups = bookAgeGroups(book).flatMap((slug) => getAgeGroup(slug) ?? []);
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
  // ["0-2", "3-5"] -> [0, 5]
  const ageRange = ageSpan(bookAgeGroups(book));

  const jsonLd =
    book.status === "published"
      ? {
          "@context": "https://schema.org",
          "@type": "Book",
          "@id": `${absoluteUrl(bookPath)}#book`,
          name: plainText(book.title),
          description: plainText(book.summary) || undefined,
          inLanguage: language,
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
          typicalAgeRange: `${ageRange[0]}-${ageRange[1]}`,
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
          {t.statusNotes[book.status as Exclude<BookStatus, "published">]}
        </p>
      ) : null}

      {needsTranslation(book) ? (
        <p role="note" className="rounded-md bg-warning-soft px-4 py-3 text-base">
          {t.needsTranslation(language)}
        </p>
      ) : null}

      <article className="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr] md:gap-10 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="mx-auto w-full max-w-64 md:max-w-none">
          <div className="aspect-[3/4] overflow-hidden rounded-xl border border-border bg-surface-2 shadow-pop">
            {cover ? (
              <img
                src={cover}
                alt={t.coverAlt(book.title)}
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
            title={
              language === "he" && locale === "he" ? (
                book.title
              ) : (
                <span lang={language} dir={textDirection(language)}>
                  {book.title}
                </span>
              )
            }
            structuredData={book.status === "published"}
            locale={locale}
            crumbs={[
              { label: t.allBooks, href: routes.books() },
              ...(age ? [{ label: taxonomyText(locale, "age", age.slug, age).label, href: routes.age(age.slug) }] : []),
              { label: book.title },
            ]}
          >
            {!book.author && !book.illustrator && book.credits?.creators ? (
              <p className="text-lg text-muted">
                {t.creators}
                <bdi>{book.credits.creators}</bdi>
              </p>
            ) : null}
            {book.author || book.illustrator ? (
              <p className="text-lg text-muted">
                {book.author ? (
                  <span>
                    {t.writtenBy}
                    <bdi>{book.author}</bdi>
                  </span>
                ) : null}
                {book.author && book.illustrator ? <span aria-hidden="true"> · </span> : null}
                {book.illustrator ? (
                  <span>
                    {t.illustratedBy}
                    <bdi>{book.illustrator}</bdi>
                  </span>
                ) : null}
              </p>
            ) : null}
            <ul className="flex flex-wrap gap-2">
              {ageGroups.map((group) => (
                <li key={group.slug}>
                  <Chip href={routes.age(group.slug)} icon={group.emoji} tone="accent">
                    {taxonomyText(locale, "age", group.slug, group).label}
                  </Chip>
                </li>
              ))}
              <li>
                <Chip
                  href={timeBucket ? routes.time(timeBucket.slug) : undefined}
                  icon={<Clock className="size-4" />}
                  tone="secondary"
                  size="md"
                >
                  {t.readingTime(readingTimeText(locale, book.readingMinutes))}
                </Chip>
              </li>
              {hasPages ? (
                <li>
                  <Chip size="md">{t.pages(book.pages.length)}</Chip>
                </li>
              ) : null}
            </ul>
          </PageHeading>

          {book.summary ? (
            <p lang={language} dir={textDirection(language)} className="max-w-2xl text-xl leading-relaxed">
              {book.summary}
            </p>
          ) : null}

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
                  {t.read}
                </ButtonLink>
                {hasAudio ? (
                  <ButtonLink
                    href={routes.read(book.slug, undefined, true)}
                    variant="secondary"
                    size="lg"
                    className="w-full sm:w-auto"
                  >
                    <Headphones aria-hidden="true" />
                    {t.listen}
                  </ButtonLink>
                ) : null}
              </div>
            ) : (
              <p role="note" className="rounded-md bg-surface-2 px-4 py-3 text-lg">
                {t.noPages}
              </p>
            )}
            {hasPages && !hasAudio ? (
              <p className="flex items-center gap-2 text-muted">
                <Headphones aria-hidden="true" className="size-5 shrink-0" />
                {t.noAudio}
              </p>
            ) : null}
            {hasMockAudio ? <MockNotice kind="tts" locale={locale} /> : null}
            <div className="flex flex-wrap items-start gap-3">
              {user ? (
                <>
                  <FavoriteButtonSlot
                    bookId={book.id}
                    initialFavorite={isFavorite}
                    signedIn
                    loginHref={routes.login(bookPath)}
                  />
                  {hasAudio && book.status === "published" ? (
                    <PlaylistButton bookId={book.id} initialInPlaylist={inPlaylist} />
                  ) : null}
                  {hasPages ? (
                    <ReadToggleButton
                      bookId={book.id}
                      initialRead={!!myProgress?.completed}
                      pageIndex={myProgress?.pageIndex ?? 0}
                    />
                  ) : null}
                </>
              ) : (
                // Signed-out readers keep favorites on this device; they move into the account at sign-in.
                <FavoriteButton bookId={book.id} title={book.title} variant="label" />
              )}
              {hasPages ? (
                <>
                  <ButtonLink href={routes.print(book.slug)} variant="outline">
                    <Printer aria-hidden="true" className="size-5" />
                    {t.print}
                  </ButtonLink>
                  <OfflineDownloadButton bookId={book.id} title={book.title} />
                  {book.status === "published" ? (
                    <BookVideoButton
                      title={plainText(book.title)}
                      slug={book.slug}
                      coverImage={book.coverImage}
                      version={book.updatedAt}
                      pages={book.pages.map(({ text, textNikud, image, audio, audioSource }) => ({
                        text,
                        textNikud,
                        image,
                        audio,
                        audioSource,
                      }))}
                    />
                  ) : null}
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
            {t.facts}
          </h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {book.author ? (
              <Fact label={t.author}>
                <bdi>{book.author}</bdi>
              </Fact>
            ) : null}
            {book.illustrator ? (
              <Fact label={t.illustrator}>
                <bdi>{book.illustrator}</bdi>
              </Fact>
            ) : null}
            {ageGroups.length > 0 ? (
              <Fact label={t.age}>{ageGroupsText(locale, ageGroups.map((group) => group.slug))}</Fact>
            ) : null}
            <Fact label={t.time}>{readingTimeText(locale, book.readingMinutes)}</Fact>
            <Fact label={t.license}>{book.license ? <bdi>{book.license}</bdi> : t.notGiven}</Fact>
            <Fact label={t.source}>
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
                book.source ? <bdi>{book.source}</bdi> : t.notGiven
              )}
            </Fact>
          </dl>
          {book.origin === "ai" ? (
            <p className="rounded-md bg-surface-2 px-4 py-3 text-base">
              <span aria-hidden="true">✨ </span>
              {t.aiMade}
            </p>
          ) : null}
        </Card>

        {categories.length + themes.length + tags.length > 0 ? (
          <Card as="section" aria-labelledby="book-topics-title" className="flex flex-col gap-4">
            <h2 id="book-topics-title" className="text-2xl font-bold">
              {t.topics}
            </h2>
            {categories.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted">{t.categories}</h3>
                <ul className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <li key={category.slug}>
                      <Chip href={routes.category(category.slug)} icon={category.emoji} tone="primary">
                        {taxonomyText(locale, "category", category.slug, category).label}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {themes.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted">{t.themes}</h3>
                <ul className="flex flex-wrap gap-2">
                  {themes.map((theme) => (
                    <li key={theme.slug}>
                      <Chip href={routes.theme(theme.slug)} icon={theme.emoji} tone="secondary">
                        {taxonomyText(locale, "theme", theme.slug, theme).label}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {tags.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted">{t.tags}</h3>
                <ul className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <li key={tag}>
                      <Chip href={routes.tag(tag)}>{taxonomyText(locale, "tag", tag, { label: tag }).label}</Chip>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>

      {hasPages ? <BookFullText book={book} locale={locale} /> : null}

      {showCredits ? <BookCredits book={book} locale={locale} /> : null}

      {questions.length > 0 ? (
        <section aria-labelledby="book-questions-title" className="flex flex-col gap-4 rounded-xl bg-accent-soft p-5 sm:p-8">
          <h2 id="book-questions-title" className="text-2xl font-bold sm:text-3xl">
            <span aria-hidden="true">💬 </span>
            {t.questions}
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
                <span dir="auto">{question}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Readers' comments are user content: plain text, and never part of the JSON-LD above. */}
      <BookComments
        bookId={book.id}
        initialComments={comments.map((comment) => toCommentView(comment, user))}
        signedIn={!!user}
        loginHref={routes.login(bookPath)}
      />

      <BookRow
        title={t.similar}
        emoji="📚"
        books={similar}
        href={age ? routes.age(age.slug) : routes.books()}
        hrefLabel={age ? t.moreForAge(taxonomyText(locale, "age", age.slug, age).label) : t.toAllBooks}
        locale={locale}
      />
    </main>
  );
}
