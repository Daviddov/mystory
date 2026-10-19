/**
 * The AI story pipeline:
 *
 *   outline -> pages (tuned to the age group) -> second-pass quality and
 *   child-safety review (one automatic revision on "major") -> character sheet
 *   (description + reference image) -> page illustrations (grids of up to 9 panels, cropped) + cover ->
 *   title, summary, tags, themes, discussion questions -> save the book ->
 *   narration (when a narration pipeline is installed).
 *
 * Every dependency is injected, so the same code runs inside Next.js
 * (server.ts wires the real repo and providers), in the daily-story CLI and
 * in tests. This file must not import "server-only" modules.
 *
 * Privacy: this module never logs inputs, and the child photo is reachable
 * only through EphemeralPhoto.useOnce (see photo.ts).
 */
import type { AiUsage, ImageProvider, ImageReference, TextProvider, TextRequest } from "../ai/types";
import { countWords, estimateReadingMinutes } from "../hebrew";
import { newId } from "../ids";
import { storeImage } from "../media/optimize";
import type { MediaStore } from "../media/types";
import { bookMediaPath, bookMediaPrefix, extensionForContentType } from "../media/url";
import type { JobPatch, Repository } from "../repo/types";
import { CATEGORY_SLUGS, THEME_SLUGS } from "../taxonomy";
import type { BookStatus, BookWithPages, GenerationJob, Page } from "../types";
import type { WizardInput } from "./input";
import { cleanFreeText } from "./input";
import { mockCharacter, mockMetadata, mockOutline, mockPages, mockReview } from "./mock-story";
import { AGE_WRITING_RULES, getStoryStyle } from "./options";
import { illustrationDirection } from "./presets";
import type { EphemeralPhoto } from "./photo";
import {
  CharacterSchema,
  MetadataSchema,
  OutlineSchema,
  ReviewSchema,
  StoryPagesSchema,
  characterFromPhotoPrompt,
  characterPrompt,
  characterSheetImagePrompt,
  coverImagePrompt,
  metadataPrompt,
  outlinePrompt,
  pagesPrompt,
  reviewPrompt,
  revisionPrompt,
  type Review,
  type StoryPage,
} from "./prompts";
import { supportsVision } from "./vision";
import { planGridLayout, renderGrid } from "../studio/grid";

// --- Steps and progress ------------------------------------------------------------

export const GENERATION_STEPS = [
  { step: "outline", label: "חושבים על העלילה", progress: 5 },
  { step: "pages", label: "כותבים את העמודים", progress: 15 },
  { step: "review", label: "בודקים שהסיפור מתאים לילדים", progress: 32 },
  { step: "character", label: "מציירים את הגיבור", progress: 45 },
  { step: "illustrations", label: "מאיירים את העמודים", progress: 52 },
  { step: "details", label: "בוחרים שם ושאלות לשיחה", progress: 86 },
  { step: "saving", label: "כורכים את הספר", progress: 92 },
  { step: "narration", label: "מכינים את ההקראה", progress: 95 },
] as const;

export type GenerationStep = (typeof GENERATION_STEPS)[number]["step"] | "queued" | "revise" | "done" | "failed";

const STEP_INFO = new Map<string, { label: string; progress: number }>(
  GENERATION_STEPS.map((s) => [s.step, { label: s.label, progress: s.progress }]),
);

// --- Errors ---------------------------------------------------------------------------

/** A failure with a Hebrew message that is safe to show to the parent. */
export class GenerationError extends Error {
  constructor(
    readonly userMessage: string,
    readonly code: "unsafe" | "bad_output" | "quota" | "provider",
  ) {
    super(`${code}: ${userMessage}`);
    this.name = "GenerationError";
  }
}

const GENERIC_FAILURE = "לא הצלחנו ליצור את הספר הפעם. הניסיון לא נספר במכסה, ואפשר לנסות שוב.";

// --- Dependencies -----------------------------------------------------------------------

