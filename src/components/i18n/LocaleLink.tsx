"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { localizedPath } from "@/lib/i18n/paths";
import { useLocale } from "./LocaleProvider";

/**
 * next/link that keeps English visitors on the English addresses: in the
 * English interface a link to a page that has an English twin (/book/x) points
 * to it (/en/book/x), so search engines crawling the English pages find the
 * rest of them. Every other link, and every link in Hebrew, is unchanged.
 */
export default function LocaleLink({ href, ...props }: ComponentProps<typeof Link>) {
  const locale = useLocale();
  return <Link href={typeof href === "string" ? localizedPath(href, locale) : href} {...props} />;
}
