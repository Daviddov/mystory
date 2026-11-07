/**
 * Interface texts of the library pages: category, age, theme, time and tag
 * listings, collections, search, the parasha and holiday pages, and the
 * bedtime "radio" (/listen). Client-safe.
 *
 * Book content (titles, summaries, collection titles and descriptions) is
 * never translated. Taxonomy names come from taxonomyText() in ./messages.
 * Holiday and Torah-portion names in English are kept here, keyed by slug;
 * the Hebrew names stay in src/lib/occasions.ts.
 */
import type { TorahBook } from "../generation/parasha";
import type { OccasionKind } from "../occasions";
import { defineMessages } from "./define";
import type { Locale } from "./locale";

export const LIBRARY_MESSAGES = defineMessages(
  {
    allBooksCrumb: "כל הספרים",
    category: {
      eyebrow: "קטגוריה",
      siblings: "קטגוריות",
      empty: "עוד אין ספרים בקטגוריה הזאת",
      parashaLink: "סיפור לכל פרשה בתורה",
      holidaysLink: "סיפורים לשבת ולחגים",
    },
    age: {
      eyebrow: "ספרים לפי גיל",
      title: (label: string) => `סיפורים ל${label}`,
      siblings: "קבוצות גיל",
      empty: "עוד אין ספרים לגיל הזה",
    },
    theme: {
      eyebrow: "נושא לשיחה",
      title: (label: string) => `סיפורים על ${label}`,
      description: "ספרים שעוזרים לפתוח שיחה על הנושא הזה. בעמוד של כל ספר מחכות שאלות לשיחה.",
      siblings: "נושאים לשיחה",
      empty: "עוד אין ספרים בנושא הזה",
    },
    time: {
      eyebrow: "ספרים לפי זמן קריאה",
      siblings: "זמני קריאה",
      empty: "עוד אין ספרים באורך הזה",
      descriptions: {
        "5": "סיפורים קצרצרים, לרגע קטן של ביחד.",
        "10": "סיפורים של שש עד עשר דקות.",
        "15": "סיפורים של אחת עשרה עד חמש עשרה דקות.",
        "20": "סיפורים ארוכים, לערב רגוע בלי למהר.",
      } as Record<string, string>,
    },
    tag: {
      eyebrow: "תגית",
      siblings: "תגיות נפוצות",
      empty: "עוד אין ספרים עם התגית הזאת",
    },
    collections: {
      title: "אוספים",
      description: "ספרים שנבחרו ביד וסודרו יחד: לעונות השנה, לחגים ולרגעים מיוחדים.",
      crumb: "אוספים",
      emptyTitle: "עוד אין אוספים",
      emptyDescription: "אוספים חדשים יופיעו כאן. בינתיים אפשר לעיין בכל הספרים.",
      allBooks: "לכל הספרים",
    },
    collection: {
      eyebrow: "אוסף",
      startFirst: "מתחילים מהספר הראשון",
      emptyTitle: "האוסף הזה עוד ריק",
      emptyDescription: "עוד לא נוספו אליו ספרים שפורסמו.",
      allCollections: "לכל האוספים",
    },
    search: {
      title: "חיפוש ספרים",
      description: "מחפשים לפי שם הספר, המחבר, התגיות או מילים מתוך הסיפור. אפשר לכתוב עם ניקוד או בלי.",
      crumb: "חיפוש",
      nothingFor: (q: string) => `לא מצאנו ספרים עבור "${q}"`,
      foundFor: (count: string, q: string) => `${count} עבור "${q}"`,
      noResultsTitle: "אין תוצאות",
      noResultsDescription: "נסו מילה אחרת או קצרה יותר, או בחרו אחת מההצעות למטה.",
      allBooks: "לכל הספרים",
      popularTags: "תגיות נפוצות",
      categories: "קטגוריות",
      popular: "הכי פופולריים",
    },
    occasions: {
      parasha: {
        crumb: "פרשת השבוע",
        title: "סיפורי פרשת השבוע לילדים: סיפור לכל פרשה, מבראשית ועד וזאת הברכה",
        description:
          "סיפורי פרשת השבוע לילדים, סיפור לכל פרשה בתורה: סיפורים מאוירים עם ניקוד והקראה, לקריאה לפני שבת ולשיחה בשולחן השבת. בחינם.",
        eyebrow: "פרשת השבוע",
        pageTitle: (name: string) => `סיפורים לפרשת ${name}`,
        siblings: "עוד פרשות",
        empty: (name: string) => `הסיפור לפרשת ${name} עוד בהכנה`,
        backToIndex: "לכל פרשות השבוע",
        otherIndex: "סיפורים לשבת ולחגים",
      },
      holiday: {
        crumb: "חגים",
        title: "סיפורי חגים לילדים: סיפורים לשבת ולחגי ישראל",
        description:
          "סיפורי חגים לילדים: סיפורים מאוירים לשבת, לראש השנה, סוכות, חנוכה, ט״ו בשבט, פורים, פסח ושבועות. עם ניקוד והקראה, בחינם.",
        eyebrow: "חגים ומועדים",
        pageTitle: (name: string) => `סיפורים ל${name}`,
        siblings: "עוד חגים",
        empty: (name: string) => `סיפורים ל${name} עוד בהכנה`,
        backToIndex: "לכל החגים",
        otherIndex: "סיפורים לפרשת השבוע",
      },
      allBooksCrumb: "כל הספרים",
      torahBook: (label: string) => `ספר ${label}`,
      holidaysGroup: "שבת וחגים",
      now: "עכשיו · ",
      count: (count: number) => (count === 0 ? "בקרוב" : count === 1 ? "סיפור אחד" : `${count} סיפורים`),
    },
    bedtime: {
      title: "איך בוחרים סיפור לפני השינה",
      intro:
        "סיפור לפני השינה עובד הכי טוב כשהוא קצר, רגוע ונגמר בטוב. הסיפורים כאן נבחרו בשביל סוף היום: עלילה פשוטה, קצב איטי ומילים שחוזרות על עצמן, כך שגם ילדים קטנים יכולים להשלים את המשפט יחד איתכם.",
      readOrListen: "לקרוא או להאזין",
      readOrListenText:
        "כל ספר אפשר לקרוא בקול מהמסך, עם ניקוד מלא שמקל על קריאה ראשונה. ברוב הספרים יש גם הקראה מוקלטת: מפעילים, מנמיכים את האור ונותנים לסיפור להתנגן. בנגן יש טיימר שינה שעוצר את ההקראה לבד, ומצב כהה שלא מסנוור בחדר חשוך. אפשר גם להאזין לכמה סיפורים ברצף ב",
      listenLink: "סיפורים להאזנה",
      howLong: "כמה זמן ולאיזה גיל",
      toddlers: "לפעוטות מתאימים ספרים של כמה דקות עם איור גדול בכל עמוד, ב",
      toddlersLink: "סיפורים לגילאי 0 עד 2",
      preschool: ". לגן ולגיל הרך אפשר סיפור ארוך מעט יותר, ב",
      preschoolLink: "סיפורים לגילאי 3 עד 5",
      busy: ". בערבים עמוסים כדאי לבחור מתוך ",
      busyLink: "סיפורים קצרים של עד 5 דקות",
      free: "כל הסיפורים באתר חינמיים, בלי פרסומות ובלי חלונות קופצים, כדי שהרגע לפני השינה יישאר שקט.",
    },
    readToggle: {
      read: "קראתי את הספר",
      mark: "סימון כנקרא",
      failed: "לא הצלחנו לעדכן. נסו שוב בעוד רגע.",
    },
    favorite: {
      save: "שמירה במועדפים",
      saved: "במועדפים שלי",
      signInNote: "כדי לשמור ספרים במועדפים צריך להתחבר.",
      loginBefore: "כדי לשמור במועדפים צריך",
      loginLink: "להתחבר",
      unavailable: "המועדפים לא זמינים כרגע, והספר לא נשמר.",
      failed: "לא הצלחנו לעדכן את המועדפים. נסו שוב בעוד רגע.",
    },
    listen: {
      title: "סיפורים להאזנה לפני השינה",
      lead: "סיפור אחרי סיפור, בלי לגעת במסך. אפשר לכבות את המסך והסיפורים ימשיכו להתנגן, עד שטיימר השינה יעצור אותם.",
      emptyTitle: "עדיין אין סיפורים מוקלטים",
      emptyDescription:
        "הרצף מתמלא מספרים בספרייה שיש להם הקראה, ועדיין לא הוקלט אף ספר. בינתיים אפשר לקרוא יחד מהספרייה.",
      allBooks: "לכל הספרים",
      loading: "מכינים את רצף הסיפורים…",
      bedtimeLink: "סיפורים לפני השינה לקריאה, עם ניקוד ואיורים",
    },
    player: {
      sleepDone: "הטיימר הסתיים וההשמעה נעצרה. לילה טוב!",
      audioFailed: "לא הצלחנו להשמיע את ההקלטה. בדקו את החיבור לרשת ונסו שוב.",
      playlistFailed: "לא הצלחנו לעדכן את רשימת ההשמעה. נסו שוב בעוד רגע.",
      siteName: "הסיפור שלי",
      album: "האזנה לפני השינה",
      whoTonight: "למי מקריאים הערב?",
      allAges: "כל הגילים",
      whatToPlay: "מה להשמיע?",
      myPlaylist: (count: number) => `רשימת ההשמעה שלי (${count})`,
      allStories: "כל הסיפורים",
      emptyPlaylistTitle: "רשימת ההשמעה שלכם ריקה",
      emptyAgeTitle: "אין עדיין סיפורים מוקלטים לגיל הזה",
      emptyPlaylistDescription: "אפשר להוסיף סיפורים עם כפתור הרשימה ליד כל סיפור ב'כל הסיפורים', או מעמוד הספר.",
      emptyAgeDescription: "אפשר לבחור גיל אחר, או לחזור אחרי שיתווספו הקלטות.",
      toAllStories: "לכל הסיפורים",
      showAllAges: "להציג את כל הגילים",
      nowPlaying: "מתנגן עכשיו",
      ready: "מוכנים לסיפור?",
      part: (page: number, total: number) => `חלק ${page} מתוך ${total}`,
      noneTicked: "לא סומן אף סיפור. מסמנים סיפורים ברשימה למטה.",
      waiting: (count: number) => `${count} סיפורים מחכים ברצף. לוחצים על הכפתור ומתחילים.`,
      progress: "התקדמות בסיפור",
      previous: "לתחילת הסיפור או לסיפור הקודם",
      pause: "השהיה",
      play: "הפעלה",
      next: "לסיפור הבא",
      watch: "לצפות בסיפורים עם התמונות",
      sleepTimer: "טיימר שינה",
      sleepNote: "ההשמעה תיחלש בעדינות ותיעצר לבד.",
      noTimer: "בלי טיימר",
      minutes: (minutes: number) => `${minutes} דקות`,
      endOfStory: "עד סוף הסיפור",
      stopsIn: "ההשמעה תיעצר בעוד",
      stopsAtEnd: "ההשמעה תיעצר בסוף הסיפור הנוכחי.",
      queueTitle: "הסיפורים ברצף",
      ticked: (count: number, total: number) => `${count} מתוך ${total} סיפורים מסומנים.`,
      selectAll: "סימון הכול",
      clearAll: "ניקוי הסימון",
      include: (title: string) => `לכלול את ${title} ברצף`,
      demoVoice: " · קול הדגמה",
      playing: "מתנגן",
      paused: "מושהה",
      removeTrack: (title: string) => `הסרת ${title} מרשימת ההשמעה`,
      addTrack: (title: string) => `הוספת ${title} לרשימת ההשמעה`,
      removeTitle: "הסרה מרשימת ההשמעה",
      addTitle: "הוספה לרשימת ההשמעה",
      openBook: (title: string) => `לעמוד הספר ${title}`,
    },
    playlistButton: {
      inPlaylist: "ברשימת ההשמעה שלי",
      add: "הוספה לרשימת ההשמעה",
      failed: "לא הצלחנו לעדכן את הרשימה. נסו שוב בעוד רגע.",
    },
    watch: {
      opening: "פותחים את הסיפור…",
      failed: "לא הצלחנו לפתוח את הסיפור.",
      next: "לסיפור הבא",
      back: "חזרה לרשימה",
    },
  },
  {
    allBooksCrumb: "All books",
    category: {
      eyebrow: "Category",
      siblings: "Categories",
      empty: "No books in this category yet",
      parashaLink: "A story for every Torah portion",
      holidaysLink: "Stories for Shabbat and the holidays",
    },
    age: {
      eyebrow: "Books by age",
      title: (label: string) => `Stories for ${label.toLowerCase()}`,
      siblings: "Age groups",
      empty: "No books for this age yet",
    },
    theme: {
      eyebrow: "Something to talk about",
      title: (label: string) => `Stories about ${label.toLowerCase()}`,
      description:
        "Books that help you start a conversation about this. Each book's page has a few questions to talk about together.",
      siblings: "Things to talk about",
      empty: "No books on this subject yet",
    },
    time: {
      eyebrow: "Books by reading time",
      siblings: "Reading times",
      empty: "No books of this length yet",
      descriptions: {
        "5": "Tiny stories for a small moment together.",
        "10": "Stories of six to ten minutes.",
        "15": "Stories of eleven to fifteen minutes.",
        "20": "Long stories for a calm evening with no rush.",
      },
    },
    tag: {
      eyebrow: "Tag",
      siblings: "Popular tags",
      empty: "No books with this tag yet",
    },
    collections: {
      title: "Collections",
      description: "Hand-picked books gathered together: for the seasons, the holidays and special moments.",
      crumb: "Collections",
      emptyTitle: "No collections yet",
      emptyDescription: "New collections will show up here. Meanwhile, you can browse all the books.",
      allBooks: "See all books",
    },
    collection: {
      eyebrow: "Collection",
      startFirst: "Start with the first book",
      emptyTitle: "This collection is still empty",
      emptyDescription: "No published books have been added to it yet.",
      allCollections: "See all collections",
    },
    search: {
      title: "Search books",
      description:
        "Search by book title, author, tags or words from the story. You can type with or without vowel marks.",
      crumb: "Search",
      nothingFor: (q: string) => `We found no books for "${q}"`,
      foundFor: (count: string, q: string) => `${count} for "${q}"`,
      noResultsTitle: "No results",
      noResultsDescription: "Try a different or shorter word, or pick one of the suggestions below.",
      allBooks: "See all books",
      popularTags: "Popular tags",
      categories: "Categories",
      popular: "Most popular",
    },
    occasions: {
      parasha: {
        crumb: "Weekly Torah portion",
        title: "Weekly Torah portion stories for children: a story for every portion, from Bereshit to V'Zot HaBerachah",
        description:
          "Stories for every weekly Torah portion: illustrated, with vowel marks and narration, to read before Shabbat and talk about at the Shabbat table. Free.",
        eyebrow: "Weekly Torah portion",
        pageTitle: (name: string) => `Stories for Parashat ${name}`,
        siblings: "More Torah portions",
        empty: (name: string) => `The story for Parashat ${name} is on its way`,
        backToIndex: "All weekly Torah portions",
        otherIndex: "Stories for Shabbat and the holidays",
      },
      holiday: {
        crumb: "Holidays",
        title: "Holiday stories for children: stories for Shabbat and the Jewish holidays",
        description:
          "Illustrated holiday stories for Shabbat, Rosh Hashanah, Sukkot, Hanukkah, Tu BiShvat, Purim, Passover and Shavuot. With vowel marks and narration, free.",
        eyebrow: "Holidays and festivals",
        pageTitle: (name: string) => `Stories for ${name}`,
        siblings: "More holidays",
        empty: (name: string) => `Stories for ${name} are on their way`,
        backToIndex: "All holidays",
        otherIndex: "Stories for the weekly Torah portion",
      },
      allBooksCrumb: "All books",
      torahBook: (label: string) => `The Book of ${label}`,
      holidaysGroup: "Shabbat and holidays",
      now: "Now · ",
      count: (count: number) => (count === 0 ? "Coming soon" : count === 1 ? "1 story" : `${count} stories`),
    },
    bedtime: {
      title: "How to choose a bedtime story",
      intro:
        "A bedtime story works best when it is short, calm and ends well. The stories here were chosen for the end of the day: a simple plot, a slow pace and words that repeat, so even little ones can finish the sentence with you.",
      readOrListen: "Read or listen",
      readOrListenText:
        "You can read every book aloud from the screen, with full vowel marks that make a first reading easier. Most books also have a recorded narration: press play, dim the lights and let the story play. The player has a sleep timer that stops the narration on its own, and a dark mode that won't dazzle in a dark room. You can also listen to several stories in a row in ",
      listenLink: "stories to listen to",
      howLong: "How long, and for what age",
      toddlers: "Toddlers do well with books of a few minutes and a big picture on every page, in ",
      toddlersLink: "stories for ages 0 to 2",
      preschool: ". Preschoolers can enjoy a slightly longer story, in ",
      preschoolLink: "stories for ages 3 to 5",
      busy: ". On busy evenings, pick one of the ",
      busyLink: "short stories of up to 5 minutes",
      free: "Every story on the site is free, with no ads and no pop-ups, so the moment before sleep stays quiet.",
    },
    readToggle: {
      read: "I've read this book",
      mark: "Mark as read",
      failed: "We couldn't update that. Please try again in a moment.",
    },
    favorite: {
      save: "Save to favorites",
      saved: "In my favorites",
      signInNote: "Sign in to save books to your favorites.",
      loginBefore: "To save favorites, please",
      loginLink: "sign in",
      unavailable: "Favorites aren't available right now, so the book wasn't saved.",
      failed: "We couldn't update your favorites. Please try again in a moment.",
    },
    listen: {
      title: "Bedtime stories to listen to",
      lead: "One story after another, without touching the screen. You can turn the screen off and the stories keep playing until the sleep timer stops them.",
      emptyTitle: "No recorded stories yet",
      emptyDescription:
        "The queue fills with library books that have narration, and none has been recorded yet. Meanwhile, you can read together from the library.",
      allBooks: "See all books",
      loading: "Getting the stories ready…",
      bedtimeLink: "Bedtime stories to read, with vowels and pictures",
    },
    player: {
      sleepDone: "The timer ended and playback stopped. Good night!",
      audioFailed: "We couldn't play the recording. Check your internet connection and try again.",
      playlistFailed: "We couldn't update your playlist. Please try again in a moment.",
      siteName: "My Story",
      album: "Bedtime listening",
      whoTonight: "Who are we reading to tonight?",
      allAges: "All ages",
      whatToPlay: "What should we play?",
      myPlaylist: (count: number) => `My playlist (${count})`,
      allStories: "All stories",
      emptyPlaylistTitle: "Your playlist is empty",
      emptyAgeTitle: "No recorded stories for this age yet",
      emptyPlaylistDescription:
        "Add stories with the playlist button next to each story in 'All stories', or from the book's page.",
      emptyAgeDescription: "Pick another age, or come back once more recordings are added.",
      toAllStories: "See all stories",
      showAllAges: "Show all ages",
      nowPlaying: "Now playing",
      ready: "Ready for a story?",
      part: (page: number, total: number) => `Part ${page} of ${total}`,
      noneTicked: "No story is ticked. Tick stories in the list below.",
      waiting: (count: number) => `${count} stories are waiting in the queue. Press the button to start.`,
      progress: "Story progress",
      previous: "To the start of the story or the previous story",
      pause: "Pause",
      play: "Play",
      next: "Next story",
      watch: "Watch the stories with pictures",
      sleepTimer: "Sleep timer",
      sleepNote: "Playback will fade out gently and stop on its own.",
      noTimer: "No timer",
      minutes: (minutes: number) => `${minutes} minutes`,
      endOfStory: "Until the end of the story",
      stopsIn: "Playback stops in",
      stopsAtEnd: "Playback stops at the end of this story.",
      queueTitle: "Stories in the queue",
      ticked: (count: number, total: number) => `${count} of ${total} stories ticked.`,
      selectAll: "Tick all",
      clearAll: "Untick all",
      include: (title: string) => `Include ${title} in the queue`,
      demoVoice: " · demo voice",
      playing: "Playing",
      paused: "Paused",
      removeTrack: (title: string) => `Remove ${title} from the playlist`,
      addTrack: (title: string) => `Add ${title} to the playlist`,
      removeTitle: "Remove from playlist",
      addTitle: "Add to playlist",
      openBook: (title: string) => `Book page of ${title}`,
    },
    playlistButton: {
      inPlaylist: "In my playlist",
      add: "Add to playlist",
      failed: "We couldn't update the playlist. Please try again in a moment.",
    },
    watch: {
      opening: "Opening the story…",
      failed: "We couldn't open the story.",
      next: "Next story",
      back: "Back to the list",
    },
  },
);

