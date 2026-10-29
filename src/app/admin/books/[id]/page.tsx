import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnimationPanel } from "@/components/admin/AnimationPanel";
import { BookRowActions } from "@/components/admin/BookRowActions";
import { PushToSupabasePanel } from "@/components/admin/PushToSupabasePanel";
import { ReviewActions } from "@/components/admin/ReviewActions";
import { StatusChip } from "@/components/admin/StatusChip";
import { MockNotice } from "@/components/MockNotice";
import { ButtonLink, Card, CardTitle, Chip } from "@/components/ui";
import { animateBook, animationLicenseCheck, type BookAnimationSummary } from "@/lib/animation";
import { mediaUrl } from "@/lib/media/url";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { isBookPushAvailable } from "@/lib/sync/push-book";
import { ageGroupLabel, categoryLabel, readingTimeLabel, themeLabel } from "@/lib/taxonomy";
import { IdSchema, SYSTEM_OWNER_ID } from "@/lib/types";
import { requireAdminPage } from "../../_lib/guard";
import { formatDate, ORIGIN_LABELS } from "../../_lib/labels";
import { adminPaths } from "../../_lib/paths";
import { missingPublishCredits, publishBlockers } from "../../_lib/service";

export const metadata: Metadata = { title: "תצוגה מקדימה" };
export const dynamic = "force-dynamic";

