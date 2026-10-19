import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { mockImageProvider, mockTextProvider } from "@/lib/ai/mock";
import type { ImageProvider, ImageRequest } from "@/lib/ai/types";
import type { MediaObject } from "@/lib/media/types";
import type { BookWithPages } from "@/lib/types";
import { gridPrompt, illustrateGrid, planGridLayout } from "./grid";
import { IllustrateError, type IllustrateDeps } from "./illustrate";

function memoryMedia() {
  const files = new Map<string, MediaObject>();
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

function book(pageCount: number): BookWithPages {
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
    hero: { description: "A girl in yellow boots.", style: "watercolor" },
    pages: Array.from({ length: pageCount }, (_, index) => ({ index, text: `עמוד מספר ${index + 1}` })),
  };
}

/** 2x2 grid of striped colour panels on white gutters, 1200x900. */
async function gridPng(): Promise<Uint8Array> {
  const colors = [
    [220, 60, 60],
    [60, 200, 80],
    [60, 90, 220],
    [230, 200, 40],
  ];
  const w = 560;
  const h = 410;
  const overlays = colors.map(([r, g, b], i) => {
    const raw = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 3;
        const f = (x + y) % 40 < 20 ? 1 : 0.7;
        raw[k] = r * f;
        raw[k + 1] = g * f;
        raw[k + 2] = b * f;
      }
    }
    return { input: raw, raw: { width: w, height: h, channels: 3 as const }, left: 20 + (i % 2) * (w + 20), top: 20 + Math.floor(i / 2) * (h + 20) };
  });
  const png = await sharp({ create: { width: 1180 + 20, height: 840 + 20, channels: 3, background: "#fff" } })
    .composite(overlays)
    .png()
    .toBuffer();
  return new Uint8Array(png);
}

describe("planGridLayout", () => {
  it("uses the smallest grid that fits, up to the requested size", () => {
    expect(planGridLayout(1, "auto")).toBe("1x1");
    expect(planGridLayout(3, "auto")).toBe("2x2");
    expect(planGridLayout(4, "3x3")).toBe("2x2");
    expect(planGridLayout(5, "auto")).toBe("3x3");
    expect(planGridLayout(9, "auto")).toBe("3x3");
    expect(planGridLayout(12, "auto")).toBe("3x3");
    expect(planGridLayout(9, "4x4")).toBe("3x3");
    expect(planGridLayout(10, "4x4")).toBe("4x4");
    expect(planGridLayout(16, "4x4")).toBe("4x4");
  });
});

describe("gridPrompt", () => {
  it("asks for plain gutters, no text, the panels in order and blank spare cells", () => {
    const prompt = gridPrompt({ direction: "DIRECTION", character: "a girl", scenes: ["first", "second", "third"], layout: "2x2" });
    expect(prompt).toContain("2x2 grid");
    expect(prompt).toContain("plain white gutters");
    expect(prompt).toContain("1: first 2: second 3: third");
    expect(prompt).toContain("DIRECTION");
    expect(prompt).toContain("last 1 panel stays completely blank");
  });
});

describe("illustrateGrid", () => {
  it("makes one text call and one image call, and stores one picture per page", async () => {
    const { media, files } = memoryMedia();
    const requests: ImageRequest[] = [];
    const grid = await gridPng();
    const image: ImageProvider = {
      name: "test",
      isMock: false,
      async generate(request) {
        requests.push(request);
        return { image: grid, contentType: "image/png", isMock: false };
      },
    };
    let textCalls = 0;
    const text = {
      ...mockTextProvider,
      async generate<T>(request: Parameters<typeof mockTextProvider.generate<T>>[0]) {
        textCalls++;
        return mockTextProvider.generate(request);
      },
    };
    const result = await illustrateGrid({ media, text, image }, book(6), { pages: [2, 3, 4, 5], layout: "auto" });
    expect(result.layout).toBe("2x2");
    expect(requests).toHaveLength(1);
    expect(requests[0].aspect).toBe("4:3");
    expect(textCalls).toBe(1);
    expect(result.panels.map((p) => p.page)).toEqual([2, 3, 4, 5]);
    expect(result.panels.every((p) => files.has(p.path))).toBe(true);
    expect(result.warnings).toEqual([]);
    const meta = await sharp(files.get(result.panels[0].path)!.bytes).metadata();
    expect(Math.abs(meta.width! / meta.height! - 4 / 3)).toBeLessThan(0.01);
  });

  it("falls back to one placeholder per page when the provider is a mock", async () => {
    const { media, files } = memoryMedia();
    const result = await illustrateGrid({ media, text: mockTextProvider, image: mockImageProvider }, book(3), { pages: [0, 1, 2] });
    expect(result.isMock).toBe(true);
    expect(result.panels).toHaveLength(3);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(files.size).toBe(3);
  });

  it("refuses too many pages for the layout and pages without text", async () => {
    const { media } = memoryMedia();
    const deps = { media, text: mockTextProvider, image: mockImageProvider };
    await expect(illustrateGrid(deps, book(12), { pages: Array.from({ length: 10 }, (_, i) => i), layout: "3x3" })).rejects.toBeInstanceOf(
      IllustrateError,
    );
    const empty = book(2);
    empty.pages[1].text = "";
    await expect(illustrateGrid(deps, empty, { pages: [0, 1] })).rejects.toBeInstanceOf(IllustrateError);
  });
});
