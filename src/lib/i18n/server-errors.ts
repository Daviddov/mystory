/**
 * English for the Hebrew messages the server sends to people: API error
 * bodies (`{ error }` from jsonError/apiError in src/lib/api.ts), the stored
 * messages of a book-creation job, and the Hebrew fallbacks of the browser
 * helpers in src/lib/studio/client.ts and src/lib/recordings/client.ts.
 * Client-safe.
 *
 * Hebrew stays the source of truth: the server keeps writing Hebrew, and this
 * table translates it on the way out. To add a message, add one line to
 * EXACT (fixed text) or PATTERNS (text with numbers or names in it).
 * A message that is not here stays as it is.
 */
import type { Locale } from "./locale";

const EXACT: Record<string, string> = {
  // src/lib/api.ts, src/lib/auth, same-origin checks
  "לא נמצא": "We couldn't find that.",
  "הנתונים שנשלחו אינם תקינים": "Some of the details sent aren't valid. Please check them and try again.",
  "נתיב הקובץ אינו תקין": "That file path isn't valid.",
  "משהו השתבש. נסו שוב בעוד רגע.": "Something went wrong. Please try again in a moment.",
  "יש להתחבר כדי להמשיך": "Please sign in to continue.",
  "אין לך הרשאה לפעולה הזאת": "You don't have permission to do that.",
  "אין הרשאה": "You don't have permission to do that.",
  "הבקשה נחסמה": "The request was blocked.",
  "הבקשה נדחתה": "The request was refused.",
  "ההתחברות לסביבת הפיתוח כבויה בסביבת הייצור": "Development sign-in is turned off on the live site.",
  "הבקשה אינה JSON תקין": "The request isn't valid JSON.",
  "גוף הבקשה אינו JSON תקין": "The request isn't valid JSON.",
  "הבקשה צריכה להיות טופס עם קובץ": "The request needs to be a form with a file.",

  // Books, sharing, PDF, library, comments
  "הספר לא נמצא": "We couldn't find this book.",
  "הרשימה לא נמצאה": "We couldn't find this list.",
  "בספר הזה עדיין אין עמודים להדפסה": "This book has no pages to print yet.",
  "הספר ארוך מדי להורדה כקובץ אחד": "This book is too long to download as one file.",
  "אי אפשר ליצור קובץ PDF כרגע. אפשר להדפיס ישירות מדף ההדפסה.":
    "We can't make a PDF right now. You can print straight from the print page instead.",
  "אי אפשר לשתף ספר בלי עמודים": "A book without pages can't be shared.",
  "אפשר למחוק רק תגובות שכתבתם": "You can only delete comments you wrote.",
  "הגעתם למספר הספרים המרבי בחשבון. מחקו ספר ישן כדי ליצור חדש.":
    "You've reached the most books an account can hold. Delete an old book to make a new one.",

  // Book creation wizard (/api/generate) and its job messages
  "התמונה גדולה מדי. אפשר להעלות תמונה עד 5 מ״ב.": "That photo is too big. You can upload a photo of up to 5 MB.",
  "אפשר להעלות רק תמונה מסוג JPEG, PNG או WebP.": "You can only upload a JPEG, PNG or WebP photo.",
  "כבר יש ספר בהכנה. חכו שיסתיים לפני שמתחילים ספר חדש.":
    "A book is already being made. Wait for it to finish before starting a new one.",
  "יצירת ספרים בבינה מלאכותית סגורה כרגע.": "Creating books with AI is closed right now.",
  "אפשר ליצור ספר אחד בשבוע, וכבר יצרתם אחד השבוע.":
    "You can create one book a week, and you've already made one this week.",
  "היו היום יותר מדי ניסיונות יצירה. נסו שוב מחר.":
    "There were too many creation attempts today. Please try again tomorrow.",
  "לא הצלחנו ליצור את הספר הפעם. הניסיון לא נספר במכסה, ואפשר לנסות שוב.":
    "We couldn't make the book this time. This try doesn't count toward your limit, so you can try again.",
  "הסיפור שנוצר לא עבר את בדיקת האיכות וההתאמה לילדים, ולכן לא נשמר. הניסיון לא נספר במכסה. נסו לנסח את הרעיון אחרת.":
    "The story didn't pass our quality and child-safety check, so it wasn't saved. This try doesn't count toward your limit. Try describing the idea differently.",
  "היצירה נקטעה באמצע (השרת הופעל מחדש). הניסיון לא נספר במכסה, ואפשר להתחיל שוב.":
    "Making the book was interrupted (the server restarted). This try doesn't count toward your limit, so you can start again.",
  "הספר מוכן! היצירה נקטעה לפני שההקראה הושלמה. אפשר להשלים את ההקראה מהסטודיו.":
    "Your book is ready! It was interrupted before the narration was finished. You can finish the narration in the studio.",
  "היצירה נקטעה לפני שההקראה הושלמה. אפשר להשלים את ההקראה מהסטודיו.":
    "It was interrupted before the narration was finished. You can finish the narration in the studio.",
  "הספר ממתין בתור": "Waiting in line",
  "חושבים על העלילה": "Thinking up the plot",
  "כותבים את העמודים": "Writing the pages",
  "בודקים שהסיפור מתאים לילדים": "Checking the story is right for children",
  "משפרים את הסיפור לפי הערות העורך": "Polishing the story",
  "מציירים את הגיבור": "Drawing the hero",
  "מאיירים את העמודים": "Illustrating the pages",
  "בוחרים שם ושאלות לשיחה": "Choosing a title and questions to talk about",
  "כורכים את הספר": "Binding the book",
  "מכינים את ההקראה": "Preparing the narration",
  "הספר מוכן!": "Your book is ready!",
  "התמונה לא נשמרה, ולא נעשה בה שימוש: שירות שמתאר תמונות לא מחובר.":
    "The photo wasn't saved or used: the picture-description service isn't connected.",
  "ההקראה היא קול הדגמה שקט, כי שירות ההקראה לא מחובר.":
    "The narration is a silent demo voice, because the narration service isn't connected.",
  "חלק מהעמודים לא הוקראו. אפשר להשלים מהסטודיו.": "Some pages weren't narrated. You can finish them in the studio.",
  "ההקראה לא הוכנה. אפשר להפעיל אותה מהסטודיו.": "The narration wasn't prepared. You can start it from the studio.",
  "הספר נשמר בלי הקראה. אפשר להוסיף הקראה מהסטודיו.":
    "The book was saved without narration. You can add narration in the studio.",

  // Narration and nikud
  "שירות הניקוד לא זמין כרגע. נסו שוב בעוד רגע.": "The nikud service isn't available right now. Please try again in a moment.",
  "הקול שנבחר אינו זמין באתר הזה.": "The chosen voice isn't available on this site.",
  "הדגמת הקול נכשלה. נסו שוב בעוד רגע.": "The voice sample didn't work. Please try again in a moment.",
  "שירות ההקראה אינו מוגדר כראוי. פנו למנהל האתר.":
    "The narration service isn't set up correctly. Please contact the site administrator.",
  "ההקראה נכשלה. נסו שוב בעוד רגע.": "The narration didn't work. Please try again in a moment.",
  "ההקראה נכשלה": "The narration didn't work.",
  "Gemini החזיר שמע ריק.": "Gemini returned empty audio.",
  "Gemini לא החזיר שמע להקראה. נסו שוב.": "Gemini didn't return any narration audio. Please try again.",
  "Google דחתה את מפתח ה-API של ההקראה (TTS_API_KEY). פנו למנהל האתר.":
    "Google rejected the narration API key (TTS_API_KEY). Please contact the site administrator.",
  "אין מכסה או חיוב פעילים בחשבון Google של ההקראה. פנו למנהל האתר.":
    "The narration's Google account has no active quota or billing. Please contact the site administrator.",
  "מכסת ההקראה של Google (קול Gemini) נוצלה כרגע. נסו שוב בעוד דקה, או מחר אם המכסה היומית נגמרה.":
    "The Google narration quota (Gemini voice) is used up for now. Try again in a minute, or tomorrow if the daily quota has run out.",
  "TTS_API_KEY לא הוגדר, ולכן אין הקראה של Gemini.": "TTS_API_KEY isn't set, so Gemini narration isn't available.",

  // Studio
  "שירות הבינה המלאכותית לא זמין כרגע או שהוא מוגדר לא נכון. אפשר לעשות את השלב ידנית, או לנסות שוב מאוחר יותר.":
    "The AI service isn't available right now or isn't set up correctly. You can do this step by hand, or try again later.",
  "ספר שפורסם בספרייה נעול לעריכה. כדי לערוך אותו צריך קודם להחזיר אותו למצב פרטי.":
    "A book published in the library is locked for editing. To edit it, first make it private again.",
  "הספר הוגש לפרסום וממתין לאישור, ולכן הוא נעול לעריכה. כדי לערוך אותו צריך קודם לבטל את ההגשה ולהחזיר אותו למצב פרטי.":
    "This book was submitted for publication and is waiting for approval, so it's locked for editing. To edit it, first withdraw the submission and make it private again.",
  "הספר השתנה במקום אחר (בלשונית אחרת, במכשיר אחר או על ידי עורך), ולכן השינוי לא נשמר. טענו את העמוד מחדש כדי להמשיך לערוך.":
    "The book was changed somewhere else (in another tab, on another device or by an editor), so this change wasn't saved. Reload the page to keep editing.",
  "יצירת איורים והנפשות באמצעות בינה מלאכותית זמינה כרגע למנהלים בלבד.":
    "Making pictures and animations with AI is available only to administrators for now.",
  "הקובץ ריק": "The file is empty.",
  "הקובץ גדול מדי": "The file is too big.",
  "לא צורף קובץ": "No file was attached.",
  "סוג הקובץ לא נתמך. אפשר להעלות תמונות PNG, JPG, WebP, GIF או AVIF.":
    "That file type isn't supported. You can upload PNG, JPG, WebP, GIF or AVIF pictures.",
  "סוג הקובץ לא נתמך. אפשר להעלות הקלטות MP3, WAV, OGG, M4A או WebM.":
    "That file type isn't supported. You can upload MP3, WAV, OGG, M4A or WebM recordings.",
  "יש יותר מדי קבצים בספר הזה. מחקו עמודים שאינם בשימוש ונסו שוב.":
    "This book has too many files. Delete pages you aren't using and try again.",
  "רק עורכים יכולים לפרסם ספר בספרייה. אפשר להגיש את הספר לאישור.":
    "Only editors can publish a book in the library. You can submit the book for approval.",
  "הספר עוד לא מוכן להגשה": "The book isn't ready to submit yet.",
  "הספר עדיין לא בעברית. הספרייה הציבורית היא בעברית ובערבית בלבד: תרגמו את הספר ואשרו את התרגום לפני ההגשה.":
    "The book isn't in Hebrew yet. The public library is in Hebrew and Arabic only: translate the book and approve the translation before submitting.",
  "הפרטים כבר בהכנה. חכו שיסתיים.": "The details are already being prepared. Please wait for them to finish.",
  "האיור הזה כבר בהכנה. חכו שיסתיים.": "This picture is already being made. Please wait for it to finish.",
  "הספר הזה כבר בתרגום. חכו שהתרגום יסתיים.": "This book is already being translated. Please wait for the translation to finish.",
  "הסיפור כבר בכתיבה. חכו שיסתיים.": "The story is already being written. Please wait for it to finish.",
  "העמוד הזה כבר בהנפשה. חכו שתסתיים.": "This page is already being animated. Please wait for it to finish.",
  "שירות הווידאו אינו מוגדר כראוי. אפשר להעלות קליפ ידנית.":
    "The video service isn't set up correctly. You can upload a clip yourself.",
  "ההנפשה לא הופעלה": "The animation didn't run.",
  "הקליפ גדול מדי": "The clip is too big.",
  'הקליפ גדול מדי. הגודל המרבי הוא 25 מ"ב.': "The clip is too big. The largest size allowed is 25 MB.",
  "סוג הקובץ לא נתמך. אפשר להעלות קליפ MP4 או WebM.": "That file type isn't supported. You can upload an MP4 or WebM clip.",
  "קובץ האיור של העמוד לא נמצא.": "We couldn't find the page's picture file.",
  "האיור השתנה בזמן ההעלאה. נסו שוב.": "The picture changed during the upload. Please try again.",
  "אין איור בעמוד הזה. הוסיפו איור ואז אפשר להנפיש אותו.": "This page has no picture. Add a picture, and then you can animate it.",
  "בעמוד הזה יש קליפ שהעליתם בעצמכם. אשרו כדי להחליף אותו בהנפשה חדשה.":
    "This page has a clip you uploaded yourself. Confirm to replace it with a new animation.",
  'בעמוד הזה כבר יש הנפשה. בחרו "הנפשה מחדש" כדי ליצור חדשה.':
    'This page already has an animation. Choose "Animate again" to make a new one.',
  "לספר המיובא אין רישיון רשום, ולכן אי אפשר להנפיש את האיורים שלו.":
    "This imported book has no license on record, so its pictures can't be animated.",
  "העמוד לא נמצא. שמרו את הספר ונסו שוב.": "We couldn't find the page. Save the book and try again.",
  "צרו קודם את הגיבור של הספר, ואז אפשר לאייר את העמודים לפיו.":
    "First create the book's hero, and then the pages can be illustrated to match.",
  "לא נבחרו עמודים לאיור.": "No pages were chosen to illustrate.",
  "כתבו קודם את הטקסט של כל העמודים שנבחרו, ואז אפשר לאייר אותם.":
    "First write the text of all the chosen pages, and then they can be illustrated.",
  "כתבו קודם את הטקסט של העמוד, ואז אפשר לאייר אותו.": "First write the page's text, and then it can be illustrated.",
  "כתבו תיאור של הגיבור, או קודם את הטקסט של הסיפור כדי שנכתוב תיאור לפיו.":
    "Describe the hero, or write the story first so we can describe the hero from it.",
  "אין עדיין טקסט בספר. כתבו את הסיפור, ואז נמלא את הפרטים.":
    "The book has no text yet. Write the story, and then we'll fill in the details.",
  "לא הצלחנו לכתוב סיפור. נסו שוב.": "We couldn't write a story. Please try again.",
  "הסיפור שנכתב לא עבר את בדיקת האיכות וההתאמה לילדים. נסו לנסח את הרעיון אחרת.":
    "The story didn't pass our quality and child-safety check. Try describing the idea differently.",

  // Translation of a book
  "אין בספר טקסט בשפת המקור שאפשר לתרגם.": "The book has no text in its original language to translate.",
  "שירות התרגום לא הצליח לתרגם את הספר. הספר לא השתנה. נסו שוב בעוד רגע.":
    "The translation service couldn't translate the book. The book wasn't changed. Please try again in a moment.",
  "התרגום שהתקבל לא תאם את עמודי הספר (מספר העמודים או התוכן שלהם), גם בניסיון שני. הספר לא השתנה. נסו שוב.":
    "The translation didn't match the book's pages (their number or content), even on a second try. The book wasn't changed. Please try again.",
  "הספר השתנה בזמן התרגום, ולכן התרגום לא נשמר. נסו לתרגם שוב.":
    "The book changed during the translation, so the translation wasn't saved. Please translate again.",
  "הספר כבר מסומן כספר בעברית.": "The book is already marked as a Hebrew book.",
  "כתבו את שם המתרגם או המתרגמת לפני אישור התרגום.": "Write the translator's name before approving the translation.",
  "שם הספר עדיין לא בעברית (בלשונית פרטי הספר).": "The book's title isn't in Hebrew yet (in the book details tab).",

  // Recordings
  "ההקלטה ארוכה מדי": "The recording is too long.",
  "לא צורפה הקלטה": "No recording was attached.",
  "ההקלטה לא נמצאה": "We couldn't find this recording.",
  "בספר הזה אין עמודים להקליט": "This book has no pages to record.",
  "אין בספר עמוד כזה": "The book has no such page.",
  "ההקלטה ריקה": "The recording is empty.",
  "סוג ההקלטה לא נתמך": "That recording type isn't supported.",
  "עוד לא הוקלט אף עמוד": "No page has been recorded yet.",
  "אפשר לשתף הקלטה רק של ספר שפורסם בספרייה": "You can only share a recording of a book that's published in the library.",
  "ההקלטה כבר לא ממתינה לאישור": "The recording is no longer waiting for approval.",
  "ההקלטה השתנתה מאז שנפתחה. רעננו את הדף והאזינו שוב.":
    "The recording changed since it was opened. Refresh the page and listen again.",

  // Importing books (zip package, pages, text recognition)
  "זיהוי הטקסט לא זמין באתר הזה.": "Text recognition isn't available on this site.",
  "לא נשלחה תמונה.": "No picture was sent.",
  "התמונה גדולה מדי לזיהוי טקסט.": "The picture is too big for text recognition.",
  "אפשר לזהות טקסט רק בתמונות JPEG, PNG, GIF או WebP.": "Text can only be recognized in JPEG, PNG, GIF or WebP pictures.",
  "לא הצלחנו לזהות טקסט בעמוד הזה. אפשר להקליד אותו ידנית.":
    "We couldn't recognize any text on this page. You can type it in yourself.",
  "זיהוי הטקסט לא זמין: מפתח השירות אינו תקין.": "Text recognition isn't available: the service key isn't valid.",
  "שירות זיהוי הטקסט עמוס כרגע. נסו שוב בעוד רגע.": "The text recognition service is busy right now. Please try again in a moment.",
  "לא הצלחנו לקרוא את התמונה הזו. אפשר להקליד את הטקסט ידנית.":
    "We couldn't read this picture. You can type the text in yourself.",
  "שירות זיהוי הטקסט לא זמין כרגע. נסו שוב בעוד רגע.":
    "The text recognition service isn't available right now. Please try again in a moment.",
  "לא נבחר קובץ.": "No file was chosen.",
  "חסרים פרטי הספר.": "The book's details are missing.",
  "פרטי הספר אינם תקינים.": "The book's details aren't valid.",
  "הקובץ גדול מדי.": "The file is too big.",
  "סוג הבקשה אינו נתמך.": "That kind of request isn't supported.",
  "לא הצלחנו לקרוא את הקבצים שנשלחו.": "We couldn't read the files that were sent.",
  "קובץ הספר גדול מדי.": "The book file is too big.",
  "הקובץ אינו קובץ zip תקין.": "The file isn't a valid zip file.",
  "קובץ הספר מכיל נתיב קובץ לא בטוח, ולכן לא יובא.": "The book file contains an unsafe file path, so it wasn't imported.",
  "קובץ הספר מכיל יותר מדי קבצים.": "The book file contains too many files.",
  "בקובץ ה-zip חסר הקובץ book.json. זה לא נראה כמו ספר שיוצא מהאתר.":
    "The zip file is missing book.json. It doesn't look like a book exported from this site.",
  "הקובץ book.json אינו תקין.": "The book.json file isn't valid.",
  "הספר יוצא בגרסה חדשה יותר של האתר, ואי אפשר לייבא אותו כאן.":
    "The book was exported from a newer version of the site, so it can't be imported here.",
  "בספר יש יותר מדי עמודים.": "The book has too many pages.",
  "באחד העמודים בספר יש טקסט ארוך מדי.": "One of the book's pages has too much text.",
  "הספר מפנה לקובץ מדיה מחוץ לתיקיות images ו-audio.": "The book points to a media file outside the images and audio folders.",
  "הספר מפנה לקובץ תמונה או שמע שלא נמצא בתוך ה-zip.": "The book points to a picture or audio file that isn't in the zip.",
  "אחד מקובצי התמונה או השמע בספר גדול מדי.": "One of the book's picture or audio files is too big.",
  "אחד מקובצי המדיה בספר אינו תמונה או שמע מסוג נתמך.": "One of the book's media files isn't a supported picture or audio type.",
  "מספר התמונות שנשלחו לא תואם את מספר העמודים.": "The number of pictures sent doesn't match the number of pages.",
  "אחת התמונות גדולה מדי.": "One of the pictures is too big.",
  "אחד הקבצים אינו תמונה מסוג נתמך (PNG, JPEG, WebP, GIF או AVIF).":
    "One of the files isn't a supported picture type (PNG, JPEG, WebP, GIF or AVIF).",

  // Browser helpers: src/lib/studio/client.ts, src/lib/recordings/client.ts
  "אין חיבור לשרת. בדקו את החיבור לאינטרנט.": "Can't reach the server. Please check your internet connection.",
  "פג תוקף ההתחברות. התחברו שוב כדי להמשיך.": "Your sign-in has expired. Please sign in again to continue.",
  "שירות הניקוד האוטומטי עדיין לא זמין באתר. אפשר לנקד ידנית.":
    "Automatic nikud isn't available on the site yet. You can add nikud by hand.",
  "שירות הניקוד החזיר תשובה לא צפויה": "The nikud service sent an unexpected answer.",
  "שירות ההקראה האוטומטית עדיין לא זמין באתר. אפשר להקליט בקול שלכם.":
    "Automatic narration isn't available on the site yet. You can record it in your own voice.",
  "אין חיבור לאינטרנט. נסו שוב.": "No internet connection. Please try again.",
};

