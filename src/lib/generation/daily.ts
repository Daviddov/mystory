/**
 * The daily story: one generated book per day, saved as 'pending' so it lands
 * in the editors' approval queue. Nothing is published automatically.
 *
 * The heroes are invented animal characters, never real children. No
 * "server-only" imports: used by scripts/daily-story.ts and by the cron route.
 */
import type { Repository } from "../repo/types";
import { SYSTEM_OWNER_ID, type AgeGroup, type GenerationJob } from "../types";
import { WizardInputSchema, type WizardInput } from "./input";
import { DAILY_STYLE_SLUGS } from "./options";
import { runGeneration, type PipelineDeps, type PipelineResult } from "./pipeline";
import { isJobStale, settleStaleJob } from "./stale";

interface DailySeed {
  name: string;
  gender: "boy" | "girl";
  appearance: string;
  idea: string;
  category: string;
}

const DAILY_SEEDS: readonly DailySeed[] = [
  { name: "קיפי", gender: "boy", appearance: "קיפוד קטן עם משקפיים עגולים וצעיף אדום", idea: "קיפוד שמחפש חבר שלא מפחד מקוצים", category: "friendship" },
  { name: "נוגה", gender: "girl", appearance: "ינשופה צעירה עם נוצות אפורות ועיניים גדולות", idea: "ינשופה שלא מצליחה להירדם ביום", category: "bedtime" },
  { name: "פילפל", gender: "boy", appearance: "פילון אפור קטן עם אוזניים גדולות וכובע צהוב", idea: "פילון שלומד להתיז מים בחדק", category: "overcoming" },
  { name: "תותי", gender: "girl", appearance: "ארנבת לבנה עם סרט ורוד וסל קש קטן", idea: "ארנבת ששותלת את הגזר הראשון שלה ומחכה שיצמח", category: "nature" },
  { name: "זוזו", gender: "boy", appearance: "קוף קטן וחום עם אפוד כחול", idea: "קוף שמצחיק את כל היער ביום גשום", category: "humor" },
  { name: "שירה", gender: "girl", appearance: "צבה ירוקה עם שריון מנוקד ותרמיל גב קטן", idea: "צבה שיוצאת למסע אל הים, צעד אחרי צעד", category: "adventures" },
  { name: "דובי", gender: "boy", appearance: "דובון חום ורך עם פיג׳מה מפוספסת", idea: "דובון שעובר לישון במיטה של גדולים", category: "transitions" },
  { name: "לילי", gender: "girl", appearance: "דרקונית סגולה קטנה עם כנפיים זעירות", idea: "דרקונית שנושפת בועות סבון במקום אש", category: "fantasy" },
  { name: "גורי", gender: "boy", appearance: "גור כלבים מנומר עם קולר ירוק", idea: "גור שלומד לסדר את הצעצועים שלו לבד", category: "home-education" },
  { name: "מיקה", gender: "girl", appearance: "חתולה ג׳ינג׳ית עם פעמון קטן על הצוואר", idea: "חתולה שסופרת כוכבים ולומדת את המספרים", category: "educational" },
  { name: "ברווזי", gender: "boy", appearance: "ברווזון צהוב עם מגפיים כחולים", idea: "ברווזון שמצא כפפה אבודה ומחפש את בעליה", category: "values" },
  { name: "שועלי", gender: "girl", appearance: "שועלה כתומה קטנה עם זנב עבות ומעיל ירוק", idea: "שועלה שמגלה מי משאיר עקבות בשלג", category: "animals" },
];

const AGE_ROTATION: readonly AgeGroup[] = ["3-5", "0-2", "6-8"];

/** Calendar day in Israel as YYYY-MM-DD. */
export function israelDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(date);
}

function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

/** Deterministic story request for a calendar day. */
export function dailyInput(day: string): WizardInput {
  const n = dayNumber(day);
  const seed = DAILY_SEEDS[((n % DAILY_SEEDS.length) + DAILY_SEEDS.length) % DAILY_SEEDS.length];
  return WizardInputSchema.parse({
    childName: seed.name,
    childGender: seed.gender,
    hobbies: [],
    appearance: seed.appearance,
    idea: seed.idea,
    ageGroup: AGE_ROTATION[Math.abs(n) % AGE_ROTATION.length],
    category: seed.category,
    style: DAILY_STYLE_SLUGS[Math.abs(n) % DAILY_STYLE_SLUGS.length],
  });
}

export type DailyStart =
  | { skipped: true; job: GenerationJob }
  | { skipped: false; job: GenerationJob; run: () => Promise<PipelineResult> };

/**
 * Creates today's daily job and returns a function that runs it. When a daily
 * job for the same day already exists and did not fail, nothing is created
 * (pass `force` to generate another one).
 *
 * A job of today that was killed mid-run (timeout, deploy) would otherwise
 * block the day for good, so a job that stopped reporting is settled first:
 * it becomes 'done' when its book was saved (still skipped) and 'failed'
 * otherwise (a new job starts). `isRunningHere` protects jobs of this process.
 */
export async function startDailyStory(
  deps: PipelineDeps & {
    repo: Pick<Repository, "createBook" | "updateJob" | "createJob" | "listJobs" | "getBookById">;
  },
  options: { now?: Date; force?: boolean; isRunningHere?: (jobId: string) => boolean } = {},
): Promise<DailyStart> {
  const now = options.now ?? new Date();
  const day = israelDay(now);
  if (!options.force) {
    const todays = (await deps.repo.listJobs({ kind: "daily" })).filter((job) => job.input?.day === day);
    for (const job of todays) {
      const settled = isJobStale(job, options.isRunningHere, now.getTime())
        ? await settleStaleJob(deps.repo, job)
        : job;
      if (settled.status !== "failed") return { skipped: true, job: settled };
    }
  }
  const input = dailyInput(day);
  const job = await deps.repo.createJob({
    ownerId: SYSTEM_OWNER_ID,
    kind: "daily",
    input: { day, ageGroup: input.ageGroup, category: input.category, style: input.style },
    message: "הסיפור היומי ממתין בתור",
  });
  return {
    skipped: false,
    job,
    run: () =>
      runGeneration(deps, {
        jobId: job.id,
        ownerId: SYSTEM_OWNER_ID,
        input,
        status: "pending",
        source: `הסיפור היומי (${day}), נוצר אוטומטית וממתין לאישור עורך`,
      }),
  };
}
