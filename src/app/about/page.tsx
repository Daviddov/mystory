import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { routes } from "@/lib/routes";
import { InfoPage, InfoSection } from "./_components/InfoPage";

export const metadata: Metadata = {
  title: "על האתר",
  description: "הסיפור שלי הוא אתר סיפורים לילדים בעברית: קוראים, מקשיבים, ויוצרים ספרים משלכם. בלי פרסומות ובלי הרשמה לקריאה.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <InfoPage
      title="על האתר"
      current={routes.about()}
      lead="הסיפור שלי הוא מקום לקרוא ולשמוע בו סיפורים לילדים בעברית, ומקום קל ליצור ולהעלות בו ספרים משלכם."
    >
      <InfoSection id="reading-first" title="קודם קוראים">
        <p>
          פותחים ספר וקוראים. בלי הרשמה, בלי פרסומות ובלי חלונות קופצים. כל ספר מוצג עמוד אחרי עמוד, עם איור גדול וטקסט
          ברור, ומדפדפים בו מימין לשמאל כמו בספר עברי אמיתי.
        </p>
        <p>
          הספרייה מסודרת לפי <Link href={routes.books()}>גיל, קטגוריה, זמן קריאה ונושא לשיחה</Link>, כדי שיהיה קל למצוא
          סיפור של חמש דקות לפני השינה או סיפור על אומץ לקראת היום הראשון בגן.
        </p>
      </InfoSection>

      <InfoSection id="what-is-here" title="מה אפשר לעשות כאן">
        <ul>
          <li>
            <strong>לקרוא.</strong> ספרים לגילאי 0 עד 8, עם אפשרות להגדיל את הטקסט, לעבור למסך מלא ולהמשיך מהמקום שבו
            עצרתם.
          </li>
          <li>
            <strong>להקשיב.</strong> בספרים שיש להם הקראה, המילה המוקראת מודגשת בזמן ההקראה. ב
            <Link href={routes.listen()}>האזנה לפני השינה</Link> הסיפורים מתנגנים ברצף, עם טיימר שינה.
          </li>
          <li>
            <strong>לקרוא עם ניקוד.</strong> בספרים מנוקדים, כפתור הניקוד מציג או מסתיר את הניקוד בלחיצה אחת.
          </li>
          <li>
            <strong>ליצור.</strong> ב<Link href={routes.studio()}>סטודיו</Link> מעלים תמונות, מקלידים טקסט ומקליטים הקראה
            בקול שלכם. ב<Link href={routes.create()}>יצירת ספר אישי</Link> בונים סיפור שבו הילד או הילדה הם הגיבורים.
          </li>
          <li>
            <strong>להדפיס.</strong> כל ספר אפשר להדפיס או להוריד כקובץ PDF, עמוד סיפור בכל דף.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="principles" title="העקרונות שלנו">
        <ul>
          <li>
            <strong>ספר הוא ספר.</strong> ספר שהועלה ידנית, ספר שיובא וספר שנוצר בעזרת בינה מלאכותית נראים ונקראים באותו
            אופן.
          </li>
          <li>
            <strong>בינה מלאכותית היא תוספת.</strong> הקריאה, ההעלאה והעריכה עובדות גם בלעדיה. כשמשהו באתר הוא הדגמה ולא
            תוצר אמיתי, למשל קול הדגמה או איור לדוגמה, זה כתוב במפורש.
          </li>
          <li>
            <strong>פרטי כברירת מחדל.</strong> ספר שיצרתם שייך לכם ונשאר פרטי. הוא מגיע לספרייה הציבורית רק אחרי שעורך
            מטעם האתר אישר אותו.
          </li>
          <li>
            <strong>שומרים על הילדים.</strong> אין באתר פרופיל לילד, ואין פרסומות. פרטים נוספים ב
            <Link href={routes.privacy()}>מדיניות הפרטיות</Link>.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="content" title="מאיפה מגיעים הסיפורים">
        <p>
          הסיפורים הראשונים בספרייה הם סיפורים מקוריים שנכתבו ואוירו במיוחד לאתר, בעזרת בינה מלאכותית, והם מתפרסמים
          ברישיון חופשי. בעמוד של כל ספר מופיעים המחבר, המאייר, הרישיון והמקור.
        </p>
        <p>
          בהמשך יתווספו ספרים ברישיון Creative Commons שתורגמו לעברית, עם קרדיט מלא ליוצרים, וספרים שהורים יצרו ועורך
          אישר.
        </p>
      </InfoSection>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href={routes.books()}>לספרייה</ButtonLink>
        <ButtonLink href={routes.faq()} variant="outline">
          שאלות ותשובות
        </ButtonLink>
      </div>
    </InfoPage>
  );
}
