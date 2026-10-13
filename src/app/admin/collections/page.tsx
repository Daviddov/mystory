import type { Metadata } from "next";
import { BookOfWeekPicker } from "@/components/admin/BookOfWeekPicker";
import { CollectionsManager } from "@/components/admin/CollectionsManager";
import { Card } from "@/components/ui";
import { getRepo } from "@/lib/repo";
import { requireAdminPage } from "../_lib/guard";
import { adminPaths } from "../_lib/paths";

export const metadata: Metadata = { title: "אוספים וספר השבוע" };
export const dynamic = "force-dynamic";

export default async function AdminCollectionsPage() {
  await requireAdminPage(adminPaths.collections());
  const repo = await getRepo();
  const [collections, { books }, settings] = await Promise.all([
    repo.listCollections(),
    repo.listBooks({ status: "any", sort: "title" }),
    repo.getSettings(),
  ]);
  const options = books.map((book) => ({
    id: book.id,
    title: book.title,
    status: book.status,
  }));
  const published = options.filter((book) => book.status === "published");
  const currentId = published.some((book) => book.id === settings.bookOfTheWeekId)
    ? (settings.bookOfTheWeekId ?? null)
    : null;

  return (
    <div className="flex flex-col gap-8">
      <Card as="section" aria-label="ספר השבוע">
        {/* The key resets the picker when the stored choice changes elsewhere. */}
        <BookOfWeekPicker key={currentId ?? "none"} books={published} currentId={currentId} />
      </Card>
      <CollectionsManager collections={collections} books={options} />
    </div>
  );
}
