/**
 * Markdown versions of the public pages, for AI agents and other clients that
 * ask for `Accept: text/markdown` (src/proxy.ts rewrites them to src/app/md)
 * and for /llms.txt. Pure formatting: the callers load the data.
 *
 * Text goes out WITHOUT nikud (plainText / stripNikud): agents, like people
 * searching, match Hebrew without vowel points. Every link is absolute.
 */
import { creditPeople, creditStatements, licenseDeedUrl, safeHttpUrl } from "./credits";
import { stripNikud } from "./hebrew";
import { routes } from "./routes";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, plainText } from "./seo";
import {
  ageGroupsLabel,
  categoryLabel,
  readingTimeLabel,
  themeLabel,
} from "./taxonomy";
import { bookAgeGroups, type Book, type BookWithPages } from "./types";

export const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";

/** A Markdown response. Vary: the same address serves HTML to browsers (see src/proxy.ts). */
export function markdownResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": MARKDOWN_CONTENT_TYPE, Vary: "Accept" } });
}

/** Text safe inside the [label] of a link. */
function linkLabel(text: string): string {
  return text.replace(/([\\[\]])/g, "\\$1");
}

/** `[label](absolute url)`. */
export function mdLink(label: string, path: string): string {
  return `[${linkLabel(plainText(label))}](${absoluteUrl(path) ?? path})`;
}

/**
 * Free text (a story page, a description) as Markdown: no nikud, paragraphs
 * kept, single line breaks kept as hard breaks (rhymed verse), and a line that
 * would start a heading, quote or list escaped.
 */
