/**
 * One-off: tidy the tags of the local books (data/books/*\/book.json).
 *
 *   node scripts/retag-books.mjs          dry run, prints the summary
 *   node scripts/retag-books.mjs --write  writes the books (backup of the old tags first)
 *
 * 1. spelling is normalized (gershayim),
 * 2. thin or variant tags are merged into one canonical tag (MERGE),
 * 3. a tag that is still used by fewer than MIN books is dropped, unless it is
 *    protected (parasha / holiday / starter tags the site relies on) or the book
 *    would be left with fewer than KEEP tags.
 */
import fs from "node:fs";
import path from "node:path";

const MIN = 3;
const KEEP = 3;
const dir = "data/books";
const write = process.argv.includes("--write");

const group = (to, list) => Object.fromEntries(list.split("|").map((t) => [t, to]));
const MERGE = {
  // animals
  ...group("חתולים", "חתלתולים"),
  ...group("ג'ירפות", "ג'ירפים"),
  ...group("היפופוטמים", "היפופוטם"),
  ...group("צפרדעים", "קרפדות|ראשנים"),
  ...group("תנינים", "תנין"),
  ...group("תרנגולות", "תרנגולים|תרנגולת"),
  ...group("עיזים", "עז|גדיים|גדי|תיש|תיישים|עז הרים"),
  ...group("ציפורים", "עוף|ציפור|אנפות|אווזה|ינשוף|ינשופים"),
  ...group("חרקים", "ציקדות|שפיריות|גחליליות|מרבה רגליים|זחלים"),
  ...group("שועלים", "שועל"),
  ...group("כלבים", "כלב"),
  ...group("סוס", "סוסים"),
  ...group("ארנבים", "שפנים"),
  ...group("דגים", "דג|דיג|דייגים"),
  ...group("ים", "סרטנים|חוף|סירות"),
  ...group("חיות", "זברות|טיגריסים|נמרים|קוברה|דורבנים|זיקית|דינוזאורים|פינגווינים|תאואים|איילים|גמלים|קיפודים|אוגרים|דובים|חיות בר|יצורים|יצורים קטנים|גן חיות|מפלצות|טרול|פרה|עגלים"),
  // places
  ...group("אפריקה", "קניה|אוגנדה|קייפטאון|זולו"),
  ...group("הרים", "הר|נפאל|הרי נפאל"),
  // food
  ...group("אוכל", "פיקניק|מטבח|פנקייקים|פנקייק|בישול|אפייה|מרק|חמאה|חלה|עוגה|לחמנייה|סוכריות|שוקולד|דבש|תנור|בייגל|רעב|ממתקים|קניות|מכירה"),
  ...group("פירות", "מנגו|ענבים|עץ מנגו|שקדים|בננות"),
  ...group("ירקות", "תירס|שעועית|עשבי תיבול|גזר"),
  // family
  ...group("הורים", "אבא ובן|אמא ואבא|אבא ואמא|כיבוד הורים"),
  ...group("תינוק", "תינוקות"),
  ...group("דודה", "דודים"),
  ...group("משפחה", "סיפורי משפחה|זיכרונות|אחיות"),
  // school
  ...group("בית ספר", "ילקוט|מורים|תלמידים|שיעורי בית|בית ספר חדש|מקצועות|ימי השבוע"),
  ...group("גן ילדים", "גננת"),
  // transport
  ...group("כלי תחבורה", "מוניות|כביש|אופנועים|אמבולנס|כבאות|משאבת כיבוי|מסוק|רחפנים|מטוסים|תעופה|טיסה|רכבים|נסיעה|בטיחות בדרכים|תנועה|אוטובוסים|מכוניות|עגלה|אופניים"),
  // nature and weather
  ...group("גשם", "מטרייה|שלולית"),
  ...group("חורף", "שלג|קור"),
  ...group("קשת בענן", "קשת"),
  ...group("כוכבים", "כוכבי לכת|חלל"),
  ...group("שמיים", "עננים|רעם|זריחה|מזג אוויר"),
  ...group("שמירה על הסביבה", "שינוי אקלים|זיהום|מחזור|זבל|סביבה"),
  ...group("צמחים", "עלים|גזע|שורשים|סרפד|צמחי מרפא|כרם|נטיעה|במבוק"),
  ...group("חקלאות", "קציר|יבול|אסם|רפת|פאה|שדות אורז|אדמה"),
  // play, sport, hobbies
  ...group("משחקים", "נדנדה|מגלשה|פארק|גן ציבורי|חצר|משחק"),
  ...group("ספורט", "כדורעף|שחייה|טיפוס|קפיצה|התעמלות|אימונים|יוגה|מרוץ"),
  ...group("ציור", "קרטון|יצירה|ציור ויצירה|שפופרות צבע"),
  ...group("טכנולוגיה", "רדיו|טלפונים|רובוטים"),
  // clothes
  ...group("בגדים", "שמלות|מעיל|מגפיים|גרביים|כפתור|כפתורים|אופנה|התלבשות|בגדים ישנים"),
  ...group("כובעים", "כובע"),
  // body and health
  ...group("בריאות", "שיניים|צחצוח שיניים|מחלה|אבעבועות רוח|מרפאה|בית חולים|גבס|שבר|שברים"),
  ...group("גוף", "ראש|ידיים|שיער|תלתלים|נשימה|רגליים"),
  ...group("חושים", "ריח|ריחות|טעם"),
  // feelings and values
  ...group("רגשות", "בכי|שמחה|חיבוקים|אופטימיות|געגועים|געגוע|עצב ושמחה|עצב"),
  ...group("שינה", "הירדמות|שעת שינה|סיפור לפני השינה|לפני השינה|פיהוק|רוגע|שקט"),
  ...group("יושר", "אמת|כנות"),
  ...group("הכנסת אורחים", "אורחים"),
  ...group("שכנים", "קהילה|שכונה|עזרה לשכן"),
  ...group("קבלת השונה", "שוויון|כבוד לכל אדם|ואהבת לרעך כמוך|כל אחד חשוב|ילד חדש|חברים חדשים"),
  ...group("תודה", "הודיה|ברכת הגומל"),
  ...group("ריבים והשלמה", "ריב|ויכוח|ויכוחים|מריבה|השלמה"),
  // Jewish content
  ...group("סיפורי חז״ל", "חז״ל|חז\"ל|אגדות חז״ל|אגדות חז\"ל|משלי חז״ל|משלי חז\"ל|סיפורי חז\"ל|שמאי|רבי מאיר|ברוריה|רבי אליעזר|רבי עקיבא|רבי טרפון|אדריאנוס|רבי יהושע בן חנניה|רבי יהודה הנשיא|שמעיה ואבטליון|שמעון בן שטח|רבי חנינא בן דוסא|רבי אלעזר בן שמעון|אלכסנדר מוקדון|המלך קציא|דמא בן נתינה|נחום איש גם זו|כל מה דעביד רחמנא לטב עביד"),
  ...group("סיפורי צדיקים", "האר\"י|האר״י|החסיד|חסידים|גיטל'ה"),
  ...group("הרשל'ה", "הרשל'ה אוסטרופולר"),
  ...group("אגדות עם", "סיפורי עם"),
  ...group("תורה", "נח|תיבת נח|בלעם|האתון|יצחק|רבקה|לוט|סדום|אהרן הכוהן|מרים הנביאה|מרים|באר מרים|עגל הזהב|מטה אהרן|המרגלים|קריעת ים סוף|שירת הים|עשר המכות|שירת משה|מסעות במדבר|שבטי ישראל|דגלים|עוג מלך הבשן|עקדת יצחק|הר נבו|הר גריזים|הר עיבל|שבט ראובן|עבר הירדן|בנות צלפחד|כהנים|בגדי כהונה"),
  ...group("תנ״ך", "שלמה המלך|דוד המלך|דוד|יהושע|ירמיהו|יחזקאל|אליהו הנביא"),
  ...group("ברכות", "ברכה|ברכת המזון|ברכת הלבנה|ברכת כוהנים|אמן"),
  ...group("מצוות", "מזוזה|כשרות|סנפיר וקשקשת|לשון הרע|שילוח הקן|שמיטה|צדק צדק תרדוף|ברית|קריאת שמע|עשרת הדיברות|חזק ואמץ"),
  ...group("חנוכה", "נס פך השמן|סביבון|דמי חנוכה|מטבעות שוקולד|הדלקת נרות|נרות|פרסומי ניסא|מעוז צור|הנרות הללו|יהודה המכבי|מתתיהו|סופגניות"),
  ...group("פסח", "סדר פסח|יציאת מצרים"),
  ...group("בית מדרש", "בית המדרש"),
};

