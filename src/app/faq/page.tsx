import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { routes } from "@/lib/routes";
import { InfoPage } from "../about/_components/InfoPage";

export const metadata: Metadata = {
  title: "שאלות ותשובות",
  description: "תשובות על קריאה, האזנה, כפתור הניקוד, יצירת סיפור, פרטיות של תמונות ילדים ורישיונות הספרים באתר הסיפור שלי.",
  alternates: { canonical: "/faq" },
};

interface Question {
  q: string;
  /** Paragraphs of the answer, as plain text (also used for the structured data). */
  a: string[];
  /** Optional link shown after the answer. */
  link?: { href: string; label: string };
}

interface Topic {
  id: string;
  title: string;
  emoji: string;
  questions: Question[];
}

const TOPICS: Topic[] = [
  {
    id: "reading",
    title: "קריאה",
    emoji: "📖",
    questions: [
      {
        q: "צריך להירשם כדי לקרוא?",
        a: ["לא. כל הספרים בספרייה פתוחים לקריאה בלי הרשמה, בלי תשלום ובלי פרסומות."],
        link: { href: routes.books(), label: "לכל הספרים" },
      },
      {
        q: "איך מדפדפים בספר?",
        a: [
          "הספר נפתח עמוד אחרי עמוד. מדפדפים בהחלקה על המסך, בכפתורים הגדולים שבצדדים או במקשי החיצים במקלדת.",
          "הדפדוף הוא מימין לשמאל, כמו בספר עברי: העמוד הבא נמצא משמאל.",
        ],
      },
      {
        q: "איך בוחרים ספר שמתאים לגיל של הילד?",
        a: [
          "הספרים מחולקים לשלוש קבוצות גיל: 0 עד 2, 3 עד 5 ו-6 עד 8. אפשר לסנן גם לפי קטגוריה, לפי זמן קריאה ולפי נושא לשיחה, כמו אומץ או חברות.",
        ],
      },
      {
        q: "אפשר להמשיך מהמקום שבו עצרנו?",
        a: [
          "כן. המקום האחרון בכל ספר נשמר במכשיר שלכם, גם בלי חשבון. מי שמחובר לחשבון יכול לראות את הספרים שהתחיל גם במדף האישי.",
        ],
      },
      {
        q: "אפשר להדפיס ספר?",
        a: [
          "כן. בדף ההדפסה של הספר אפשר להדפיס ישירות מהדפדפן או להוריד קובץ PDF. כל דף A4 לרוחב מכיל עמוד סיפור אחד: האיור בצד ימין והטקסט בצד שמאל.",
        ],
      },
    ],
  },
  {
    id: "listening",
    title: "האזנה",
    emoji: "🎧",
    questions: [
      {
        q: "לכל הספרים יש הקראה?",
        a: [
          "לא. הקראה יש רק בספרים שהוקלטו או שנוצרה להם הקראה. בספר כזה מופיע כפתור הפעלה בנגן הקריאה, והמילה המוקראת מודגשת בזמן ההקראה.",
        ],
      },
      {
        q: "מה זה האזנה לפני השינה?",
        a: [
          "זה רצף של כל הספרים המוקלטים בספרייה, שמתנגנים אחד אחרי השני. בוחרים גיל, לוחצים על הפעלה ואפשר לכבות את המסך.",
          "טיימר השינה עוצר את ההשמעה לבד אחרי הזמן שבחרתם, או בסוף הסיפור הנוכחי.",
        ],
        link: { href: routes.listen(), label: "להאזנה לפני השינה" },
      },
      {
        q: "מה פירוש ההודעה ״קול הדגמה״?",
        a: [
          "כששירות ההקראה לא מחובר לאתר, ההקלטה שנוצרת היא שקטה והמילים מודגשות בקצב קבוע. זו הדגמה של אופן הפעולה, לא הקראה אמיתית, ולכן האתר מציין זאת במפורש.",
        ],
      },
      {
        q: "אפשר להקליט את הסיפור בקול שלי?",
        a: [
          "כן. בסטודיו אפשר להקליט כל עמוד ישירות מהדפדפן, בקול של אמא, אבא, סבתא או סבא. ההקלטה נשמרת כחלק מהספר שלכם.",
        ],
      },
    ],
  },
  {
    id: "nikud",
    title: "כפתור הניקוד",
    emoji: "אָ",
    questions: [
      {
        q: "מה עושה כפתור הניקוד?",
        a: [
          "הכפתור מחליף בין הטקסט הרגיל לבין אותו טקסט עם ניקוד. ניקוד עוזר לקוראים מתחילים, ואפשר לכבות אותו לקוראים שכבר לא צריכים אותו.",
        ],
      },
      {
        q: "למה בחלק מהספרים אין כפתור ניקוד?",
        a: [
          "הכפתור מופיע רק בספרים שיש להם גרסה מנוקדת. כרגע מנוקדים בעיקר הספרים לגילאי 0 עד 2, וספרים נוספים ינוקדו בהמשך.",
        ],
      },
      {
        q: "הניקוד תמיד מדויק?",
        a: [
          "לא תמיד. ניקוד אוטומטי יכול לטעות, במיוחד במילים שנכתבות אותו דבר ונקראות אחרת. בסטודיו אפשר לתקן ידנית את הניקוד של כל מילה.",
        ],
      },
    ],
  },
  {
    id: "creating",
    title: "יצירת סיפור",
    emoji: "✨",
    questions: [
      {
        q: "איך יוצרים ספר משלנו?",
        a: [
          "יש שתי דרכים. בסטודיו מעלים תמונות או קובץ PDF, מקלידים טקסט לכל עמוד, ומוסיפים הקראה. ביצירת ספר אישי עונים על כמה שאלות על הילד ועל רעיון הסיפור, והאתר כותב ומאייר ספר על ידי דב בר",
          "בשני המקרים הספר נפתח בעורך, ואפשר לתקן בו כל מילה וכל עמוד.",
        ],
        link: { href: routes.create(), label: "ליצירת ספר אישי" },
      },
      {
        q: "צריך חשבון כדי ליצור ספר?",
        a: ["כן. קריאה והאזנה פתוחות לכולם, אבל כדי ליצור, להעלות ולשמור ספרים צריך להתחבר."],
      },
      {
        q: "כמה ספרים אפשר ליצור בעזרת בינה מלאכותית?",
        a: [
          "ברירת המחדל היא ספר אחד בשבוע לכל חשבון. ההגבלה קיימת כי יצירת איורים עולה כסף. העלאה ועריכה ידנית בסטודיו אינן מוגבלות.",
        ],
      },
      {
        q: "מי רואה את הספר שיצרתי?",
        a: [
          "רק אתם. ספר חדש הוא פרטי. אפשר לשתף אותו עם המשפחה בקישור שיתוף, ואפשר לבקש לפרסם אותו בספרייה. ספר מתפרסם בספרייה רק אחרי שעורך מטעם האתר קרא ואישר אותו.",
        ],
      },
      {
        q: "מה פירוש ״איור לדוגמה״ או ״מצב הדגמה״?",
        a: [
          "כששירותי הבינה המלאכותית לא מחוברים לאתר, האשף מציג סיפור קבוע ואיורים זמניים כדי להראות איך התהליך נראה. אלה אינם תוצרים אמיתיים, והאתר מסמן אותם בבירור.",
        ],
      },
    ],
  },
  {
    id: "child-photos",
    title: "פרטיות ותמונות של ילדים",
    emoji: "🔒",
    questions: [
      {
        q: "חייבים להעלות תמונה של הילד כדי ליצור ספר אישי?",
        a: ["לא. התמונה היא רשות. אפשר לתאר את הילד במילים, למשל צבע השיער, משקפיים או בגד אהוב."],
      },
      {
        q: "מה קורה לתמונה שהעליתי?",
        a: [
          "התמונה משמשת רק כדי ליצור תיאור של דמות מאוירת שדומה לילד. מיד אחרי שהתיאור נוצר, התמונה נמחקת. היא לא נשמרת בספר, לא מוצגת באתר ולא משמשת לשום מטרה אחרת.",
          "כדי ליצור את התיאור, התמונה נשלחת לשירות בינה מלאכותית חיצוני. הפרטים המלאים נמצאים במדיניות הפרטיות.",
        ],
        link: { href: routes.privacy(), label: "למדיניות הפרטיות" },
      },
      {
        q: "האתר שומר מידע על הילדים?",
        a: [
          "אין באתר פרופיל לילד ואין הרשמה לילדים. החשבון שייך להורה. השם והתחביבים שמקלידים באשף היצירה משמשים לכתיבת הסיפור, ולכן הם מופיעים בספר שנוצר.",
        ],
      },
      {
        q: "יש באתר פרסומות או מעקב?",
        a: ["אין פרסומות ואין מעקב פרסומי. האתר סופר כמה פעמים נפתח כל ספר, בלי לזהות מי פתח אותו."],
      },
    ],
  },
  {
    id: "licensing",
    title: "רישיונות וזכויות יוצרים",
    emoji: "📜",
    questions: [
      {
        q: "מותר להדפיס ולשתף את הספרים?",
        a: [
          "זה תלוי ברישיון של כל ספר, והוא מופיע בעמוד הספר ובדף האחרון של קובץ ההדפסה. הסיפורים המקוריים של האתר שמורים לאתר, ומותרים לשימוש אישי: לקרוא, להקריא ולהדפיס עותק למשפחה. אסור להפיץ אותם, למכור או לעבד בלי רשות.",
        ],
      },
      {
        q: "מי כתב ואייר את הסיפורים המקוריים?",
        a: [
          "הסיפורים הראשונים בספרייה נכתבו ואוירו במיוחד לאתר על ידי דב בר זה מצוין בשדה המקור של כל ספר כזה.",
        ],
      },
      {
        q: "מה מותר לי להעלות לסטודיו?",
        a: [
          "רק תוכן שהזכויות עליו שלכם, או תוכן שהרישיון שלו מתיר זאת, למשל ספר ברישיון Creative Commons. לכל ספר חובה למלא רישיון ומקור.",
          "אסור להעלות סריקה של ספר שנמכר בחנויות, גם אם קניתם אותו.",
        ],
      },
      {
        q: "של מי הספר שיצרתי?",
        a: [
          "שלכם. הטקסט והתמונות שהעליתם נשארים בבעלותכם. אם ביקשתם לפרסם את הספר בספרייה, אתם בוחרים באיזה רישיון הוא יתפרסם.",
        ],
        link: { href: routes.terms(), label: "לתנאי השימוש" },
      },
    ],
  },
];