export type LibraryMessages = (typeof LIBRARY_MESSAGES)["he"];

export function libraryMessages(locale: Locale): LibraryMessages {
  return LIBRARY_MESSAGES[locale];
}

// --- Holidays and Torah portions -------------------------------------------------

/** English names of the Torah portions, keyed by slug (src/lib/generation/parasha.ts). */
const PARASHA_EN: Record<string, string> = {
  bereshit: "Bereshit",
  noach: "Noach",
  "lech-lecha": "Lech Lecha",
  vayera: "Vayera",
  "chayei-sarah": "Chayei Sarah",
  toldot: "Toldot",
  vayetze: "Vayetze",
  vayishlach: "Vayishlach",
  vayeshev: "Vayeshev",
  miketz: "Miketz",
  vayigash: "Vayigash",
  vayechi: "Vayechi",
  shemot: "Shemot",
  vaera: "Vaera",
  bo: "Bo",
  beshalach: "Beshalach",
  yitro: "Yitro",
  mishpatim: "Mishpatim",
  terumah: "Terumah",
  tetzaveh: "Tetzaveh",
  "ki-tisa": "Ki Tisa",
  vayakhel: "Vayakhel",
  pekudei: "Pekudei",
  vayikra: "Vayikra",
  tzav: "Tzav",
  shemini: "Shemini",
  tazria: "Tazria",
  metzora: "Metzora",
  "acharei-mot": "Acharei Mot",
  kedoshim: "Kedoshim",
  emor: "Emor",
  behar: "Behar",
  bechukotai: "Bechukotai",
  bamidbar: "Bamidbar",
  naso: "Naso",
  behaalotecha: "Beha'alotecha",
  shelach: "Shelach",
  korach: "Korach",
  chukat: "Chukat",
  balak: "Balak",
  pinchas: "Pinchas",
  matot: "Matot",
  masei: "Masei",
  devarim: "Devarim",
  vaetchanan: "Va'etchanan",
  eikev: "Eikev",
  reeh: "Re'eh",
  shoftim: "Shoftim",
  "ki-tetze": "Ki Teitzei",
  "ki-tavo": "Ki Tavo",
  nitzavim: "Nitzavim",
  vayelech: "Vayelech",
  haazinu: "Ha'azinu",
  "vezot-haberacha": "V'Zot HaBerachah",
};