/** Editor preview: the whole book on one page (works even before the reader exists). */
export default async function AdminBookPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = IdSchema.safeParse(rawId);
  if (!id.success) notFound();
  const viewer = await requireAdminPage(adminPaths.book(id.data));

  const repo = await getRepo();
  const book = await repo.getBookById(id.data);
  if (!book) notFound();
  const [owner, settings] = await Promise.all([
    book.ownerId === SYSTEM_OWNER_ID ? null : repo.getUser(book.ownerId),
    repo.getSettings(),
  ]);
  const ownerName = book.ownerId === SYSTEM_OWNER_ID ? "ספריית האתר" : (owner?.name ?? "משתמש לא ידוע");
  const hasMockAudio = book.pages.some((page) => page.audioSource === "mock");
  const animationLicense = animationLicenseCheck(book);
  // Dry run: which pages would be animated and what it would cost. Reads the illustrations, calls no provider.
  let animationEstimate: BookAnimationSummary | null = null;
  if (animationLicense.allowed) {
    try {
      animationEstimate = await animateBook(book.id, { dryRun: true });
    } catch (err) {
      console.error("[admin] animation estimate failed", err);
    }
  }
  const details: [string, string][] = [
    ["יוצר", ownerName],
    ["מחבר", book.author || "לא צוין"],
    ["מאייר", book.illustrator || "לא צוין"],
    ["רישיון", book.license || "חסר"],
    ["מקור", book.source || "חסר"],
    ["אופן היצירה", ORIGIN_LABELS[book.origin]],
    ["נוצר", formatDate(book.createdAt)],
    ["עודכן", formatDate(book.updatedAt)],
    ...(book.publishedAt ? ([["פורסם", formatDate(book.publishedAt)]] as [string, string][]) : []),
    ["צפיות", String(book.viewCount)],
  ];

  return (
    <article className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-3xl font-extrabold">{book.title}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusChip status={book.status} />
            <Chip>{ageGroupLabel(book.ageGroup)}</Chip>
            <Chip>{book.pages.length} עמודים</Chip>
            <Chip>{readingTimeLabel(book.readingMinutes)}</Chip>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={routes.read(book.slug)} variant="outline" size="sm">
            פתיחה בנגן הקריאה
          </ButtonLink>
          <ButtonLink href={routes.studioBook(book.id)} variant="outline" size="sm">
            עריכה בסטודיו
          </ButtonLink>
        </div>
      </div>

      {book.origin === "ai" ? (
        <p role="note" className="rounded-md bg-warning-soft px-4 py-3">
          הספר נוצר ב-AI. חשוב לקרוא את כל הטקסט ולבדוק את כל האיורים לפני הפרסום.
        </p>
      ) : null}
      {hasMockAudio ? <MockNotice kind="tts" /> : null}

      <Card className="flex flex-col gap-4">
        <CardTitle>החלטה</CardTitle>
        {book.status === "pending" ? (
          <ReviewActions
            bookId={book.id}
            title={book.title}
            blockers={publishBlockers(book)}
            missingCredits={missingPublishCredits(book)}
            canWaiveCredits={viewer.role === "admin"}
            afterHref={adminPaths.queue()}
            updatedAt={book.updatedAt}
          />
        ) : (
          <p className="text-muted">הספר לא ממתין לאישור. אפשר לשנות את הסטטוס שלו ישירות:</p>
        )}
        {book.reviewNote ? (
          <p className="rounded-md bg-warning-soft px-4 py-3">
            <span className="font-semibold">הערת עורך קודמת: </span>
            {book.reviewNote}
          </p>
        ) : null}
        <BookRowActions
          bookId={book.id}
          title={book.title}
          status={book.status}
          isBookOfTheWeek={settings.bookOfTheWeekId === book.id}
          afterDeleteHref={adminPaths.books()}
          missingCredits={missingPublishCredits(book)}
          canWaiveCredits={viewer.role === "admin"}
        />
      </Card>

      {viewer.role === "admin" && (await isBookPushAvailable()) && (
        <Card className="flex flex-col gap-4">
          <CardTitle>עדכון ב-Supabase</CardTitle>
          <PushToSupabasePanel bookId={book.id} />
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <CardTitle>הנפשת איורים</CardTitle>
        <AnimationPanel
          bookId={book.id}
          title={book.title}
          estimate={animationEstimate}
          licenseRefusal={animationLicense.allowed ? undefined : animationLicense.message}
          animatedPages={book.pages.filter((page) => page.video).map((page) => page.index)}
          canRun={viewer.role === "admin"}
        />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]">
        <div className="aspect-[3/4] w-56 max-w-full overflow-hidden rounded-lg bg-surface-2">
          {book.coverImage ? (
            <img
              src={mediaUrl(book.coverImage, book.updatedAt)}
              alt={`כריכת ${book.title}`}
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-muted">אין כריכה</span>
          )}
        </div>
        <div className="flex flex-col gap-4">
          {book.summary ? <p className="text-lg leading-relaxed">{book.summary}</p> : null}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="font-medium [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            {book.categories.map((slug) => (
              <Chip key={`c-${slug}`} tone="primary">
                {categoryLabel(slug)}
              </Chip>
            ))}
            {book.themes.map((slug) => (
              <Chip key={`t-${slug}`} tone="secondary">
                {themeLabel(slug)}
              </Chip>
            ))}
            {book.tags.map((tag) => (
              <Chip key={`g-${tag}`}>{tag}</Chip>
            ))}
          </div>
        </div>
      </div>

      <section aria-labelledby="pages-heading" className="flex flex-col gap-4">
        <h3 id="pages-heading" className="text-2xl font-bold">
          עמודי הספר
        </h3>
        {book.pages.length === 0 ? (
          <p className="text-muted">לספר אין עמודים.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {book.pages.map((page) => (
              <Card as="li" key={page.index} className="grid gap-4 md:grid-cols-[20rem_1fr]">
                <div className="aspect-[4/3] overflow-hidden rounded-md bg-surface-2">
                  {page.image ? (
                    <img
                      src={mediaUrl(page.image, book.updatedAt)}
                      alt={`האיור של עמוד ${page.index + 1}`}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted">אין איור</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold text-muted">עמוד {page.index + 1}</p>
                  <p className="story-text whitespace-pre-line">{page.textNikud || page.text || "(אין טקסט)"}</p>
                  {page.audio ? (
                    <audio controls preload="none" src={mediaUrl(page.audio, book.updatedAt)} className="w-full" />
                  ) : (
                    <p className="text-sm text-muted">אין הקראה לעמוד הזה.</p>
                  )}
                  {page.audioSource === "mock" ? <MockNotice kind="tts" variant="inline" /> : null}
                  {page.video ? (
                    <video
                      src={mediaUrl(page.video, book.updatedAt)}
                      poster={page.image ? mediaUrl(page.image, book.updatedAt) : undefined}
                      muted
                      loop
                      controls
                      playsInline
                      preload="none"
                      aria-label={`ההנפשה של עמוד ${page.index + 1}`}
                      className="aspect-video w-full max-w-sm rounded-md bg-surface-2"
                    />
                  ) : null}
                  {page.video && page.videoSource === "mock" ? (
                    <MockNotice variant="inline">הנפשה לדוגמה: שירות הווידאו לא היה מחובר.</MockNotice>
                  ) : null}
                </div>
              </Card>
            ))}
          </ol>
        )}
      </section>

      {book.discussionQuestions.length > 0 ? (
        <section aria-labelledby="questions-heading" className="flex flex-col gap-2">
          <h3 id="questions-heading" className="text-2xl font-bold">
            שאלות לשיחה
          </h3>
          <ul className="list-inside list-disc leading-relaxed">
            {book.discussionQuestions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
