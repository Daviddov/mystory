/**
 * Actions on many books at once, for the publishing pipeline screen. Each book
 * is handled on its own through the studio service, so the same checks apply
 * as for a single book, and one refused book does not stop the others.
 * Callers authenticate the actor (an editor or admin).
 */
import "server-only";
import { NotFoundError, ConflictError } from "@/lib/repo/types";
import { setBookStatus, StudioError, updateBookMeta, type StudioContext } from "@/lib/studio/service";
import { MAX_CATEGORIES, MAX_THEMES, type BookMetaPatch, type PublishProblem } from "@/lib/studio/shared";
import type { BulkMetaInput } from "./schemas";
import { missingPublishCredits } from "./service";

export interface BulkBookResult {
  id: string;
  ok: boolean;
  /** Hebrew, for the editor. Set when the book was refused. */
  error?: string;
}

function refusal(err: unknown): string {
  if (err instanceof StudioError) {
    const problems = Array.isArray(err.details) ? (err.details as PublishProblem[]) : [];
    const list = problems.map((problem) => problem.message).filter(Boolean);
    return list.length > 0 ? `${err.message}: ${list.join("; ")}` : err.message;
  }
  if (err instanceof NotFoundError) return "הספר לא נמצא";
  if (err instanceof ConflictError) return err.message;
  console.error("[admin] bulk action failed", err);
  return "הפעולה נכשלה";
}

async function each(ids: string[], action: (id: string) => Promise<void>): Promise<BulkBookResult[]> {
  const results: BulkBookResult[] = [];
  // One after the other: every book takes its own lock and the local repository rewrites whole files.
  for (const id of ids) {
    try {
      await action(id);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: refusal(err) });
    }
  }
  return results;
}

/**
 * Publishes every book that passes the full publication checklist (the one an
 * owner must pass to submit, plus the credits an editor checks). Nothing is
 * waived here: a book with missing details is refused and reported.
 */
export function bulkPublish(ctx: StudioContext, ids: string[]): Promise<BulkBookResult[]> {
  return each(ids, async (id) => {
    const book = await ctx.repo.getBookById(id);
    if (!book) throw new NotFoundError(`book ${id}`);
    if (book.status === "published") return;
    const missing = missingPublishCredits(book);
    if (missing.length > 0) throw new ConflictError(missing.join(" "));
    await setBookStatus(ctx, id, "published");
    if (book.reviewNote !== undefined) await ctx.repo.updateBook(id, { reviewNote: undefined });
  });
}

function merged(current: string[], added: string[], max: number): string[] {
  return Array.from(new Set([...current, ...added])).slice(0, max);
}

/** Sets the age group and adds (or replaces) categories and themes on every book. */
export function bulkUpdateMeta(ctx: StudioContext, ids: string[], input: BulkMetaInput): Promise<BulkBookResult[]> {
  return each(ids, async (id) => {
    const book = await ctx.repo.getBookById(id);
    if (!book) throw new NotFoundError(`book ${id}`);
    const replace = input.mode === "replace";
    const patch: BookMetaPatch = {};
    if (input.ageGroup) patch.ageGroup = input.ageGroup;
    if (input.categories) {
      patch.categories = replace ? input.categories : merged(book.categories, input.categories, MAX_CATEGORIES);
    }
    if (input.themes) patch.themes = replace ? input.themes : merged(book.themes, input.themes, MAX_THEMES);
    await updateBookMeta(ctx, id, patch);
  });
}
