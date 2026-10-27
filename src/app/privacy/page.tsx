import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { InfoPage, InfoSection } from "../about/_components/InfoPage";

export const metadata: Metadata = {
  title: "מדיניות פרטיות",
  description:
    "מדיניות הפרטיות של הסיפור שלי: איזה מידע נשמר, מה מקבלים מחשבון Google, מה קורה לתמונות של ילדים, ואילו שירותים חיצוניים מעורבים.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "27 באוקטובר 2026";
const CONTACT_EMAIL = "baror2013@gmail.com";

export default function PrivacyPage() {
  return (
    <InfoPage
      title="מדיניות פרטיות"
      current={routes.privacy()}
      lead="האתר מיועד למשפחות עם ילדים קטנים, ולכן אנחנו אוספים כמה שפחות מידע. כאן מוסבר מה נשמר, למה, ומה לא נשמר בכלל."
      notice={<p className="text-muted">עדכון אחרון: {UPDATED}</p>}
    >
      <InfoSection id="summary" title="בקצרה">
        <ul>
          <li>קריאה והאזנה אינן דורשות הרשמה, ואיננו מזהים את מי שקורא.</li>
          <li>אין באתר פרסומות ואין מעקב פרסומי.</li>
          <li>אין פרופיל לילד. חשבון שייך להורה בלבד.</li>
          <li>מחשבון Google אנחנו מקבלים רק שם, כתובת אימייל ותמונת פרופיל, ומשתמשים בהם רק כדי לחבר אתכם לחשבון.</li>
          <li>תמונה של ילד שהועלתה לאשף היצירה אינה נשמרת. היא משמשת פעם אחת ליצירת תיאור הדמות ונמחקת מהזיכרון.</li>
          <li>ספר שיצרתם פרטי, עד שתבחרו לשתף אותו או לבקש לפרסם אותו.</li>
          <li>איננו מוכרים מידע אישי ואיננו מעבירים אותו למפרסמים.</li>
        </ul>
      </InfoSection>

      <InfoSection id="who" title="מי אחראי למידע">
        <p>
          האתר ״הסיפור שלי״ (mystory-alpha.vercel.app) מופעל על ידי צוות הסיפור שלי. פניות בנושא פרטיות, בקשות לעיון
          במידע ובקשות למחיקה אפשר לשלוח אל{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr">
            {CONTACT_EMAIL}
          </a>
          . נשתדל להשיב תוך 14 יום.
        </p>
      </InfoSection>

      <InfoSection id="without-account" title="מידע שנשמר בלי חשבון">
        <p>מי שקורא בלי להתחבר אינו מוסר לנו פרטים מזהים. בכל זאת נשמרים כמה דברים:</p>
        <ul>
          <li>
            <strong>במכשיר שלכם בלבד:</strong> העמוד האחרון שקראתם בכל ספר, גודל הטקסט שבחרתם, מצב יום או מצב לפני
            השינה, וספרים שהורדתם לקריאה בלי רשת. המידע הזה נשמר בדפדפן ואינו נשלח אלינו. אפשר למחוק אותו בכל רגע
            מהגדרות הדפדפן.
          </li>
          <li>
            <strong>מונה צפיות:</strong> אנחנו סופרים כמה פעמים נפתח כל ספר, כדי להציג את הספרים הפופולריים. המונה אינו
            שומר מי פתח את הספר.
          </li>
          <li>
            <strong>סטטיסטיקת ביקורים:</strong> אנחנו משתמשים ב-Vercel Web Analytics כדי לספור ביקורים בדפים. הכלי אינו
            משתמש בעוגיות ואינו מזהה מבקרים בין אתרים או בין ימים.
          </li>
          <li>
            <strong>רישום טכני:</strong> כמו בכל אתר, ספק האירוח רושם כתובת IP, סוג דפדפן ושעת הגישה לצורכי אבטחה
            ותפעול. הרישום נשמר אצל ספק האירוח לזמן קצר, לפי מדיניות השמירה שלו, ואינו משמש לזיהוי קוראים.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="account" title="מידע שנשמר בחשבון של הורה">
        <p>
          כדי ליצור, להעלות ולשמור ספרים צריך חשבון. מתחברים עם חשבון Google או עם קישור חד-פעמי שנשלח לאימייל, בלי
          סיסמה. בחשבון נשמרים:
        </p>
        <ul>
          <li>שם וכתובת דואר אלקטרוני.</li>
          <li>הספרים שיצרתם: הטקסט, האיורים, ההקלטות והפרטים שמילאתם עליהם.</li>
          <li>המועדפים שלכם, רשימות ההשמעה וההתקדמות בקריאה, כדי שיופיעו בכל מכשיר שבו אתם מחוברים.</li>
          <li>רישום של בקשות היצירה בבינה מלאכותית, כדי לאכוף את המכסה השבועית ולמדוד את העלות.</li>
        </ul>
        <p>
          החשבונות מיועדים למבוגרים בני 18 ומעלה. איננו פותחים חשבונות לילדים, ואיננו מבקשים פרטים מזהים על ילדים מעבר
          למה שההורה בוחר לכתוב בסיפור.
        </p>
      </InfoSection>

      <InfoSection id="google" title="התחברות עם Google">
        <p>כשאתם בוחרים ״כניסה עם Google״, אנחנו מבקשים מ-Google את ההרשאות הבסיסיות בלבד (openid, email, profile):</p>
        <ul>
          <li>
            <strong>מה אנחנו מקבלים:</strong> מזהה החשבון ב-Google, כתובת האימייל, השם המלא וכתובת תמונת הפרופיל.
          </li>
          <li>
            <strong>למה:</strong> כדי ליצור את החשבון שלכם באתר ולזהות אתכם בכניסות הבאות, ולהציג את השם שלכם בתפריט
            החשבון. כתובת האימייל משמשת גם לפניות שלנו אליכם בנושא החשבון.
          </li>
          <li>
            <strong>מה איננו מקבלים:</strong> איננו מקבלים גישה ל-Gmail, ליומן, לאנשי הקשר, ל-Drive או לכל מידע אחר
            בחשבון Google שלכם, ואיננו מקבלים את הסיסמה.
          </li>
          <li>
            <strong>איפה זה נשמר:</strong> במערכת ההתחברות של Supabase, ספק מסד הנתונים שלנו. המידע אינו נמכר, אינו
            מועבר למפרסמים ואינו משמש לאימון מודלים של בינה מלאכותית.
          </li>
          <li>
            <strong>מחיקה:</strong> אפשר לבקש למחוק את החשבון ואת המידע שקיבלנו מ-Google בפנייה לכתובת שבראש הדף. אפשר גם
            לבטל את הגישה של האתר בכל רגע בדף{" "}
            <a href="https://myaccount.google.com/connections" rel="noopener noreferrer" target="_blank">
              החיבורים של חשבון Google
            </a>
            .
          </li>
        </ul>
        <p>
          השימוש שלנו במידע שמתקבל מ-Google API ובהעברתו לכל אפליקציה אחרת כפוף ל
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noopener noreferrer"
            target="_blank"
          >
            מדיניות נתוני המשתמשים של Google API Services
          </a>
          , כולל דרישות השימוש המוגבל (Limited Use).
        </p>
      </InfoSection>

      <InfoSection id="child-photos" title="תמונות ופרטים של ילדים">
        <p>באשף יצירת הספר האישי אפשר, אם רוצים, להעלות תמונה של הילד. זו רשות, ואפשר לתאר את הילד במילים במקום.</p>
        <ul>
          <li>התמונה משמשת למטרה אחת: יצירת תיאור כתוב של דמות מאוירת שדומה לילד.</li>
          <li>לשם כך התמונה נשלחת פעם אחת לשירות מודל השפה, כמפורט בהמשך. היא אינה נשלחת לשירות האיורים.</li>
          <li>
            התמונה מוחזקת בזיכרון השרת בלבד ונמחקת מיד אחרי השימוש. היא אינה נשמרת בקובץ, במסד הנתונים או בספר, ואינה
            מוצגת לאיש.
          </li>
          <li>האיורים שבספר הם ציורים של דמות, לא התמונה עצמה.</li>
        </ul>
        <p>
          השם, הגיל והתחביבים שמקלידים באשף משמשים לכתיבת הסיפור, ולכן הם נשמרים כחלק מהטקסט של הספר ומבקשת היצירה.
          כדאי לכתוב רק את מה שנוח לכם שיופיע בספר.
        </p>
      </InfoSection>

      <InfoSection id="private-books" title="ספרים פרטיים, שיתוף ופרסום">
        <ul>
          <li>ספר שיצרתם הוא פרטי. הוא אינו מופיע בספרייה, בחיפוש או במנועי חיפוש.</li>
          <li>
            אם יצרתם קישור שיתוף, כל מי שמחזיק בקישור יכול לקרוא את הספר. אפשר לבטל את הקישור בכל רגע, ומאותו רגע הוא
            מפסיק לעבוד.
          </li>
          <li>ספר מתפרסם בספרייה הציבורית רק אם ביקשתם זאת, ורק אחרי שעורך מטעם האתר אישר אותו.</li>
          <li>עורכים ומנהלים של האתר יכולים לראות ספרים פרטיים, לצורך אישור, תמיכה וטיפול בתלונות.</li>
        </ul>
        <p>
          <strong>מגבלה ידועה:</strong> קובצי התמונות וההקלטות של ספר פרטי מוגשים מכתובת שקשה לנחש, אבל אינה מוגנת
          בסיסמה. מי שמחזיק בכתובת המלאה של קובץ יכול לפתוח אותו גם בלי קישור שיתוף.
        </p>
      </InfoSection>

      <InfoSection id="third-parties" title="שירותים חיצוניים">
        <p>כדי להפעיל את האתר אנחנו נעזרים בספקים חיצוניים, שמקבלים רק את המידע הדרוש לפעולתם:</p>
        <ul>
          <li>
            <strong>אירוח:</strong> Vercel, שמריצה את שרתי האתר ומספקת את סטטיסטיקת הביקורים.
          </li>
          <li>
            <strong>מסד נתונים, התחברות ואחסון קבצים:</strong> Supabase. שם נשמרים פרטי החשבון, הספרים והקבצים שלהם.
          </li>
          <li>
            <strong>התחברות:</strong> Google, כשאתם בוחרים להתחבר עם חשבון Google.
          </li>
          <li>
            <strong>כתיבת סיפורים ותיאור דמות:</strong> הפרטים שהקלדתם באשף, והתמונה אם העליתם, נשלחים לשירות מודל שפה
            (Gemini של Google, או Claude של Anthropic) כדי לכתוב את הסיפור ולבדוק שהוא מתאים לילדים.
          </li>
          <li>
            <strong>איורים והקראה:</strong> תיאור הדמות, תיאורי העמודים וטקסט הסיפור נשלחים ל-Gemini של Google ליצירת
            איורים ולהקראה.
          </li>
          <li>
            <strong>ניקוד:</strong> טקסט הסיפור נשלח לשירות הניקוד של Dicta. לשירות נשלח הטקסט בלבד, בלי פרטי החשבון.
          </li>
        </ul>
        <p>איננו מוכרים מידע אישי ואיננו מעבירים אותו למפרסמים.</p>
      </InfoSection>

      <InfoSection id="cookies" title="עוגיות ואחסון בדפדפן">
        <p>
          האתר משתמש בעוגיות הכרחיות בלבד, ששומרות את ההתחברות לחשבון. אין עוגיות פרסום ואין עוגיות של צד שלישי.
          ההעדפות וההתקדמות בקריאה נשמרות באחסון המקומי של הדפדפן, כמתואר למעלה.
        </p>
      </InfoSection>

      <InfoSection id="retention" title="כמה זמן המידע נשמר ואיך מוחקים אותו">
        <ul>
          <li>פרטי החשבון והספרים נשמרים כל עוד החשבון פעיל.</li>
          <li>ספר שמחקתם נמחק יחד עם האיורים וההקלטות שלו.</li>
          <li>
            אפשר לבקש למחוק את החשבון בפנייה לכתובת שבראש הדף. נמחק את פרטי החשבון, המועדפים, ההתקדמות והספרים הפרטיים
            תוך 30 יום מהבקשה.
          </li>
          <li>ספר שפורסם בספרייה ברישיון חופשי עשוי להישאר בה גם אחרי מחיקת החשבון, בהתאם לרישיון שבחרתם.</li>
        </ul>
      </InfoSection>

      <InfoSection id="rights" title="הזכויות שלכם">
        <p>
          לפי חוק הגנת הפרטיות, התשמ״א-1981, אתם רשאים לעיין במידע שנשמר עליכם, לבקש לתקן אותו או למחוק אותו. את הבקשה
          שולחים לכתובת שבראש הדף.
        </p>
      </InfoSection>

      <InfoSection id="changes" title="שינויים במדיניות">
        <p>
          כשהמדיניות תשתנה, התאריך שבראש הדף יתעדכן. על שינוי מהותי נודיע לבעלי החשבונות לפני שייכנס לתוקף. השימוש באתר
          כפוף גם ל<Link href={routes.terms()}>תנאי השימוש</Link>.
        </p>
      </InfoSection>

      <section id="english" lang="en" dir="ltr" aria-labelledby="english-title" className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 id="english-title" className="text-2xl font-bold">
          Summary in English
        </h2>
        <div className="flex flex-col gap-3 text-lg leading-relaxed [&_a]:font-medium [&_a]:text-secondary [&_a]:underline [&_a]:underline-offset-4 [&_li]:ms-6 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2">
          <p>
            MyStory (״הסיפור שלי״) is a Hebrew children&apos;s picture-book library. Reading needs no account. Parents
            may create an account to make, save and share books.
          </p>
          <ul>
            <li>
              <strong>Google user data:</strong> with &quot;Sign in with Google&quot; we request only the basic scopes
              (openid, email, profile) and receive your Google account ID, email address, name and profile picture URL.
              We use them only to create your account, sign you in and show your name in the account menu. We do not
              access Gmail, Calendar, Contacts, Drive or any other Google data.
            </li>
            <li>
              <strong>Storage and sharing:</strong> this data is stored by our authentication and database provider,
              Supabase. It is never sold, never shared with advertisers and never used to train AI models. Story text
              you write is sent to AI providers (Google Gemini, Anthropic Claude, Dicta) only to generate the book.
            </li>
            <li>
              <strong>Deletion:</strong> email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to delete your account and the
              Google data we hold; we do so within 30 days. You can also revoke access at{" "}
              <a href="https://myaccount.google.com/connections" rel="noopener noreferrer" target="_blank">
                myaccount.google.com/connections
              </a>
              .
            </li>
            <li>
              <strong>Limited Use:</strong> MyStory&apos;s use and transfer of information received from Google APIs
              adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </li>
            <li>
              <strong>Children:</strong> accounts are for adults (18+). An optional child photo is held in memory for a
              single AI call that writes a text description of a cartoon character, and is never stored.
            </li>
          </ul>
        </div>
      </section>
    </InfoPage>
  );
}
