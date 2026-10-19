// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_NARRATION_STYLE, ILLUSTRATION_STYLES, RULE_PACKS } from "@/lib/generation/presets";
import { buildCostContext } from "@/lib/generation/costs";
import { StagesPanel, type StagesPanelProps } from "./StagesPanel";

function setup(overrides: Partial<StagesPanelProps> = {}) {
  const props: StagesPanelProps = {
    bookId: "bk_test",
    hero: { description: "ילדה", image: "books/bk_test/hero.png" },
    counts: { pages: 3, withText: 3, withImage: 1, withNikud: 0, withAudio: 0 },
    disabled: false,
    illustratedPages: [],
    onHeroChange: vi.fn(),
    onHeroGenerate: vi.fn(),
    onHeroUpload: vi.fn(),
    onWriteStory: vi.fn(),
    onPasteStory: vi.fn(),
    onGoToPages: vi.fn(),
    onGoToDetails: vi.fn(),
    details: { done: 1, total: 5, missing: ["תקציר", "קטגוריה"] },
    onAutoDetails: vi.fn(),
    onUploadImages: vi.fn(),
    onIllustrateGrid: vi.fn(),
    onNikudAll: vi.fn(),
    onNarrateAll: vi.fn(),
    onFlush: vi.fn(async () => true),
    onNotice: vi.fn(),
    onBusy: vi.fn(),
    ...overrides,
  };
  render(<StagesPanel {...props} />);
  return props;
}

describe("StagesPanel book details stage", () => {
  it("shows the details card with its status and calls the handlers", async () => {
    const user = userEvent.setup();
    const props = setup();
    expect(screen.getByRole("heading", { name: /8\. פרטי הספר/ })).toBeInTheDocument();
    expect(screen.getByText("חסר: תקציר, קטגוריה")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "לפרטי הספר" }));
    expect(props.onGoToDetails).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "מילוי אוטומטי של הפרטים" }));
    expect(props.onAutoDetails).toHaveBeenLastCalledWith({ replace: false });
    await user.click(screen.getByLabelText(/להחליף גם פרטים שכבר מולאו/));
    await user.click(screen.getByRole("button", { name: "מילוי אוטומטי של הפרטים" }));
    expect(props.onAutoDetails).toHaveBeenLastCalledWith({ replace: true });
  });

  it("disables the AI button when the book has no text", () => {
    setup({ counts: { pages: 1, withText: 0, withImage: 0, withNikud: 0, withAudio: 0 } });
    expect(screen.getByRole("button", { name: "מילוי אוטומטי של הפרטים" })).toBeDisabled();
  });
});

