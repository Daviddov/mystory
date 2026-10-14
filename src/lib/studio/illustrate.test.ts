import { describe, expect, it } from "vitest";
import { mockImageProvider, mockTextProvider } from "@/lib/ai/mock";
import type { ImageProvider, ImageRequest, TextProvider, TextRequest } from "@/lib/ai/types";
import type { MediaObject } from "@/lib/media/types";
import type { BookWithPages } from "@/lib/types";
import { createHeroImage, IllustrateError, illustratePage, type IllustrateDeps } from "./illustrate";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function memoryMedia(initial: Record<string, MediaObject> = {}) {
  const files = new Map(Object.entries(initial));
  const media: IllustrateDeps["media"] = {
    async put(path, bytes, contentType) {
      files.set(path, { bytes, contentType, size: bytes.byteLength });
      return { path, url: `/media/${path}` };
    },
    async get(path) {
      return files.get(path) ?? null;
    },
    async list(prefix) {
      return [...files.keys()].filter((path) => path.startsWith(prefix));
    },
  };
  return { media, files };
}

function book(overrides: Partial<BookWithPages> = {}): BookWithPages {
  return {
    id: "bk1",
    slug: "boots",
    title: "המגפיים הצהובים",
    summary: "",
    author: "",
    illustrator: "",
    license: "",
    source: "",
    ageGroup: "3-5",
    readingMinutes: 1,
    coverImage: "",
    status: "draft",
    ownerId: "u1",
    categories: [],
    tags: [],
    themes: [],
    discussionQuestions: [],
    origin: "manual",
    viewCount: 0,
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
    pages: [
      { index: 0, text: "תמר קיבלה מגפיים צהובים." },
      { index: 1, text: "היא קפצה בשלוליות." },
      { index: 2, text: "" },
    ],
    ...overrides,
  };
}

/** Records the requests and answers like the mocks, but as a "real" PNG provider. */
function recordingImage(): { provider: ImageProvider; requests: ImageRequest[] } {
  const requests: ImageRequest[] = [];
  return {
    requests,
    provider: {
      name: "test",
      isMock: false,
      async generate(request) {
        requests.push(request);
        return { image: PNG, contentType: "image/png", isMock: false };
      },
    },
  };
}

function recordingText(): { provider: TextProvider; prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    provider: {
      name: "test",
      isMock: false,
      async generate<T>(request: TextRequest<T>) {
        prompts.push(request.prompt);
        return { data: request.schema.parse(request.mockData), isMock: false };
      },
    },
  };
}

describe("createHeroImage", () => {
  it("draws the typed description and stores the image in the book folder", async () => {
    const { media, files } = memoryMedia();
    const image = recordingImage();
    const text = recordingText();
    const result = await createHeroImage({ media, text: text.provider, image: image.provider }, book(), {
      description: "ילדה עם צמה ומגפיים צהובים",
      style: "crayon",
    });
    expect(text.prompts).toHaveLength(0);
    expect(result).toMatchObject({ style: "crayon", descriptionWritten: false, isMock: false });
    expect(result.path).toMatch(/^books\/bk1\/hero-.+\.png$/);
    expect(files.has(result.path)).toBe(true);
    expect(image.requests[0].prompt).toContain("ילדה עם צמה ומגפיים צהובים");
    expect(image.requests[0].aspect).toBe("1:1");
  });

  it("writes the description from the story when none is given", async () => {
    const { media } = memoryMedia();
    const text = recordingText();
    const result = await createHeroImage(
      { media, text: text.provider, image: recordingImage().provider },
      book(),
      {},
    );
    expect(result.descriptionWritten).toBe(true);
    expect(result.description.length).toBeGreaterThan(10);
    expect(result.style).toBe("watercolor");
    expect(text.prompts[0]).toContain("היא קפצה בשלוליות.");
  });

  it("refuses to invent a hero for a book without text", async () => {
    const { media } = memoryMedia();
    const empty = book({ pages: [{ index: 0, text: " " }] });
    await expect(
      createHeroImage({ media, text: mockTextProvider, image: mockImageProvider }, empty, {}),
    ).rejects.toBeInstanceOf(IllustrateError);
  });

  it("reports mock output", async () => {
    const { media } = memoryMedia();
    const result = await createHeroImage({ media, text: mockTextProvider, image: mockImageProvider }, book(), {
      description: "a boy",
    });
    expect(result.isMock).toBe(true);
  });
});

describe("illustratePage", () => {
  const hero = { description: "A girl with a red braid", style: "paper-cut", image: "books/bk1/hero-1.png" };

  it("draws the page from the story, the page and the hero image", async () => {
    const { media, files } = memoryMedia({
      "books/bk1/hero-1.png": { bytes: PNG, contentType: "image/png", size: PNG.length },
    });
    const text = recordingText();
    const image = recordingImage();
    const result = await illustratePage({ media, text: text.provider, image: image.provider }, book({ hero }), {
      pageIndex: 1,
      note: "עם מטרייה",
    });
    // The scene is written from the whole story, with the page number and the note.
    expect(text.prompts[0]).toContain("Page 1: תמר קיבלה מגפיים צהובים.");
    expect(text.prompts[0]).toContain("page 2");
    expect(text.prompts[0]).toContain("עם מטרייה");
    const request = image.requests[0];
    expect(request.prompt).toContain("A girl with a red braid");
    expect(request.style).toBe("paper-cut");
    expect(request.aspect).toBe("4:3");
    expect(request.referenceImages?.[0].bytes).toEqual(PNG);
    expect(result.path).toMatch(/^books\/bk1\/art-.+\.png$/);
    expect(files.has(result.path)).toBe(true);
    expect(result.isMock).toBe(false);
  });

  it("does not send a mock (SVG) hero as a reference", async () => {
    const { media } = memoryMedia({
      "books/bk1/hero-1.svg": { bytes: new Uint8Array([60]), contentType: "image/svg+xml", size: 1 },
    });
    const image = recordingImage();
    await illustratePage(
      { media, text: recordingText().provider, image: image.provider },
      book({ hero: { description: "a cat", image: "books/bk1/hero-1.svg" } }),
      { pageIndex: 0 },
    );
    expect(image.requests[0].referenceImages).toEqual([]);
  });

  it("needs a hero and a page with text", async () => {
    const deps = { media: memoryMedia().media, text: mockTextProvider, image: mockImageProvider };
    await expect(illustratePage(deps, book(), { pageIndex: 0 })).rejects.toMatchObject({ status: 409 });
    await expect(illustratePage(deps, book({ hero }), { pageIndex: 2 })).rejects.toMatchObject({ status: 400 });
    await expect(illustratePage(deps, book({ hero }), { pageIndex: 9 })).rejects.toMatchObject({ status: 400 });
  });
});
