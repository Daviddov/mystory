import type { Metadata } from "next";
import { BookHeart, Camera, Printer, Sparkles } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";
import { ButtonLink, Card, CardDescription, CardTitle } from "@/components/ui";
import { accountMessages } from "@/lib/i18n/account";
import { getLocale } from "@/lib/i18n/server";
import { routes } from "@/lib/routes";
import { breadcrumbJsonLd } from "@/lib/seo";
import { localizeTitle } from "@/lib/i18n/metadata";

/** The visible price teaser. A plan, not an offer: nothing can be bought yet. */
const TEASER = { books: 10, shekels: 39 } as const;

const TITLE = "ספר אישי לילד: סיפור מאויר עם השם שלו";
const DESCRIPTION =
  "יוצרים בעברית ספר ילדים מאויר שבו הילד או הילדה הם הגיבורים, עם ניקוד והקראה. ספר אחד בשבוע בחינם, ואפשר להירשם לעדכון על ספרים נוספים וספר מודפס.";

const HEBREW_METADATA: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.personalBook() },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", locale: "he_IL" },
};

export function generateMetadata(): Promise<Metadata> {
  return localizeTitle(HEBREW_METADATA, "A personal book for your child: an illustrated story with their name");
}

const STEP_ICONS = [Camera, Sparkles, BookHeart] as const;

/** Structured data stays Hebrew, like the rest of the page's SEO. */
const QUESTIONS = accountMessages("he").personalBook.questions(TEASER.books, TEASER.shekels);

export default async function PersonalBookPage() {
  const t = accountMessages(await getLocale()).personalBook;
  const questions = t.questions(TEASER.books, TEASER.shekels);
  return (
    <main className="container-page py-10">
      <JsonLd data={breadcrumbJsonLd([{ label: accountMessages("he").personalBook.crumb }])} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: QUESTIONS.map(({ q, a }) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }}
      />
      <div className="mx-auto flex max-w-3xl flex-col gap-12">
        <header className="flex flex-col items-start gap-4">
          <h1 className="text-3xl font-bold leading-tight sm:text-5xl">{t.title}</h1>
          <p className="text-xl leading-relaxed text-muted">{t.intro}</p>
          <ButtonLink href={routes.create()} size="lg">
            {t.cta}
          </ButtonLink>
        </header>

        <section aria-labelledby="how" className="flex flex-col gap-5">
          <h2 id="how" className="text-2xl font-bold">
            {t.how}
          </h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {t.steps.map(({ title, text }, index) => {
              const Icon = STEP_ICONS[index] ?? Sparkles;
              return (
                <Card as="li" key={title} className="flex flex-col gap-2">
                  <Icon aria-hidden="true" className="size-8 text-primary" />
                  <CardTitle>
                    {index + 1}. {title}
                  </CardTitle>
                  <CardDescription>{text}</CardDescription>
                </Card>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="more" className="flex flex-col gap-5">
          <h2 id="more" className="text-2xl font-bold">
            {t.more}
          </h2>
          <Card tone="soft" padding="lg" className="flex flex-col gap-6">
            <p className="flex items-center gap-3 text-lg leading-relaxed">
              <Printer aria-hidden="true" className="size-7 shrink-0 text-primary" />
              <span>{t.moreText(TEASER.books, TEASER.shekels)}</span>
            </p>
            <WaitlistForm />
          </Card>
        </section>

        <section aria-labelledby="faq" className="flex flex-col gap-4">
          <h2 id="faq" className="text-2xl font-bold">
            {t.faq}
          </h2>
          {questions.map(({ q, a }) => (
            <div key={q} className="flex flex-col gap-1">
              <h3 className="text-lg font-bold">{q}</h3>
              <p className="text-lg leading-relaxed text-muted">{a}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
