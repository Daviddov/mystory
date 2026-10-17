/**
 * Share images (Open Graph / Twitter cards): 1200x630 PNG.
 *
 * Social networks and messaging apps reject SVG and handle WebP poorly, and a
 * 3:4 cover is cropped badly in a wide card, so the cover is drawn whole in
 * the middle of a blurred, enlarged copy of itself. No text is drawn: the
 * title travels in og:title, and the image renderer has no Hebrew (RTL) support.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export const OG_SIZE = { width: 1200, height: 630 } as const;

const BRAND_BACKGROUND = "#fff8ec";
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

type Sharp = (typeof import("sharp"))["default"];

async function loadSharp(): Promise<Sharp | null> {
  try {
    const mod = await import("sharp");
    return mod.default ?? (mod as unknown as Sharp);
  } catch {
    return null;
  }
}

function png(bytes: Uint8Array | Buffer, maxAge: number): Response {
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=86400` },
  });
}

/** The site's own card: the app icon on the brand background. */
export async function siteShareImage(): Promise<Response> {
  const sharp = await loadSharp();
  const icon = await readFile(path.join(process.cwd(), "public", "icons", "icon-512.png"));
  if (!sharp) return png(icon, 3600);
  const logo = await sharp(icon).resize(420, 420, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const out = await sharp({ create: { ...OG_SIZE, channels: 4, background: BRAND_BACKGROUND } })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer();
  return png(out, 86400);
}

/** A book's card from its cover bytes, or the site card when the cover cannot be read. */
export async function coverShareImage(cover: { bytes: Uint8Array; contentType: string } | null): Promise<Response> {
  const sharp = await loadSharp();
  if (!sharp || !cover || cover.bytes.length === 0 || cover.bytes.length > MAX_INPUT_BYTES) return siteShareImage();
  try {
    const isSvg = cover.contentType.includes("svg");
    const source = () => sharp(cover.bytes, { density: isSvg ? 200 : undefined, limitInputPixels: 50_000_000 }).rotate();
    const backdrop = await source()
      .resize(OG_SIZE.width, OG_SIZE.height, { fit: "cover" })
      .blur(28)
      .modulate({ brightness: 0.85 })
      .toBuffer();
    const front = await source()
      .resize({ height: OG_SIZE.height - 50, width: OG_SIZE.width - 100, fit: "inside" })
      .png()
      .toBuffer();
    const out = await sharp(backdrop)
      .composite([{ input: front, gravity: "centre" }])
      .flatten({ background: BRAND_BACKGROUND })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return png(out, 86400);
  } catch (err) {
    console.warn("[og-image] could not render a cover", err);
    return siteShareImage();
  }
}