// Never dropped: tags the site reads (parashot, holidays) and the starter list.
const protectedTags = new Set();
const grab = (file) => {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/"([^"\n]*[א-ת][^"\n]*)"/g)) protectedTags.add(norm(m[1]));
};
function norm(t) {
  return t.trim().replace(/\s+/g, " ").replace(/(\S)"(\S)/g, "$1״$2").replace(/״(?=\s|$)/g, "״");
}
grab("src/lib/occasions.ts");
grab("src/lib/taxonomy.ts");
const isProtected = (t) => t.startsWith("פרשת ") || protectedTags.has(t);

const files = fs.readdirSync(dir).map((d) => path.join(dir, d, "book.json")).filter((f) => fs.existsSync(f));
const books = files.map((f) => ({ f, j: JSON.parse(fs.readFileSync(f, "utf8")) }));
const mergeNorm = Object.fromEntries(Object.entries(MERGE).map(([k, v]) => [norm(k), norm(v)]));

// Pass 1: normalize and merge.
for (const b of books) {
  const out = [];
  for (const raw of b.j.tags ?? []) {
    let t = norm(raw);
    t = mergeNorm[t] ?? t;
    if (t && !out.includes(t)) out.push(t);
  }
  b.next = out;
}

// Pass 2: drop what is still thin.
const count = () => {
  const c = {};
  for (const b of books) for (const t of b.next) c[t] = (c[t] || 0) + 1;
  return c;
};
const c = count();
for (const b of books) {
  const thin = b.next.filter((t) => c[t] < MIN && !isProtected(t)).sort((x, y) => c[x] - c[y]);
  for (const t of thin) {
    if (b.next.length <= KEEP) break;
    b.next = b.next.filter((x) => x !== t);
  }
}

const before = {};
for (const b of books) for (const t of b.j.tags ?? []) before[t] = (before[t] || 0) + 1;
const after = count();
const stat = (o) => `${Object.keys(o).length} tags, ${Object.values(o).filter((n) => n < MIN).length} thin`;
console.log("before:", stat(before));
console.log("after: ", stat(after));
console.log("avg tags/book:", (books.reduce((s, b) => s + b.next.length, 0) / books.length).toFixed(2));
console.log("top new:", Object.entries(after).sort((a, b) => b[1] - a[1]).slice(0, 25).map((e) => e.join(":")).join(" | "));
console.log("still thin:", Object.entries(after).filter(([, n]) => n < MIN).map(([t]) => t).join("|"));

if (write) {
  const backup = {};
  for (const b of books) backup[b.j.id] = b.j.tags ?? [];
  fs.writeFileSync("data/tags-backup-2026-11-08.json", JSON.stringify(backup, null, 2));
  for (const b of books) {
    if (JSON.stringify(b.j.tags ?? []) === JSON.stringify(b.next)) continue;
    b.j.tags = b.next;
    fs.writeFileSync(b.f, JSON.stringify(b.j, null, 2) + "\n");
  }
  console.log("written");
}
