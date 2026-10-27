/** "More like this" ranking and small date helpers. Pure and client-safe. */
import { readingTimeBucket, tagSlug } from "@/lib/taxonomy";
import { bookAgeGroups, type Book } from "@/lib/types";

type Comparable = Pick<Book, "id" | "ageGroup" | "extraAgeGroups" | "categories" | "themes" | "tags" | "readingMinutes" | "viewCount">;

function shared(a: readonly string[], b: readonly string[]): number {
  const set = new Set(a);
  return b.reduce((count, value) => count + (set.has(value) ? 1 : 0), 0);
}

/** Higher means more alike. Zero means the books have nothing in common. */
export function similarityScore(book: Comparable, other: Comparable): number {
  let score = 0;
  if (bookAgeGroups(other).includes(book.ageGroup)) score += 3;
  score += 2 * shared(book.categories, other.categories);
  score += 1.5 * shared(book.themes, other.themes);
  score += shared(book.tags.map(tagSlug), other.tags.map(tagSlug));
  if (readingTimeBucket(book.readingMinutes) === readingTimeBucket(other.readingMinutes)) score += 0.5;
  return score;
}

/**
 * The `limit` candidates most similar to `book`. The book itself, duplicates
 * and candidates with nothing in common are dropped; ties go to the more read book.
 */
export function rankSimilar<T extends Comparable>(book: Comparable, candidates: readonly T[], limit: number = 6): T[] {
  const seen = new Set<string>([book.id]);
  const scored: { candidate: T; score: number }[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const score = similarityScore(book, candidate);
    if (score > 0) scored.push({ candidate, score });
  }
  scored.sort((a, b) => b.score - a.score || b.candidate.viewCount - a.candidate.viewCount);
  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.candidate);
}

export const NEW_BOOK_DAYS = 14;

/** True when the book was published in the last `days` days. */
export function isNewBook(
  book: Pick<Book, "publishedAt" | "createdAt">,
  now: number,
  days: number = NEW_BOOK_DAYS,
): boolean {
  const published = Date.parse(book.publishedAt ?? book.createdAt);
  if (Number.isNaN(published)) return false;
  const age = now - published;
  return age >= 0 && age <= days * 24 * 60 * 60 * 1000;
}
