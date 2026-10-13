import type { Metadata, Viewport } from "next";
import { Frank_Ruhl_Libre, Rubik } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { AppShellExtras } from "@/components/pwa/AppShellExtras";
import { siteUrl } from "@/lib/config";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Interface font: rounded, friendly and very readable in Hebrew.
const uiFont = Rubik({
  subsets: ["hebrew", "latin"],
  variable: "--font-ui",
  display: "swap",
});

// Story font: a book face whose vowel points (nikud) sit correctly under the letters.
const storyFont = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  variable: "--font-story-face",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "הסיפור שלי: סיפורים לילדים", template: "%s | הסיפור שלי" },
  description: "סיפורים לילדים בעברית לקרוא ולשמוע, ומקום קל ליצור ולהעלות ספרים משלכם.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ color: "#fff8ec" }],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="he"
      dir="rtl"
      data-theme="day"
      className={`${uiFont.variable} ${storyFont.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        >
          דילוג לתוכן
        </a>
        <SiteHeader />
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
        <SiteFooter />
        <AppShellExtras />
      </body>
    </html>
  );
}
