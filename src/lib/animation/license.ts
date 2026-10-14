/**
 * May this book's illustrations be animated? Client-safe and pure.
 *
 * An animated clip is a derivative work of the illustration ("an adaptation"
 * in Creative Commons terms), so:
 *
 *  - A NoDerivatives license (CC BY-ND, CC BY-NC-ND, "NoDerivs", the Hebrew
 *    "ללא יצירות נגזרות") is always refused, whatever the origin of the book.
 *  - Books made on this site (origin "ai" or "manual") are allowed: the
 *    illustrations were generated here or uploaded by the book's owner, who is
 *    the one asking (license strings like "לשימוש אישי" or "כל הזכויות שמורות").
 *  - Imported books are allowed only under a license that permits adaptations:
 *    a Creative Commons BY license without ND (BY, BY-SA, BY-NC, BY-NC-SA, as
 *    in src/lib/importers/cc.ts), CC0 or the public domain. Anything else
 *    (empty, "all rights reserved", unknown wording) is refused: we cannot
 *    tell that a derivative is allowed.
 */
import { isCreativeCommons } from "../credits";
import type { Book } from "../types";
import type { AnimationLicenseCheck } from "./types";

/** True when the license text forbids derivative works. */
export function forbidsDerivatives(license: string): boolean {
  const upper = license.toUpperCase();
  // "ND" as its own token: "CC BY-ND 4.0", "CC BY-NC-ND", "BY ND". Not inside words like "AND" or "LONDON".
  if (/(^|[^A-Z])ND([^A-Z]|$)/.test(upper)) return true;
  if (/NO\s*-?\s*DERIV/.test(upper)) return true;
  if (/(ללא|בלי|אין|לא)\s+(יצירות\s+)?נגזרות/.test(license)) return true;
  return false;
}

/** True for licenses that clearly allow adaptations of an outside work. */
export function allowsAdaptation(license: string): boolean {
  const value = license.trim();
  if (value === "" || forbidsDerivatives(value)) return false;
  if (isCreativeCommons(value)) return true; // CC0 or CC BY..., ND already excluded
  return /public\s+domain|נחלת\s+הכלל/i.test(value);
}

export function animationLicenseCheck(book: Pick<Book, "license" | "origin">): AnimationLicenseCheck {
  if (forbidsDerivatives(book.license)) {
    return {
      allowed: false,
      reason: "no-derivatives",
      message: `הרישיון של הספר (${book.license.trim()}) אוסר יצירות נגזרות, ולכן אי אפשר להנפיש את האיורים שלו.`,
    };
  }
  if (book.origin === "ai" || book.origin === "manual") return { allowed: true };
  if (allowsAdaptation(book.license)) return { allowed: true };
  return {
    allowed: false,
    reason: "unknown-license",
    message: book.license.trim()
      ? `לא ברור שהרישיון של הספר (${book.license.trim()}) מתיר יצירות נגזרות, ולכן אי אפשר להנפיש את האיורים שלו.`
      : "לספר המיובא אין רישיון רשום, ולכן אי אפשר להנפיש את האיורים שלו.",
  };
}