describe("StagesPanel presets", () => {
  it("picks a style and a rule pack without losing the hero image", async () => {
    const user = userEvent.setup();
    const props = setup();
    const style = ILLUSTRATION_STYLES[1];
    await user.click(screen.getByRole("button", { name: new RegExp(style.label) }));
    expect(props.onHeroChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ style: style.slug, image: "books/bk_test/hero.png" }),
    );
    await user.click(screen.getByRole("button", { name: new RegExp(RULE_PACKS[0].label) }));
    expect(props.onHeroChange).toHaveBeenLastCalledWith(expect.objectContaining({ packs: [RULE_PACKS[0].slug] }));
  });

  it("illustrates with a 3x3 grid by default and passes the notes", async () => {
    const user = userEvent.setup();
    const props = setup();
    expect(screen.getByRole("button", { name: /רשת 3×3/ })).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByLabelText(/הנחיות לאיור הזה/), "ערב");
    await user.click(screen.getByRole("button", { name: /איור 2 עמודים/ }));
    expect(props.onIllustrateGrid).toHaveBeenCalledWith({ layout: "3x3", notes: "ערב" });
    await user.click(screen.getByRole("button", { name: /רשת 4×4/ }));
    await user.click(screen.getByRole("button", { name: /איור 2 עמודים/ }));
    expect(props.onIllustrateGrid).toHaveBeenLastCalledWith({ layout: "4x4", notes: "ערב" });
  });

  it("narrates with the default style and shows the honest note", async () => {
    const user = userEvent.setup();
    const onNarrateAll = vi.fn(async () => ({ styleNotesIgnored: true }));
    setup({ onNarrateAll });
    await user.click(screen.getByRole("button", { name: "הקראה לעמודים שעדיין אין להם הקראה" }));
    expect(onNarrateAll).toHaveBeenCalledWith({ style: DEFAULT_NARRATION_STYLE, notes: "", scope: "missing" });
    expect(await screen.findByText(/לא מקבל הנחיות חופשיות/)).toBeInTheDocument();
  });

  const voices = [
    { id: "Sulafat", label: "סולפת", description: "חם ונעים", gender: "female" as const },
    { id: "Puck", label: "פאק", description: "עליז ושמח", gender: "male" as const },
  ];

  it("shows the voice picker with the default selected, saves the choice and narrates with it", async () => {
    const user = userEvent.setup();
    const onNarrateAll = vi.fn();
    const props = setup({ onNarrateAll, narrationInfo: { voices, defaultVoice: "Sulafat", notesHonoured: true } });
    expect(screen.getByRole("button", { name: /סולפת/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /פאק/ }));
    expect(props.onHeroChange).toHaveBeenLastCalledWith(expect.objectContaining({ narrationVoice: "Puck" }));
    await user.click(screen.getByRole("button", { name: "הקראה לעמודים שעדיין אין להם הקראה" }));
    expect(onNarrateAll).toHaveBeenCalledWith({ style: DEFAULT_NARRATION_STYLE, notes: "", voice: "Sulafat", scope: "missing" });
  });

  it("offers the full re-narration as a second, different action", async () => {
    const user = userEvent.setup();
    const onNarrateAll = vi.fn();
    setup({
      onNarrateAll,
      counts: { pages: 3, withText: 3, withImage: 3, withNikud: 3, withAudio: 3, withFreshAudio: 3 },
      narrationInfo: { voices, defaultVoice: "Sulafat", notesHonoured: true },
    });
    await user.click(screen.getByRole("button", { name: "עריכת שלב 5: הקראה" }));
    // Nothing is missing: the primary action is replaced by a plain note.
    expect(screen.queryByRole("button", { name: "הקראה לעמודים שעדיין אין להם הקראה" })).not.toBeInTheDocument();
    expect(screen.getByText("כל העמודים כבר מוקראים.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /פאק/ }));
    await user.click(screen.getByRole("button", { name: "הקראה מחדש של כל הספר בקול ובסגנון שנבחרו" }));
    expect(onNarrateAll).toHaveBeenCalledWith({ style: DEFAULT_NARRATION_STYLE, notes: "", voice: "Sulafat", scope: "all" });
  });

  it("treats stale audio as missing", async () => {
    const user = userEvent.setup();
    setup({ counts: { pages: 3, withText: 3, withImage: 3, withNikud: 3, withAudio: 3, withFreshAudio: 1 } });
    await user.click(screen.getByRole("button", { name: "עריכת שלב 5: הקראה" }));
    expect(screen.getByRole("button", { name: "הקראה לעמודים שעדיין אין להם הקראה" })).toBeEnabled();
    expect(screen.getByText("2 עמודים מחכים להקראה.")).toBeInTheDocument();
  });

  it("uses the book's stored voice, plays a sample, and hides the picker without voices", async () => {
    const user = userEvent.setup();
    const onSampleVoice = vi.fn(async () => undefined);
    setup({
      hero: { description: "ילדה", narrationVoice: "Puck" },
      narrationInfo: { voices, defaultVoice: "Sulafat", notesHonoured: true },
      onSampleVoice,
    });
    expect(screen.getByRole("button", { name: /פאק/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "שמעו דוגמה" }));
    expect(onSampleVoice).toHaveBeenCalledWith({ voice: "Puck", style: DEFAULT_NARRATION_STYLE });
  });

  it("shows the free-text note only when the provider ignores the notes", () => {
    setup({
      hero: { description: "ילדה", narrationNotes: "לאט" },
      narrationInfo: { voices, defaultVoice: "Sulafat", notesHonoured: false },
    });
    expect(screen.getByText(/לא מקבל הנחיות חופשיות/)).toBeInTheDocument();
  });

  it("has no ignored-notes note when the provider honours them", () => {
    setup({
      hero: { description: "ילדה", narrationNotes: "לאט" },
      narrationInfo: { voices, defaultVoice: "Sulafat", notesHonoured: true },
    });
    expect(screen.queryByText(/לא מקבל הנחיות חופשיות/)).not.toBeInTheDocument();
  });
});

