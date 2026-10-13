import { readdir } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BOOK_PACKAGE_FORMAT,
  BOOK_PACKAGE_MANIFEST,
  BOOK_PACKAGE_VERSION,
  BookPackageError,
  BookPackageManifestSchema,
  exportBookPackage,
  importBookPackage,
  isUnsafeZipEntryName,
  type BookPackageErrorCode,
} from "@/lib/book-package";
import { createTempData, type TempData } from "@/test/temp-data";
import { IMPORT_LIMITS } from "./limits";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect/></svg>');
const WAV = new Uint8Array([...new TextEncoder().encode("RIFF"), 4, 0, 0, 0, ...new TextEncoder().encode("WAVEfmt ")]);

let source: TempData;
let target: TempData;

beforeEach(async () => {
  source = await createTempData();
  target = await createTempData();
});

afterEach(async () => {
  await source.cleanup();
  await target.cleanup();
});

function portableBook(overrides: Record<string, unknown> = {}) {
  return {
    title: "ספר בדיקה",
    summary: "",
    author: "",
    illustrator: "",
    license: "CC BY 4.0",
    source: "",
    ageGroup: "3-5",
    readingMinutes: 1,
    coverImage: "",
    categories: [],
    tags: [],
    themes: [],
    discussionQuestions: [],
    origin: "manual",
    pages: [{ index: 0, text: "עמוד ראשון", image: "images/page-01.png" }],
    ...overrides,
  };
}