/** English names and one-sentence intros of the holidays, keyed by slug (src/lib/occasions.ts). */
const HOLIDAY_EN: Record<string, { name: string; blurb: string }> = {
  shabbat: { name: "Shabbat", blurb: "Stories to read at the Shabbat table and at bedtime on Friday night." },
  "rosh-hashana": { name: "Rosh Hashanah", blurb: "Apples in honey, the sound of the shofar and a fresh start." },
  "yom-kippur": { name: "Yom Kippur", blurb: "Stories about forgiveness, saying sorry and a good heart." },
  sukkot: { name: "Sukkot", blurb: "Building a sukkah, decorating it and inviting guests." },
  "simchat-torah": {
    name: "Simchat Torah",
    blurb: "Finishing the Torah, starting again from Bereshit and dancing with the Torah scroll.",
  },
  hanukkah: { name: "Hanukkah", blurb: "Candles, dreidels, latkes and the miracle of the little jar of oil." },
  "tu-bishvat": { name: "Tu BiShvat", blurb: "The new year of the trees: planting, trees and the fruits of the land." },
  purim: { name: "Purim", blurb: "The Megillah of Esther, costumes and gifts of food." },
  pesach: { name: "Passover", blurb: "The exodus from Egypt, the Seder night and matzah." },
  "lag-baomer": { name: "Lag BaOmer", blurb: "Bonfires, bows and arrows, and joy between Passover and Shavuot." },
  shavuot: { name: "Shavuot", blurb: "The giving of the Torah, first fruits and the wheat harvest." },
};

