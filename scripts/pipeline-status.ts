/**
 * Prints what stands between the local books and the library, as the
 * "מסלול פרסום" screen of the admin console counts it.
 *
 *   tsx scripts/pipeline-status.ts [--details]
 *
 * --details also lists every unpublished book that lacks details, with what it lacks.
 */
import { inPipelineView, pipelineRow, PIPELINE_VIEWS } from "../src/app/admin/_lib/readiness";
import { openLocalRepository } from "./lib/local-books";

async function main(): Promise<void> {
  const details = process.argv.includes("--details");
  const repo = openLocalRepository();
  const rows = (await repo.listAllBooksWithPages()).map(pipelineRow);
  const published = rows.filter((row) => row.status === "published").length;
  console.log(`books: ${rows.length} (published ${published})`);
  for (const view of PIPELINE_VIEWS) {
    console.log(`${view}: ${rows.filter((row) => inPipelineView(row, view)).length}`);
  }
  const waiting = rows.filter((row) => inPipelineView(row, "narration"));
  const chars = waiting.reduce((sum, row) => sum + row.charsToNarrate, 0);
  const pages = waiting.reduce((sum, row) => sum + row.textPages - row.narratedPages, 0);
  console.log(`to narrate: ${pages} pages, ${chars} characters`);
  if (details) {
    for (const row of rows.filter((item) => inPipelineView(item, "details"))) {
      console.log(`  ${row.id} "${row.title}": ${row.missing.join(", ")}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
