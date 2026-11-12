/**
 * Cuts one generated grid picture (several illustrations in one image) into
 * one PNG per panel. A TypeScript port of
 * .claude/skills/ai-picture-book/scripts/crop-grid.py:
 *
 *  - the cut lines are searched in a window of about 6% around each equal
 *    split, at the plainest (lowest-variance) row or column, then widened to
 *    the whole plain band and cut in its middle, so the model does not have to
 *    draw exact cells;
 *  - vertical cuts are searched per row, inside that row's own band;
 *  - every panel is trimmed by `trim` px to drop gutter bleed;
 *  - with `aspect` (width / height) each panel is then centre-cropped to it.
 *
 * Panels come in reading order (left to right, top to bottom). No "server-only"
 * import. The analysis samples at most ~400 points per line, so it is fast.
 */
import sharp from "sharp";

export interface GridCropOptions {
  cols: number;
  rows: number;
  /** Pixels trimmed off every side of every panel. Default 6. */
  trim?: number;
  /** Width / height to centre-crop every panel to, e.g. 4 / 3. */
  aspect?: number;
  /**
   * How many panels are really drawn (the rest of the grid is blank). With it the cut lines follow
   * the drawn content, so a model that drew fewer or uneven rows still gets cut right.
   */
  count?: number;
}

export interface GridPanel {
  bytes: Uint8Array;
  contentType: "image/png";
  width: number;
  height: number;
  row: number;
  col: number;
  /** A white gutter line runs through the panel: the cut fell inside a picture or between two. */
  suspect: boolean;
}

export interface GridCropResult {
  panels: GridPanel[];
  warnings: string[];
}

/** A panel narrower than this is reported as too small. */
export const MIN_PANEL_WIDTH = 400;

/** How much noisier than the plainest line a line may be and still count as gutter. */
const BAND_TOLERANCE = 8;
const MAX_SAMPLES = 400;

interface Band {
  lo: number;
  hi: number;
}

interface Raw {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

/**
 * How far one column (axis "x") or row (axis "y") span is from a plain white gutter line: the
 * standard deviation of its grey value, plus a penalty for being darker than white. 0 = clean white.
 */
function lineScore(raw: Raw, axis: "x" | "y", pos: number, from: number, to: number): number {
  const length = Math.max(1, to - from);
  const step = Math.max(1, Math.ceil(length / MAX_SAMPLES));
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let t = from; t < to; t += step) {
    const x = axis === "x" ? pos : t;
    const y = axis === "x" ? t : pos;
    const i = (y * raw.width + x) * raw.channels;
    const grey = raw.channels >= 3 ? (raw.data[i] + raw.data[i + 1] + raw.data[i + 2]) / 3 : raw.data[i];
    n++;
    sum += grey;
    sumSq += grey * grey;
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean)) + Math.max(0, 240 - mean) * 0.5;
}

/**
 * The `parts - 1` plain gutter bands along one axis. axis "x": vertical cuts, scored inside the
 * band [from, to) of rows; axis "y": horizontal cuts across [from, to) of columns.
 */
function findBands(raw: Raw, axis: "x" | "y", total: number, parts: number, from: number, to: number): Band[] {
  const cuts: Band[] = [];
  const win = Math.max(6, Math.round(total * 0.06));
  for (let k = 1; k < parts; k++) {
    const expect = Math.round((total * k) / parts);
    const lo0 = Math.max(1, expect - win);
    const hi0 = Math.min(total - 1, expect + win);
    let best = expect;
    let bestScore = Infinity;
    for (let p = lo0; p < hi0; p++) {
      const score = lineScore(raw, axis, p, from, to);
      if (score < bestScore) {
        best = p;
        bestScore = score;
      }
    }
    let lo = best;
    let hi = best;
    while (lo - 1 >= lo0 && lineScore(raw, axis, lo - 1, from, to) <= bestScore + BAND_TOLERANCE) lo--;
    while (hi + 1 < hi0 && lineScore(raw, axis, hi + 1, from, to) <= bestScore + BAND_TOLERANCE) hi++;
    cuts.push({ lo, hi });
  }
  return cuts;
}

/** The plain margin at one end of an axis, scanned at most `limit` lines in. */
function margin(raw: Raw, axis: "x" | "y", total: number, from: number, to: number, fromEnd: boolean): number {
  const limit = Math.round(total * 0.06);
  let n = 0;
  while (n < limit) {
    const pos = fromEnd ? total - 1 - n : n;
    if (lineScore(raw, axis, pos, from, to) > BAND_TOLERANCE) break;
    n++;
  }
  return n;
}

/** Cell spans between the gutters: from the end of one plain band to the start of the next. */
function spans(raw: Raw, axis: "x" | "y", total: number, parts: number, from: number, to: number): [number, number][] {
  const bands = findBands(raw, axis, total, parts, from, to);
  const starts = [margin(raw, axis, total, from, to, false), ...bands.map((b) => b.hi + 1)];
  const ends = [...bands.map((b) => b.lo), total - margin(raw, axis, total, from, to, true)];
  return starts.map((start, i) => [start, ends[i]] as [number, number]);
}

