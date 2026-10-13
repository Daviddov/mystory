/** Hebrew labels used across the admin console. Client-safe. */
import type { ChipTone } from "@/components/ui";
import type { BookOrigin, BookStatus, JobStatus, UserRole } from "@/lib/types";

export const STATUS_LABELS: Record<BookStatus, string> = {
  draft: "טיוטה",
  private: "פרטי",
  pending: "ממתין לאישור",
  published: "מפורסם",
};

export const STATUS_TONES: Record<BookStatus, ChipTone> = {
  draft: "neutral",
  private: "secondary",
  pending: "warning",
  published: "success",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  parent: "הורה",
  editor: "עורך",
  admin: "מנהל",
};

export const ORIGIN_LABELS: Record<BookOrigin, string> = {
  manual: "הועלה ידנית",
  import: "יובא מקובץ",
  ai: "נוצר ב-AI",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: "בתור",
  running: "בתהליך",
  done: "הסתיימו",
  failed: "נכשלו",
};

/** Suggested season / holiday keys for collections. The stored value is the key. */
export const SEASONS: readonly { key: string; label: string }[] = [
  { key: "winter", label: "חורף" },
  { key: "spring", label: "אביב" },
  { key: "summer", label: "קיץ" },
  { key: "autumn", label: "סתיו" },
  { key: "rosh-hashana", label: "ראש השנה" },
  { key: "sukkot", label: "סוכות" },
  { key: "hanukkah", label: "חנוכה" },
  { key: "tu-bishvat", label: 'ט"ו בשבט' },
  { key: "purim", label: "פורים" },
  { key: "passover", label: "פסח" },
  { key: "independence-day", label: "יום העצמאות" },
  { key: "shavuot", label: "שבועות" },
  { key: "back-to-school", label: "חוזרים לגן ולבית הספר" },
];

export function seasonLabel(key: string | undefined): string {
  if (!key) return "";
  return SEASONS.find((s) => s.key === key)?.label ?? key;
}

const DATE_FORMAT = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeZone: "Asia/Jerusalem",
});

export function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMAT.format(date);
}
