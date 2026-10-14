/**
 * Studio illustration: the hero's reference image, and one page illustration
 * made from the hero, the whole story and the page.
 *
 *   hero:  description (typed, or written from the story) -> character sheet image
 *   page:  story + page + hero -> scene (text model) -> illustration, with the
 *          hero image as reference so the character looks the same on every page
 *
 * Only media files are written. The book itself is not changed: the editor
 * puts the returned path in `book.hero` or `page.image` and saves, exactly as
 * with an upload. Every dependency is injected (see the route for the wiring),
 * so this file must not import "server-only" modules.
 */
import type { ImageProvider, ImageReference, TextProvider } from "../ai/types";
import {
  CharacterSchema,
  SceneSchema,
  characterSheetImagePrompt,
  heroFromStoryPrompt,
  pageImagePrompt,
  scenePrompt,
} from "../generation/prompts";
import { getStoryStyle } from "../generation/options";
import { newId } from "../ids";
import type { MediaStore } from "../media/types";
import { bookMediaPath, bookMediaPrefix, extensionForContentType } from "../media/url";
import type { BookWithPages } from "../types";
import { DEFAULT_ILLUSTRATION_STYLE, MAX_MEDIA_FILES_PER_BOOK } from "./shared";

export interface IllustrateDeps {
  media: Pick<MediaStore, "put" | "get" | "list">;
  text: TextProvider;
  image: ImageProvider;
}

/** A refused illustration request, with a Hebrew message that is safe to show. */
export class IllustrateError extends Error {
  constructor(
    readonly status: 400 | 409,
    message: string,
  ) {
    super(message);
    this.name = "IllustrateError";
  }
}

const MOCK_HERO =
  "A cheerful child of about six with short curly brown hair and warm brown eyes, wearing a yellow T-shirt, " +
  "blue shorts and red sneakers, with a small green backpack.";

export interface HeroImageResult {
  /** Media path of the new hero image; put it in book.hero.image. */
  path: string;
  url: string;
  /** The description the image was drawn from (written from the story when none was given). */
  description: string;
  style: string;
  /** True when the description was written from the story (the owner typed none). */
  descriptionWritten: boolean;
  /** True when the image (or the written description) came from a mock provider. */
  isMock: boolean;
}

export interface PageIllustrationResult {
  /** Media path of the new illustration; put it in page.image. */
  path: string;
  url: string;
  /** The English scene the picture was drawn from. */
  scene: string;
  isMock: boolean;
}

function storyTexts(book: BookWithPages): string[] {
  return book.pages.map((page) => page.text.replace(/\s+/g, " ").trim());
}

function isRaster(contentType: string): boolean {
  return /^image\/(png|jpeg|webp)$/.test(contentType);
}

async function assertRoomForFile(media: IllustrateDeps["media"], bookId: string): Promise<void> {
  const existing = await media.list(bookMediaPrefix(bookId));
  if (existing.length >= MAX_MEDIA_FILES_PER_BOOK) {
    throw new IllustrateError(409, "יש יותר מדי קבצים בספר הזה. מחקו עמודים שאינם בשימוש ונסו שוב.");
  }
}

export async function createHeroImage(
  deps: IllustrateDeps,
  book: BookWithPages,
  options: { description?: string; style?: string },
): Promise<HeroImageResult> {
  const style = options.style?.trim() || book.hero?.style || DEFAULT_ILLUSTRATION_STYLE;
  let description = options.description?.replace(/\s+/g, " ").trim() ?? "";
  let isMock = false;
  const descriptionWritten = description.length === 0;

  if (descriptionWritten) {
    const texts = storyTexts(book);
    if (texts.every((text) => text.length === 0)) {
      throw new IllustrateError(400, "כתבו תיאור של הגיבור, או קודם את הטקסט של הסיפור כדי שנכתוב תיאור לפיו.");
    }
    const written = await deps.text.generate({
      ...heroFromStoryPrompt(book.title, texts),
      schema: CharacterSchema,
      schemaName: "character_sheet",
      mockData: { description: MOCK_HERO },
    });
    if (written.isMock) isMock = true;
    description = written.data.description.replace(/\s+/g, " ").trim().slice(0, 1000);
  }

  await assertRoomForFile(deps.media, book.id);
  const result = await deps.image.generate({
    prompt: characterSheetImagePrompt(style, description),
    style,
    caption: `דף דמות · ${getStoryStyle(style)?.label ?? style}`,
    aspect: "1:1",
  });
  if (result.isMock) isMock = true;
  const stored = await deps.media.put(
    bookMediaPath(book.id, `hero-${newId()}.${extensionForContentType(result.contentType)}`),
    result.image,
    result.contentType,
  );
  return { path: stored.path, url: stored.url, description, style, descriptionWritten, isMock };
}

export async function illustratePage(
  deps: IllustrateDeps,
  book: BookWithPages,
  options: { pageIndex: number; note?: string },
): Promise<PageIllustrationResult> {
  const hero = book.hero;
  if (!hero || (!hero.description && !hero.image)) {
    throw new IllustrateError(409, "צרו קודם את הגיבור של הספר, ואז אפשר לאייר את העמודים לפיו.");
  }
  const page = book.pages[options.pageIndex];
  if (!page) throw new IllustrateError(400, "העמוד לא נמצא. שמרו את הספר ונסו שוב.");
  const texts = storyTexts(book);
  if (!texts[options.pageIndex]) throw new IllustrateError(400, "כתבו קודם את הטקסט של העמוד, ואז אפשר לאייר אותו.");

  const style = hero.style || DEFAULT_ILLUSTRATION_STYLE;
  const character = hero.description || "the hero exactly as shown in the reference image";
  let isMock = false;

  const sceneResult = await deps.text.generate({
    ...scenePrompt(book.title, texts, options.pageIndex, hero.description, options.note?.trim() || undefined),
    schema: SceneSchema,
    schemaName: "page_scene",
    mockData: { scene: `The hero in the moment of page ${options.pageIndex + 1}.` },
  });
  if (sceneResult.isMock) isMock = true;
  const scene = sceneResult.data.scene.replace(/\s+/g, " ").trim().slice(0, 600);

  const references: ImageReference[] = [];
  if (hero.image) {
    const stored = await deps.media.get(hero.image);
    // A mock (SVG) hero cannot be sent to an image model; the description carries the look then.
    if (stored && isRaster(stored.contentType)) {
      references.push({ bytes: stored.bytes, contentType: stored.contentType, description: "character sheet of the hero" });
    }
  }

  await assertRoomForFile(deps.media, book.id);
  const result = await deps.image.generate({
    prompt: pageImagePrompt(style, character, scene),
    referenceImages: references,
    style,
    caption: texts[options.pageIndex],
    aspect: "4:3",
  });
  if (result.isMock) isMock = true;
  const stored = await deps.media.put(
    bookMediaPath(book.id, `art-${newId()}.${extensionForContentType(result.contentType)}`),
    result.image,
    result.contentType,
  );
  return { path: stored.path, url: stored.url, scene, isMock };
}
