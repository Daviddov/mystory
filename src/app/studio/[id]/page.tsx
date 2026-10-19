import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudioEditor } from "@/components/studio/StudioEditor";
import { getAiStatus } from "@/lib/ai";
import { canEditBook, hasRole, requireUserPage } from "@/lib/auth";
import { buildCostContext } from "@/lib/generation/costs";
import { getRepo } from "@/lib/repo";
import { routes } from "@/lib/routes";
import { IdSchema } from "@/lib/types";

export const metadata: Metadata = { title: "עריכת ספר" };
export const dynamic = "force-dynamic";

export default async function StudioBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!IdSchema.safeParse(id).success) notFound();
  const user = await requireUserPage(routes.studioBook(id));
  const repo = await getRepo();
  const book = await repo.getBookById(id);
  // Someone else's book looks exactly like a missing one.
  if (!book || !canEditBook(book, user)) notFound();

  return <StudioEditor
      key={book.id}
      book={book}
      canPublish={hasRole(user, "editor")}
      costs={buildCostContext(getAiStatus(), process.env)}
    />;
}