export function mdText(text: string): string {
  return stripNikud(text)
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .filter((line) => line !== "")
        .map((line) => line.replace(/^([#>*+-]|\d+[.)])/, "\\$1"))
        .join("  \n"),
    )
    .filter((paragraph) => paragraph !== "")
    .join("\n\n");
}

/** One list item for a book: link, then its summary. */
export function bookListItem(book: Pick<Book, "slug" | "title" | "summary">): string {
  const summary = plainText(book.summary, 200);
  return `- ${mdLink(book.title, routes.book(book.slug))}${summary ? `: ${summary}` : ""}`;
}

/** The lines as one document, with at most one blank line in a row. */
function joinLines(lines: string[]): string {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function section(title: string, lines: string[]): string[] {
  return lines.length > 0 ? [`## ${title}`, "", ...lines, ""] : [];
}

function footer(): string[] {
  return ["---", "", `מתוך ${mdLink(SITE_NAME, routes.home())}: ${plainText(SITE_DESCRIPTION)}`, ""];
}

/** A titled list of links with a short note each, for /llms.txt. */
export interface LinkSection {
  title: string;
  links: { label: string; path: string; note?: string }[];
}

/**
 * /llms.txt (llmstxt.org): the site name, a summary, a few words on the site,
 * then sections of links. Also the Markdown version of the home page.
 */
export function llmsTxt({ sections, books }: { sections: LinkSection[]; books: Book[] }): string {
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${plainText(SITE_DESCRIPTION)}`,
    "",
    "ספרייה חינמית של סיפורי ילדים מאוירים בעברית, לגילאי 0 עד 8. כל ספר אפשר לקרוא באתר עם ניקוד או בלעדיו, " +
      "ולרוב גם לשמוע בהקראה. בעמוד של כל ספר יש תקציר, גילאים מומלצים, זמן קריאה ושאלות לשיחה עם הילדים אחרי הקריאה. " +
      "אין צורך בהרשמה ואין פרסומות.",
    "",
    "כל עמוד ספר וכל רשימת ספרים זמינים גם כ-Markdown, באותה כתובת, לבקשה עם `Accept: text/markdown`. " +
      "גרסת ה-Markdown של ספר כוללת את כל טקסט הסיפור, עמוד אחר עמוד.",
    "",
  ];
  for (const { title, links } of sections) {
    lines.push(
      ...section(
        title,
        links.map((link) => `- ${mdLink(link.label, link.path)}${link.note ? `: ${plainText(link.note)}` : ""}`),
      ),
    );
  }
  lines.push(...section("ספרים", books.map(bookListItem)));
  return joinLines(lines);
}

/** The book page as Markdown: details, the whole story page by page, questions and credits. */
export function bookMarkdown(book: BookWithPages): string {
  const people = creditPeople(book);
  const hasAudio = book.pages.some((page) => !!page.audio);
  const facts = [
    ...people.map((line) => `- ${line.label}: ${plainText(line.value)}`),
    `- גילאים: ${ageGroupsLabel(bookAgeGroups(book))}`,
    `- זמן קריאה: ${readingTimeLabel(book.readingMinutes)}`,
    `- עמודים: ${book.pages.length}`,
    `- הקראה: ${hasAudio ? "יש" : "אין"}`,
    book.categories.length > 0
      ? `- קטגוריות: ${book.categories.map((slug) => mdLink(categoryLabel(slug), routes.category(slug))).join(", ")}`
      : "",
    book.themes.length > 0
      ? `- נושאים לשיחה: ${book.themes.map((slug) => mdLink(themeLabel(slug), routes.theme(slug))).join(", ")}`
      : "",
    book.tags.length > 0 ? `- תגיות: ${book.tags.map((tag) => mdLink(tag, routes.tag(tag))).join(", ")}` : "",
    `- לקריאה ולהאזנה באתר: ${absoluteUrl(routes.read(book.slug))}`,
  ].filter((line) => line !== "");

  const pages = book.pages.flatMap((page, index) => {
    const text = mdText(page.text);
    return text ? [`### עמוד ${index + 1}`, "", text, ""] : [];
  });

  const questions = book.discussionQuestions
    .map((question) => plainText(question))
    .filter(Boolean)
    .map((question, index) => `${index + 1}. ${question}`);

  const license = book.license.trim();
  const deed = licenseDeedUrl(license);
  const publisher = book.credits?.publisher?.trim() ?? "";
  const publisherUrl = safeHttpUrl(book.credits?.publisherUrl);
  const source = book.source.trim();
  const sourceUrl = safeHttpUrl(source);
  const credits = [
    ...creditStatements(book).map((line) => `- ${plainText(line)}`),
    `- רישיון: ${license ? (deed ? `[${linkLabel(license)}](${deed})` : plainText(license)) : "לא צוין"}`,
    publisher ? `- הוצאה לאור: ${publisherUrl ? `[${linkLabel(publisher)}](${publisherUrl})` : plainText(publisher)}` : "",
    source ? `- מקור: ${sourceUrl ?? plainText(source)}` : "",
  ].filter((line) => line !== "");

  const summary = plainText(book.summary);
  return joinLines([
    `# ${plainText(book.title)}`,
    "",
    ...(summary ? [`> ${summary}`, ""] : []),
    ...facts,
    "",
    ...section("הסיפור", pages),
    ...section("שאלות לשיחה", questions),
    ...section("קרדיטים ורישיון", credits),
    ...footer(),
  ]);
}

/** A listing (age, category, theme, collection...) as Markdown: heading, description and its books. */
export function listingMarkdown({
  title,
  description,
  books,
  empty = "עוד אין כאן ספרים.",
}: {
  title: string;
  description?: string;
  books: Pick<Book, "slug" | "title" | "summary">[];
  empty?: string;
}): string {
  const intro = description ? mdText(description) : "";
  return joinLines([
    `# ${plainText(title)}`,
    "",
    ...(intro ? [intro, ""] : []),
    ...(books.length > 0 ? section(`ספרים (${books.length})`, books.map(bookListItem)) : [empty, ""]),
    ...footer(),
  ]);
}

/** A page of links (the list of collections) as Markdown. */
export function linksMarkdown({ title, description, links }: { title: string; description?: string } & Pick<LinkSection, "links">): string {
  return joinLines([
    `# ${plainText(title)}`,
    "",
    ...(description ? [mdText(description), ""] : []),
    ...links.map((link) => `- ${mdLink(link.label, link.path)}${link.note ? `: ${plainText(link.note)}` : ""}`),
    "",
    ...footer(),
  ]);
}

/** The Markdown answer for a page that does not exist (or is not published). */
export function notFoundMarkdown(): Response {
  return markdownResponse(joinLines(["# הדף לא נמצא", "", ...footer()]), 404);
}
