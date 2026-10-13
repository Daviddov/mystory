// @vitest-environment jsdom
/** The translation tab of the studio editor, with the server replaced by a stub fetch. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookWithPages } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import { StudioEditor } from "./StudioEditor";

function englishBook(overrides: Partial<BookWithPages> = {}): BookWithPages {
  return {
    id: "bookdash-sleepy-mr-sloth",
    slug: "sleepy-mr-sloth",
    title: "Sleepy Mr Sloth",
    summary: "He knows how to swing.",
    author: "",
    illustrator: "",
    license: "CC BY 4.0",
    source: "https://github.com/bookdash/bookdash-books/tree/gh-pages/sleepy-mr-sloth/en",
    ageGroup: "3-5",
    readingMinutes: 1,
    coverImage: "",
    status: "draft",
    ownerId: "u_owner",
    categories: ["animals"],
    tags: [],
    themes: [],
    discussionQuestions: [],
    origin: "import",
    viewCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    language: "en",
    originalLanguage: "en",
    credits: { publisher: "Book Dash", creators: "Graham Paterson, Paul Kennedy, Nick Mulgrew", originalTitle: "Sleepy Mr Sloth" },
    pages: [
      { index: 0, text: "One day, Mr Sloth came to visit.", originalText: "One day, Mr Sloth came to visit.", imageAlt: "Mr Sloth yawns.", image: "books/bookdash-sleepy-mr-sloth/page-01.jpg" },
      { index: 1, text: "I’m sleepy!", originalText: "I’m sleepy!" },
    ],
    ...overrides,
  };
}

function hebrewBook(translator: string): BookWithPages {
  const book = englishBook();
  return {
    ...book,
    title: "מר עצלן הישנוני",
    summary: "מר עצלן מחפש ענף לישון עליו.",
    language: "he",
    updatedAt: "2026-01-03T00:00:00.000Z",
    credits: { ...book.credits, translator, adaptation: `Translation into Hebrew by ${translator}` },
    pages: [
      { ...book.pages[0], text: "יום אחד בא מר עצלן לביקור." },
      { ...book.pages[1], text: "אני עייף!" },
    ],
  };
}

interface Call {
  url: string;
  method: string;
  body: unknown;
}

describe("studio translation tab", () => {
  let calls: Call[];
  let translateAnswer: (body: { action: string; translator?: string }) => Response;

  beforeEach(() => {
    calls = [];
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
    };
    translateAnswer = () => Response.json({ status: "mock", isMock: true, book: englishBook() });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
        calls.push({ url, method: init?.method ?? "GET", body });
        if (url.endsWith("/translate")) return translateAnswer(body as { action: string; translator?: string });
        const pages = (body as { pages?: BookWithPages["pages"] } | undefined)?.pages;
        return Response.json({
          book: englishBook({
            updatedAt: "2026-01-02T00:00:00.000Z",
            ...(pages ? { pages: pages.map((page, index) => ({ ...page, index })) } : {}),
          }),
        });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is offered only for a book whose original language is not Hebrew", () => {
    const { unmount } = render(<StudioEditor book={englishBook()} canPublish={false} />);
    expect(screen.getByRole("tab", { name: "תרגום" })).toBeInTheDocument();
    unmount();
    render(<StudioEditor book={englishBook({ language: undefined, originalLanguage: undefined, credits: undefined })} canPublish={false} />);
    expect(screen.queryByRole("tab", { name: "תרגום" })).toBeNull();
  });

  it("shows the original left-to-right next to an empty Hebrew box, and blocks submission while in English", async () => {
    const user = userEvent.setup();
    render(<StudioEditor book={englishBook()} canPublish={false} />);
    await user.click(screen.getByRole("tab", { name: "תרגום" }));

    const first = screen.getByRole("article", { name: "עמוד 1" });
    const original = within(first).getByText("One day, Mr Sloth came to visit.");
    expect(original).toHaveAttribute("dir", "ltr");
    expect(original).toHaveAttribute("lang", "en");
    const hebrew = within(first).getByLabelText("עברית");
    expect(hebrew).toHaveAttribute("dir", "rtl");
    expect(hebrew).toHaveValue("");
    expect(within(first).getByRole("img", { name: "Mr Sloth yawns." })).toBeInTheDocument();
    expect(screen.getByText("0 מתוך 2 עמודים בעברית")).toBeInTheDocument();
    // The missing roles are flagged, with the creators exactly as the source lists them.
    expect(screen.getByText(/חסרים בקרדיט: כתיבה, איור, עיצוב, עריכה/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "שיתוף ופרסום" }));
    expect(screen.getByText(/הספר עדיין לא בעברית/)).toBeInTheDocument();
  });

  it("with no translation service says so and leaves the text alone", async () => {
    const user = userEvent.setup();
    render(<StudioEditor book={englishBook()} canPublish={false} />);
    await user.click(screen.getByRole("tab", { name: "תרגום" }));
    await user.click(screen.getByRole("button", { name: "תרגם לעברית" }));

    await waitFor(() => expect(screen.getAllByText(/שירות התרגום לא מחובר/).length).toBeGreaterThan(0));
    expect(calls.filter((call) => call.url.endsWith("/translate"))).toHaveLength(1);
    expect(screen.getByText("One day, Mr Sloth came to visit.")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "עמוד 1" })).getByLabelText("עברית")).toHaveValue("");
    expect(screen.getByText("הספר עדיין באנגלית")).toBeInTheDocument();
    // Nothing was saved back to the server as a result.
    expect(calls.some((call) => call.url.endsWith("/pages"))).toBe(false);
  });

  it("translates the whole book in one request and shows the Hebrew beside the original", async () => {
    translateAnswer = (body) => Response.json({ status: "translated", isMock: false, book: hebrewBook(body.translator || "הסיפור שלי (תרגום מכונה)") });
    const user = userEvent.setup();
    render(<StudioEditor book={englishBook()} canPublish={false} />);
    await user.click(screen.getByRole("tab", { name: "תרגום" }));
    await user.type(screen.getByLabelText("שם המתרגם או המתרגמת"), "דנה כהן");
    await user.click(screen.getByRole("button", { name: "תרגם לעברית" }));

    await waitFor(() => expect(screen.getByText(/הספר תורגם לעברית/)).toBeInTheDocument());
    const translate = calls.filter((call) => call.url.endsWith("/translate"));
    expect(translate).toHaveLength(1);
    expect(translate[0]).toMatchObject({ method: "POST", body: { action: "translate", translator: "דנה כהן" } });

    const first = screen.getByRole("article", { name: "עמוד 1" });
    expect(within(first).getByLabelText("עברית")).toHaveValue("יום אחד בא מר עצלן לביקור.");
    expect(within(first).getByText("One day, Mr Sloth came to visit.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "מר עצלן הישנוני" })).toBeInTheDocument();
    expect(screen.getByLabelText("שם הספר בעברית")).toHaveValue("מר עצלן הישנוני");
    expect(screen.getByText("הספר מסומן כספר בעברית")).toBeInTheDocument();
    expect(screen.getByText("2 מתוך 2 עמודים בעברית")).toBeInTheDocument();

    // Editing the Hebrew afterwards is an ordinary autosave that keeps the original text.
    await user.type(within(first).getByLabelText("עברית"), " בוקר טוב!");
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/pages"))).toBe(true), { timeout: 3000 });
    const save = calls.filter((call) => call.url.endsWith("/pages")).at(-1)!;
    expect(save.body).toMatchObject({
      pages: [
        { text: "יום אחד בא מר עצלן לביקור. בוקר טוב!", originalText: "One day, Mr Sloth came to visit.", imageAlt: "Mr Sloth yawns." },
        { text: "אני עייף!", originalText: "I’m sleepy!" },
      ],
    });

    // The translator credit is editable with the other credits.
    await user.click(screen.getByRole("tab", { name: "פרטי הספר" }));
    expect(screen.getByLabelText("תרגום לעברית")).toHaveValue("דנה כהן");
    expect(screen.getByLabelText("מה שונה מהמקור")).toHaveValue("Translation into Hebrew by דנה כהן");
  });

  it("lets a person translate by hand and accept, once every page is in Hebrew and a name is given", async () => {
    translateAnswer = (body) => Response.json({ status: "accepted", isMock: false, book: hebrewBook(body.translator ?? "") });
    const user = userEvent.setup();
    render(<StudioEditor book={englishBook()} canPublish={false} />);
    await user.click(screen.getByRole("tab", { name: "תרגום" }));
    const accept = screen.getByRole("button", { name: "תרגמתי בעצמי, הספר בעברית" });
    expect(accept).toBeDisabled();

    await user.type(within(screen.getByRole("article", { name: "עמוד 1" })).getByLabelText("עברית"), "יום אחד");
    await user.type(within(screen.getByRole("article", { name: "עמוד 2" })).getByLabelText("עברית"), "אני עייף");
    expect(accept).toBeDisabled();
    await user.type(screen.getByLabelText("שם המתרגם או המתרגמת"), "דנה");
    expect(accept).toBeEnabled();
    await user.click(accept);

    await waitFor(() => expect(screen.getByText(/התרגום אושר/)).toBeInTheDocument());
    const call = calls.find((item) => item.url.endsWith("/translate"));
    expect(call?.body).toEqual({ action: "accept", translator: "דנה" });
    // The typed Hebrew was saved before the server was asked to accept it.
    const order = calls.map((item) => item.url.split("/").pop());
    expect(order.indexOf("pages")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("pages")).toBeLessThan(order.indexOf("translate"));
  });
});
