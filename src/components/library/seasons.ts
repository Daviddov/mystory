/**
 * Seasonal collections. Collection.season is a free key ("winter", "hanukkah").
 * This file maps a date to the keys that are "in season" and gives Hebrew
 * labels for the keys it knows. Unknown keys are shown as they are.
 * Pure and client-safe.
 */
import type { Collection } from "@/lib/types";

const SEASON_LABELS: Record<string, { label: string; emoji: string }> = {
  winter: { label: "חורף", emoji: "🌧️" },
  spring: { label: "אביב", emoji: "🌷" },
  summer: { label: "קיץ", emoji: "🌞" },
  autumn: { label: "סתיו", emoji: "🍂" },
  "rosh-hashana": { label: "ראש השנה", emoji: "🍎" },
  sukkot: { label: "סוכות", emoji: "🌿" },
  hanukkah: { label: "חנוכה", emoji: "🕎" },
  "tu-bishvat": { label: "ט״ו בשבט", emoji: "🌳" },
  purim: { label: "פורים", emoji: "🎭" },
  pesach: { label: "פסח", emoji: "🍷" },
  independence: { label: "יום העצמאות", emoji: "🎆" },
  "lag-baomer": { label: "ל״ג בעומר", emoji: "🔥" },
  shavuot: { label: "שבועות", emoji: "🌾" },
};

/** Aliases people are likely to type in the admin screen. */
const ALIASES: Record<string, string> = {
  fall: "autumn",
  chanukah: "hanukkah",
  hanukah: "hanukkah",
  passover: "pesach",
  "rosh-hashanah": "rosh-hashana",
  succot: "sukkot",
};

export function normalizeSeason(season: string | undefined | null): string | undefined {
  if (!season) return undefined;
  const key = season.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (key === "") return undefined;
  return ALIASES[key] ?? key;
}

export function seasonInfo(season: string | undefined | null): { label: string; emoji: string } | undefined {
  const key = normalizeSeason(season);
  if (!key) return undefined;
  return SEASON_LABELS[key] ?? { label: (season ?? "").trim(), emoji: "🗓️" };
}

/** Holidays by Hebrew month, as named by Intl's Hebrew calendar in English. */
const HOLIDAYS_BY_HEBREW_MONTH: Record<string, string[]> = {
  elul: ["rosh-hashana"],
  tishri: ["rosh-hashana", "sukkot"],
  kislev: ["hanukkah"],
  tevet: ["hanukkah"],
  shevat: ["tu-bishvat"],
  adar: ["purim"],
  "adar ii": ["purim"],
  nisan: ["pesach"],
  iyar: ["independence", "lag-baomer"],
  sivan: ["shavuot"],
};

function hebrewMonth(date: Date): string | undefined {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-hebrew", { month: "long", timeZone: "Asia/Jerusalem" }).formatToParts(
      date,
    );
    return parts.find((part) => part.type === "month")?.value.toLowerCase();
  } catch {
    // Runtime without Hebrew calendar data: only the weather seasons are used.
    return undefined;
  }
}

/** Season keys that fit the given date in Israel: the weather season plus nearby holidays. */
export function currentSeasons(date: Date): string[] {
  const month = date.getUTCMonth(); // 0 = January
  const weather =
    month === 11 || month <= 1 ? "winter" : month <= 4 ? "spring" : month <= 7 ? "summer" : "autumn";
  const holidays = HOLIDAYS_BY_HEBREW_MONTH[hebrewMonth(date) ?? ""] ?? [];
  return [weather, ...holidays];
}

export function isInSeason(collection: Pick<Collection, "season">, date: Date): boolean {
  const key = normalizeSeason(collection.season);
  return !!key && currentSeasons(date).includes(key);
}

/** In-season collections first; the others keep their order. */
export function sortCollectionsBySeason<T extends Pick<Collection, "season">>(collections: readonly T[], date: Date): T[] {
  const rank = (collection: T) => (isInSeason(collection, date) ? 0 : 1);
  return collections
    .map((collection, index) => ({ collection, index }))
    .sort((a, b) => rank(a.collection) - rank(b.collection) || a.index - b.index)
    .map((entry) => entry.collection);
}
