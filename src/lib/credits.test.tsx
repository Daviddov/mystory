// @vitest-environment jsdom
/**
 * Credits: the shared rules, the <BookCredits> block, the print/PDF lines,
 * the Creative Commons import form and the zip package round trip.
 */
import { render, screen, within } from "@testing-library/react";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BookCredits } from "@/components/BookCredits";
import { EndScreen } from "@/components/reader/EndScreen";
import { exportBookPackage, importBookPackage } from "@/lib/book-package";
import { CcCreditSchema } from "@/lib/importers/cc";
import { createDraftFromPages, PagesImportMetaSchema } from "@/lib/importers/create-from-pages";
import { creditLines } from "@/lib/pdf/printable";
import { BookMetaPatchSchema, PagesPayloadSchema, sanitizePages } from "@/lib/studio/shared";
import { createTempData, type TempData } from "@/test/temp-data";
import { adaptationLine, isCreativeCommons, licenseDeedUrl, missingCreditRoles, safeHttpUrl, type CreditBook } from "./credits";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);

const BOOK_DASH_BOOK: CreditBook & { updatedAt: string } = {
  author: "Paul Kennedy",
  illustrator: "Graham Paterson",
  license: "CC BY 4.0",
  source: "https://github.com/bookdash/bookdash-books/tree/gh-pages/sleepy-mr-sloth/en",
  language: "he",
  originalLanguage: "en",
  updatedAt: "2026-10-13T00:00:00.000Z",
  credits: {
    designer: "Nick Mulgrew",
    editor: "An Editor",
    translator: "דנה כהן",
    originalTitle: "Sleepy Mr Sloth",
    publisher: "Book Dash",
    publisherUrl: "https://bookdash.org",
    publisherLogo: "books/bookdash-sleepy-mr-sloth/publisher-logo.png",
    attributionLine: "Originally published by Book Dash under a Creative Commons CC BY 4.0 license.",
    adaptation: "Translation into Hebrew by דנה כהן",
  },
};

describe("credit rules", () => {
  it("links Creative Commons licenses to their deed and nothing else", () => {
    expect(licenseDeedUrl("CC BY 4.0")).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(licenseDeedUrl(" cc by-nc-sa 4.0 ")).toBe("https://creativecommons.org/licenses/by-nc-sa/4.0/");
    expect(licenseDeedUrl("CC BY-ND 4.0")).toBe("https://creativecommons.org/licenses/by-nd/4.0/");
    expect(licenseDeedUrl("CC0 1.0")).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
    expect(licenseDeedUrl("CC0 (נחלת הכלל)")).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
    expect(licenseDeedUrl("כל הזכויות שמורות")).toBeUndefined();
    expect(licenseDeedUrl("CC BY 4.0/../../evil")).toBeUndefined();
    expect(isCreativeCommons("CC BY-SA 4.0")).toBe(true);
    expect(isCreativeCommons("כל הזכויות שמורות")).toBe(false);
  });

  it("only treats http(s) addresses as links", () => {
    expect(safeHttpUrl("https://bookdash.org")).toBe("https://bookdash.org/");
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("נכתב לאתר")).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
  });

  it("words the adaptation the way Book Dash asks", () => {
    expect(adaptationLine("he", "Dana Cohen")).toBe("Translation into Hebrew by Dana Cohen");
  });

  it("flags the roles an imported book does not name, and never flags ordinary books", () => {
    expect(missingCreditRoles({ author: "", illustrator: "", credits: { publisher: "Book Dash", creators: "A, B, C" } })).toEqual([
      "author",
      "illustrator",
      "designer",
      "editor",
    ]);
    expect(missingCreditRoles(BOOK_DASH_BOOK)).toEqual([]);
    expect(missingCreditRoles({ author: "", illustrator: "" })).toEqual([]);
    expect(missingCreditRoles({ author: "", illustrator: "", credits: { translator: "x" } })).toEqual([]);
  });

  it("prints every required credit on the last sheet and in the PDF", () => {
    expect(creditLines(BOOK_DASH_BOOK)).toEqual([
      { label: "כתיבה", value: "Paul Kennedy" },
      { label: "איור", value: "Graham Paterson" },
      { label: "עיצוב", value: "Nick Mulgrew" },
      { label: "עריכה", value: "An Editor" },
      { label: "השם המקורי של הספר", value: "Sleepy Mr Sloth" },
      { label: "תרגום לעברית", value: "דנה כהן" },
      { label: "פורסם במקור על ידי", value: "Book Dash, https://bookdash.org" },
      { label: "ייחוס", value: "Originally published by Book Dash under a Creative Commons CC BY 4.0 license." },
      { label: "שינויים מהמקור", value: "Translation into Hebrew by דנה כהן" },
      { label: "רישיון", value: "CC BY 4.0, https://creativecommons.org/licenses/by/4.0" },
      { label: "מקור", value: BOOK_DASH_BOOK.source },
    ]);
    // An ordinary book keeps its short list.
    expect(creditLines({ author: "מחברת", illustrator: "", license: "כל הזכויות שמורות", source: "" })).toEqual([
      { label: "כתיבה", value: "מחברת" },
      { label: "רישיון", value: "כל הזכויות שמורות" },
    ]);
  });
});

