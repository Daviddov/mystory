import Link from "next/link";
import { routes } from "@/lib/routes";

const LINK = "font-semibold text-primary underline-offset-4 hover:underline";

/**
 * A short guide under the bedtime category's books. Parents search for
 * "סיפורים לפני השינה" more than for anything else on the site, and a page that
 * is only a grid of covers gives search engines little to go on.
 */
export function BedtimeGuide() {
  return (
    <section aria-labelledby="bedtime-guide-title" className="flex max-w-3xl flex-col gap-4 text-lg leading-relaxed">
      <h2 id="bedtime-guide-title" className="text-2xl font-bold sm:text-3xl">
        איך בוחרים סיפור לפני השינה
      </h2>
      <p>
        סיפור לפני השינה עובד הכי טוב כשהוא קצר, רגוע ונגמר בטוב. הסיפורים כאן נבחרו בשביל סוף היום: עלילה פשוטה, קצב
        איטי ומילים שחוזרות על עצמן, כך שגם ילדים קטנים יכולים להשלים את המשפט יחד איתכם.
      </p>
      <h3 className="text-xl font-bold">לקרוא או להאזין</h3>
      <p>
        כל ספר אפשר לקרוא בקול מהמסך, עם ניקוד מלא שמקל על קריאה ראשונה. ברוב הספרים יש גם הקראה מוקלטת: מפעילים, מנמיכים
        את האור ונותנים לסיפור להתנגן. בנגן יש טיימר שינה שעוצר את ההקראה לבד, ומצב כהה שלא מסנוור בחדר חשוך. אפשר גם
        להאזין לכמה סיפורים ברצף ב
        <Link href={routes.listen()} className={LINK}>
          סיפורים להאזנה
        </Link>
        .
      </p>
      <h3 className="text-xl font-bold">כמה זמן ולאיזה גיל</h3>
      <p>
        לפעוטות מתאימים ספרים של כמה דקות עם איור גדול בכל עמוד, ב
        <Link href={routes.age("0-2")} className={LINK}>
          סיפורים לגילאי 0 עד 2
        </Link>
        . לגן ולגיל הרך אפשר סיפור ארוך מעט יותר, ב
        <Link href={routes.age("3-5")} className={LINK}>
          סיפורים לגילאי 3 עד 5
        </Link>
        . בערבים עמוסים כדאי לבחור מתוך{" "}
        <Link href={routes.time("5")} className={LINK}>
          סיפורים קצרים של עד 5 דקות
        </Link>
        .
      </p>
      <p>כל הסיפורים באתר חינמיים, בלי פרסומות ובלי חלונות קופצים, כדי שהרגע לפני השינה יישאר שקט.</p>
    </section>
  );
}
