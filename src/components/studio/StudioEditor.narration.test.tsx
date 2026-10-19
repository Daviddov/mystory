// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookWithPages } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import { StudioEditor } from "./StudioEditor";

const timings = (words: string[]) => words.map((word, i) => ({ word, start: i, end: i + 1 }));

function makeBook(audio: "none" | "fresh" | "recorded"): BookWithPages {
  const page = (index: number, text: string, source: "tts" | "recorded") => ({
    index,
    text,
    ...(audio !== "none" ? { audio: `books/bk_test/a${index}.mp3`, audioSource: source, wordTimings: timings(text.split(" ")) } : {}),
  });
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
    pages: [page(0, "עמוד ראשון", "tts"), page(1, "עמוד שני", audio === "recorded" ? "recorded" : "tts")],
  } as BookWithPages;
}

describe("stage 5 narration buttons", () => {
  let narrationBodies: Record<string, unknown>[];
  let current: BookWithPages;

  beforeEach(() => {
    narrationBodies = [];
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
        const method = init?.method ?? "GET";
        if (url === "/api/narration/bk_test" && method === "POST") {
          narrationBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          const lines = [
            { type: "start", total: 2, ttsMock: false },
            { type: "page", done: 1, total: 2, result: { pageIndex: 0, status: "narrated", audioSource: "tts" } },
            { type: "page", done: 2, total: 2, result: { pageIndex: 1, status: "narrated", audioSource: "tts" } },
            { type: "done", summary: { narrated: 2, skipped: 0, failed: 0 } },
          ];
          return new Response(lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
        }
        if (url === "/api/narration/bk_test") {
          return Response.json({
            voices: [{ id: "Puck", label: "פאק", description: "עליז", gender: "male" }],
            defaultVoice: "Puck",
            notesHonoured: true,
            ttsProvider: "gemini",
            ttsMock: false,
          });
        }
        return Response.json({ book: current });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openStage5(book: BookWithPages) {
    current = book;
    const user = userEvent.setup();
    render(<StudioEditor book={book} canPublish={false} />);
    await user.click(screen.getByRole("tab", { name: "שלבי היצירה" }));
    const toggle = screen.getByRole("button", { name: /^(עריכת|סגירת) שלב 5: הקראה$/ });
    if (toggle.getAttribute("aria-expanded") !== "true") await user.click(toggle);
    return user;
  }

  it("narrates only the missing pages (no force) with the primary button", async () => {
    const user = await openStage5(makeBook("none"));
    await user.click(await screen.findByRole("button", { name: "הקראה לעמודים שעדיין אין להם הקראה" }));
    await waitFor(() => expect(narrationBodies).toHaveLength(1));
    expect(narrationBodies[0]).toMatchObject({ force: false, overwriteRecorded: false });
    expect(narrationBodies[0]).not.toHaveProperty("pages");
    // The result is shown in a fixed toast where the user is.
    expect(await screen.findByTestId("notice-toast")).toHaveTextContent(/הוקראו 2 עמודים/);
  });

  it("when every page is narrated, says so and re-narrates everything with force after a confirmation", async () => {
    const user = await openStage5(makeBook("fresh"));
    expect(screen.queryByRole("button", { name: "הקראה לעמודים שעדיין אין להם הקראה" })).not.toBeInTheDocument();
    expect(screen.getByText("כל העמודים כבר מוקראים.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "הקראה מחדש של כל הספר בקול ובסגנון שנבחרו" }));
    expect(narrationBodies).toHaveLength(0);
    await user.click(await screen.findByRole("button", { name: "הקראה מחדש" }));
    await waitFor(() => expect(narrationBodies).toHaveLength(1));
    expect(narrationBodies[0]).toMatchObject({ force: true, overwriteRecorded: false, pages: [0, 1] });
  });

  it("never replaces a recording unless the second confirm button is chosen", async () => {
    const user = await openStage5(makeBook("recorded"));
    await user.click(screen.getByRole("button", { name: "הקראה מחדש של כל הספר בקול ובסגנון שנבחרו" }));
    await user.click(await screen.findByRole("button", { name: "הקראה מחדש, בלי לגעת בהקלטות" }));
    await waitFor(() => expect(narrationBodies).toHaveLength(1));
    expect(narrationBodies[0]).toMatchObject({ force: true, overwriteRecorded: false, pages: [0, 1] });
  });

  it("replaces recordings only when the user confirms that explicitly", async () => {
    const user = await openStage5(makeBook("recorded"));
    await user.click(screen.getByRole("button", { name: "הקראה מחדש של כל הספר בקול ובסגנון שנבחרו" }));
    await user.click(await screen.findByRole("button", { name: "הקראה מחדש, כולל ההקלטות שלי" }));
    await waitFor(() => expect(narrationBodies).toHaveLength(1));
    expect(narrationBodies[0]).toMatchObject({ force: true, overwriteRecorded: true });
  });
});