describe("<BookCredits>", () => {
  it("shows the people, the attribution, the license deed, the publisher link and the logo", () => {
    render(<BookCredits book={BOOK_DASH_BOOK} />);
    const block = screen.getByRole("region", { name: "קרדיטים" });
    for (const [label, value] of [
      ["כתיבה", "Paul Kennedy"],
      ["איור", "Graham Paterson"],
      ["עיצוב", "Nick Mulgrew"],
      ["עריכה", "An Editor"],
      ["תרגום לעברית", "דנה כהן"],
      ["השם המקורי של הספר", "Sleepy Mr Sloth"],
    ]) {
      expect(within(block).getByText(label).nextElementSibling).toHaveTextContent(value);
    }
    expect(within(block).getByText(/^Originally published by Book Dash under a Creative Commons CC BY 4\.0 license\.$/)).toBeInTheDocument();
    expect(within(block).getByText("Translation into Hebrew by דנה כהן")).toBeInTheDocument();

    const license = within(block).getByRole("link", { name: /CC BY 4\.0/ });
    expect(license).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
    expect(license).toHaveAttribute("rel", expect.stringContaining("noopener"));
    const publisher = within(block).getByRole("link", { name: /^Book Dash/ });
    expect(publisher).toHaveAttribute("href", "https://bookdash.org/");
    const logo = within(block).getByRole("img", { name: "הלוגו של Book Dash" });
    expect(logo.getAttribute("src")).toMatch(/^\/media\/books\/bookdash-sleepy-mr-sloth\/publisher-logo\.png\?v=/);
    expect(logo.closest("a")).toHaveAttribute("href", "https://bookdash.org/");
  });

  it("passes the share token to the logo only when asked, and shows creators without roles as given", () => {
    render(
      <BookCredits
        mediaToken="tok_1234567890abcdef"
        book={{
          author: "",
          illustrator: "",
          license: "CC BY 4.0",
          source: "",
          credits: { publisher: "Book Dash", creators: "Graham Paterson, Paul Kennedy, Nick Mulgrew", publisherLogo: "books/b/publisher-logo.png" },
        }}
      />,
    );
    expect(screen.getByRole("img", { name: "הלוגו של Book Dash" }).getAttribute("src")).toContain("t=tok_1234567890abcdef");
    expect(screen.getByText("יוצרי הספר").nextElementSibling).toHaveTextContent("Graham Paterson, Paul Kennedy, Nick Mulgrew");
    // No role is invented for people the source did not assign one to.
    expect(screen.queryByText("כתיבה")).toBeNull();
    expect(screen.queryByText("איור")).toBeNull();
    // A publisher without an address is plain text, not a link.
    expect(screen.queryByRole("link", { name: /Book Dash/ })).toBeNull();
  });

  it("renders nothing when there is nothing to credit, and never links an unsafe address", () => {
    const { container, rerender } = render(<BookCredits book={{ author: "", illustrator: "", license: "", source: "" }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <BookCredits
        book={{ author: "מחברת", illustrator: "", license: "כל הזכויות שמורות", source: "javascript:alert(1)", credits: { publisher: "X", publisherUrl: "javascript:alert(2)" } }}
      />,
    );
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.getByText("כל הזכויות שמורות")).toBeInTheDocument();
  });

  it("is shown at the end of reading", () => {
    render(<EndScreen title="מר עצלן" discussionQuestions={[]} recommendations={[]} onReadAgain={() => undefined} creditsBook={BOOK_DASH_BOOK} />);
    const block = screen.getByRole("region", { name: "קרדיטים" });
    expect(within(block).getByText("תרגום לעברית").nextElementSibling).toHaveTextContent("דנה כהן");
    expect(within(block).getByRole("img", { name: "הלוגו של Book Dash" })).toBeInTheDocument();
  });
});

