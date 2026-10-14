import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type MockKind = "text" | "nikud" | "tts" | "tts-device" | "image" | "video" | "login" | "translation" | "generic";

const MESSAGES: Record<MockKind, string> = {
  text: "מצב הדגמה: שירות כתיבת הסיפורים לא מחובר, ולכן מוצג סיפור קבוע לדוגמה.",
  nikud: "מצב הדגמה: שירות הניקוד לא מחובר, ולכן הטקסט נשאר בלי ניקוד.",
  tts: "קול הדגמה: שירות ההקראה לא מחובר ובמכשיר הזה אין קול עברי, ולכן ההקלטה שקטה והמילים מודגשות בקצב קבוע.",
  "tts-device": "קול המכשיר: שירות ההקראה לא מחובר, ולכן הסיפור מוקרא בקול העברי המובנה של המכשיר.",
  image: "איור לדוגמה: שירות האיורים לא מחובר, ולכן מוצג איור זמני במקום איור אמיתי.",
  video: "הנפשה לדוגמה: שירות הנפשת האיורים לא מחובר, ולכן מוצגת תנועה זמנית במקום הנפשה אמיתית.",
  translation:
    "מצב הדגמה: שירות התרגום לא מחובר, ולכן הספר לא תורגם והטקסט לא השתנה. אפשר לתרגם ידנית, עמוד מול עמוד.",
  login: "התחברות לסביבת פיתוח: בלי סיסמה ובלי אימות. לא לשימוש באתר פעיל.",
  generic: "מצב הדגמה: חלק מהשירותים החיצוניים לא מחוברים, והתוצאה היא דוגמה בלבד.",
};

export interface MockNoticeProps {
  /** Which mocked service the notice is about. Default 'generic'. */
  kind?: MockKind;
  /** Replaces the default Hebrew message. */
  children?: ReactNode;
  /** 'inline' is a compact one-line badge. Default 'banner'. */
  variant?: "banner" | "inline";
  className?: string;
}

/** Visible notice that a result came from a mock provider. Never hide mock output from the user. */
export function MockNotice({ kind = "generic", children, variant = "banner", className }: MockNoticeProps) {
  return (
    <p
      role="note"
      className={cn(
        "flex items-start gap-2 bg-warning-soft text-foreground",
        variant === "banner" ? "rounded-md px-4 py-3 text-base" : "inline-flex rounded-full px-3 py-1 text-sm",
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
      <span>{children ?? MESSAGES[kind]}</span>
    </p>
  );
}
