/** Creative Commons licenses offered in the import form. Client-safe. */
import { z } from "zod";
import type { BookCredits, BookLanguage } from "../types";

export interface CcLicense {
  /** Stored in Book.license. */
  value: string;
  /** Hebrew explanation shown in the form. */
  label: string;
  /** False for licenses that forbid adaptations, so a translation may not be published. */
  allowsAdaptation: boolean;
}

export const CC_LICENSES: readonly CcLicense[] = [
  { value: "CC BY 4.0", label: "CC BY 4.0 (ייחוס)", allowsAdaptation: true },
  { value: "CC BY-SA 4.0", label: "CC BY-SA 4.0 (ייחוס, שיתוף זהה)", allowsAdaptation: true },
  { value: "CC BY-NC 4.0", label: "CC BY-NC 4.0 (ייחוס, לא מסחרי)", allowsAdaptation: true },
  { value: "CC BY-NC-SA 4.0", label: "CC BY-NC-SA 4.0 (ייחוס, לא מסחרי, שיתוף זהה)", allowsAdaptation: true },
  { value: "CC BY-ND 4.0", label: "CC BY-ND 4.0 (ייחוס, בלי יצירות נגזרות)", allowsAdaptation: false },
  { value: "CC BY-NC-ND 4.0", label: "CC BY-NC-ND 4.0 (ייחוס, לא מסחרי, בלי יצירות נגזרות)", allowsAdaptation: false },
  { value: "CC0 1.0", label: "CC0 1.0 (נחלת הכלל)", allowsAdaptation: true },
];

export const CC_LICENSE_VALUES = CC_LICENSES.map((license) => license.value);

export function getCcLicense(value: string): CcLicense | undefined {
  return CC_LICENSES.find((license) => license.value === value);
}

/** Credit of a Creative Commons book. All three of license, sourceUrl and author are required. */
export const CcCreditSchema = z.object({
  license: z.string().refine((value) => CC_LICENSE_VALUES.includes(value), "unknown license"),
  sourceUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    }, "invalid url"),
  /** Attribution: the original author(s). Stored in Book.author. */
  author: z.string().trim().min(1).max(200),
  /** Stored in Book.illustrator. */
  illustrator: z.string().trim().max(200).default(""),
  // The rest is optional. Publishers such as Book Dash and StoryWeaver ask for
  // all the makers, the original publisher and a note about what was changed.
  designer: z.string().trim().max(200).optional(),
  editor: z.string().trim().max(200).optional(),
  /** Who translated the uploaded text, when it is a translation. */
  translator: z.string().trim().max(200).optional(),
  originalTitle: z.string().trim().max(200).optional(),
  /** Original publisher, e.g. "StoryWeaver" or "Pratham Books". */
  publisher: z.string().trim().max(200).optional(),
  publisherUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(value), "invalid url")
    .optional(),
  /** The attribution sentence the publisher asks for, in its own wording. */
  attributionLine: z.string().trim().max(500).optional(),
  /** What was changed from the original, e.g. "Translation into Hebrew by ...". */
  adaptation: z.string().trim().max(500).optional(),
  /** Language of the uploaded text. A book that is not in Hebrew stays a draft until it is translated. */
  language: z.enum(["he", "en"]).optional(),
});
export type CcCredit = z.infer<typeof CcCreditSchema>;

/** The Book.credits block of an imported Creative Commons book; undefined when no extra credit was given. */
export function ccBookCredits(credit: CcCredit): BookCredits | undefined {
  const credits: BookCredits = {};
  const keys = ["designer", "editor", "translator", "originalTitle", "publisher", "publisherUrl", "attributionLine", "adaptation"] as const;
  for (const key of keys) {
    const value = credit[key];
    if (value) credits[key] = value;
  }
  return Object.keys(credits).length > 0 ? credits : undefined;
}

/** Language fields of an imported book: an English text is marked as waiting for translation. */
export function ccBookLanguage(credit: CcCredit | undefined): { language?: BookLanguage; originalLanguage?: BookLanguage } {
  if (!credit?.language || credit.language === "he") return {};
  return { language: credit.language, originalLanguage: credit.language };
}
