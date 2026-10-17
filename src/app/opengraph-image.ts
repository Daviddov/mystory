import { OG_SIZE, siteShareImage } from "@/lib/og-image";

// Default share image for every page that has no image of its own.
export const alt = "הסיפור שלי: סיפורים לילדים";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return siteShareImage();
}
