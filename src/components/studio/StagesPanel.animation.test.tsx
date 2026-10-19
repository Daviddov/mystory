// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookWithPages } from "@/lib/types";

const animatePageWithAi = vi.fn();
let storedPages: Partial<BookWithPages["pages"][number]>[] = [];

vi.mock("@/lib/studio/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/studio/client")>();
  return {
    ...actual,
    animatePageWithAi: (...args: unknown[]) => animatePageWithAi(...args),
    fetchBook: async () => ({ pages: storedPages }),
  };
});

import { StagesPanel, type StagesPanelProps } from "./StagesPanel";

function setup(overrides: Partial<StagesPanelProps> = {}) {
  const props: StagesPanelProps = {
    bookId: "bk_test",
    hero: { description: "ילדה", image: "books/bk_test/hero.png", animationNotes: "העננים זזים" },
    counts: { pages: 2, withText: 2, withImage: 2, withNikud: 2, withAudio: 2 },
    disabled: false,
    illustratedPages: [0, 1],
    onHeroChange: vi.fn(),
    onHeroGenerate: vi.fn(),
    onHeroUpload: vi.fn(),
    onWriteStory: vi.fn(),
    onPasteStory: vi.fn(),
    onGoToPages: vi.fn(),
    onGoToDetails: vi.fn(),
    details: { done: 5, total: 5, missing: [] },
    onAutoDetails: vi.fn(),
    onUploadImages: vi.fn(),
    onIllustrateGrid: vi.fn(),
    onNikudAll: vi.fn(),
    onNarrateAll: vi.fn(),
    onFlush: vi.fn(async () => true),
    onNotice: vi.fn(),
    onBusy: vi.fn(),
    onConfirm: vi.fn((request) => request.run()),
    ...overrides,
  };
  render(<StagesPanel {...props} />);
  return props;
}

async function openStage7(user: ReturnType<typeof userEvent.setup>) {
  const toggle = screen.getByRole("button", { name: /^(עריכת|סגירת) שלב 7: הנפשת התמונות$/ });
  if (toggle.getAttribute("aria-expanded") !== "true") await user.click(toggle);
}

const CREATED: NonNullable<StagesPanelProps["created"]> = {
  title: "",
  summary: "",
  tags: [],
  categories: [],
  pages: [
    { index: 0, text: "א", image: "books/bk_test/p1.webp" },
    { index: 1, text: "ב", image: "books/bk_test/p2.webp" },
  ],
};

describe("animation stage: one picture at a time", () => {
  beforeEach(() => {
    animatePageWithAi.mockReset();
    animatePageWithAi.mockResolvedValue({ status: "animated", videoSource: "ai" });
    storedPages = [{ index: 0, text: "א" }, { index: 1, text: "ב" }];
  });

  it("has a button per page and no bulk button", async () => {
    const user = userEvent.setup();
    setup();
    await openStage7(user);
    expect(screen.getByRole("button", { name: /^הנפשה של עמוד 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^הנפשה של עמוד 2/ })).toBeInTheDocument();
    expect(screen.queryByText(/העמודים שנשארו/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "הנפשת עמוד אחד" })).not.toBeInTheDocument();
  });

  it("animates exactly one page with the chosen motion and the notes (book + page)", async () => {
    const user = userEvent.setup();
    const props = setup();
    await openStage7(user);
    await user.click(screen.getByRole("button", { name: /רוח קלה/ }));
    expect(props.onHeroChange).toHaveBeenLastCalledWith(expect.objectContaining({ animationMotion: "wind" }));
    const row = screen.getAllByRole("button", { name: "הוראה לעמוד הזה" })[1];
    await user.click(row);
    await user.type(screen.getByLabelText("הוראה להנפשת עמוד 2"), "הציפור עפה");
    await user.click(screen.getByRole("button", { name: /^הנפשה של עמוד 2/ }));
    await waitFor(() => expect(animatePageWithAi).toHaveBeenCalledTimes(1));
    expect(animatePageWithAi).toHaveBeenCalledWith("bk_test", 1, { motion: "gentle", notes: "העננים זזים הציפור עפה" });
    expect(props.onBusy).toHaveBeenCalledWith(expect.objectContaining({ expectedSeconds: expect.any(Number) }));
    await waitFor(() => expect(props.onBusy).toHaveBeenLastCalledWith(null));
  });

  it("replaces an AI clip with replace:true and asks first for a clip the user uploaded", async () => {
    const user = userEvent.setup();
    storedPages = [
      { index: 0, text: "א", image: "books/bk_test/p1.webp", video: "books/bk_test/animation-01-a.mp4", videoSource: "ai" },
      { index: 1, text: "ב", image: "books/bk_test/p2.webp", video: "books/bk_test/animation-02-b.mp4" },
    ];
    const props = setup({ created: CREATED });
    await screen.findByText("2 מתוך 2 איורים מונפשים");
    await openStage7(user);
    const redo = await screen.findAllByRole("button", { name: /^הנפשה מחדש של עמוד/ });
    expect(redo).toHaveLength(2);
    await user.click(redo[0]);
    await waitFor(() => expect(animatePageWithAi).toHaveBeenCalledTimes(1));
    expect(animatePageWithAi.mock.calls[0][2]).toMatchObject({ replace: true });
    expect(props.onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^הנפשה מחדש של עמוד 2/ }));
    expect(props.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: "להחליף את הקליפ שהעליתם?" }));
    await waitFor(() => expect(animatePageWithAi).toHaveBeenCalledTimes(2));
    expect(animatePageWithAi.mock.calls[1][2]).toMatchObject({ replace: true });
  });

  it("keeps a clip with its picture when the pages are reordered before saving", async () => {
    const user = userEvent.setup();
    storedPages = [
      { index: 0, text: "א", image: "books/bk_test/p1.webp", video: "books/bk_test/animation-01-a.mp4", videoSource: "ai" },
      { index: 1, text: "ב", image: "books/bk_test/p2.webp", video: "books/bk_test/animation-02-b.mp4" },
    ];
    // The editor shows p2 first now; the user's own clip moves with it.
    const props = setup({ created: { ...CREATED, pages: [{ ...CREATED.pages[1], index: 0 }, { ...CREATED.pages[0], index: 1 }] } });
    await screen.findByText("2 מתוך 2 איורים מונפשים");
    await openStage7(user);
    await user.click(await screen.findByRole("button", { name: /^הנפשה מחדש של עמוד 1/ }));
    expect(props.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: "להחליף את הקליפ שהעליתם?" }));
  });

  it("hands the changed book to the editor after an animation", async () => {
    const user = userEvent.setup();
    const onServerBook = vi.fn();
    setup({ onServerBook });
    await openStage7(user);
    await user.click(screen.getByRole("button", { name: /^הנפשה של עמוד 1/ }));
    await waitFor(() => expect(onServerBook).toHaveBeenCalledWith(expect.objectContaining({ pages: storedPages })));
  });
});