/**
 * The stretches of the image that hold drawing, found from the white lines between them instead of
 * from an equal split. Short white gaps inside a picture do not split it; specks are ignored.
 */
function contentRuns(raw: Raw, axis: "x" | "y", total: number, from: number, to: number): [number, number][] {
  const minGap = Math.max(3, Math.round(total * 0.003));
  const minLength = Math.max(8, Math.round(total * 0.04));
  const runs: [number, number][] = [];
  let start = -1;
  let last = -1;
  for (let p = 0; p < total; p++) {
    if (lineScore(raw, axis, p, from, to) > BAND_TOLERANCE) {
      if (start < 0) start = p;
      last = p;
    } else if (start >= 0 && p - last > minGap) {
      runs.push([start, last + 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, last + 1]);
  return runs.filter(([a, b]) => b - a >= minLength);
}

/**
 * True when a white gutter line runs across the inside of a panel (not at its edges): the panel
 * then shows parts of two pictures, or a picture cut in two.
 */
function hasInnerGutter(raw: Raw, left: number, top: number, width: number, height: number): boolean {
  const run = (axis: "x" | "y", length: number, from: number, to: number, base: number): boolean => {
    const need = Math.max(3, Math.round(length * 0.012));
    let streak = 0;
    for (let p = Math.round(length * 0.1); p < Math.round(length * 0.9); p++) {
      if (lineScore(raw, axis, base + p, from, to) <= BAND_TOLERANCE) {
        if (++streak >= need) return true;
      } else {
        streak = 0;
      }
    }
    return false;
  };
  return run("y", height, left, left + width, top) || run("x", width, top, top + height, left);
}

export async function cropGrid(bytes: Uint8Array, options: GridCropOptions): Promise<GridCropResult> {
  const { cols, rows, aspect } = options;
  const trim = options.trim ?? 6;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new Error("cropGrid: cols and rows must be positive integers");
  }
  const { data, info } = await sharp(bytes, { failOn: "none" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw: Raw = { data, width: info.width, height: info.height, channels: info.channels };
  const W = raw.width;
  const H = raw.height;
  const warnings: string[] = [];

  const filled = Math.min(rows * cols, Math.max(1, options.count ?? rows * cols));
  const usedRows = Math.ceil(filled / cols);
  // Cut along the drawn content when it matches what was asked for; otherwise fall back to an equal split.
  const drawnRows = options.count === undefined ? [] : contentRuns(raw, "y", H, 0, W);
  const byContent = drawnRows.length === usedRows;
  const rowSpans = byContent ? drawnRows : spans(raw, "y", H, rows, 0, W);
  const panels: GridPanel[] = [];
  for (let row = 0; row < (byContent ? usedRows : rows); row++) {
    const [y0, y1] = rowSpans[row];
    const wanted = byContent ? Math.min(cols, filled - row * cols) : cols;
    const drawnCols = byContent ? contentRuns(raw, "x", W, y0, y1) : [];
    const colSpans = drawnCols.length === wanted ? drawnCols : spans(raw, "x", W, cols, y0, y1);
    for (let col = 0; col < wanted; col++) {
      const [x0, x1] = colSpans[col];
      const number = row * cols + col + 1;
      let left = x0 + trim;
      let top = y0 + trim;
      let width = x1 - x0 - 2 * trim;
      let height = y1 - y0 - 2 * trim;
      if (width < 8 || height < 8) {
        warnings.push(`פאנל ${number} קטן מדי ונדחה.`);
        continue;
      }
      if (aspect) {
        if (width / height > aspect) {
          const nw = Math.round(height * aspect);
          left += Math.floor((width - nw) / 2);
          width = nw;
        } else {
          const nh = Math.round(width / aspect);
          top += Math.floor((height - nh) / 2);
          height = nh;
        }
      }
      const suspect = hasInnerGutter(raw, left, top, width, height);
      const png = await sharp(raw.data, { raw: { width: W, height: H, channels: raw.channels as 3 } })
        .extract({ left, top, width, height })
        .png()
        .toBuffer();
      panels.push({
        bytes: new Uint8Array(png.buffer, png.byteOffset, png.byteLength),
        contentType: "image/png",
        width,
        height,
        row,
        col,
        suspect,
      });
      if (suspect) warnings.push(`פאנל ${number} נחתך כנראה לא נכון: יש בו פס לבן באמצע.`);
      if (width < MIN_PANEL_WIDTH) {
        warnings.push(`פאנל ${number} צר (${width} פיקסלים) והאיור יצא בחדות נמוכה.`);
      }
    }
  }
  return { panels, warnings };
}
