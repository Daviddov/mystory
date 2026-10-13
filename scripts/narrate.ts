/**
 * Narrates books from the command line: nikud -> speech -> stored audio and
 * word timings, written into the data directory (default ./data).
 *
 *   npx tsx scripts/narrate.ts <slug> [<slug> ...]   narrate these books
 *   npx tsx scripts/narrate.ts --all                 narrate every book
 *   npx tsx scripts/narrate.ts --seed                narrate the seeded sample books
 *     --force     narrate again even when a page is already narrated
 *     --pages 1,3 only these pages (1-based)
 *
 * Providers follow the same env vars as the site (NIKUD_PROVIDER, TTS_PROVIDER,
 * ...). tsx does not read .env.local, so export them in the shell first.
 * With none set the mock providers are used: the audio is SILENCE, stored as
 * audioSource "mock" so the reader shows a demo-voice notice.
 *
 * Only the local JSON repository is supported here.
 */
import path from "node:path";
import { mockNikudProvider, mockTtsProvider } from "../src/lib/ai/mock";
import type { NikudProvider, TtsProvider } from "../src/lib/ai/types";
import { LocalMediaStore } from "../src/lib/media/local";
import { narrateBookWith } from "../src/lib/narration/pipeline";
import { LocalRepository } from "../src/lib/repo/local";

const FLAGS = ["--force", "--all", "--seed"];

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

async function pickNikud(): Promise<NikudProvider> {
  if (env("NIKUD_PROVIDER")?.toLowerCase() !== "dicta") return mockNikudProvider;
  return (await import("../src/lib/ai/providers/dicta-nikud")).createDictaNikudProvider();
}

async function pickTts(): Promise<TtsProvider> {
  const name = env("TTS_PROVIDER")?.toLowerCase();
  if (name === undefined || name === "mock") return mockTtsProvider;
  return (await import("../src/lib/ai/providers/tts")).createTtsProvider();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const all = args.includes("--all");
  const seedOnly = args.includes("--seed");
  let pages: number[] | undefined;
  const slugs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--pages") {
      pages = (args[++i] ?? "")
        .split(",")
        .map((value) => Number(value.trim()) - 1)
        .filter((value) => Number.isInteger(value) && value >= 0);
      if (pages.length === 0) throw new Error("--pages needs a list of page numbers, e.g. --pages 1,3");
    } else if (arg.startsWith("--")) {
      if (!FLAGS.includes(arg)) throw new Error(`unknown option ${arg}`);
    } else slugs.push(arg);
  }
  if (!all && !seedOnly && slugs.length === 0) {
    console.error("usage: tsx scripts/narrate.ts <slug> [...] | --all | --seed  [--force] [--pages 1,3]");
    process.exit(2);
  }
  if (env("NEXT_PUBLIC_SUPABASE_URL") && env("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    console.warn("warning: Supabase is configured, but this script only narrates the LOCAL data directory.");
  }

  const dataDirOverride = env("DATA_DIR");
  const root = dataDirOverride ? path.resolve(dataDirOverride) : path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const media = new LocalMediaStore(root);
  const [nikud, tts] = await Promise.all([pickNikud(), pickTts()]);

  console.log(`data:  ${root}`);
  console.log(`nikud: ${nikud.name}${nikud.isMock ? " (mock: no nikud is added)" : ""}`);
  console.log(`tts:   ${tts.name}${tts.isMock ? ' (mock: SILENT demo audio, stored as audioSource "mock")' : ""}`);

  const targets: { id: string; slug: string }[] = [];
  if (all || seedOnly) {
    const { books } = await repo.listBooks({ status: "any", sort: "title" });
    for (const book of books) {
      if (!seedOnly || book.id.startsWith("seed-")) targets.push({ id: book.id, slug: book.slug });
    }
  }
  for (const slug of slugs) {
    const book = await repo.getBookBySlug(slug);
    if (!book) throw new Error(`no book with slug "${slug}"`);
    if (!targets.some((target) => target.id === book.id)) targets.push({ id: book.id, slug: book.slug });
  }

  let failed = 0;
  for (const target of targets) {
    console.log(`\n${target.slug}`);
    const summary = await narrateBookWith({ repo, media, nikud, tts }, target.id, {
      force,
      ...(pages ? { pages } : {}),
      onPage: (result, done, total) => {
        const detail =
          result.status === "narrated"
            ? `${result.audio} (${result.audioSource}, ${result.durationSeconds?.toFixed(1)}s, ${result.wordCount} words${result.nikudAdded ? ", nikud added" : ""})`
            : result.status === "skipped"
              ? result.reason
              : result.error;
        console.log(`  [${done}/${total}] page ${result.pageIndex + 1}: ${result.status} ${detail ?? ""}`);
        for (const warning of result.warnings) console.log(`      warning: ${warning}`);
      },
    });
    console.log(`  narrated ${summary.narrated}, skipped ${summary.skipped}, failed ${summary.failed}`);
    failed += summary.failed;
  }
  if (failed > 0) {
    console.error(`\n${failed} page(s) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
