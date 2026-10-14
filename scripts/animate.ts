/**
 * Animates book illustrations from the command line ("bring illustrations to
 * life"): each page's picture becomes a short silent looping clip, written
 * into the data directory (default ./data).
 *
 *   npx tsx scripts/animate.ts <slug> [<slug> ...]   animate these books
 *   npx tsx scripts/animate.ts --all                 animate every book
 *     --force     animate again even when a page's clip matches its picture
 *     --pages 1,3 only these pages (1-based)
 *     --dry-run   only list the pages that would be animated and the estimated cost
 *     --remove    remove the clips instead (with --pages: only those pages)
 *
 * The provider follows the same env vars as the site (VIDEO_PROVIDER,
 * VIDEO_API_KEY, ...), read from the shell and then from .env.local and .env.
 * With none set the mock provider is used: the clip is a flat placeholder,
 * stored as videoSource "mock" so the reader shows a demo notice.
 * VIDEO_COST_PER_SECOND_USD overrides the price used for estimates.
 *
 * Books whose license forbids derivative works (ND) are never animated.
 * Only the local JSON repository is supported here.
 */
import path from "node:path";
import { mockVideoProvider } from "../src/lib/ai/mock";
import type { VideoProvider } from "../src/lib/ai/types";
import {
  animateBookWith,
  removeBookAnimationWith,
  videoCostPerSecondUsd,
} from "../src/lib/animation/pipeline";
import { rasterizeForVideo } from "../src/lib/animation/raster";
import { LocalMediaStore } from "../src/lib/media/local";
import { LocalRepository } from "../src/lib/repo/local";

const FLAGS = ["--force", "--all", "--dry-run", "--remove"];

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

async function pickVideo(): Promise<VideoProvider> {
  const name = env("VIDEO_PROVIDER")?.toLowerCase();
  if (name === undefined || name === "mock") return mockVideoProvider;
  return (await import("../src/lib/ai/providers/video")).createVideoProvider();
}

/** The site's own settings, so the script animates with the same provider. Variables already set win. */
function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(path.join(process.cwd(), file));
    } catch {
      // No such file.
    }
  }
}

function usd(value: number): string {
  return `$${value.toFixed(2)}`;
}

async function main(): Promise<void> {
  loadEnvFiles();
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const all = args.includes("--all");
  const dryRun = args.includes("--dry-run");
  const remove = args.includes("--remove");
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
  if (!all && slugs.length === 0) {
    console.error(
      "usage: tsx scripts/animate.ts <slug> [...] | --all  [--force] [--pages 1,3] [--dry-run] [--remove]",
    );
    process.exit(2);
  }
  if (env("NEXT_PUBLIC_SUPABASE_URL") && env("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    console.warn("warning: Supabase is configured, but this script only animates the LOCAL data directory.");
  }

  const dataDirOverride = env("DATA_DIR");
  const root = dataDirOverride ? path.resolve(dataDirOverride) : path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const media = new LocalMediaStore(root);

  const targets: { id: string; slug: string }[] = [];
  if (all) {
    const { books } = await repo.listBooks({ status: "any", sort: "title" });
    for (const book of books) targets.push({ id: book.id, slug: book.slug });
  }
  for (const slug of slugs) {
    const book = await repo.getBookBySlug(slug);
    if (!book) throw new Error(`no book with slug "${slug}"`);
    if (!targets.some((target) => target.id === book.id)) targets.push({ id: book.id, slug: book.slug });
  }

  console.log(`data:  ${root}`);
  if (remove) {
    for (const target of targets) {
      const result = await removeBookAnimationWith({ repo, media }, target.id, pages ? { pages } : {});
      const list = result.removed.map((index) => index + 1).join(", ");
      console.log(`${target.slug}: ${result.removed.length === 0 ? "no clips" : `removed the clips of pages ${list}`}`);
    }
    return;
  }

  const video = await pickVideo();
  const costPerSecondUsd = videoCostPerSecondUsd();
  console.log(
    `video: ${video.name}${video.isMock ? ' (mock: placeholder clips, stored as videoSource "mock")' : ` (estimate ${usd(costPerSecondUsd)}/s)`}`,
  );
  if (dryRun) console.log("dry run: nothing is generated or stored");

  let failed = 0;
  let totalCost = 0;
  let totalPages = 0;
  for (const target of targets) {
    console.log(`\n${target.slug}`);
    const summary = await animateBookWith({ repo, media, video, rasterize: rasterizeForVideo }, target.id, {
      force,
      dryRun,
      costPerSecondUsd,
      ...(pages ? { pages } : {}),
      onPage: (result, done, total) => {
        const detail =
          result.status === "animated"
            ? `${result.video} (${result.videoSource}, ${result.durationSeconds?.toFixed(1)}s, ${usd(result.costUsd ?? 0)})`
            : result.status === "skipped"
              ? `${result.reason}${result.reason === "would-animate" ? ` (${usd(result.costUsd ?? 0)})` : ""}`
              : result.error;
        console.log(`  [${done}/${total}] page ${result.pageIndex + 1}: ${result.status} ${detail ?? ""}`);
        for (const warning of result.warnings) console.log(`      warning: ${warning}`);
      },
    });
    if (summary.license) {
      console.log(`  not animated: the license forbids it (${summary.license.reason})`);
      continue;
    }
    console.log(
      dryRun
        ? `  would animate ${summary.pagesToAnimate} page(s), estimated ${usd(summary.estimatedCostUsd)}`
        : `  animated ${summary.animated}, skipped ${summary.skipped}, refused ${summary.refused}, failed ${summary.failed}, cost ${usd(summary.estimatedCostUsd)}`,
    );
    failed += summary.failed;
    totalCost += summary.estimatedCostUsd;
    totalPages += summary.pagesToAnimate;
    if (summary.quotaExceeded) {
      console.error("\n  stopped: the video provider's quota is used up. Run again later; finished pages are skipped.");
      break;
    }
  }
  if (targets.length > 1) {
    console.log(
      `\n${dryRun ? "would animate" : "animated"} ${totalPages} page(s) in total, ${dryRun ? "estimated" : "about"} ${usd(totalCost)}`,
    );
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
