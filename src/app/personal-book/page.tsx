import type { Metadata } from "next";
import { BookHeart, Camera, Printer, Sparkles } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";
import { ButtonLink, Card, CardDescription, CardTitle } from "@/components/ui";
import { routes } from "@/lib/routes";
import { breadcrumbJsonLd } from "@/lib/seo";

/** The visible price teaser. A plan, not an offer: nothing can be bought yet. */
const TEASER = { books: 10, shekels: 39 } as const;

const TITLE = "ספר אישי לילד: סיפור מאויר עם השם שלו";
const DESCRIPTION =
  "יוצרים בעברית ספר ילדים מאויר שבו הילד או הילדה הם הגיבורים, עם ניקוד והקראה. ספר אחד בשבוע בחינם, ואפשר להירשם לעדכון על ספרים נוספים וספר מודפס.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.personalBook() },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", locale: "he_IL" },
};

const STEPS = [
  { icon: Camera, title: "מספרים על הילד", text: "שם, גיל, מה הוא אוהב, ואם רוצים גם תמונה כדי שהגיבור ידמה לו." },
  { icon: Sparkles, title: "הסיפור נכתב ומאויר", text: "סיפור בחרוזים בעברית, עם איור לכל עמוד, בכמה דקות." },
  { icon: BookHeart, title: "קוראים ומקשיבים", text: "הספר נפתח עם ניקוד והקראה בקול, ואפשר לשמור אותו, לשתף אותו ולהדפיס." },
] as const;

const QUESTIONS = [
  {
    q: "כמה עולה ספר אישי?",
    a: `ספר אחד בשבוע בחינם. על חבילות ספרים נוספות אנחנו עדיין חושבים (בערך ${TEASER.books} ספרים ב-${TEASER.shekels} ₪), ועוד אי אפשר לרכוש. השאירו מייל ונעדכן.`,
  },
  {
    q: "אפשר לקבל ספר מודפס?",
    a: "זה בתכנון. כרגע אפשר להוריד קובץ PDF להדפסה בבית. השאירו מייל ונעדכן כשיהיה ספר מודפס שמגיע עד הדלת.",
  },
  {
    q: "מה קורה לתמונה של הילד?",
    a: "התמונה משמשת רק ליצירת הספר שלכם. הספר נשאר פרטי ורק אתם מחליטים אם לשתף אותו.",
  },
] as const;

export default function PersonalBookPage() {
  return (
    <main className="container-page py-10">
      <JsonLd data={breadcrumbJsonLd([{ label: "ספר אישי" }])} />
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
          <h1 className="text-3xl font-bold leading-tight sm:text-5xl">ספר אישי לילד שלכם</h1>
          <p className="text-xl leading-relaxed text-muted">
            סיפור מאויר בעברית שבו הילד או הילדה הם הגיבורים. מתאים כמתנה, לפני השינה, או סתם בשביל הכיף.
          </p>
          <ButtonLink href={routes.create()} size="lg">
            יוצרים ספר חינם
          </ButtonLink>
        </header>

        <section aria-labelledby="how" className="flex flex-col gap-5">
          <h2 id="how" className="text-2xl font-bold">
            איך זה עובד
          </h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <Card as="li" key={title} className="flex flex-col gap-2">
                <Icon aria-hidden="true" className="size-8 text-primary" />
                <CardTitle>
                  {index + 1}. {title}
                </CardTitle>
                <CardDescription>{text}</CardDescription>
              </Card>
            ))}
          </ol>
        </section>

        <section aria-labelledby="more" className="flex flex-col gap-5">
          <h2 id="more" className="text-2xl font-bold">
            רוצים עוד?
          </h2>
          <Card tone="soft" padding="lg" className="flex flex-col gap-6">
            <p className="flex items-center gap-3 text-lg leading-relaxed">
              <Printer aria-hidden="true" className="size-7 shrink-0 text-primary" />
              <span>
                ספר אחד בשבוע הוא חינם. אנחנו בודקים אם יש עניין בחבילת ספרים נוספים (בערך {TEASER.books} ספרים ב-
                {TEASER.shekels} ₪) ובספר מודפס. אם זה מעניין אתכם, השאירו מייל ונעדכן כשזה יהיה זמין.
              </span>
            </p>
            <WaitlistForm />
          </Card>
        </section>

        <section aria-labelledby="faq" className="flex flex-col gap-4">
          <h2 id="faq" className="text-2xl font-bold">
            שאלות נפוצות
          </h2>
          {QUESTIONS.map(({ q, a }) => (
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
