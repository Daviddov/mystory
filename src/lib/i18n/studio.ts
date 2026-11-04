/**
 * Interface texts of the studio shared by several components (status names,
 * credit roles, book languages), plus the studio home, new-book and small
 * shared components. Client-safe.
 *
 * Label maps here mirror maps in src/lib/studio/shared.ts and src/lib/credits.ts
 * (keyed by the same values); those stay Hebrew because the server uses them.
 */
import type { BookStatus } from "@/lib/types";
import type { CreditRole } from "@/lib/credits";
import { LANGUAGE_NAMES_EN, LANGUAGE_NAMES_HE } from "@/lib/credits";
import type { Locale } from "./locale";
import { defineMessages } from "./define";

export const STUDIO_STATUS_LABELS: Record<Locale, Record<BookStatus, string>> = {
  he: { draft: "טיוטה", private: "פרטי", pending: "ממתין לאישור", published: "פורסם" },
  en: { draft: "Draft", private: "Private", pending: "Awaiting approval", published: "Published" },
};

export const STUDIO_CREDIT_ROLE_LABELS: Record<Locale, Record<CreditRole, string>> = {
  he: { author: "כתיבה", illustrator: "איור", designer: "עיצוב", editor: "עריכה" },
  en: { author: "Writing", illustrator: "Illustration", designer: "Design", editor: "Editing" },
};

/** Names of book languages in the interface language. */
export const STUDIO_LANGUAGE_NAMES = { he: LANGUAGE_NAMES_HE, en: LANGUAGE_NAMES_EN } as const;

export const STUDIO_COMMON = defineMessages(
  {
    closeNotice: "סגירת ההודעה",
  },
  {
    closeNotice: "Close message",
  },
);

/** BusyOverlay: English twins of the Hebrew texts in src/lib/studio/progress.ts. */
export const STUDIO_BUSY = defineMessages(
  {
    inProgress: "בתהליך",
    processing: "מעבדים…",
  },
  {
    inProgress: "In progress",
    processing: "Working…",
  },
);

/** English of remainingText() in src/lib/studio/progress.ts (same rounding). */
export function remainingTextEn(seconds: number): string {
  if (seconds <= 5) return "A few seconds left";
  if (seconds <= 90) {
    const rounded = seconds <= 10 ? Math.ceil(seconds) : Math.ceil(seconds / 5) * 5;
    return `About ${rounded} seconds left`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? "About a minute left" : `About ${minutes} minutes left`;
}

/** English of elapsedText() in src/lib/studio/progress.ts. */
export function elapsedTextEn(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) return `${whole} seconds so far`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")} minutes so far`;
}

export const OVERDUE_TEXT_EN = "Taking longer than expected…";

export const STUDIO_BOOK_ACTIONS = defineMessages(
  {
    linkCopied: "הקישור הועתק",
    shareFailed: "יצירת הקישור נכשלה",
    deleteFailed: "מחיקת הספר נכשלה",
    edit: "עריכה",
    shareBook: (title: string) => `שיתוף הספר ${title}`,
    deleteBook: (title: string) => `מחיקת הספר ${title}`,
    confirmTitle: "למחוק את הספר?",
    confirmText: (title: string) => `הספר "${title}", התמונות וההקלטות שלו יימחקו לצמיתות.`,
    cancel: "ביטול",
    confirmDelete: "מחיקת הספר",
  },
  {
    linkCopied: "Link copied",
    shareFailed: "Could not create the link",
    deleteFailed: "Could not delete the book",
    edit: "Edit",
    shareBook: (title: string) => `Share the book ${title}`,
    deleteBook: (title: string) => `Delete the book ${title}`,
    confirmTitle: "Delete this book?",
    confirmText: (title: string) => `The book "${title}" and its pictures and recordings will be deleted for good.`,
    cancel: "Cancel",
    confirmDelete: "Delete book",
  },
);

export const STUDIO_NEW_BOOK = defineMessages(
  {
    myBooks: "הספרים שלי",
    heading: "ספר חדש",
    intro:
      "אחרי היצירה תוכלו לגרור את כל התמונות בבת אחת, להדביק את הסיפור ולהקליט הקראה. הספר נשאר פרטי עד שתחליטו אחרת.",
    missingTitle: "כתבו שם לספר. אפשר לשנות אותו אחר כך.",
    createFailed: "יצירת הספר נכשלה",
    titleLabel: "שם הספר",
    ageLabel: "לאיזה גיל?",
    submit: "יצירת הספר ומעבר לעריכה",
  },
  {
    myBooks: "My books",
    heading: "New book",
    intro:
      "Once it is created you can drag in all the pictures at once, paste the story and record narration. The book stays private until you decide otherwise.",
    missingTitle: "Give the book a name. You can change it later.",
    createFailed: "Could not create the book",
    titleLabel: "Book name",
    ageLabel: "For what age?",
    submit: "Create the book and start editing",
  },
);

export const STUDIO_HOME = defineMessages(
  {
    heading: "הספרים שלי",
    intro: "כאן יוצרים ספר חדש וממשיכים לעבוד על ספרים קיימים.",
    newBook: "ספר חדש",
    importFile: "ייבוא מקובץ",
    createWithAi: "יצירה עם AI",
    emptyTitle: "עוד אין לכם ספרים",
    emptyText: "מעלים תמונות, כותבים או מדביקים את הטקסט, מקליטים הקראה, והספר מוכן לקריאה.",
    firstBook: "יצירת הספר הראשון",
    editorNote: "יש הערה מהעורך",
    sections: {
      draft: "טיוטות",
      pending: "ממתינים לאישור",
      private: "ספרים פרטיים",
      published: "פורסמו בספרייה",
    } as Record<BookStatus, string>,
  },
  {
    heading: "My books",
    intro: "Start a new book here and keep working on the ones you have.",
    newBook: "New book",
    importFile: "Import from a file",
    createWithAi: "Create with AI",
    emptyTitle: "You have no books yet",
    emptyText: "Upload pictures, write or paste the text, record narration, and the book is ready to read.",
    firstBook: "Create your first book",
    editorNote: "The editor left a note",
    sections: {
      draft: "Drafts",
      pending: "Awaiting approval",
      private: "Private books",
      published: "Published in the library",
    },
  },
);
