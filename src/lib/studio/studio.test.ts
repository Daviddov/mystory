import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/repo/types";
import type { User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";
import {
  createShareLink,
  createStudioBook,
  deleteStudioBook,
  listMyBooks,
  loadEditableBook,
  removeShareLink,
  saveBookPages,
  setBookStatus,
  storeUpload,
  StudioError,
  updateBookMeta,
  type StudioContext,
} from "./service";
import {
  BookMetaPatchSchema,
  IMAGE_MAX_BYTES,
  narrationStale,
  nikudWordMismatch,
  PagesPayloadSchema,
  publishProblems,
  sanitizePages,
  sortByFileName,
  splitStoryIntoPages,
} from "./shared";
import { sniffMedia } from "./upload";

const owner: User = { id: "u_owner", name: "דנה", role: "parent" };
const stranger: User = { id: "u_other", name: "יואב", role: "parent" };
const editor: User = { id: "u_editor", name: "עורכת", role: "editor" };

function png(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function webm(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
  return bytes;
}

function ascii(text: string, size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(Array.from(text, (ch) => ch.charCodeAt(0)));
  return bytes;
}

describe("sniffMedia", () => {
  it("recognises the accepted formats by content", () => {
    expect(sniffMedia(png())).toMatchObject({ kind: "image", ext: "png" });
    expect(sniffMedia(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toMatchObject({ ext: "jpg" });
    expect(sniffMedia(ascii("GIF89a"))).toMatchObject({ ext: "gif" });
    expect(sniffMedia(ascii("RIFF\0\0\0\0WEBP"))).toMatchObject({ kind: "image", ext: "webp" });
    expect(sniffMedia(ascii("RIFF\0\0\0\0WAVE"))).toMatchObject({ kind: "audio", ext: "wav" });
    expect(sniffMedia(ascii("\0\0\0\x20ftypavif"))).toMatchObject({ kind: "image", ext: "avif" });
    expect(sniffMedia(ascii("\0\0\0\x20ftypM4A "))).toMatchObject({ kind: "audio", ext: "m4a" });
    expect(sniffMedia(ascii("OggS"))).toMatchObject({ kind: "audio", ext: "ogg" });
    expect(sniffMedia(webm())).toMatchObject({ kind: "audio", ext: "webm" });
    expect(sniffMedia(ascii("ID3"))).toMatchObject({ kind: "audio", ext: "mp3" });
    expect(sniffMedia(new Uint8Array([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toMatchObject({ ext: "mp3" });
  });

  it("rejects SVG, HTML, executables and tiny files", () => {
    expect(sniffMedia(ascii("<svg xmlns='http://www.w3.org/2000/svg'><script>"))).toBeNull();
    expect(sniffMedia(ascii("<!doctype html><html>"))).toBeNull();
    expect(sniffMedia(ascii("MZ\x90\0"))).toBeNull();
    expect(sniffMedia(ascii("RIFF\0\0\0\0AVI "))).toBeNull();
    expect(sniffMedia(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe("shared helpers", () => {
  it("sorts dropped files in natural filename order", () => {
    const names = ["page10.png", "page2.png", "Page1.png"].map((name) => ({ name }));
    expect(sortByFileName(names).map((f) => f.name)).toEqual(["Page1.png", "page2.png", "page10.png"]);
    const hebrew = ["עמוד 10.jpg", "עמוד 2.jpg", "עמוד 1.jpg"].map((name) => ({ name }));
    expect(sortByFileName(hebrew).map((f) => f.name)).toEqual(["עמוד 1.jpg", "עמוד 2.jpg", "עמוד 10.jpg"]);
  });

  it("splits a pasted story by blank lines, or by lines when there are none", () => {
    expect(splitStoryIntoPages("אחת\nעדיין אחת\n\n\nשתיים\r\n\r\nשלוש")).toEqual(["אחת עדיין אחת", "שתיים", "שלוש"]);
    expect(splitStoryIntoPages("אחת\nשתיים\n")).toEqual(["אחת", "שתיים"]);
    expect(splitStoryIntoPages("   ")).toEqual([]);
  });

  it("detects nikud word-count mismatch and stale narration", () => {
    expect(nikudWordMismatch({ text: "שלום עולם", textNikud: "שָׁלוֹם עוֹלָם" })).toBe(false);
    expect(nikudWordMismatch({ text: "שלום עולם", textNikud: "שָׁלוֹם" })).toBe(true);
    expect(nikudWordMismatch({ text: "שלום עולם" })).toBe(false);
    const timings = [{ word: "שלום", start: 0, end: 0.4 }];
    expect(narrationStale({ text: "שלום", audio: "a.wav", wordTimings: timings })).toBe(false);
    expect(narrationStale({ text: "שלום עולם", audio: "a.wav", wordTimings: timings })).toBe(true);
    expect(narrationStale({ text: "שלום עולם", audio: "a.webm" })).toBe(false);
  });

  it("sanitizePages reindexes, drops orphan audio metadata and stale timings", () => {
    const timings = [{ word: "שלום", start: 0, end: 0.4 }];
    const pages = sanitizePages(
      PagesPayloadSchema.parse({
        pages: [
          { index: 7, text: "שלום", audio: "books/b/a.wav", audioSource: "mock", wordTimings: timings },
          { index: 3, text: "שלום עולם", audio: "books/b/b.wav", audioSource: "tts", wordTimings: timings },
          { text: "בלי שמע", audioSource: "tts", wordTimings: timings, image: "", textNikud: "  " },
        ],
      }).pages,
    );
    expect(pages.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(pages[0]).toMatchObject({ audioSource: "mock", wordTimings: timings });
    expect(pages[1].wordTimings).toBeUndefined();
    expect(pages[1].audio).toBe("books/b/b.wav");
    expect(pages[2]).toEqual({ index: 2, text: "בלי שמע" });
  });

  it("the metadata schema refuses fields an owner must not set", () => {
    expect(BookMetaPatchSchema.safeParse({ status: "published" }).success).toBe(false);
    expect(BookMetaPatchSchema.safeParse({ ownerId: "u_x" }).success).toBe(false);
    expect(BookMetaPatchSchema.safeParse({ slug: "x" }).success).toBe(false);
    expect(BookMetaPatchSchema.safeParse({ categories: ["nope"] }).success).toBe(false);
    const ok = BookMetaPatchSchema.parse({ tags: [" חתול ", "חתול", "ים"], discussionQuestions: ["", " למה? "] });
    expect(ok.tags).toEqual(["חתול", "ים"]);
    expect(ok.discussionQuestions).toEqual(["למה?"]);
  });

  it("publishProblems lists what is missing", () => {
    const codes = publishProblems({
      title: "ספר",
      summary: "",
      license: "",
      author: "",
      categories: [],
      pages: [{ index: 0, text: "" }],
    }).map((p) => p.code);
    expect(codes).toEqual(["summary", "author", "license", "categories", "blank-page", "no-text"]);
  });
});

describe("studio service", () => {
  let data: TempData;
  let ctx: StudioContext;
  const as = (user: User): StudioContext => ({ ...ctx, user });

  beforeEach(async () => {
    data = await createTempData();
    ctx = { repo: data.repo, media: data.media, user: owner };
  });
  afterEach(async () => {
    await data.cleanup();
  });

  async function readyBook() {
    const book = await createStudioBook(ctx, { title: "הספר שלי" });
    await updateBookMeta(ctx, book.id, {
      summary: "תקציר",
      license: "כל הזכויות שמורות",
      categories: ["animals"],
    });
    return saveBookPages(ctx, book.id, { pages: [{ text: "היה היה חתול" }] });
  }

  it("creates a private draft owned by the user with one empty page", async () => {
    const book = await createStudioBook(ctx, { title: "הספר שלי", ageGroup: "0-2" });
    expect(book).toMatchObject({ ownerId: owner.id, status: "draft", origin: "manual", ageGroup: "0-2", author: "דנה" });
    expect(book.pages).toHaveLength(1);
    expect((await listMyBooks(ctx)).map((b) => b.id)).toEqual([book.id]);
    expect(await listMyBooks(as(stranger))).toEqual([]);
  });

  it("hides other people's books from every operation, but lets editors in", async () => {
    const book = await createStudioBook(ctx, { title: "הספר שלי" });
    const other = as(stranger);
    await expect(loadEditableBook(other, book.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateBookMeta(other, book.id, { title: "פריצה" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveBookPages(other, book.id, { pages: [] })).rejects.toBeInstanceOf(NotFoundError);
    await expect(storeUpload(other, book.id, "image", png())).rejects.toBeInstanceOf(NotFoundError);
    await expect(setBookStatus(other, book.id, "private")).rejects.toBeInstanceOf(NotFoundError);
    await expect(createShareLink(other, book.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(removeShareLink(other, book.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteStudioBook(other, book.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(loadEditableBook(other, "../etc")).rejects.toBeInstanceOf(NotFoundError);
    expect((await data.repo.getBookById(book.id))?.title).toBe("הספר שלי");

    expect((await updateBookMeta(as(editor), book.id, { title: "תוקן" })).title).toBe("תוקן");
  });

  it("saves pages, recomputes reading minutes and never changes pages on a metadata save", async () => {
    const book = await createStudioBook(ctx, { title: "הספר שלי" });
    const text = Array.from({ length: 180 }, () => "מילה").join(" ");
    const saved = await saveBookPages(ctx, book.id, { pages: [{ text }, { text }] });
    expect(saved.pages.map((p) => p.index)).toEqual([0, 1]);
    expect(saved.readingMinutes).toBe(4);
    const meta = await updateBookMeta(ctx, book.id, { summary: "תקציר" });
    expect(meta.pages).toHaveLength(2);
    expect((await data.repo.getBookById(book.id))?.pages).toHaveLength(2);
  });

  it("validates uploads by size, content and kind", async () => {
    const book = await createStudioBook(ctx, { title: "הספר שלי" });
    const image = await storeUpload(ctx, book.id, "image", png());
    expect(image.path).toMatch(new RegExp(`^books/${book.id}/img-[a-z0-9]+\\.png$`));
    expect(await data.media.get(image.path)).not.toBeNull();
    const audio = await storeUpload(ctx, book.id, "audio", webm());
    expect(audio.path).toMatch(/\/rec-[a-z0-9]+\.webm$/);

    await expect(storeUpload(ctx, book.id, "image", webm())).rejects.toMatchObject({ status: 415 });
    await expect(storeUpload(ctx, book.id, "audio", png())).rejects.toMatchObject({ status: 415 });
    await expect(storeUpload(ctx, book.id, "image", ascii("<svg onload=alert(1)>"))).rejects.toMatchObject({ status: 415 });
    await expect(storeUpload(ctx, book.id, "image", new Uint8Array(0))).rejects.toMatchObject({ status: 400 });
    await expect(storeUpload(ctx, book.id, "cover", png(IMAGE_MAX_BYTES + 1))).rejects.toMatchObject({ status: 413 });
  });

  it("refuses media paths outside the book's own folder", async () => {
    const mine = await createStudioBook(ctx, { title: "הספר שלי" });
    const theirs = await createStudioBook(as(stranger), { title: "ספר אחר" });
    const foreign = await storeUpload(as(stranger), theirs.id, "image", png());

    await expect(saveBookPages(ctx, mine.id, { pages: [{ text: "", image: foreign.path }] })).rejects.toBeInstanceOf(StudioError);
    await expect(saveBookPages(ctx, mine.id, { pages: [{ text: "", image: "../../secret.png" }] })).rejects.toBeInstanceOf(StudioError);
    await expect(updateBookMeta(ctx, mine.id, { coverImage: foreign.path })).rejects.toBeInstanceOf(StudioError);

    const own = await storeUpload(ctx, mine.id, "image", png());
    const ownAudio = await storeUpload(ctx, mine.id, "audio", webm());
    // An image cannot be used as audio and the other way round.
    await expect(saveBookPages(ctx, mine.id, { pages: [{ text: "", audio: own.path }] })).rejects.toBeInstanceOf(StudioError);
    await expect(saveBookPages(ctx, mine.id, { pages: [{ text: "", image: ownAudio.path }] })).rejects.toBeInstanceOf(StudioError);
    const saved = await saveBookPages(ctx, mine.id, { pages: [{ text: "", image: own.path, audio: ownAudio.path }] });
    expect(saved.pages[0]).toMatchObject({ image: own.path, audio: ownAudio.path });
    expect(await data.media.get(foreign.path)).not.toBeNull();
  });

  it("deletes media only when the book stops referencing it", async () => {
    const book = await createStudioBook(ctx, { title: "הספר שלי" });
    const a = await storeUpload(ctx, book.id, "image", png());
    const b = await storeUpload(ctx, book.id, "image", png());
    const unsaved = await storeUpload(ctx, book.id, "image", png());
    await saveBookPages(ctx, book.id, { pages: [{ text: "", image: a.path }, { text: "", image: b.path }] });
    await updateBookMeta(ctx, book.id, { coverImage: a.path });

    // Files are deleted only by a save that names the version it is based on.
    const base = async () => ({ baseUpdatedAt: (await data.repo.getBookById(book.id))!.updatedAt });

    // Page one goes away, but its picture is still the cover.
    await saveBookPages(ctx, book.id, { pages: [{ text: "", image: b.path }] }, await base());
    expect(await data.media.get(a.path)).not.toBeNull();
    expect(await data.media.get(unsaved.path)).not.toBeNull();

    await updateBookMeta(ctx, book.id, { coverImage: "" }, await base());
    expect(await data.media.get(a.path)).toBeNull();
    expect(await data.media.get(b.path)).not.toBeNull();
    expect(await data.media.get(unsaved.path)).not.toBeNull();
  });

  it("submits for publication only when the book is ready, and only editors publish", async () => {
    const draft = await createStudioBook(ctx, { title: "הספר שלי" });
    await expect(setBookStatus(ctx, draft.id, "pending")).rejects.toMatchObject({ status: 400 });
    expect((await data.repo.getBookById(draft.id))?.status).toBe("draft");

    const book = await readyBook();
    await expect(setBookStatus(ctx, book.id, "published")).rejects.toMatchObject({ status: 403 });
    expect((await setBookStatus(ctx, book.id, "private")).status).toBe("private");
    expect((await setBookStatus(ctx, book.id, "pending")).status).toBe("pending");
    const published = await setBookStatus(as(editor), book.id, "published");
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeTruthy();
  });

  it("locks a published book for its owner until it is taken back to private", async () => {
    const book = await readyBook();
    await setBookStatus(ctx, book.id, "pending");
    await setBookStatus(as(editor), book.id, "published");

    await expect(updateBookMeta(ctx, book.id, { title: "שינוי בלי אישור" })).rejects.toMatchObject({ status: 409 });
    await expect(saveBookPages(ctx, book.id, { pages: [{ text: "שינוי" }] })).rejects.toMatchObject({ status: 409 });
    await expect(storeUpload(ctx, book.id, "image", png())).rejects.toMatchObject({ status: 409 });
    await expect(deleteStudioBook(ctx, book.id)).rejects.toMatchObject({ status: 409 });
    expect((await updateBookMeta(as(editor), book.id, { summary: "עריכת עורך" })).summary).toBe("עריכת עורך");

    await setBookStatus(ctx, book.id, "private");
    expect((await updateBookMeta(ctx, book.id, { title: "עכשיו מותר" })).title).toBe("עכשיו מותר");
  });

  it("clears the review note on resubmission and fills a missing cover from the first picture", async () => {
    const book = await readyBook();
    const image = await storeUpload(ctx, book.id, "image", png());
    await saveBookPages(ctx, book.id, { pages: [{ text: "היה היה חתול", image: image.path }] });
    await data.repo.updateBook(book.id, { reviewNote: "חסר ניקוד" });
    const pending = await setBookStatus(ctx, book.id, "pending");
    expect(pending.reviewNote).toBeUndefined();
    expect(pending.coverImage).toBe(image.path);
  });

  it("renames the slug from the title while the book was never published", async () => {
    const book = await createStudioBook(ctx, { title: "ספר חדש" });
    await updateBookMeta(ctx, book.id, { title: "Moon Cat" });
    const updated = await setBookStatus(ctx, book.id, "private");
    expect(updated.slug).toBe("moon-cat");
    expect((await data.repo.getBookBySlug("moon-cat"))?.id).toBe(book.id);
    expect((await data.repo.getBookById(book.id))?.pages).toHaveLength(1);
  });

  it("creates, reuses and revokes a share link", async () => {
    const book = await createStudioBook(ctx, { title: "הספר שלי" });
    const shared = await createShareLink(ctx, book.id);
    expect(shared.shareToken).toMatch(/^[A-Za-z0-9]{24}$/);
    expect((await createShareLink(ctx, book.id)).shareToken).toBe(shared.shareToken);
    expect((await data.repo.getBookByShareToken(shared.shareToken!))?.id).toBe(book.id);
    expect((await removeShareLink(ctx, book.id)).shareToken).toBeUndefined();
    expect(await data.repo.getBookByShareToken(shared.shareToken!)).toBeNull();
  });

  it("deletes a book together with its media", async () => {
    const book = await createStudioBook(ctx, { title: "הספר שלי" });
    const image = await storeUpload(ctx, book.id, "image", png());
    await deleteStudioBook(ctx, book.id);
    expect(await data.repo.getBookById(book.id)).toBeNull();
    expect(await data.media.get(image.path)).toBeNull();
  });
});
