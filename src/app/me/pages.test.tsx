import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempData, type TempData } from "@/test/temp-data";
import type { User } from "@/lib/types";

let currentUser: User | null = null;

vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, getCurrentUser: async () => currentUser };
});

import MePage from "./page";
import FavoritesPage from "./favorites/page";
import SharePage from "../share/[token]/page";
import OfflinePage from "../offline/page";
import manifest from "../manifest";

const owner: User = { id: "u_owner", name: "דנה", role: "parent" };
const TOKEN = "abcdefghijklmnopqrstuvwx";

let data: TempData;

beforeEach(async () => {
  data = await createTempData({ setEnv: true });
  currentUser = null;
});

afterEach(async () => {
  await data.cleanup();
});

describe("/me", () => {
  it("invites anonymous visitors to sign in and shows no private shelf", async () => {
    const html = renderToStaticMarkup(await MePage());
    expect(html).toContain("המדף שלי");
    expect(html).toContain("/login?next=%2Fme");
    expect(html).toContain("כאן יופיעו הספרים שלכם");
  });

  it("lists my books with their status and share link, and nobody else's", async () => {
    await data.repo.createBook({
      title: "הספר הפרטי שלי",
      ownerId: owner.id,
      status: "private",
      shareToken: TOKEN,
      pages: [{ index: 0, text: "שלום" }],
    });
    await data.repo.createBook({ title: "טיוטה שלי", ownerId: owner.id });
    await data.repo.createBook({ title: "ספר של מישהו אחר", ownerId: "u_other", status: "private" });
    currentUser = owner;

    const html = renderToStaticMarkup(await MePage());
    expect(html).toContain("המדף של דנה");
    expect(html).toContain("הספר הפרטי שלי");
    expect(html).toContain("טיוטה שלי");
    expect(html).toContain("פרטי");
    expect(html).toContain("טיוטה");
    expect(html).toContain(`/share/${TOKEN}`);
    expect(html).toContain("יצירת קישור שיתוף");
    expect(html).not.toContain("ספר של מישהו אחר");
  });

  it("renders the favorites page", async () => {
    expect(renderToStaticMarkup(await FavoritesPage())).toContain("המועדפים שלי");
  });
});

describe("/share/[token]", () => {
  it("shows a private book to anyone holding the token, with a reader link that carries it", async () => {
    const book = await data.repo.createBook({
      title: "סיפור לסבתא",
      summary: "תקציר קצר",
      ownerId: owner.id,
      status: "private",
      shareToken: TOKEN,
      coverImage: "books/x/cover.svg",
      pages: [{ index: 0, text: "שלום" }],
    });
    const html = renderToStaticMarkup(await SharePage({ params: Promise.resolve({ token: TOKEN }) }));
    expect(html).toContain("סיפור לסבתא");
    expect(html).toContain("/media/books/x/cover.svg");
    expect(html).toContain(`/read/${book.slug}?token=${TOKEN}`);
    expect(html).toContain("בואו נקרא");
  });

  it("is a 404 for unknown, malformed and revoked tokens", async () => {
    const book = await data.repo.createBook({ title: "X", ownerId: owner.id, status: "private", shareToken: TOKEN });
    const open = (token: string) => SharePage({ params: Promise.resolve({ token }) });
    await expect(open("zzzzzzzzzzzzzzzzzzzzzzzz")).rejects.toThrow();
    await expect(open("../../etc/passwd")).rejects.toThrow();
    await expect(open("")).rejects.toThrow();
    await data.repo.updateBook(book.id, { shareToken: undefined });
    await expect(open(TOKEN)).rejects.toThrow();
  });
});

describe("pwa", () => {
  it("renders the offline page without any server data", () => {
    expect(renderToStaticMarkup(OfflinePage())).toContain("ספרים בלי רשת");
  });

  it("has an installable manifest whose icons exist", async () => {
    const { access } = await import("node:fs/promises");
    const path = await import("node:path");
    const result = manifest();
    expect(result.display).toBe("standalone");
    expect(result.dir).toBe("rtl");
    expect(result.icons?.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable")).toBe(true);
    for (const icon of result.icons ?? []) {
      await expect(access(path.join(process.cwd(), "public", icon.src))).resolves.toBeUndefined();
    }
  });
});
