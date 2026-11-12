// One-off: puts the Hershele book (made in Arabic in the wizard) on live as a HEBREW book with the spoken-Arabic version
// (text + narration) as its second language, because the live database does not allow an Arabic-language book until
// supabase/migrations/20261101000000_arabic_books.sql is applied. The local book stays Arabic.
//   npx tsx --env-file=.env.supabase scripts/_push-hershele.ts <owner id> <slug> <status>
import { dataDir } from "../src/lib/config";
import { LocalMediaStore } from "../src/lib/media/local";
import { createSupabaseMediaStore } from "../src/lib/media/supabase";
import { contentTypeForPath } from "../src/lib/media/url";
import { LocalRepository } from "../src/lib/repo/local";
import { createSupabaseRepository } from "../src/lib/repo/supabase";
import type { BookStatus, Page } from "../src/lib/types";

const ID = "bk_l3wtrh489rp3";
const TITLE = "הרשל'ה והדלת הנעולה";
const SUMMARY =
  "הרשל'ה רוצה לשמח את החבר העצוב שנעל את הדלת. הוא מנסה הכול: דופק, שר, ובסוף נכנס דרך חריץ הדואר ויוצא עם פנים שחורות, ושם הצחוק פותח את הדלת.";
const QUESTIONS = ["מה אתם עושים כשחבר עצוב ואתם רוצים לשמח אותו?", "איזה רגע בסיפור הצחיק אתכם הכי הרבה?"];
const PAGES = [
  "הדלת נעולה, והבית שקט וחשוך,\nוהחבר בפנים עצוב ולא מחייך.\nעמד הרשל'ה, גירד בראש וחשב:\nאיך אפתח את הדלת הנעולה הזאת, איך?",
  "דפק הרשל'ה בידו הקטנה, ואמר בקול עליז:\n\"טוק־טוק־בום, מי בדלת היום? פתחו לי, וייעלם העצב!\"\nאבל הדלת לא זזה, והחבר בפנים לא צחק.",
  "הביא הרשל'ה פעמון מצלצל, ובובה מצחיקה ששרה,\nוצעק בכל כוחו: \"טוק־טוק־בום, מי בדלת היום? פתחו לי, וייעלם העצב!\"\nוהמנעול עוד עיקש, והחבר עוד עצוב וכועס.",
  "ראה הרשל'ה למטה חריץ קטן, ואמר: \"יש לי רעיון, רעיון גדול!\nדרך חריץ הדואר אכנס בקלות, ואפתיע אותו בהפתעה!\"",
  "זחל הרשל'ה על הבטן בגינה, והכניס את הראש בעדינות,\nולחש: \"זוּם... ביפ... אני כאן!\" וגירד את הדלת בנוצה: \"יאללה, פתח לי!\"",
  "נפלה פחית צבע שחור שהייתה מאחורי החריץ, והפנים של הרשל'ה נהיו כולם כתמים!\nנהיה שחור כמו פחם, ונשארו רק שתי עיניים נוצצות,\nוכל מי שראה אותו כמעט נפל מצחוק!",
  "הסתובב החבר העצוב, וראה פנים מוזרות שמצחיקות את הקירות!\nיצור שחור קטן עם לשון ורודה, והוא התפוצץ בצחוק: \"הא הא הא, זה אתה, הרשל'ה?\"\nוהעצב עף כמו פרפרים!",
  "ניקו את הפנים במים נקיים, ופתחו את הדלת יחד לשמש הנעימה,\nושרו בשמחה: \"טוק־טוק־בום, מי בדלת היום? פתחנו את הדלת והעצב נעלם!\"",
];

const [ownerId, slug, status] = process.argv.slice(2);
(async () => {
  const local = new LocalRepository(dataDir());
  const localMedia = new LocalMediaStore(dataDir());
  const remote = await createSupabaseRepository();
  const remoteMedia = await createSupabaseMediaStore();
  const book = await local.getBookById(ID);
  if (!book) throw new Error("no local book");
  if (book.pages.length !== PAGES.length) throw new Error("page count");
  if (await remote.getBookById(ID)) throw new Error("already on live");
  if (await remote.getBookBySlug(slug)) throw new Error("slug taken");

  const remoteFiles = new Set(await remoteMedia.list("books/" + ID));
  for (const m of [book.coverImage, book.hero?.image, ...book.pages.flatMap((p) => [p.image, p.audio])]) {
    if (!m || remoteFiles.has(m)) continue;
    const obj = await localMedia.get(m);
    if (!obj) throw new Error("no local file " + m);
    await remoteMedia.put(m, obj.bytes, contentTypeForPath(m));
    console.log("  uploaded", m);
  }

  const pages: Page[] = book.pages.map((page, i) => {
    const { audio, wordTimings, audioSource, textNikud: _n, ...rest } = page;
    return {
      ...rest,
      text: PAGES[i],
      translation: { text: page.text, ...(audio ? { audio } : {}), ...(wordTimings ? { wordTimings } : {}), ...(audioSource ? { audioSource } : {}) },
    };
  });
  const { pages: _p, hasAudio: _h, shareToken: _s, language: _l, ...rest } = book;
  const created = await remote.createBook({
    ...rest,
    slug,
    ownerId,
    status: status as BookStatus,
    viewCount: 0,
    title: TITLE,
    summary: SUMMARY,
    discussionQuestions: QUESTIONS,
    translation: { language: "ar", title: book.title, summary: book.summary },
    pages,
  });
  console.log(created.id, created.slug, created.status, "pages", created.pages.length, "| ar version:", created.translation?.language,
    "| ar audio:", created.pages.filter((p) => p.translation?.audio).length);
})();