const TORAH_BOOKS_EN: Record<TorahBook, string> = {
  bereshit: "Genesis",
  shemot: "Exodus",
  vayikra: "Leviticus",
  bamidbar: "Numbers",
  devarim: "Deuteronomy",
};

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** English name of a Torah portion or holiday: "Noach", "Hanukkah". */
export function occasionNameEn(kind: OccasionKind, slug: string): string {
  return (kind === "parasha" ? PARASHA_EN[slug] : HOLIDAY_EN[slug]?.name) ?? titleCase(slug);
}

/** English name of a book of the Torah: "Genesis". */
export function torahBookEn(book: TorahBook): string {
  return TORAH_BOOKS_EN[book];
}

/** English intro under the title of a parasha or holiday page. */
export function occasionIntroEn(kind: OccasionKind, slug: string, book?: TorahBook): string {
  const name = occasionNameEn(kind, slug);
  if (kind === "parasha") {
    const where = book ? `in the Book of ${TORAH_BOOKS_EN[book]}` : "in the Torah";
    return `Parashat ${name} is one of the weekly Torah portions ${where}. Here you will find stories for children that tell the portion in simple words, with pictures, vowel marks and narration, and a few small questions to talk about at the Shabbat table.`;
  }
  const blurb = HOLIDAY_EN[slug]?.blurb ?? "";
  return `${blurb} Stories for children for the days before ${name} and during it, with pictures, vowel marks and narration.`.trim();
}
