import type { MetadataRoute } from "next";

/** Web app manifest, served at /manifest.webmanifest and linked from every page by Next.js. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "הסיפור שלי: סיפורים לילדים",
    short_name: "הסיפור שלי",
    description: "סיפורים לילדים בעברית לקרוא ולשמוע, גם בלי רשת.",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fff8ec",
    theme_color: "#fff8ec",
    categories: ["books", "education", "kids"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "המדף שלי", url: "/me", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      {
        name: "ספרים בלי רשת",
        url: "/offline",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
