/**
 * Regression tests for two review findings in the studio service:
 *  - a book that waits for review stays editable by its owner, and the editor
 *    then approves content they never saw;
 *  - page saves are last-write-wins, and a stale snapshot deletes the other
 *    writer's media files.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reviewBook, setBookStatus as adminSetBookStatus } from "@/app/admin/_lib/service";
import { ConflictError } from "@/lib/repo/types";
import type { User } from "@/lib/types";
import { createTempData, type TempData } from "@/test/temp-data";
import {
  createShareLink,
  createStudioBook,
  deleteStudioBook,
  saveBookPages,
  setBookStatus,
  STALE_VERSION_CODE,
  storeUpload,
  StudioError,
  updateBookMeta,
  type StudioContext,
} from "./service";

const owner: User = { id: "u_owner", name: "דנה", role: "parent" };
const editor: User = { id: "u_editor", name: "עורכת", role: "editor" };

function png(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

let data: TempData;
let ctx: StudioContext;
let editorCtx: StudioContext;

beforeEach(async () => {
  data = await createTempData();
  ctx = { repo: data.repo, media: data.media, user: owner };
  editorCtx = { ...ctx, user: editor };
});
afterEach(async () => {
  await data.cleanup();
});

async function readyBook() {
  const book = await createStudioBook(ctx, { title: "הספר שלי" });
  await saveBookPages(ctx, book.id, { pages: [{ text: "היה היה חתול קטן" }] });
  await updateBookMeta(ctx, book.id, { summary: "חתול יוצא לטיול", license: "CC BY 4.0", categories: ["animals"] });
  return book;
}

const stored = async (id: string) => (await data.repo.getBookById(id))!;

describe("a book that waits for review is locked for its owner", () => {
  it("refuses every content change until the owner withdraws the submission", async () => {
    const book = await readyBook();
    await setBookStatus(ctx, book.id, "pending");

    const refused = async (action: Promise<unknown>) => {
      const error = await action.then(
        () => null,
        (err: unknown) => err,
      );
      expect(error).toBeInstanceOf(StudioError);
      expect((error as StudioError).status).toBe(409);
      expect((error as StudioError).message).toContain("ממתין לאישור");
    };
    await refused(saveBookPages(ctx, book.id, { pages: [{ text: "טקסט אחר לגמרי" }] }));
    await refused(updateBookMeta(ctx, book.id, { title: "שם אחר" }));
    await refused(storeUpload(ctx, book.id, "image", png()));
    await refused(deleteStudioBook(ctx, book.id));

    // What the editor will read is exactly what was submitted.
    const pending = await stored(book.id);
    expect(pending.pages[0].text).toBe("היה היה חתול קטן");
    expect(pending.title).toBe("הספר שלי");

    // Editors may still fix a pending book; the owner edits again after withdrawing.
    await expect(updateBookMeta(editorCtx, book.id, { summary: "תקציר מתוקן" })).resolves.toMatchObject({ summary: "תקציר מתוקן" });
    await setBookStatus(ctx, book.id, "private");
    await expect(saveBookPages(ctx, book.id, { pages: [{ text: "גרסה חדשה" }] })).resolves.toBeDefined();
  });

  it("publishes only the version the editor read", async () => {
    const book = await readyBook();
    await updateBookMeta(ctx, book.id, { source: "נכתב לאתר" });
    await setBookStatus(ctx, book.id, "pending");
    const seen = (await stored(book.id)).updatedAt;

    // The book changes after the editor opened it (here: another editor fixes a page).
    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveBookPages(editorCtx, book.id, { pages: [{ text: "טקסט שהעורך לא ראה" }] });

    await expect(reviewBook(data.repo, book.id, { action: "approve", updatedAt: seen })).rejects.toBeInstanceOf(ConflictError);
    expect((await stored(book.id)).status).toBe("pending");

    const current = (await stored(book.id)).updatedAt;
    const approved = await reviewBook(data.repo, book.id, { action: "approve", updatedAt: current });
    expect(approved.book.status).toBe("published");
  });
});

describe("page saves carry the version they are based on", () => {
  it("refuses a save from a stale tab and leaves the newer pages and their media alone", async () => {
    const book = await createStudioBook(ctx, { title: "הספר שלי" });
    const opened = (await stored(book.id)).updatedAt; // both tabs load this version

    // Tab B uploads a picture and saves the page.
    const picture = await storeUpload(ctx, book.id, "image", png());
    await new Promise((resolve) => setTimeout(resolve, 5));
    const fromB = await saveBookPages(ctx, book.id, { pages: [{ text: "הטקסט של לשונית ב", image: picture.path }] }, { baseUpdatedAt: opened });
    expect(fromB.updatedAt).not.toBe(opened);

    // Tab A, opened earlier, autosaves its own edit on top of the old version.
    const error = await saveBookPages(ctx, book.id, { pages: [{ text: "הטקסט של לשונית א" }] }, { baseUpdatedAt: opened }).then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(StudioError);
    expect((error as StudioError).status).toBe(409);
    expect((error as StudioError).details).toMatchObject({ code: STALE_VERSION_CODE, updatedAt: fromB.updatedAt });
    expect((error as StudioError).message).toContain("טענו את העמוד מחדש");

    const after = await stored(book.id);
    expect(after.pages[0]).toMatchObject({ text: "הטקסט של לשונית ב", image: picture.path });
    expect(await data.media.get(picture.path)).not.toBeNull();

    // The same holds for the details form.
    await expect(updateBookMeta(ctx, book.id, { title: "שם ישן" }, { baseUpdatedAt: opened })).rejects.toMatchObject({ status: 409 });
    // With the current version the save goes through.
    await expect(
      saveBookPages(ctx, book.id, { pages: [{ text: "המשך", image: picture.path }] }, { baseUpdatedAt: after.updatedAt }),
    ).resolves.toBeDefined();
  });

  it("never deletes media on a save that does not name its version", async () => {
    const book = await createStudioBook(ctx, { title: "הספר שלי" });
    const picture = await storeUpload(ctx, book.id, "image", png());
    await saveBookPages(ctx, book.id, { pages: [{ text: "", image: picture.path }] });

    // A client that sends no version still saves (last write wins), but files are kept.
    await saveBookPages(ctx, book.id, { pages: [{ text: "בלי תמונה" }] });
    expect(await data.media.get(picture.path)).not.toBeNull();

    // A conditional save that drops the picture does remove the file.
    await saveBookPages(ctx, book.id, { pages: [{ text: "", image: picture.path }] });
    const base = (await stored(book.id)).updatedAt;
    await saveBookPages(ctx, book.id, { pages: [{ text: "בלי תמונה" }] }, { baseUpdatedAt: base });
    expect(await data.media.get(picture.path)).toBeNull();
  });

  it("serialises two saves of the same book that arrive together", async () => {
    const book = await createStudioBook(ctx, { title: "הספר שלי" });
    const base = (await stored(book.id)).updatedAt;
    const results = await Promise.allSettled([
      saveBookPages(ctx, book.id, { pages: [{ text: "ראשון" }] }, { baseUpdatedAt: base }),
      new Promise((resolve) => setTimeout(resolve, 5)).then(() =>
        saveBookPages(ctx, book.id, { pages: [{ text: "שני" }] }, { baseUpdatedAt: base }),
      ),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect((await stored(book.id)).pages[0].text).toBe("ראשון");
  });
});

describe("a share link does not outlive a book's time in the public library", () => {
  it("is cleared when the book leaves the library, from the studio and from the admin table", async () => {
    const book = await readyBook();
    await updateBookMeta(ctx, book.id, { source: "נכתב לאתר" });
    const token = (await createShareLink(ctx, book.id)).shareToken;
    expect(token).toBeTruthy();

    await setBookStatus(editorCtx, book.id, "published");
    expect((await stored(book.id)).shareToken).toBe(token);
    // While public, the token may have been seen by anyone; unpublishing must close that door.
    await setBookStatus(ctx, book.id, "private");
    expect((await stored(book.id)).shareToken).toBeUndefined();
    expect(await data.repo.getBookByShareToken(token!)).toBeNull();

    const again = (await createShareLink(ctx, book.id)).shareToken;
    expect(again).not.toBe(token);
    await adminSetBookStatus(data.repo, book.id, "published");
    await adminSetBookStatus(data.repo, book.id, "private");
    expect((await stored(book.id)).shareToken).toBeUndefined();
  });
});

describe("animation clips survive studio saves", () => {
  it("keeps a page's clip while its illustration stays, and drops it when the illustration is replaced", async () => {
    const book = await createStudioBook(ctx, { title: "הספר שלי" });
    const picture = await storeUpload(ctx, book.id, "image", png());
    await saveBookPages(ctx, book.id, { pages: [{ text: "עמוד", image: picture.path }] });
    const withClip = await stored(book.id);
    await data.repo.replacePages(book.id, [
      { ...withClip.pages[0], video: `books/${book.id}/animation-01-abc.mp4`, videoImageHash: "abc", videoSource: "ai" },
    ]);

    const edited = await saveBookPages(ctx, book.id, { pages: [{ text: "עמוד ערוך", image: picture.path }] });
    expect(edited.pages[0].video).toBe(`books/${book.id}/animation-01-abc.mp4`);
    expect(edited.pages[0].videoSource).toBe("ai");

    const other = await storeUpload(ctx, book.id, "image", png(80));
    const replaced = await saveBookPages(ctx, book.id, { pages: [{ text: "עמוד ערוך", image: other.path }] });
    expect(replaced.pages[0].video).toBeUndefined();
  });
});
