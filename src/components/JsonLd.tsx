import { jsonLdString } from "@/lib/seo";

/** schema.org structured data for search engines. Server Components only. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
