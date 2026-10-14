import type { Metadata } from "next";
import { MockNotice } from "@/components/MockNotice";
import { PipelineBoard } from "@/components/admin/PipelineBoard";
import { EmptyState } from "@/components/ui";
import { getAiStatus } from "@/lib/ai";
import { getRepo } from "@/lib/repo";
import { requireAdminPage } from "../_lib/guard";
import { adminPaths } from "../_lib/paths";
import { inPipelineView, pipelineRow, PIPELINE_VIEWS, type PipelineView } from "../_lib/readiness";

export const metadata: Metadata = { title: "מסלול פרסום" };
export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function AdminPipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage(adminPaths.pipeline());
  const viewParam = first((await searchParams).view);
  const initialView = PIPELINE_VIEWS.includes(viewParam as PipelineView) ? (viewParam as PipelineView) : "details";

  const repo = await getRepo();
  // Readiness depends on the pages (text, narration), so the books are read whole, in one pass.
  const rows = (await repo.listAllBooksWithPages())
    .map(pipelineRow)
    // A published, fully narrated book has left the pipeline.
    .filter((row) => PIPELINE_VIEWS.some((view) => inPipelineView(row, view)))
    .sort((a, b) => a.title.localeCompare(b.title, "he"));
  const ai = getAiStatus();

  return (
    <section aria-labelledby="pipeline-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="pipeline-heading" className="text-2xl font-bold">
          מסלול פרסום
        </h2>
        <p className="text-muted">
          מה חסר לכל ספר כדי להיכנס לספרייה, ופעולות על כמה ספרים יחד: פרטים, ניקוד והקראה, ופרסום.
        </p>
      </div>
      {ai.tts.isMock ? (
        <MockNotice kind="generic">
          שירות ההקראה לא מחובר, ולכן הקראה מכאן תיצור הקלטות שקטות לדוגמה. הגדירו TTS_PROVIDER כדי להקריא באמת.
        </MockNotice>
      ) : null}
      {ai.nikud.isMock ? <MockNotice kind="nikud" /> : null}
      {rows.length === 0 ? (
        <EmptyState icon="✅" title="אין ספרים במסלול" description="כל הספרים פורסמו ומוקראים." />
      ) : (
        <PipelineBoard rows={rows} initialView={initialView} ttsMock={ai.tts.isMock} />
      )}
    </section>
  );
}