function structuredData(): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "he",
    mainEntity: TOPICS.flatMap((topic) =>
      topic.questions.map((question) => ({
        "@type": "Question",
        name: question.q,
        acceptedAnswer: { "@type": "Answer", text: question.a.join(" ") },
      })),
    ),
  };
  // "<" is escaped so the JSON can never close the script element.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function FaqPage() {
  return (
    <InfoPage
      title="שאלות ותשובות"
      current={routes.faq()}
      lead="כל מה ששואלים על קריאה, האזנה, ניקוד, יצירת סיפורים, פרטיות ורישיונות."
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData() }} />

      <nav aria-label="נושאים בדף" className="rounded-lg bg-surface-2 p-5">
        <h2 className="mb-2 text-lg font-bold">נושאים</h2>
        <ul className="flex flex-wrap gap-2">
          {TOPICS.map((topic) => (
            <li key={topic.id}>
              <a
                href={`#${topic.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 font-medium hover:bg-primary-soft"
              >
                <span aria-hidden="true">{topic.emoji}</span>
                {topic.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {TOPICS.map((topic) => (
        <section key={topic.id} id={topic.id} aria-labelledby={`${topic.id}-title`} className="flex scroll-mt-24 flex-col gap-3">
          <h2 id={`${topic.id}-title`} className="flex items-center gap-2 text-2xl font-bold">
            <span aria-hidden="true">{topic.emoji}</span>
            {topic.title}
          </h2>
          <div className="flex flex-col gap-2">
            {topic.questions.map((question) => (
              <details key={question.q} className="group rounded-md border border-border bg-surface open:shadow-card">
                <summary className="flex min-h-touch-lg list-none items-center justify-between gap-3 rounded-md px-5 py-3 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  <span>{question.q}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-6 shrink-0 text-muted transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="flex flex-col gap-3 px-5 pb-5 text-lg leading-relaxed">
                  {question.a.map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                  {question.link ? (
                    <p>
                      <Link
                        href={question.link.href}
                        className="font-medium text-secondary underline underline-offset-4 hover:text-secondary-hover"
                      >
                        {question.link.label}
                      </Link>
                    </p>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <p className="text-lg leading-relaxed text-muted">
        לא מצאתם תשובה? פרטים נוספים על האתר נמצאים בדף <Link href={routes.about()} className="font-medium text-secondary underline underline-offset-4">על האתר</Link>.
      </p>
    </InfoPage>
  );
}