/** Hebrew labels inside "<label>: הקובץ אינו שייך לספר הזה" (src/lib/studio/service.ts). */
function mediaLabel(label: string): string {
  if (label === "תמונת השער") return "The cover picture";
  if (label === "תמונת הגיבור") return "The hero picture";
  const page = /^(האיור|ההקראה) בעמוד (\d+)$/.exec(label);
  if (page) return `The ${page[1] === "האיור" ? "picture" : "narration"} on page ${page[2]}`;
  return label;
}

type Pattern = [RegExp, (match: RegExpExecArray) => string];

const PATTERNS: Pattern[] = [
  [/^יותר מדי בקשות בזמן קצר\. נסו שוב בעוד דקה\.$/, () => "Too many requests in a short time. Please try again in a minute."],
  [/^יותר מדי בקשות בזמן קצר\. נסו שוב בעוד (\d+) דקות\.$/, (m) => `Too many requests in a short time. Please try again in ${m[1]} minutes.`],
  [/^אפשר ליצור (\d+) ספרים בשבוע, וכבר יצרתם (\d+)\.$/, (m) => `You can create ${m[1]} books a week, and you've already made ${m[2]}.`],
  [/^מאיירים את העמודים \((\d+) מתוך (\d+)\)$/, (m) => `Illustrating the pages (${m[1]} of ${m[2]})`],
  [/^הקובץ גדול מדי\. הגודל המרבי הוא (\d+) מ"ב\.$/, (m) => `The file is too big. The largest size allowed is ${m[1]} MB.`],
  [/^(.+): הקובץ אינו שייך לספר הזה$/, (m) => `${mediaLabel(m[1])}: the file doesn't belong to this book.`],
  [/^ברשת (3x3|4x4) נכנסים עד (\d+) עמודים\.$/, (m) => `A ${m[1]} grid holds up to ${m[2]} pages.`],
  [/^השם ארוך מדי\. אפשר עד (\d+) תווים\.$/, (m) => `The name is too long. You can use up to ${m[1]} characters.`],
  [
    /^אפשר לשמור עד (\d+) הקלטות לכל ספר\. מחקו הקלטה ישנה ונסו שוב\.$/,
    (m) => `You can keep up to ${m[1]} recordings for each book. Delete an old recording and try again.`,
  ],
  [/^עמוד (\d+) עדיין לא תורגם לעברית\.$/, (m) => `Page ${m[1]} hasn't been translated into Hebrew yet.`],
  [/^העמודים ([\d, ]+) עדיין לא תורגמו לעברית\.$/, (m) => `Pages ${m[1]} haven't been translated into Hebrew yet.`],
  [
    /^הרישיון של הספר \((.+)\) אוסר יצירות נגזרות, ותרגום הוא יצירה נגזרת\. אי אפשר לתרגם את הספר הזה\.$/,
    (m) => `The book's license (${m[1]}) doesn't allow derivative works, and a translation is one. This book can't be translated.`,
  ],
  [
    /^הרישיון של הספר \((.+)\) אוסר יצירות נגזרות, ולכן אי אפשר להנפיש את האיורים שלו\.$/,
    (m) => `The book's license (${m[1]}) doesn't allow derivative works, so its pictures can't be animated.`,
  ],
  [
    /^לא ברור שהרישיון של הספר \((.+)\) מתיר יצירות נגזרות, ולכן אי אפשר להנפיש את האיורים שלו\.$/,
    (m) => `It isn't clear that the book's license (${m[1]}) allows derivative works, so its pictures can't be animated.`,
  ],
  [/^ההקראה של Gemini נכשלה \(HTTP (\d+)\)\. נסו שוב בעוד רגע\.$/, (m) => `Gemini narration failed (HTTP ${m[1]}). Please try again in a moment.`],
  [
    /^הבקשה להקראה של Gemini לא הסתיימה \((.+)\)\. נסו שוב\.$/,
    (m) => `The Gemini narration request didn't finish (${m[1] === "שגיאת רשת" ? "network error" : m[1]}). Please try again.`,
  ],
];

function translateOne(message: string): string | undefined {
  const exact = EXACT[message];
  if (exact !== undefined) return exact;
  for (const [pattern, render] of PATTERNS) {
    const match = pattern.exec(message);
    if (match) return render(match);
  }
  return undefined;
}

/** Longest known messages first, so "הספר מוכן! ..." is split into the right sentences. */
let sortedKeys: string[] | undefined;

/**
 * Some messages are known sentences joined with spaces, e.g. a finished job's
 * "הספר מוכן!" followed by notes. Translates them sentence by sentence;
 * undefined unless every part is known.
 */
function translateJoined(message: string): string | undefined {
  sortedKeys ??= Object.keys(EXACT).sort((a, b) => b.length - a.length);
  const parts: string[] = [];
  let rest = message.trim();
  while (rest.length > 0) {
    const key = sortedKeys.find((candidate) => rest === candidate || rest.startsWith(`${candidate} `));
    if (!key) return undefined;
    parts.push(EXACT[key]);
    rest = rest.slice(key.length).trimStart();
  }
  return parts.length > 1 ? parts.join(" ") : undefined;
}

/**
 * The message in the interface language, or undefined when it is a Hebrew
 * message this table does not know (so the caller can show its own generic
 * text). Hebrew: always the message itself.
 */
export function findServerMessage(locale: Locale, message: string): string | undefined {
  if (locale === "he") return message;
  return translateOne(message) ?? translateJoined(message);
}

/**
 * A server message in the interface language. Hebrew (the source) passes
 * unchanged; English uses the table above, and an unknown message stays as it is.
 */
export function translateServerMessage(locale: Locale, message: string): string {
  return findServerMessage(locale, message) ?? message;
}

/** True when the text has Hebrew letters, i.e. is a server message that was not translated. */
export function hasHebrew(text: string): boolean {
  return /[א-ת]/.test(text);
}

/**
 * For showing a server message in a Client Component: the translated message,
 * or `fallback` when English is wanted but the message is Hebrew this table
 * does not know. A message that already arrived in English is shown as it is.
 * An empty message gives the fallback.
 */
export function showServerMessage(locale: Locale, message: string | null | undefined, fallback: string): string {
  if (!message) return fallback;
  const found = findServerMessage(locale, message);
  if (found !== undefined) return found;
  return hasHebrew(message) ? fallback : message;
}
