/**
 * Turns the text layer of one PDF page (pdf.js `getTextContent().items`) into
 * page text. Client-safe and free of pdf.js imports so it can be unit-tested.
 */

/** The fields of a pdf.js TextItem this module reads. Marked-content items have no `str`. */
export interface PdfTextItemLike {
  str?: string;
  hasEOL?: boolean;
  /** [a, b, c, d, x, y]; y grows upwards. */
  transform?: readonly number[];
  width?: number;
  height?: number;
  /** pdf.js's guess of the item's direction; "rtl" items are already in reading order. */
  dir?: string;
}

/** A vertical gap larger than this many line heights starts a new paragraph. */
const PARAGRAPH_GAP = 1.6;
/** A change of font size by more than this factor starts a new paragraph (title, caption). */
const FONT_SIZE_JUMP = 1.2;
/** A "space" narrower than this share of the line height is a kerning artefact, not a space. */
const MIN_SPACE_WIDTH = 0.15;

const RTL_LETTER = /[א-תؠ-ي]/g;
const LTR_LETTER = /[A-Za-z]/g;
/** Hebrew points and accents, and Arabic marks: they attach to the letter before them. */
const ONLY_MARKS = /^[\s֑-ׇֽֿׁׂًׅׄ-ٰٟ]+$/;
const STRONG_LTR = /[A-Za-z0-9]/;
const STRONG_OR_MARK = /[A-Za-z0-9֐-׿؀-ۿ]/;

interface LineItem {
  str: string;
  dir: string | undefined;
  x: number | undefined;
  width: number | undefined;
}

interface Line {
  items: LineItem[];
  y: number | undefined;
  height: number;
  /** An end-of-line flag was seen, so the next text starts a new line even at the same position. */
  closed: boolean;
}

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

function isSpace(item: LineItem): boolean {
  return item.str.trim() === "";
}

/** A zero-width item made only of vowel points: pdf.js reports points that are placed one by one this way. */
function isMark(item: LineItem): boolean {
  return !isSpace(item) && ONLY_MARKS.test(item.str);
}

/**
 * Some PDF writers (Chrome's, which most web-to-PDF exports use) place every
 * glyph of pointed Hebrew on its own, from left to right. pdf.js then returns
 * one item per glyph in that visual order, and the line reads backwards.
 */
function isVisualOrder(items: readonly LineItem[]): boolean {
  let leftToRight = 0;
  let rightToLeft = 0;
  let previous: number | undefined;
  for (const item of items) {
    if (item.x === undefined || isSpace(item) || isMark(item)) continue;
    if (previous !== undefined) {
      if (item.x > previous) leftToRight += 1;
      else if (item.x < previous) rightToLeft += 1;
    }
    previous = item.x;
  }
  return leftToRight > rightToLeft;
}

/** A base item with the vowel points that belong to it, or a space. */
interface Group {
  str: string;
  dir: string | undefined;
  marks: string;
  x: number | undefined;
  space: boolean;
}

