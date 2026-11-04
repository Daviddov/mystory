import type { Metadata, Viewport } from "next";
import { Frank_Ruhl_Libre, Fredoka, Noto_Naskh_Arabic, Rubik } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { AppShellExtras } from "@/components/pwa/AppShellExtras";
import { seoEnv, siteUrl } from "@/lib/config";
import { localeDir } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { SITE_NAME_EN, SITE_TITLE_EN } from "@/lib/i18n/metadata";
import { getLocale } from "@/lib/i18n/server";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_TITLE } from "@/lib/seo";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Interface font: rounded, friendly and very readable in Hebrew.
const uiFont = Rubik({
  subsets: ["hebrew", "latin"],
  variable: "--font-ui",
  display: "swap",
});

// Display font for headings: round and playful, with Hebrew glyphs.
const displayFont = Fredoka({
  subsets: ["hebrew", "latin"],
  variable: "--font-display-face",
  display: "swap",
});

// Story font: a book face whose vowel points (nikud) sit correctly under the letters.
// Not preloaded: most pages have no story text above the fold, and every
// preloaded font competes with the cover image for the first paint (LCP).
const storyFont = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  variable: "--font-story-face",
  display: "swap",
  preload: false,
});

// Arabic books (text marked lang="ar"): a Naskh face whose vowel marks (harakat)
// stay clear at reading sizes. Not preloaded: only Arabic pages use it.
const arabicFont = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic-face",
  display: "swap",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const google = seoEnv.googleVerification();
  const bing = seoEnv.bingVerification();
  // The tab title follows the interface language; the rest is for search engines and stays Hebrew.
  const english = (await getLocale()) === "en";
  return {
    metadataBase: new URL(siteUrl()),
    applicationName: SITE_NAME,
    title: english
      ? { default: SITE_TITLE_EN, template: `%s | ${SITE_NAME_EN}` }
      : { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
    keywords: SITE_KEYWORDS,
    category: "סיפורי ילדים",
    // Defaults for every page; pages that set their own openGraph replace these
    // fields (pageMetadata() in lib/seo builds them), while the image comes
    // from the nearest opengraph-image file.
    openGraph: {
      siteName: SITE_NAME,
      type: "website",
      locale: "he_IL",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
    },
    twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
    verification: {
      google,
      other: bing ? { "msvalidate.01": bing } : undefined,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ color: "#fff8ec" }],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const plausibleDomain = seoEnv.plausibleDomain();
  // Always Hebrew on the static (force-static) pages, which see no cookies.
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={localeDir(locale)}
      data-theme="day"
      className={`${uiFont.variable} ${displayFont.variable} ${storyFont.variable} ${arabicFont.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <LocaleProvider locale={locale}>
          <a
            href="#main"
            className="sr-only z-50 rounded-full bg-primary font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:px-5 focus:py-3"
          >
            {getMessages(locale).site.skipToContent}
          </a>
          <SiteHeader />
          <div id="main" className="flex flex-1 flex-col">
            {children}
          </div>
          <SiteFooter />
          <AppShellExtras />
        </LocaleProvider>
        <Analytics />
        <SpeedInsights />
        {plausibleDomain ? (
          // Cookieless and without personal data, so no consent banner is needed.
          <Script
            defer
            data-domain={plausibleDomain}
            src={seoEnv.plausibleSrc() ?? "https://plausible.io/js/script.js"}
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}
