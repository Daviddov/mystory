/**
 * Creates a draft book from a list of page images and page texts. Used by the
 * "folder of images", "PDF" and "Creative Commons book" imports: the browser
 * prepares one image per page (PDF pages are rendered there) and this module
 * validates and stores them.
 */
import { z } from "zod";
import { newId } from "../ids";
import { getMediaStore } from "../media";
import { assertOwnerCanAddBook } from "../owner-books";
import type { MediaStore } from "../media/types";
import { storeImage } from "../media/optimize";
import { bookMediaPath, bookMediaPrefix, extensionForContentType } from "../media/url";
import { getRepo } from "../repo";
import type { Repository } from "../repo/types";
import type { BookWithPages, Page } from "../types";
import { ccBookCredits, ccBookLanguage, CcCreditSchema } from "./cc";
import { IMPORT_LIMITS } from "./limits";
import { detectImageType } from "./media-sniff";

export const PagesImportMetaSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    /** What the pages were made from. 'cc' is the Creative Commons form without files. */
    kind: z.enum(["images", "pdf", "cc"]),
    /** One entry per page, in reading order. Pages with hasImage consume the uploaded images in order. */
    pages: z
      .array(
        z.object({
          text: z.string().max(IMPORT_LIMITS.pageTextChars).default(""),
          hasImage: z.boolean().default(false),
        }),
      )
      .max(IMPORT_LIMITS.pages),
    /** Required for kind 'cc'; optional credit for the other kinds. */
    credit: CcCreditSchema.optional(),
  })
  .refine((meta) => meta.kind !== "cc" || meta.credit !== undefined, {
    message: "credit is required for a Creative Commons book",
    path: ["credit"],
  });
export type PagesImportMeta = z.infer<typeof PagesImportMetaSchema>;

export type PagesImportErrorCode = "image-count" | "image-too-large" | "image-type";

const USER_MESSAGES: Record<PagesImportErrorCode, string> = {
  "image-count": "מספר התמונות שנשלחו לא תואם את מספר העמודים.",
  "image-too-large": "אחת התמונות גדולה מדי.",
  "image-type": "אחד הקבצים אינו תמונה מסוג נתמך (PNG, JPEG, WebP, GIF או AVIF).",
};

/** A pages import that was refused. `userMessage` is Hebrew and safe to show. */
export class PagesImportError extends Error {
  readonly code: PagesImportErrorCode;
  readonly userMessage: string;

  constructor(code: PagesImportErrorCode, detail?: string) {
    super(detail ? `pages import rejected (${code}): ${detail}` : `pages import rejected (${code})`);
    this.name = "PagesImportError";
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
  }
}

export interface PagesImportInput {
  ownerId: string;
  meta: PagesImportMeta;
  /** Page images in page order. The file names are ignored; the type is read from the bytes. */
  images: Uint8Array[];
  repo?: Repository;
  media?: MediaStore;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Stores the images and creates a draft owned by `ownerId`. The first image is also copied as the cover. */
export async function createDraftFromPages(input: PagesImportInput): Promise<BookWithPages> {
  const { meta, images } = input;
  const expected = meta.pages.filter((page) => page.hasImage).length;
  if (images.length !== expected) {
    throw new PagesImportError("image-count", `${images.length} images for ${expected} pages`);
  }

  // Validate everything before the first write.
  const typed = images.map((bytes, i) => {
    if (bytes.byteLength > IMPORT_LIMITS.imageBytes) throw new PagesImportError("image-too-large", `image ${i + 1}`);
    // Like the studio upload: a picture a user picks is never an SVG (it can carry scripts).
    const contentType = detectImageType(bytes, { allowSvg: false });
    if (!contentType) throw new PagesImportError("image-type", `image ${i + 1}`);
    return { bytes, contentType, ext: extensionForContentType(contentType) };
  });

  const bookId = newId("bk");
  const media = input.media ?? (await getMediaStore());
  const repo = input.repo ?? (await getRepo());
  // Before the first write: an account at its book cap gets nothing stored.
  await assertOwnerCanAddBook(repo, input.ownerId);

  const language = ccBookLanguage(meta.credit);
  const foreign = language.language !== undefined;

  try {
    const pages: Page[] = [];
    let nextImage = 0;
    for (const [i, page] of meta.pages.entries()) {
      const next: Page = { index: i, text: normalizeText(page.text) };
      // A book in another language keeps its source text next to the future translation.
      if (foreign && next.text) next.originalText = next.text;
      if (page.hasImage) {
        const image = typed[nextImage];
        nextImage += 1;
        const path = bookMediaPath(bookId, `page-${String(i + 1).padStart(2, "0")}.${image.ext}`);
        next.image = (await storeImage(media, path, image.bytes, image.contentType)).path;
      }
      pages.push(next);
    }

    let coverImage = "";
    if (typed.length > 0) {
      // A separate copy, so replacing or deleting the first page later does not break the cover.
      const cover = bookMediaPath(bookId, `cover.${typed[0].ext}`);
      coverImage = (await storeImage(media, cover, typed[0].bytes, typed[0].contentType)).path;
    }

    return await repo.createBook({
      id: bookId,
      ownerId: input.ownerId,
      status: "draft",
      origin: "import",
      title: meta.title,
      author: meta.credit?.author ?? "",
      illustrator: meta.credit?.illustrator ?? "",
      license: meta.credit?.license ?? "",
      source: meta.credit?.sourceUrl ?? "",
      ...language,
      credits: meta.credit ? ccBookCredits(meta.credit) : undefined,
      coverImage,
      pages,
    });
  } catch (err) {
    await media.deletePrefix(bookMediaPrefix(bookId)).catch(() => undefined);
    throw err;
  }
}
