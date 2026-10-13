// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookWithPages } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import { SimplePreview } from "./PreviewPane";
import { StudioEditor } from "./StudioEditor";

function makeBook(overrides: Partial<BookWithPages> = {}): BookWithPages {
  return {
    id: "bk_test",
    slug: "test-book",
    title: "ספר בדיקה",
    summary: "",
    author: "דנה",
    illustrator: "",
    license: "",
    source: "",
    ageGroup: "3-5",
    readingMinutes: 1,
    coverImage: "",
    status: "draft",
    ownerId: "u_owner",
    categories: [],
    tags: [],
    themes: [],
    discussionQuestions: [],
    origin: "manual",
    viewCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pages: [
      { index: 0, text: "עמוד ראשון" },
      { index: 1, text: "עמוד שני" },
    ],
    ...overrides,
  };
}

interface Call {
  url: string;
  method: string;
  body: unknown;
}

describe("StudioEditor", () => {
  let calls: Call[];

  beforeEach(() => {
    calls = [];
    // jsdom has no <dialog> modal support.
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
        calls.push({ url, method: init?.method ?? "GET", body });
        if (url === "/api/narration/nikud") {
          const text = (body as { text: string }).text;
          return Response.json({ text, isMock: true, provider: "mock" });
        }
        const pages = (body as { pages?: { text: string }[] } | undefined)?.pages;
        return Response.json({
          book: makeBook({
            updatedAt: "2026-01-02T00:00:00.000Z",
            ...(pages ? { pages: pages.map((page, index) => ({ ...page, index })) } : {}),
            ...(url.endsWith("/status") ? { status: (body as { status: BookWithPages["status"] }).status } : {}),
          }),
        });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("autosaves page text and shows the save state", async () => {
    const user = userEvent.setup();
    render(<StudioEditor book={makeBook()} canPublish={false} />);
    expect(screen.getByText("כל השינויים נשמרו")).toBeInTheDocument();

    const text = screen.getByLabelText("הטקסט של העמוד");
    await user.type(text, " ועוד");
    expect(screen.getByText("יש שינויים שעוד לא נשמרו")).toBeInTheDocument();

    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/pages"))).toBe(true), { timeout: 3000 });
    const save = calls.filter((call) => call.url.endsWith("/pages")).at(-1)!;
    expect(save.method).toBe("PUT");
    expect(save.body).toEqual({ pages: [{ text: "עמוד ראשון ועוד" }, { text: "עמוד שני" }] });
    await waitFor(() => expect(screen.getByText("כל השינויים נשמרו")).toBeInTheDocument());
  });

  it("adds, duplicates and deletes pages", async () => {
    const user = userEvent.setup();
    render(<StudioEditor book={makeBook()} canPublish={false} />);
    const list = screen.getByRole("list", { name: "עמודי הספר" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "עמוד חדש" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: /עמוד 2/ })).toBeInTheDocument();

    // The new page is blank, so it is deleted without a confirmation.
    await user.click(screen.getByRole("button", { name: "מחיקה" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "שכפול" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);

    // A page with text asks first.
    await user.click(screen.getByRole("button", { name: "מחיקה" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "מחיקת העמוד" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("does not store mock nikud and says that the service is in demo mode", async () => {
    const user = userEvent.setup();
    render(<StudioEditor book={makeBook()} canPublish={false} />);
    await user.click(screen.getByRole("button", { name: "ניקוד אוטומטי" }));
    await waitFor(() => expect(screen.getByText(/שירות הניקוד לא מחובר/)).toBeInTheDocument());
    expect(screen.queryByLabelText("הטקסט המנוקד")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(calls.some((call) => call.url.endsWith("/pages"))).toBe(false);
  });

  it("saves details and never sends an empty title", async () => {
    const user = userEvent.setup();
    render(<StudioEditor book={makeBook()} canPublish={false} />);
    await user.click(screen.getByRole("tab", { name: "פרטי הספר" }));
    await user.clear(screen.getByLabelText(/שם הספר/));
    await user.type(screen.getByLabelText("תקציר"), "סיפור קצר");
    await user.click(screen.getByRole("button", { name: /חיות/ }));
    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true), { timeout: 3000 });
    const merged = Object.assign({}, ...calls.filter((call) => call.method === "PATCH").map((call) => call.body as object));
    expect(merged).toEqual({ summary: "סיפור קצר", categories: ["animals"] });
  });

  it("shows the publication checklist and submits when ready", async () => {
    const user = userEvent.setup();
    const ready = makeBook({ summary: "תקציר", license: "CC BY 4.0", categories: ["animals"] });
    render(<StudioEditor book={ready} canPublish={false} />);
    await user.click(screen.getByRole("tab", { name: "שיתוף ופרסום" }));
    expect(screen.queryByRole("button", { name: /פרסום עכשיו/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "הגשה לפרסום בספרייה" }));
    await waitFor(() => expect(screen.getAllByText("ממתין לאישור").length).toBeGreaterThan(0));
    expect(calls.find((call) => call.url.endsWith("/status"))?.body).toEqual({ status: "pending" });
  });

  it("blocks submission while details are missing, and locks a published book for its owner", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<StudioEditor book={makeBook()} canPublish={false} />);
    await user.click(screen.getByRole("tab", { name: "שיתוף ופרסום" }));
    expect(screen.getByRole("button", { name: "הגשה לפרסום בספרייה" })).toBeDisabled();
    expect(screen.getByText("חסר תקציר")).toBeInTheDocument();
    unmount();

    render(<StudioEditor book={makeBook({ status: "published" })} canPublish={false} />);
    expect(screen.getByText(/נעול לעריכה/)).toBeInTheDocument();
    expect(screen.getByLabelText("הטקסט של העמוד").closest("[inert]")).not.toBeNull();
  });

  it("shows a live preview of the unsaved book", async () => {
    const user = userEvent.setup();
    render(<StudioEditor book={makeBook()} canPublish={false} />);
    await user.type(screen.getByLabelText("הטקסט של העמוד"), " חדש");
    await user.click(screen.getByRole("tab", { name: "תצוגה מקדימה" }));
    // Works with the real reading player and with the simple fallback alike.
    await waitFor(() => expect(screen.getByRole("tabpanel").textContent).toContain("חדש"), { timeout: 8000 });
  }, 15000);

  it("has a simple preview that needs no reader module", async () => {
    const user = userEvent.setup();
    const book = makeBook({
      pages: [
        { index: 0, text: "שלום עולם", textNikud: "שָׁלוֹם עוֹלָם", audio: "books/bk_test/a.wav", audioSource: "mock" },
        { index: 1, text: "עמוד שני" },
      ],
    });
    render(<SimplePreview book={book} />);
    expect(screen.getByText("שלום עולם")).toBeInTheDocument();
    expect(screen.getByText(/קול הדגמה/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "עם ניקוד" }));
    expect(screen.getByText("שָׁלוֹם עוֹלָם")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /הבא/ }));
    expect(screen.getByText("עמוד שני")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /הבא/ })).toBeDisabled();
  });
});
