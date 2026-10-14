/**
 * Fallback source for Book Dash books that are unfinished in the GitHub
 * repository (no page pictures, or no text at all): the book's page on
 * bookdash.org shows every spread of the printed book as one picture.
 *
 * Those pictures have the English text printed in them, unlike the clean
 * illustrations of the repository, so a book imported this way needs a person
 * to check it. The page also names the writer, illustrator, designer and
 * editor, which the repository does not.
 */
import { IMPORT_LIMITS } from "./limits";
import { detectImageType } from "./media-sniff";

const SITE = "https://bookdash.org";
const UPLOADS = `${SITE}/wp-content/uploads/`;
/** Books whose page on the site has another name than their folder in the repository. */
const WEB_SLUGS: Record<string, string> = {
  "mrs-penguins-palace": "mrs-penguins-perfect-palace",
};
/**
 * A printed book opens with a cover, a title page and credits. The story starts on the
 * fifth picture, or on the fourth in the newer exports (named "..._page4.jpg").
 */
const FIRST_STORY_PAGE = 5;
const FIRST_STORY_PAGE_NEW_NAMING = 4;

export interface BookDashWebCredits {
  author?: string;
  illustrator?: string;
  designer?: string;
  editor?: string;
}

export interface BookDashWebPage {
  url: string;
  cover?: string;
  /** One picture per story spread, in reading order. Front and back matter are left out. */
  spreads: string[];
  credits: BookDashWebCredits;
}

export type WebFetch = (url: string) => Promise<Response>;

export function bookDashWebUrl(slug: string): string {
  return `${SITE}/books/${WEB_SLUGS[slug] ?? slug}/`;
}

const ROLES: Record<string, keyof BookDashWebCredits> = {
  writer: "author",
  author: "author",
  illustrator: "illustrator",
  designer: "designer",
  editor: "editor",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#0*39;|&#x0*27;|&#0*8217;|&rsquo;/gi, "'")
    .replace(/&#(\d{2,6});/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Page number in a file name such as "..._Page_05.jpg", "..._page10.jpg" or "..._20170208-7.jpg". */
function pageNumber(url: string): number | undefined {
  const name = url.slice(url.lastIndexOf("/") + 1);
  const match = /(?:_Page_|_page|-)(\d{1,2})(?:-scaled|-\d)?\.(?:jpe?g|png)$/i.exec(name);
  return match ? Number(match[1]) : undefined;
}

/** Reads the cover, the story spreads and the credits out of a book page of bookdash.org. */
export function parseBookDashWebPage(html: string, url: string, pageCount: number): BookDashWebPage {
  const credits: BookDashWebCredits = {};
  for (const match of html.matchAll(/<span class="txt-bold">([^<]{1,120})<\/span>\s*\(([A-Za-z ]{3,20})\)/g)) {
    const role = ROLES[match[2].trim().toLowerCase()];
    const name = decodeEntities(match[1]);
    if (!role || !name) continue;
    credits[role] = credits[role] ? `${credits[role]}, ${name}` : name;
  }

  // The gallery links every spread to its full-size file; thumbnails carry a size suffix.
  const links: string[] = [];
  for (const match of html.matchAll(
    /<a href="(https:\/\/bookdash\.org\/wp-content\/uploads\/[^"]+\.(?:jpe?g|png))"/gi,
  )) {
    if (!links.includes(match[1])) links.push(match[1]);
  }
  const newNaming =
    links.some((link) => /_page\d{1,2}\.(?:jpe?g|png)$/.test(link)) &&
    !links.some((link) => /_Page_\d{2}\./.test(link.replace(/_Page_01\./, "")));
  const first = newNaming ? FIRST_STORY_PAGE_NEW_NAMING : FIRST_STORY_PAGE;
  const spreads = links.filter((link) => (pageNumber(link) ?? 0) >= first).slice(0, pageCount);
  const cover = links.find((link) => /_cover\.|_Page_01\./i.test(link)) ?? links[0];
  return { url, cover, spreads, credits };
}

export async function fetchBookDashWebPage(
  slug: string,
  pageCount: number,
  fetchImpl: WebFetch = fetch,
): Promise<BookDashWebPage> {
  const url = bookDashWebUrl(slug);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  return parseBookDashWebPage(await response.text(), url, pageCount);
}

/** Downloads one picture of the site's uploads folder, checked to really be an image. */
export async function fetchBookDashWebImage(
  url: string,
  fetchImpl: WebFetch = fetch,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!url.startsWith(UPLOADS) || url.includes("..")) throw new Error(`${url} is not a Book Dash upload`);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > IMPORT_LIMITS.imageBytes) throw new Error(`${url} is too large`);
  const contentType = detectImageType(bytes);
  if (!contentType || contentType === "image/svg+xml") throw new Error(`${url} is not an image`);
  return { bytes, contentType };
}
