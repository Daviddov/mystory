/**
 * Turns a stored illustration into something pdf-lib can embed. pdf-lib only
 * reads PNG and JPEG, while the library's own illustrations are SVG and
 * uploads may be WebP, GIF or AVIF, so everything goes through sharp.
 *
 * When sharp cannot be loaded, PNG and JPEG files are passed through as they
 * are and every other format returns null (the PDF then shows a visible
 * "illustration not available" box).
 */
import type { PdfRasterImage } from "./book-pdf";

/** Longest side of an embedded illustration, in pixels (about 230 dpi on the sheet). */
const MAX_SIDE = 1400;
/** Refuse absurd inputs before decoding. */
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

type Sharp = (typeof import("sharp"))["default"];

let sharpModule: Promise<Sharp | null> | null = null;

function loadSharp(): Promise<Sharp | null> {
  if (!sharpModule) {
    sharpModule = import("sharp")
      .then((mod) => mod.default ?? (mod as unknown as Sharp))
      .catch((err) => {
        console.warn("[pdf] sharp is not available; only PNG and JPEG illustrations can be embedded", err);
        return null;
      });
  }
  return sharpModule;
}

function sniff(bytes: Uint8Array): "png" | "jpeg" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}

export async function rasterizeForPdf(bytes: Uint8Array, contentType: string): Promise<PdfRasterImage | null> {
  if (bytes.length === 0 || bytes.length > MAX_INPUT_BYTES) return null;
  const sharp = await loadSharp();
  if (!sharp) {
    const format = sniff(bytes);
    return format ? { bytes, format } : null;
  }

  try {
    const isSvg = contentType.includes("svg");
    let input = sharp(bytes, { limitInputPixels: 50_000_000 });
    if (isSvg) {
      // Render the vector at print resolution instead of scaling up a 72 dpi bitmap.
      const meta = await input.metadata();
      const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
      if (longest > 0) {
        const density = Math.min(600, Math.max(72, Math.round((72 * MAX_SIDE) / longest)));
        input = sharp(bytes, { density, limitInputPixels: 50_000_000 });
      }
    }
    const meta = await input.metadata();
    const resized = input.rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true });
    if (meta.hasAlpha && !isSvg) {
      // Keep transparency for uploaded cut-out art.
      return { bytes: new Uint8Array(await resized.png({ compressionLevel: 9 }).toBuffer()), format: "png" };
    }
    const jpeg = await resized.flatten({ background: "#ffffff" }).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
    return { bytes: new Uint8Array(jpeg), format: "jpeg" };
  } catch (err) {
    console.warn("[pdf] could not convert an illustration", err);
    return null;
  }
}