/** Puts the items of a right-to-left line that arrived in visual order back into reading order. */
function toLogicalOrder(items: readonly LineItem[]): string {
  // In the left-to-right stream a point comes just before its letter, and the
  // point of a word's last letter even before the space that follows the word.
  const groups: Group[] = [];
  let pending = "";
  for (const item of items) {
    if (isMark(item)) pending += item.str;
    else if (isSpace(item))
      groups.push({
        str: item.str,
        dir: item.dir,
        marks: "",
        x: item.x,
        space: true,
      });
    else {
      groups.push({
        str: item.str,
        dir: item.dir,
        marks: pending,
        x: item.x,
        space: false,
      });
      pending = "";
    }
  }
  if (pending) {
    const last = groups.findLast((group) => !group.space);
    if (last) last.marks += pending;
  }

  // The stream is not always strictly left to right (a run in another style can
  // come early), so the positions decide the visual order.
  const visual = groups.every((group) => group.x !== undefined)
    ? groups
        .map((group, index) => ({ group, index }))
        .sort((p, q) => p.group.x! - q.group.x! || p.index - q.index)
        .map((entry) => entry.group)
    : groups;
  const reversed = [...visual].reverse();

  const isLtr = (group: Group) => !group.space && STRONG_LTR.test(group.str) && count(group.str, RTL_LETTER) === 0;
  const out: string[] = [];
  for (let i = 0; i < reversed.length; i += 1) {
    const group = reversed[i];
    if (isLtr(group)) {
      // A run of Latin words or numbers keeps its own left-to-right order.
      let end = i;
      for (let j = i + 1; j < reversed.length; j += 1) {
        if (isLtr(reversed[j])) end = j;
        else if (!reversed[j].space) break;
      }
      for (let j = end; j >= i; j -= 1) out.push(reversed[j].str + reversed[j].marks);
      i = end;
    } else if (
      !group.space &&
      (!STRONG_OR_MARK.test(group.str) || (group.dir === "ltr" && !STRONG_LTR.test(group.str)))
    ) {
      // Punctuation on its own, or with a Hebrew letter that pdf.js took for left-to-right
      // text, keeps the left-to-right order it was drawn in.
      out.push([...group.str].reverse().join("") + group.marks);
    } else {
      out.push(group.str + group.marks);
    }
  }
  return out.join("");
}

function lineText(line: Line): string {
  const items = line.items
    // Drop the zero-width "spaces" pdf.js inserts between glyphs that overlap.
    .filter(
      (item) =>
        !isSpace(item) || item.width === undefined || line.height <= 0 || item.width >= line.height * MIN_SPACE_WIDTH,
    )
    .map((item) => (isMark(item) ? { ...item, str: item.str.replace(/\s+/g, "") } : item));

  const joined = items.map((item) => item.str).join("");
  const rightToLeft = count(joined, RTL_LETTER) > count(joined, LTR_LETTER);
  const text = rightToLeft && isVisualOrder(items) ? toLogicalOrder(items) : joined;
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Lines that wrap inside one paragraph are joined with a space; a larger
 * vertical gap or a change of font size becomes a line break. Right-to-left
 * lines are returned in reading order, with every vowel point after its letter.
 */
export function textFromPdfItems(items: readonly PdfTextItemLike[]): string {
  const lines: Line[] = [];
  let current: Line | undefined;

  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const y = item.transform?.[5];
    const height = item.height && item.height > 0 ? item.height : 0;

    if (item.str.trim() !== "") {
      const reference = Math.max(height, current?.height ?? 0);
      const moved =
        current !== undefined &&
        current.y !== undefined &&
        y !== undefined &&
        reference > 0 &&
        Math.abs(y - current.y) > reference * 0.5;
      if (!current || current.closed || moved) {
        current = { items: [], y, height: 0, closed: false };
        lines.push(current);
      }
      if (current.y === undefined) current.y = y;
      current.height = Math.max(current.height, height);
    }

    if (current && !current.closed && item.str !== "") {
      current.items.push({
        str: item.str,
        dir: item.dir,
        x: item.transform?.[4],
        width: item.width,
      });
    }
    // A point can arrive just before the end-of-line marker of the line it starts; keep that line open.
    if (item.hasEOL && current && current.items.some((entry) => !isMark(entry))) current.closed = true;
  }

  let out = "";
  let previous: Line | undefined;
  for (const line of lines) {
    const text = lineText(line);
    if (text === "") continue;
    if (previous) {
      const gap = previous.y !== undefined && line.y !== undefined ? Math.abs(line.y - previous.y) : 0;
      const tall = Math.max(line.height, previous.height);
      const short = Math.min(line.height, previous.height);
      const newParagraph = tall > 0 && (gap > tall * PARAGRAPH_GAP || (short > 0 && tall / short > FONT_SIZE_JUMP));
      out += newParagraph ? "\n" : " ";
    }
    out += text;
    previous = line;
  }
  return out.normalize("NFC");
}