export interface PipelineDeps {
  repo: Pick<Repository, "createBook" | "updateJob">;
  media: Pick<MediaStore, "put" | "deletePrefix">;
  text: TextProvider;
  image: ImageProvider;
  /**
   * Narrates a saved book (the narration pipeline). Optional: when it is
   * missing the book is saved without audio and the job says so. A returned
   * object may carry `ttsMock` (silent demo voice) and `failed` (page count).
   */
  narrate?: (bookId: string) => Promise<unknown>;
  /** Receives operational messages only (step names, error class names). Never inputs. */
  log?: (message: string) => void;
}

export interface PipelineParams {
  jobId: string;
  ownerId: string;
  input: WizardInput;
  /** Optional child photo. It is consumed (and destroyed) during the character step. */
  photo?: EphemeralPhoto | null;
  /** 'private' for a parent's book, 'pending' for the daily story awaiting editor approval. */
  status?: Extract<BookStatus, "private" | "pending">;
  /** Credit line stored in Book.source. */
  source?: string;
}

export interface PipelineResult {
  job: GenerationJob;
  book: BookWithPages | null;
}

const IMAGE_CONCURRENCY = 2;
/** Most pages drawn in one grid image (3x3). */
const GRID_PAGES = 9;
const MAX_PAGES = 16;
const MIN_PAGES = 3;

// --- Helpers ------------------------------------------------------------------------------

class CostMeter {
  total = 0;
  known = false;
  add(usage?: AiUsage): void {
    if (usage?.costUsd !== undefined) {
      this.total += usage.costUsd;
      this.known = true;
    }
  }
  /** Undefined when no provider reported a cost (e.g. everything was a mock). */
  value(): number | undefined {
    return this.known ? Number(this.total.toFixed(4)) : undefined;
  }
}

/**
 * Deterministic length check that backs up the LLM review: a page far over the
 * limit for the age group is a "major" issue, a page somewhat over is "minor".
 */
export function checkAgeFit(pages: StoryPage[], ageGroup: WizardInput["ageGroup"]): Review {
  const rules = AGE_WRITING_RULES[ageGroup];
  const issues: Review["issues"] = [];
  let major = false;
  pages.forEach((page, i) => {
    const words = countWords(page.text);
    if (words > rules.maxWordsPerPage) {
      issues.push({
        page: i + 1,
        description: `Page has ${words} words; the limit for ages ${ageGroup} is ${rules.maxWordsPerPage} (target ${rules.wordsPerPage}).`,
      });
      if (words > rules.maxWordsPerPage * 1.6) major = true;
    }
  });
  if (pages.length > rules.pageCount + 2 || pages.length < Math.max(MIN_PAGES, rules.pageCount - 2)) {
    issues.push({ page: 0, description: `The story has ${pages.length} pages; it should have ${rules.pageCount}.` });
    major = true;
  }
  return { verdict: major ? "major" : issues.length > 0 ? "minor" : "ok", issues };
}

function worstVerdict(a: Review["verdict"], b: Review["verdict"]): Review["verdict"] {
  const rank = { ok: 0, minor: 1, major: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

function normalizePages(pages: StoryPage[]): StoryPage[] {
  const cleaned = pages
    .map((page) => ({
      text: page.text.replace(/\s+/g, " ").trim(),
      illustrationPrompt: page.illustrationPrompt.replace(/\s+/g, " ").trim().slice(0, 600),
    }))
    .filter((page) => page.text.length > 0)
    .slice(0, MAX_PAGES);
  if (cleaned.length < MIN_PAGES) {
    throw new GenerationError(GENERIC_FAILURE, "bad_output");
  }
  return cleaned;
}

function clampList(values: string[], max: number, maxLength: number): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = cleanFreeText(value).slice(0, maxLength).trim();
    if (cleaned) seen.add(cleaned);
    if (seen.size >= max) break;
  }
  return Array.from(seen);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !failed) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  });
  // Wait for every worker to stop before reporting a failure, so that no
  // in-flight item writes media after the caller has cleaned up.
  const settled = await Promise.allSettled(workers);
  const rejected = settled.find((outcome) => outcome.status === "rejected");
  if (rejected) throw rejected.reason;
  return results;
}