describe("StagesPanel cost estimates", () => {
  const status = (mock: boolean) => ({ name: mock ? "mock" : "gemini", isMock: mock });
  const costsFor = (mock: boolean) =>
    buildCostContext(
      { text: status(mock), nikud: status(mock), tts: status(mock), image: status(mock), video: status(mock) },
      {},
      new Date("2026-10-19T00:00:00Z"),
    );

  it("shows a cost line on every AI stage and a whole-book total", () => {
    setup({ costs: costsFor(false), counts: { pages: 12, withText: 12, withImage: 0, withNikud: 0, withAudio: 0, textChars: 2400, audioMissingChars: 2400 } });
    expect(screen.getAllByTestId("cost-line")).toHaveLength(9);
    expect(screen.getAllByText(/עלות משוערת:/).length).toBeGreaterThanOrEqual(7);
    expect(screen.getByTestId("cost-total")).toHaveTextContent(/עלות משוערת לכל הספר: כ-\$/);
    expect(screen.getByTestId("cost-total")).toHaveTextContent("ניסיונות חוזרים");
  });

  it("says demo mode for mock providers", () => {
    setup({ costs: costsFor(true) });
    expect(screen.getByTestId("cost-total")).toHaveTextContent("ללא עלות (מצב הדגמה)");
    expect(screen.getAllByText("עלות משוערת: ללא עלות (מצב הדגמה)").length).toBeGreaterThanOrEqual(4);
  });

  it("shows no cost lines without a cost context", () => {
    setup();
    expect(screen.queryByTestId("cost-line")).toBeNull();
  });
});

describe("StagesPanel created previews", () => {
  const created = {
    title: "ארנבת בגן",
    summary: "ארנבת קטנה לומדת ללכת לגן.",
    tags: ["ארנבת"],
    categories: ["animals"],
    pages: [
      { index: 0, text: "ארנבת קטנה\nקפצה לגן", image: "books/bk_test/p1.png", audio: "books/bk_test/a1.mp3" },
      { index: 1, text: "והגן היה גדול", textNikud: "וְהַגַּן הָיָה גָּדוֹל" },
      { index: 2, text: "ובסוף חזרה" , image: "books/bk_test/p3.png" },
    ],
  };

  it("shows a thumbnail per picture and a numbered dashed placeholder where one is missing", async () => {
    const user = userEvent.setup();
    const onGoToPage = vi.fn();
    setup({ created, onGoToPage });
    expect(screen.getAllByTestId("page-thumb")).toHaveLength(2);
    const missing = screen.getByTestId("page-thumb-missing");
    expect(missing).toHaveTextContent("2");
    await user.click(missing);
    expect(onGoToPage).toHaveBeenCalledWith(1);
  });

  it("shows the story excerpt with its lines, the nikud sample and the details", () => {
    setup({ created });
    expect(screen.getByText(/קפצה לגן/)).toBeInTheDocument();
    expect(screen.getByText("וְהַגַּן הָיָה גָּדוֹל")).toBeInTheDocument();
    expect(screen.getByText("ארנבת בגן")).toBeInTheDocument();
    expect(screen.getByText("חיות")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /השמעת ההקראה של עמוד 1/ })).toBeInTheDocument();
  });

  it("collapses finished stages, expands unfinished ones and toggles with the keyboard", async () => {
    const user = userEvent.setup();
    setup({ created });
    // Story has text: collapsed. Details are not finished: expanded.
    const story = screen.getByRole("button", { name: /עריכת שלב 2/ });
    expect(story).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /סגירת שלב 8/ })).toHaveAttribute("aria-expanded", "true");
    story.focus();
    await user.keyboard("{Enter}");
    expect(story).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "הדבקת סיפור שלם" })).toBeVisible();
  });

  it("suggests one next step and keeps the progress stepper", () => {
    setup({ created });
    expect(screen.getByTestId("next-step")).toHaveTextContent("הבא בתור: איור 2 עמודים");
    expect(screen.getByRole("navigation", { name: "התקדמות בשלבי היצירה" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^שלב \d: / })).toHaveLength(8);
  });

  it("shows no broken previews for an empty book", () => {
    setup({
      hero: undefined,
      counts: { pages: 0, withText: 0, withImage: 0, withNikud: 0, withAudio: 0 },
    });
    expect(document.querySelectorAll("img")).toHaveLength(0);
    expect(screen.queryByTestId("page-thumb")).toBeNull();
    expect(screen.getByText("עוד אין גיבור.")).toBeInTheDocument();
    expect(screen.getByText("עוד אין טקסט בעמודים.")).toBeInTheDocument();
    expect(screen.getByTestId("next-step")).toHaveTextContent("כתיבת הסיפור");
  });
});
