/**
 * The rasterizer of the animation pipeline: SVG (and GIF/AVIF) illustrations
 * become a bitmap the video vendors accept, using the PDF's sharp-based
 * converter (../pdf/images.ts). Returns null when sharp is unavailable and the
 * file is not already PNG or JPEG.
 */
import { rasterizeForPdf } from "../pdf/images";
import type { Rasterizer } from "./pipeline";

export const rasterizeForVideo: Rasterizer = async (bytes, contentType) => {
  const raster = await rasterizeForPdf(bytes, contentType);
  if (!raster) return null;
  return { bytes: raster.bytes, contentType: raster.format === "png" ? "image/png" : "image/jpeg" };
};