/** Page indexes split into as few, evenly filled grids of at most GRID_PAGES as possible (12 -> 6 + 6). */
function planGridGroups(pageCount: number): number[][] {
  const groups = Math.max(1, Math.ceil(pageCount / GRID_PAGES));
  const size = Math.ceil(pageCount / groups);
  return Array.from({ length: groups }, (_, g) =>
    Array.from({ length: Math.max(0, Math.min(size, pageCount - g * size)) }, (_, k) => g * size + k),
  ).filter((group) => group.length > 0);
}

function isRaster(contentType: string): boolean {
  return /^image\/(png|jpeg|webp)$/.test(contentType);
}

// --- The pipeline -----------------------------------------------------------------------------

/**
 * Runs one generation job to the end. It never throws: on failure the job is
 * marked 'failed' (so it does not count against the weekly quota), any media
 * already written is removed, and the result has `book: null`. Once the book
 * is saved the job carries its `bookId` and counts against the quota whatever
 * happens next.
 */
export async function runGeneration(deps: PipelineDeps, params: PipelineParams): Promise<PipelineResult> {
  const { repo, media, text, image } = deps;
  const { jobId, ownerId, input } = params;
  const photo = params.photo ?? null;
  const log = deps.log ?? (() => {});
  const cost = new CostMeter();
  const bookId = newId("bk");
  const notes: string[] = [];
  let usedMock = false;
  let savedBook: BookWithPages | null = null;

  const update = (patch: JobPatch) => repo.updateJob(jobId, patch);
  const enter = async (step: string, progress?: number, label?: string) => {
    const info = STEP_INFO.get(step);
    log(`[generation ${jobId}] step ${step}`);
    await update({
      status: "running",
      step,
      progress: progress ?? info?.progress ?? 0,
      message: label ?? info?.label ?? "",
      usedMock: usedMock || undefined,
    });
  };

  async function ask<T>(request: TextRequest<T>): Promise<T> {
    const result = await text.generate(request);
    if (result.isMock) usedMock = true;
    cost.add(result.usage);
    return result.data;
  }

  try {
    // 1. Outline
    await enter("outline");
    const outline = await ask({
      ...outlinePrompt(input),
      schema: OutlineSchema,
      schemaName: "story_outline",
      mockData: mockOutline(input),
    });

    // 2. Pages
    await enter("pages");
    const written = await ask({
      ...pagesPrompt(input, outline),
      schema: StoryPagesSchema,
      schemaName: "story_pages",
      mockData: { pages: mockPages(input) },
    });
    let pages = normalizePages(written.pages);

    // 3. Second-pass review, with one automatic revision when the verdict is "major".
    await enter("review");
    const review = async (current: StoryPage[]): Promise<Review> => {
      const llm = await ask({
        ...reviewPrompt(input, current),
        schema: ReviewSchema,
        schemaName: "story_review",
        mockData: mockReview(),
      });
      const fit = checkAgeFit(current, input.ageGroup);
      return { verdict: worstVerdict(llm.verdict, fit.verdict), issues: [...llm.issues, ...fit.issues] };
    };
    let verdict = await review(pages);
    if (verdict.verdict === "major") {
      await enter("revise", 38, "משפרים את הסיפור לפי הערות העורך");
      const revised = await ask({
        ...revisionPrompt(input, pages, verdict.issues),
        schema: StoryPagesSchema,
        schemaName: "story_pages",
        mockData: { pages: mockPages(input) },
      });
      pages = normalizePages(revised.pages);
      verdict = await review(pages);
      if (verdict.verdict === "major") {
        log(`[generation ${jobId}] review still major after one revision (${verdict.issues.length} issues)`);
        throw new GenerationError(
          "הסיפור שנוצר לא עבר את בדיקת האיכות וההתאמה לילדים, ולכן לא נשמר. הניסיון לא נספר במכסה. נסו לנסח את הרעיון אחרת.",
          "unsafe",
        );
      }
    }
    log(`[generation ${jobId}] review verdict ${verdict.verdict}`);

    // 4. Character sheet: a written description, then a reference image.
    await enter("character");
    let characterDescription: string | undefined;
    if (photo) {
      if (supportsVision(text)) {
        const fromPhoto = await photo.useOnce(async (lent) => {
          const result = await text.generateWithImages(
            { ...characterFromPhotoPrompt(input), schema: CharacterSchema, schemaName: "character_sheet" },
            [lent],
          );
          cost.add(result.usage);
          return result.data.description;
        });
        characterDescription = fromPhoto;
      } else {
        usedMock = true;
        notes.push("התמונה לא נשמרה, ולא נעשה בה שימוש: שירות שמתאר תמונות לא מחובר.");
      }
      // The photo's only purpose is over, whatever happened above.
      photo.discard();
    }
    if (!characterDescription) {
      const sheet = await ask({
        ...characterPrompt(input),
        schema: CharacterSchema,
        schemaName: "character_sheet",
        mockData: mockCharacter(input),
      });
      characterDescription = sheet.description;
    }
    const character = characterDescription.replace(/\s+/g, " ").trim().slice(0, 800);

    const styleLabel = getStoryStyle(input.style)?.label ?? input.style;
    const sheetImage = await image.generate({
      prompt: characterSheetImagePrompt(input.style, character),
      style: input.style,
      caption: `דף דמות · ${styleLabel}`,
      aspect: "1:1",
    });
    cost.add(sheetImage.usage);
    if (sheetImage.isMock) usedMock = true;
    const references: ImageReference[] = isRaster(sheetImage.contentType)
      ? [{ bytes: sheetImage.image, contentType: sheetImage.contentType, description: "character sheet of the hero" }]
      : [];
    const characterPath = (
      await storeImage(
        media,
        bookMediaPath(bookId, `character.${extensionForContentType(sheetImage.contentType)}`),
        sheetImage.image,
        sheetImage.contentType,
      )
    ).path;

    // 5. The page illustrations, drawn in grids of up to 9 panels (one image call each) and cropped
    //    into one picture per page, then the cover. Each call uses the character sheet as reference.
    const illustrationsStart = STEP_INFO.get("illustrations")?.progress ?? 52;
    const illustrationsEnd = STEP_INFO.get("details")?.progress ?? 86;
    await enter("illustrations");
    let finished = 0;
    const totalImages = pages.length + 1;
    const direction = illustrationDirection({ style: input.style });
    const imagePaths: (string | undefined)[] = new Array(pages.length).fill(undefined);
    await mapLimit(planGridGroups(pages.length), IMAGE_CONCURRENCY, async (group) => {
      const draw = async (indexes: number[]) => {
        const rendered = await renderGrid(
          { media, image },
          {
            bookId,
            direction,
            character,
            scenes: indexes.map((i) => pages[i].illustrationPrompt),
            captions: indexes.map((i) => pages[i].text),
            layout: planGridLayout(indexes.length, "3x3"),
            style: input.style,
            references,
            fileName: (k) => `page-${String(indexes[k] + 1).padStart(2, "0")}.png`,
          },
        );
        rendered.usages.forEach((usage) => cost.add(usage));
        if (rendered.isMock) usedMock = true;
        for (const panel of rendered.panels) imagePaths[indexes[panel.index]] = panel.path;
        return rendered;
      };
      await draw(group);
      // A panel that did not come out is drawn again on its own, once.
      for (const i of group.filter((index) => !imagePaths[index])) {
        log(`[generation ${jobId}] grid panel ${i + 1} redrawn alone`);
        await draw([i]);
      }
      finished += group.length;
      await update({
        progress: Math.round(illustrationsStart + ((illustrationsEnd - illustrationsStart) * finished) / totalImages),
        message: `מאיירים את העמודים (${finished} מתוך ${pages.length})`,
      });
    });

    // 6. Title, summary, tags, themes, discussion questions.
    await enter("details");
    const meta = await ask({
      ...metadataPrompt(input, pages),
      schema: MetadataSchema,
      schemaName: "book_metadata",
      mockData: mockMetadata(input),
    });
    const title = cleanFreeText(meta.title).slice(0, 120) || `הסיפור של ${input.childName}`;

    const cover = await image.generate({
      prompt: coverImagePrompt(input.style, character, outline.premise.slice(0, 300)),
      referenceImages: references,
      style: input.style,
      caption: title,
      aspect: "3:4",
    });
    cost.add(cover.usage);
    if (cover.isMock) usedMock = true;
    const coverPath = (
      await storeImage(
        media,
        bookMediaPath(bookId, `cover.${extensionForContentType(cover.contentType)}`),
        cover.image,
        cover.contentType,
      )
    ).path;

    // 7. Save. Private by default; nothing reaches the public library without an editor.
    await enter("saving");
    const categories = [
      input.category,
      ...meta.categories.filter((slug) => CATEGORY_SLUGS.includes(slug) && slug !== input.category),
    ].slice(0, 3);
    const bookPages: Page[] = pages.map((page, index) => ({ index, text: page.text, image: imagePaths[index] }));
    savedBook = await repo.createBook({
      id: bookId,
      title,
      summary: meta.summary.replace(/\s+/g, " ").trim().slice(0, 600),
      author: text.isMock ? "סיפור לדוגמה (ללא שירות כתיבה)" : "נכתב בעזרת בינה מלאכותית",
      illustrator: image.isMock ? "איור לדוגמה (ללא שירות איור)" : "אויר בעזרת בינה מלאכותית",
      license: "לשימוש אישי",
      source: params.source ?? "נוצר באשף היצירה של האתר",
      ageGroup: input.ageGroup,
      readingMinutes: estimateReadingMinutes(pages.map((page) => page.text)),
      coverImage: coverPath,
      status: params.status ?? "private",
      ownerId,
      categories,
      tags: clampList(meta.tags, 6, 30),
      themes: Array.from(new Set(meta.themes.filter((slug) => THEME_SLUGS.includes(slug)))).slice(0, 3),
      discussionQuestions: clampList(meta.discussionQuestions, 4, 200),
      origin: "ai",
      // The studio redraws pages from this hero.
      hero: { description: character, style: input.style, image: characterPath },
      ...(cost.value() !== undefined ? { costUsd: cost.value() } : {}),
      pages: bookPages,
    });
    // Recorded at once: narration is the slowest step, and a job that is killed
    // during it must still be known to have produced this book (see stale.ts).
    await update({ bookId: savedBook.id });

    // 8. Narration hand-off. A narration failure never loses the finished book.
    if (deps.narrate) {
      await enter("narration");
      try {
        const summary = (await deps.narrate(savedBook.id)) as { ttsMock?: boolean; failed?: number } | undefined;
        if (summary?.ttsMock) {
          usedMock = true;
          notes.push("ההקראה היא קול הדגמה שקט, כי שירות ההקראה לא מחובר.");
        }
        if (summary?.failed) notes.push("חלק מהעמודים לא הוקראו. אפשר להשלים מהסטודיו.");
      } catch (err) {
        log(`[generation ${jobId}] narration failed: ${err instanceof Error ? err.name : "error"}`);
        notes.push("ההקראה לא הוכנה. אפשר להפעיל אותה מהסטודיו.");
      }
    } else {
      notes.push("הספר נשמר בלי הקראה. אפשר להוסיף הקראה מהסטודיו.");
    }

    const job = await update({
      status: "done",
      step: "done",
      progress: 100,
      bookId: savedBook.id,
      message: ["הספר מוכן!", ...notes].join(" "),
      usedMock,
      ...(cost.value() !== undefined ? { costUsd: cost.value() } : {}),
    });
    return { job, book: savedBook };
  } catch (err) {
    // Log the error class and message only. Provider errors do not echo request bodies,
    // and nothing here has access to the photo bytes.
    log(`[generation ${jobId}] failed: ${err instanceof Error ? `${err.name}: ${err.message}` : "unknown error"}`);
    if (savedBook) {
      // Failed after the save (only a job update can do that): keep the book.
      const job = await update({ status: "done", step: "done", progress: 100, bookId: savedBook.id, usedMock }).catch(
        () => null,
      );
      if (job) return { job, book: savedBook };
    }
    await media.deletePrefix(bookMediaPrefix(bookId)).catch(() => {});
    const job = await update({
      status: "failed",
      step: "failed",
      error: err instanceof GenerationError ? err.userMessage : GENERIC_FAILURE,
      message: "",
      usedMock: usedMock || undefined,
      ...(cost.value() !== undefined ? { costUsd: cost.value() } : {}),
    });
    return { job, book: null };
  } finally {
    photo?.discard();
  }
}
