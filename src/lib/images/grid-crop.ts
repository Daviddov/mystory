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
}

export interface GridPanel {
  bytes: Uint8Array;
  contentType: "image/png";
  width: number;
  height: number;
  row: number;
  col: number;
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

/** Standard deviation of the grey value along one column (axis "x") or row (axis "y") span. */
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
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean));
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

  const rowSpans = spans(raw, "y", H, rows, 0, W);
  const panels: GridPanel[] = [];
  for (let row = 0; row < rows; row++) {
    const [y0, y1] = rowSpans[row];
    const colSpans = spans(raw, "x", W, cols, y0, y1);
    for (let col = 0; col < cols; col++) {
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
      });
      if (width < MIN_PANEL_WIDTH) {
        warnings.push(`פאנל ${number} צר (${width} פיקסלים) והאיור יצא בחדות נמוכה.`);
      }
    }
  }
  return { panels, warnings };
}
