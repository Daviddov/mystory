/**
 * Generates today's daily story and saves it as a 'pending' book, so it shows
 * up in the editors' approval queue. Nothing is published by this script.
 *
 *   npx tsx scripts/daily-story.ts            generate (skips when today's story exists)
 *   npx tsx scripts/daily-story.ts --force    generate another one for today
 *   npx tsx scripts/daily-story.ts --dry-run  print today's story request and exit
 *
 * Schedule it once a day (cron, Task Scheduler). It works on the local data
 * directory (DATA_DIR, default ./data). On a hosted deployment call
 * POST /api/generate/daily with the CRON_SECRET instead.
 *
 * Providers follow the same env vars as the site: without ANTHROPIC_API_KEY
 * the text is the labelled sample story, without IMAGE_PROVIDER the pictures
 * are labelled placeholders. The output says which were used.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { mockImageProvider, mockNikudProvider, mockTextProvider, mockTtsProvider } from "../src/lib/ai/mock";
import type { ImageProvider, NikudProvider, TextProvider, TtsProvider } from "../src/lib/ai/types";
import { dailyInput, israelDay, startDailyStory } from "../src/lib/generation/daily";
import type { PipelineDeps } from "../src/lib/generation/pipeline";
import { LocalMediaStore } from "../src/lib/media/local";
import { LocalRepository } from "../src/lib/repo/local";

function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(process.cwd(), file);
    if (!existsSync(full)) continue;
    try {
      process.loadEnvFile(full); // does not override variables that are already set
    } catch (err) {
      console.warn(`could not read ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

function configured(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

async function textProvider(): Promise<TextProvider> {
  if (!configured("ANTHROPIC_API_KEY")) return mockTextProvider;
  return (await import("../src/lib/ai/providers/claude-text")).createClaudeTextProvider();
}

async function imageProvider(): Promise<ImageProvider> {
  const vendor = configured("IMAGE_PROVIDER")?.toLowerCase();
  if (!vendor || vendor === "mock") return mockImageProvider;
  return (await import("../src/lib/ai/providers/image")).createImageProvider();
}

/** The narration pipeline is another module; the daily story is still saved when it cannot be loaded. */
async function narrator(repo: LocalRepository, media: LocalMediaStore): Promise<PipelineDeps["narrate"]> {
  try {
    let nikud: NikudProvider = mockNikudProvider;
    let tts: TtsProvider = mockTtsProvider;
    if (configured("NIKUD_PROVIDER")?.toLowerCase() === "dicta") {
      nikud = await (await import("../src/lib/ai/providers/dicta-nikud")).createDictaNikudProvider();
    }
    const ttsVendor = configured("TTS_PROVIDER")?.toLowerCase();
    if (ttsVendor && ttsVendor !== "mock") {
      tts = await (await import("../src/lib/ai/providers/tts")).createTtsProvider();
    }
    const { narrateBookWith } = await import("../src/lib/narration/pipeline");
    return (bookId) => narrateBookWith({ repo, media, nikud, tts }, bookId);
  } catch (err) {
    console.warn(`narration is not available (${err instanceof Error ? err.message : err}); saving without audio`);
    return undefined;
  }
}

async function main(): Promise<void> {
  loadEnvFiles();
  const args = new Set(process.argv.slice(2));
  const day = israelDay(new Date());

  if (args.has("--dry-run")) {
    console.log(JSON.stringify({ day, request: dailyInput(day) }, null, 2));
    return;
  }
  if (configured("NEXT_PUBLIC_SUPABASE_URL") && configured("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    throw new Error(
      "Supabase is configured, and this script only writes to the local data directory. " +
        "Call POST /api/generate/daily with the CRON_SECRET instead.",
    );
  }

  const root = configured("DATA_DIR") ? path.resolve(configured("DATA_DIR") as string) : path.join(process.cwd(), "data");
  const repo = new LocalRepository(root);
  const media = new LocalMediaStore(root);
  const [text, image, narrate] = await Promise.all([textProvider(), imageProvider(), narrator(repo, media)]);

  console.log(`daily story for ${day}: text provider "${text.name}", image provider "${image.name}"`);
  const started = await startDailyStory(
    { repo, media, text, image, narrate, log: (message) => console.log(message) },
    { force: args.has("--force") },
  );
  if (started.skipped) {
    console.log(`already generated today (job ${started.job.id}, status ${started.job.status}). Use --force to add another.`);
    return;
  }

  const { job, book } = await started.run();
  if (!book) {
    throw new Error(`generation failed: ${job.error ?? "unknown error"}`);
  }
  console.log(`saved "${book.title}" (${book.pages.length} pages) as ${book.status}: id ${book.id}, slug ${book.slug}`);
  if (job.usedMock) {
    console.log("NOTE: at least one mock provider was used, so this book contains sample text, placeholder art or silent audio.");
  }
  if (job.costUsd !== undefined) console.log(`estimated text cost: $${job.costUsd.toFixed(4)} (image cost is not reported)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
