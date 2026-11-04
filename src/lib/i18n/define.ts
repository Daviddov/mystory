/**
 * Per-area interface texts. Client-safe.
 *
 *   export const READER_MESSAGES = defineMessages({ play: "הפעלה" }, { play: "Play" });
 *   const t = READER_MESSAGES[locale];
 *
 * Hebrew is the source; the English object must have the same shape. Areas
 * keep their own module (src/lib/i18n/<area>.ts) so they stay small; shared
 * site-wide texts live in ./messages.ts.
 */
import type { Locale } from "./locale";

/** Widens literal string types so `en` can hold different text than `he`. */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : T extends readonly (infer U)[]
      ? Widen<U>[]
      : T extends object
        ? { [K in keyof T]: Widen<T[K]> }
        : T;

export function defineMessages<T extends object>(he: T, en: Widen<T>): Record<Locale, Widen<T>> {
  return { he: he as Widen<T>, en };
}