describe("credits in storage and forms", () => {
  let data: TempData;
  let other: TempData;
  beforeEach(async () => {
    data = await createTempData();
    other = await createTempData();
  });
  afterEach(async () => {
    await data.cleanup();
    await other.cleanup();
  });

  it("keeps the old Creative Commons form valid and accepts the new credit fields", () => {
    const minimal = CcCreditSchema.parse({ license: "CC BY 4.0", sourceUrl: "https://storyweaver.org.in/stories/1", author: "A" });
    expect(minimal).toEqual({ license: "CC BY 4.0", sourceUrl: "https://storyweaver.org.in/stories/1", author: "A", illustrator: "" });
    expect(CcCreditSchema.safeParse({ ...minimal, publisherUrl: "", translator: "" }).success).toBe(true);
    expect(CcCreditSchema.safeParse({ ...minimal, publisherUrl: "not a url" }).success).toBe(false);
    expect(CcCreditSchema.safeParse({ ...minimal, language: "fr" }).success).toBe(false);
  });

  it("stores the extra credits of a Creative Commons import and marks an English text for translation", async () => {
    const meta = PagesImportMetaSchema.parse({
      title: "The Red Raincoat",
      kind: "images",
      pages: [{ text: "Manu had a new raincoat.", hasImage: true }, { text: "", hasImage: false }],
      credit: {
        license: "CC BY 4.0",
        sourceUrl: "https://storyweaver.org.in/stories/1",
        author: "Kiran Kasturia",
        illustrator: "Zainab Tambawalla",
        editor: "An Editor",
        publisher: "Pratham Books",
        publisherUrl: "https://prathambooks.org",
        attributionLine: "This book was first published on StoryWeaver by Pratham Books.",
        language: "en",
      },
    });
    const book = await createDraftFromPages({ ownerId: "u_1", meta, images: [PNG], repo: data.repo, media: data.media });
    expect(book).toMatchObject({
      status: "draft",
      language: "en",
      originalLanguage: "en",
      author: "Kiran Kasturia",
      credits: {
        editor: "An Editor",
        publisher: "Pratham Books",
        publisherUrl: "https://prathambooks.org",
        attributionLine: "This book was first published on StoryWeaver by Pratham Books.",
      },
    });
    expect(book.credits).not.toHaveProperty("designer");
    expect(book.pages[0].originalText).toBe("Manu had a new raincoat.");
    expect(book.pages[1]).not.toHaveProperty("originalText");

    // A Hebrew import without extra credits is stored exactly as before.
    const plain = await createDraftFromPages({
      ownerId: "u_1",
      meta: PagesImportMetaSchema.parse({ title: "ספר", kind: "cc", pages: [], credit: { license: "CC0 1.0", sourceUrl: "https://example.org", author: "א" } }),
      images: [],
      repo: data.repo,
      media: data.media,
    });
    expect(plain.language).toBeUndefined();
    expect(plain.credits).toBeUndefined();
  });

  it("keeps original text and alt text through a studio save, and never takes the logo path from the client", () => {
    const parsed = PagesPayloadSchema.parse({
      pages: [{ index: 0, text: "שלום", originalText: "Hello", imageAlt: " A cat. ", image: "books/b/p.jpg" }, { text: "x", originalText: " " }],
    });
    expect(sanitizePages(parsed.pages)).toEqual([
      { index: 0, text: "שלום", originalText: "Hello", imageAlt: "A cat.", image: "books/b/p.jpg" },
      { index: 1, text: "x" },
    ]);
    expect(BookMetaPatchSchema.safeParse({ credits: { translator: " דנה ", publisherLogo: "books/other/x.png" } }).success).toBe(true);
    expect(BookMetaPatchSchema.safeParse({ credits: { unknown: "x" } }).success).toBe(false);
    // Language is decided by the translation route only.
    expect(BookMetaPatchSchema.safeParse({ language: "he" }).success).toBe(false);
  });

  it("carries language, credits, original text and the publisher logo through a zip package", async () => {
    const created = await data.repo.createBook({
      title: "מר עצלן הישנוני",
      ownerId: "u_1",
      license: "CC BY 4.0",
      source: "https://example.org/sloth",
      language: "he",
      originalLanguage: "en",
      credits: { ...BOOK_DASH_BOOK.credits, publisherLogo: undefined },
      pages: [{ index: 0, text: "יום אחד", originalText: "One day", imageAlt: "Mr Sloth yawns." }],
    });
    const logoPath = `books/${created.id}/publisher-logo.png`;
    await data.media.put(logoPath, PNG, "image/png");
    await data.repo.updateBook(created.id, { credits: { ...created.credits, publisherLogo: logoPath } });
    const stored = await data.repo.getBookById(created.id);

    const zipBytes = await exportBookPackage(stored!, { media: data.media });
    const zip = await JSZip.loadAsync(zipBytes);
    expect(Object.keys(zip.files)).toContain("images/publisher-logo.png");
    const manifest = JSON.parse(await zip.file("book.json")!.async("string")) as { book: Record<string, unknown> };
    expect(manifest.book).toMatchObject({ language: "he", originalLanguage: "en", credits: { publisherLogo: "images/publisher-logo.png" } });

    const imported = await importBookPackage(zipBytes, { ownerId: "u_2", repo: other.repo, media: other.media });
    expect(imported).toMatchObject({
      language: "he",
      originalLanguage: "en",
      credits: { ...BOOK_DASH_BOOK.credits, publisherLogo: `books/${imported.id}/publisher-logo.png` },
    });
    expect(imported.pages[0]).toMatchObject({ text: "יום אחד", originalText: "One day", imageAlt: "Mr Sloth yawns." });
    expect((await other.media.get(`books/${imported.id}/publisher-logo.png`))?.bytes).toEqual(PNG);
  });
});
