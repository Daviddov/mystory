import sharp, { type OverlayOptions } from "sharp";
import { describe, expect, it } from "vitest";
import { cropGrid } from "./grid-crop";

const COLORS = [
  [220, 60, 60],
  [60, 200, 80],
  [60, 90, 220],
  [230, 200, 40],
  [150, 60, 200],
  [40, 190, 190],
  [240, 130, 40],
  [120, 120, 120],
  [200, 30, 120],
];

/** Striped colour panels on white gutters; column and row sizes slightly uneven. */
export async function makeGrid(colWidths: number[], rowHeights: number[], gutter: number): Promise<Buffer> {
  const W = colWidths.reduce((a, b) => a + b, 0) + gutter * (colWidths.length + 1);
  const H = rowHeights.reduce((a, b) => a + b, 0) + gutter * (rowHeights.length + 1);
  const overlays: OverlayOptions[] = [];
  let y = gutter;
  let n = 0;
  for (const h of rowHeights) {
    let x = gutter;
    for (const w of colWidths) {
      const [r, g, b] = COLORS[n++ % COLORS.length];
      const raw = Buffer.alloc(w * h * 3);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const k = (j * w + i) * 3;
          const f = (i + j) % 40 < 20 ? 1 : 0.7;
          raw[k] = r * f;
          raw[k + 1] = g * f;
          raw[k + 2] = b * f;
        }
      }
      overlays.push({ input: raw, raw: { width: w, height: h, channels: 3 }, left: x, top: y });
      x += w + gutter;
    }
    y += h + gutter;
  }
  return sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
    .composite(overlays)
    .png()
    .toBuffer();
}

describe("cropGrid", () => {
  it("cuts a 3x3 grid with uneven panels on white gutters", async () => {
    const grid = await makeGrid([520, 550, 530], [390, 410, 400], 24);
    const { panels, warnings } = await cropGrid(grid, { cols: 3, rows: 3, aspect: 4 / 3 });
    expect(panels).toHaveLength(9);
    expect([panels[4].row, panels[4].col]).toEqual([1, 1]);
    for (const [i, panel] of panels.entries()) {
      expect(panel.contentType).toBe("image/png");
      expect(Math.abs(panel.width / panel.height - 4 / 3)).toBeLessThan(0.01);
      // only the panel's own colour: no white gutter in the corners
      const { data, info } = await sharp(panel.bytes).raw().toBuffer({ resolveWithObject: true });
      const [r, g, b] = COLORS[i % COLORS.length];
      for (const [px, py] of [
        [0, 0],
        [info.width - 1, info.height - 1],
      ]) {
        const k = (py * info.width + px) * info.channels;
        expect(data[k]).toBeLessThanOrEqual(r + 1);
        expect(data[k + 1]).toBeLessThanOrEqual(g + 1);
        expect(data[k + 2]).toBeLessThanOrEqual(b + 1);
      }
    }
    expect(warnings).toEqual([]);
  });

  it("cuts 2x2 and warns about narrow panels", async () => {
    const grid = await makeGrid([300, 310], [240, 230], 20);
    const { panels, warnings } = await cropGrid(grid, { cols: 2, rows: 2 });
    expect(panels).toHaveLength(4);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("returns the whole image as one panel for 1x1", async () => {
    const grid = await makeGrid([500], [400], 10);
    const { panels } = await cropGrid(grid, { cols: 1, rows: 1, trim: 0 });
    expect(panels).toHaveLength(1);
    expect(panels[0].width).toBe(500);
  });
});
