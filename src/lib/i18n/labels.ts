/** Taxonomy labels in the interface language. Client-safe. */
import { ageGroupLabel, ageSpan, getAgeGroup } from "../taxonomy";
import type { Locale } from "./locale";
import { getMessages, taxonomyText } from "./messages";

/** ageGroupsLabel() in the interface language. */
export function ageGroupsText(locale: Locale, groups: readonly string[]): string {
  if (groups.length === 1) {
    const info = getAgeGroup(groups[0]);
    return info ? taxonomyText(locale, "age", info.slug, info).label : ageGroupLabel(groups[0]);
  }
  const [min, max] = ageSpan(groups);
  return getMessages(locale).library.ages(min, max);
}

/** readingTimeLabel() in the interface language. */
export function readingTimeText(locale: Locale, minutes: number): string {
  return getMessages(locale).library.minutes(Math.max(1, Math.round(minutes)));
}