async function buildZip(
  book: Record<string, unknown> | null,
  files: Record<string, Uint8Array | string> = {},
  manifest: Record<string, unknown> = {},
): Promise<Uint8Array> {
  const zip = new JSZip();
  if (book) {
    zip.file(
      BOOK_PACKAGE_MANIFEST,
      JSON.stringify({
        format: BOOK_PACKAGE_FORMAT,
        version: BOOK_PACKAGE_VERSION,
        exportedAt: new Date().toISOString(),
        book,
        ...manifest,
      }),
    );
  }
  for (const [name, data] of Object.entries(files)) zip.file(name, data);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

async function expectRejected(zip: Uint8Array, code: BookPackageErrorCode): Promise<void> {
  const error = await importBookPackage(zip, { ownerId: "u_1", repo: target.repo, media: target.media }).then(
    () => null,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(BookPackageError);
  expect((error as BookPackageError).code).toBe(code);
  expect((error as BookPackageError).userMessage).not.toBe("");
  // A refused package leaves nothing behind.
  expect((await target.repo.listBooks({ status: "any" })).total).toBe(0);
  expect(await target.media.list("books")).toEqual([]);
}

/**
 * Rewrites the "uncompressed size" field of one entry, in its local header and
 * in the central directory, the way a decompression bomb does. The compressed
 * data is left untouched.
 */
function forgeUncompressedSize(zipBytes: Uint8Array, entryName: string, fakeSize: number): Uint8Array {
  const out = zipBytes.slice();
  const view = new DataView(out.buffer);
  const name = new TextEncoder().encode(entryName);
  const nameAt = (offset: number) => name.every((byte, i) => out[offset + i] === byte);
  let patched = 0;
  for (let i = 0; i + 46 <= out.length; i += 1) {
    const signature = view.getUint32(i, true);
    // Local file header: sizes at +18 / +22, name length at +26, name at +30.
    if (signature === 0x04034b50 && view.getUint16(i + 26, true) === name.length && nameAt(i + 30)) {
      view.setUint32(i + 22, fakeSize, true);
      patched += 1;
    }
    // Central directory header: sizes at +20 / +24, name length at +28, name at +46.
    if (signature === 0x02014b50 && view.getUint16(i + 28, true) === name.length && nameAt(i + 46)) {
      view.setUint32(i + 24, fakeSize, true);
      patched += 1;
    }
  }
  if (patched !== 2) throw new Error(`expected to patch 2 headers of ${entryName}, patched ${patched}`);
  return out;
}

describe("decompression bomb protection", () => {
  it("stops inflating book.json at the manifest limit when the zip lies about its size", async () => {
    const zip = new JSZip();
    zip.file(BOOK_PACKAGE_MANIFEST, " ".repeat(IMPORT_LIMITS.manifestBytes * 4));
    const honest = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const forged = forgeUncompressedSize(honest, BOOK_PACKAGE_MANIFEST, 100);

    // The fixture really declares a small size, so the header pre-check cannot be what refuses it.
    const reloaded = await JSZip.loadAsync(forged);
    const declared = (reloaded.file(BOOK_PACKAGE_MANIFEST) as unknown as { _data: { uncompressedSize: number } })._data;
    expect(declared.uncompressedSize).toBe(100);

    // "manifest-invalid" is the size-limit refusal. "not-a-zip" here would mean the
    // whole entry was inflated first and only then failed JSZip's length check.
    await expectRejected(forged, "manifest-invalid");
  });

  it("stops inflating a media file at its limit when the zip lies about its size", async () => {
    const bigImage = new Uint8Array(IMPORT_LIMITS.imageBytes + 4 * 1024 * 1024);
    bigImage.set(PNG);
    const honest = await buildZip(portableBook(), { "images/page-01.png": bigImage });
    await expectRejected(forgeUncompressedSize(honest, "images/page-01.png", PNG.byteLength), "media-too-large");
  });

  it("still refuses an entry whose real size is under the limit but differs from the declared one", async () => {
    const honest = await buildZip(portableBook(), { "images/page-01.png": PNG });
    await expectRejected(forgeUncompressedSize(honest, "images/page-01.png", PNG.byteLength + 7), "not-a-zip");
  });
});

describe("book package round trip", () => {
  it("exports a book and imports it back with the same content", async () => {
    const original = await source.repo.createBook({
      id: "bk_source",
      title: "השבלול והגשם",
      ownerId: "u_owner",
      status: "published",
      summary: "שבלול קטן יוצא לטיול בגשם.",
      author: "דנה כותבת",
      illustrator: "יואב מאייר",
      license: "CC BY 4.0",
      source: "https://example.org/snail",
      ageGroup: "0-2",
      readingMinutes: 3,
      coverImage: "books/bk_source/cover.svg",
      soundtrack: "books/bk_source/music.wav",
      categories: ["animals", "nature"],
      tags: ["שבלול", "גשם"],
      themes: ["patience"],
      discussionQuestions: ["מה השבלול ראה?"],
      shareToken: "secret-share-token",
      viewCount: 42,
      reviewNote: "internal note",
      pages: [
        {
          index: 0,
          text: "שבלול קטן יצא לטייל.",
          textNikud: "שַׁבְּלוּל קָטָן יָצָא לְטַיֵּל.",
          image: "books/bk_source/page-01.png",
          audio: "books/bk_source/page-01.wav",
          audioSource: "recorded",
          wordTimings: [
            { word: "שַׁבְּלוּל", start: 0, end: 0.4 },
            { word: "קָטָן", start: 0.4, end: 0.8 },
            { word: "יָצָא", start: 0.8, end: 1.2 },
            { word: "לְטַיֵּל.", start: 1.2, end: 1.6 },
          ],
        },
        { index: 1, text: "פתאום ירד גשם.", image: "books/bk_source/page-02.svg" },
        { index: 2, text: "הסוף." },
      ],
    });
    await source.media.put("books/bk_source/cover.svg", SVG, "image/svg+xml");
    await source.media.put("books/bk_source/music.wav", WAV, "audio/wav");
    await source.media.put("books/bk_source/page-01.png", PNG, "image/png");
    await source.media.put("books/bk_source/page-01.wav", WAV, "audio/wav");
    await source.media.put("books/bk_source/page-02.svg", SVG, "image/svg+xml");

    const zipBytes = await exportBookPackage(original, { media: source.media });

    // The package holds book.json plus images/ and audio/, with zip-relative media paths.
    const zip = await JSZip.loadAsync(zipBytes);
    expect(Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort()).toEqual([
      "audio/page-01.wav",
      "audio/soundtrack.wav",
      "book.json",
      "images/cover.svg",
      "images/page-01.png",
      "images/page-02.svg",
    ]);
    const manifestJson: unknown = JSON.parse(await zip.file("book.json")!.async("string"));
    const manifest = BookPackageManifestSchema.parse(manifestJson);
    expect(manifest.missingMedia).toBeUndefined();
    expect(manifest.book.coverImage).toBe("images/cover.svg");
    expect(manifest.book.pages[0].image).toBe("images/page-01.png");
    // Installation-specific fields never leave the site.
    for (const field of ["id", "ownerId", "status", "shareToken", "viewCount", "reviewNote"]) {
      expect(manifestJson).not.toHaveProperty(`book.${field}`);
    }

    const imported = await importBookPackage(zipBytes, {
      ownerId: "u_importer",
      status: "draft",
      repo: target.repo,
      media: target.media,
    });

    expect(imported.id).not.toBe(original.id);
    expect(imported.ownerId).toBe("u_importer");
    expect(imported.status).toBe("draft");
    expect(imported.origin).toBe("import");
    expect(imported.viewCount).toBe(0);
    expect(imported.shareToken).toBeUndefined();
    expect(imported.publishedAt).toBeUndefined();
    for (const field of [
      "title",
      "summary",
      "author",
      "illustrator",
      "license",
      "source",
      "ageGroup",
      "readingMinutes",
      "categories",
      "tags",
      "themes",
      "discussionQuestions",
    ] as const) {
      expect(imported[field]).toEqual(original[field]);
    }

    const prefix = `books/${imported.id}/`;
    expect(imported.coverImage).toBe(`${prefix}cover.svg`);
    expect(imported.soundtrack).toBe(`${prefix}soundtrack.wav`);
    expect(imported.pages).toHaveLength(3);
    expect(imported.pages.map((page) => page.text)).toEqual(original.pages.map((page) => page.text));
    expect(imported.pages[0]).toMatchObject({
      index: 0,
      textNikud: original.pages[0].textNikud,
      image: `${prefix}page-01.png`,
      audio: `${prefix}page-01.wav`,
      audioSource: "recorded",
      wordTimings: original.pages[0].wordTimings,
    });
    expect(imported.pages[1].image).toBe(`${prefix}page-02.svg`);
    expect(imported.pages[2].image).toBeUndefined();

    expect(await target.media.list(`books/${imported.id}`)).toEqual(
      ["cover.svg", "page-01.png", "page-01.wav", "page-02.svg", "soundtrack.wav"].map((name) => prefix + name),
    );
    expect(Array.from((await target.media.get(`${prefix}page-01.png`))!.bytes)).toEqual(Array.from(PNG));
    expect(Array.from((await target.media.get(`${prefix}page-01.wav`))!.bytes)).toEqual(Array.from(WAV));
    expect(Array.from((await target.media.get(`${prefix}cover.svg`))!.bytes)).toEqual(Array.from(SVG));

    // The stored copy is what the repository returns.
    expect(await target.repo.getBookById(imported.id)).toEqual(imported);
  });

  it("lists media it could not bundle instead of dropping it silently", async () => {
    const book = await source.repo.createBook({
      id: "bk_gaps",
      title: "ספר עם חורים",
      ownerId: "u_owner",
      coverImage: "https://cdn.example.org/cover.png",
      pages: [
        {
          index: 0,
          text: "אחת",
          image: "books/bk_gaps/missing.png",
          audio: "books/bk_gaps/missing.wav",
          audioSource: "tts",
          wordTimings: [{ word: "אחת", start: 0, end: 1 }],
        },
      ],
    });
    const zip = await JSZip.loadAsync(await exportBookPackage(book, { media: source.media }));
    const manifest = BookPackageManifestSchema.parse(JSON.parse(await zip.file("book.json")!.async("string")));
    expect(manifest.missingMedia).toEqual([
      "books/bk_gaps/missing.png",
      "books/bk_gaps/missing.wav",
      "https://cdn.example.org/cover.png",
    ]);
    expect(manifest.book.coverImage).toBe("");
    expect(manifest.book.pages[0]).toEqual({ index: 0, text: "אחת" });
  });
});

describe("zip-slip protection", () => {
  it.each(["../evil.png", "images/../../evil.png", "/abs/evil.png", "C:/evil.png", "images\\..\\evil.png"])(
    "treats entry name %j as unsafe",
    (name) => {
      expect(isUnsafeZipEntryName(name)).toBe(true);
    },
  );

  it.each(["book.json", "images/page-01.png", "audio/", "images/שלום.png"])("accepts entry name %j", (name) => {
    expect(isUnsafeZipEntryName(name)).toBe(false);
  });

  it("rejects a package that contains a traversal entry, even when book.json does not reference it", async () => {
    const zipBytes = await buildZip(portableBook(), { "images/page-01.png": PNG, "../evil.png": PNG });
    // Guard against a fixture that silently lost the traversal name.
    const reloaded = await JSZip.loadAsync(zipBytes);
    expect(Object.values(reloaded.files).some((entry) => entry.unsafeOriginalName === "../evil.png")).toBe(true);

    await expectRejected(zipBytes, "unsafe-path");
    // Nothing was written next to the data directory either.
    expect((await readdir(path.dirname(target.dir))).includes("evil.png")).toBe(false);
    expect((await readdir(target.dir)).includes("evil.png")).toBe(false);
  });

  it("rejects a nested traversal entry", async () => {
    await expectRejected(
      await buildZip(portableBook(), { "images/page-01.png": PNG, "images/../../../evil.png": PNG }),
      "unsafe-path",
    );
  });

  it.each([
    ["../../evil.png", "unsafe-path"],
    ["images/../../evil.png", "unsafe-path"],
    ["/etc/passwd", "unsafe-path"],
    ["images\\..\\evil.png", "unsafe-path"],
    ["images/sub/page-01.png", "media-reference"],
    ["audio/page-01.png", "media-reference"],
    ["page-01.png", "media-reference"],
    ["https://example.org/page-01.png", "unsafe-path"],
    ["images/", "media-reference"],
  ] as const)("rejects the media reference %j in book.json", async (reference, code) => {
    const book = portableBook({ pages: [{ index: 0, text: "א", image: reference }] });
    await expectRejected(await buildZip(book, { "images/page-01.png": PNG }), code);
  });

  it("stores files under a sanitized name inside the new book folder", async () => {
    const book = portableBook({
      coverImage: "images/כריכה יפה.png",
      pages: [
        { index: 0, text: "א", image: "images/Page 1.PNG" },
        { index: 1, text: "ב", image: "images/page-1.png" },
      ],
    });
    const imported = await importBookPackage(
      await buildZip(book, { "images/כריכה יפה.png": PNG, "images/Page 1.PNG": PNG, "images/page-1.png": PNG }),
      { ownerId: "u_1", repo: target.repo, media: target.media },
    );
    const stored = await target.media.list(`books/${imported.id}`);
    expect(stored).toHaveLength(3);
    for (const mediaPath of stored) expect(mediaPath).toMatch(/^books\/bk_[a-z0-9]+\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/);
    // "Page-1.PNG" and "page-1.png" must not overwrite each other on a case-insensitive disk.
    const names = stored.map((mediaPath) => mediaPath.toLowerCase());
    expect(new Set(names).size).toBe(3);
    expect(imported.status).toBe("private");
  });
});

describe("package validation", () => {
  it("rejects something that is not a zip", async () => {
    await expectRejected(new TextEncoder().encode("this is not a zip file"), "not-a-zip");
  });

  it("rejects a zip without book.json", async () => {
    await expectRejected(await buildZip(null, { "images/page-01.png": PNG }), "manifest-missing");
  });

  it("rejects an invalid manifest", async () => {
    await expectRejected(await buildZip(portableBook({ title: "" }), { "images/page-01.png": PNG }), "manifest-invalid");
    await expectRejected(await buildZip(portableBook({ ageGroup: "9-12" })), "manifest-invalid");
    const zip = new JSZip();
    zip.file(BOOK_PACKAGE_MANIFEST, "{ not json");
    await expectRejected(await zip.generateAsync({ type: "uint8array" }), "manifest-invalid");
  });

  it("rejects a package from a newer format version", async () => {
    await expectRejected(
      await buildZip(portableBook(), { "images/page-01.png": PNG }, { version: BOOK_PACKAGE_VERSION + 1 }),
      "unsupported-version",
    );
  });

  it("rejects a referenced file that is missing from the zip", async () => {
    await expectRejected(await buildZip(portableBook()), "media-missing");
  });

  it("rejects media whose type is not allowed or does not match its content", async () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    // Wrong content behind an image extension.
    await expectRejected(await buildZip(portableBook(), { "images/page-01.png": html }), "media-type");
    // An extension outside the allow-list.
    await expectRejected(
      await buildZip(portableBook({ pages: [{ index: 0, text: "א", image: "images/page.html" }] }), {
        "images/page.html": html,
      }),
      "media-type",
    );
    // An image where audio is expected.
    await expectRejected(
      await buildZip(portableBook({ pages: [{ index: 0, text: "א", audio: "audio/page.wav" }] }), {
        "audio/page.wav": PNG,
      }),
      "media-type",
    );
  });

  it("enforces the size limits", async () => {
    // book.json larger than the manifest limit (highly compressible, so the zip itself is tiny).
    const hugeSummaryZip = new JSZip();
    hugeSummaryZip.file(BOOK_PACKAGE_MANIFEST, " ".repeat(IMPORT_LIMITS.manifestBytes + 1024));
    await expectRejected(
      await hugeSummaryZip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
      "manifest-invalid",
    );

    // An image larger than the per-file limit.
    const bigImage = new Uint8Array(IMPORT_LIMITS.imageBytes + 1);
    bigImage.set(PNG);
    await expectRejected(await buildZip(portableBook(), { "images/page-01.png": bigImage }), "media-too-large");

    // Too many pages.
    const pages = Array.from({ length: IMPORT_LIMITS.pages + 1 }, (_, index) => ({ index, text: "א" }));
    await expectRejected(await buildZip(portableBook({ pages })), "too-many-pages");
  });
});
