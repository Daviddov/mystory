import Link from "next/link";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { SectionTitle } from "./SectionTitle";
import { AGE_GROUP_INFO, READING_TIME_BUCKETS } from "@/lib/taxonomy";

const TILE =
  "group relative flex h-full min-h-touch-lg items-center gap-4 overflow-hidden rounded-[1.5rem] p-5 shadow-card " +
  "transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-lift active:scale-[0.98]";

const AGE_TONES = [
  "bg-gradient-to-br from-accent-soft to-surface",
  "bg-gradient-to-br from-secondary-soft to-surface",
  "bg-gradient-to-br from-primary-soft to-surface",
];

/** Three large entry tiles, one per age group. */
export function AgeTiles({ className }: { className?: string }) {
  return (
    <section aria-labelledby="age-tiles-title" className={cn("flex flex-col gap-4", className)}>
      <SectionTitle id="age-tiles-title" emoji="🎂">
        בוחרים לפי גיל
      </SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {AGE_GROUP_INFO.map((age, index) => (
          <li key={age.slug}>
            <Link href={routes.age(age.slug)} className={cn(TILE, "sm:min-h-36", AGE_TONES[index % AGE_TONES.length])}>
              <span
                aria-hidden="true"
                className="flex size-16 shrink-0 items-center justify-center rounded-full bg-surface text-4xl shadow-card transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110 sm:size-20 sm:text-5xl"
              >
                {age.emoji}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-display text-2xl font-semibold">{age.label}</span>
                <span className="leading-snug text-muted">{age.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Reading-time entry tiles: "how much time do we have?". */
export function TimeTiles({ className }: { className?: string }) {
  return (
    <section aria-labelledby="time-tiles-title" className={cn("flex flex-col gap-4", className)}>
      <SectionTitle id="time-tiles-title" emoji="⏱️">
        כמה זמן יש לנו?
      </SectionTitle>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {READING_TIME_BUCKETS.map((bucket) => (
          <li key={bucket.slug}>
            <Link
              href={routes.time(bucket.slug)}
              className={cn(TILE, "flex-col justify-center gap-2 bg-surface text-center ring-1 ring-border/70")}
            >
              <span
                aria-hidden="true"
                className="flex size-16 items-center justify-center rounded-full border-4 border-primary-soft font-display text-2xl font-bold text-primary transition-colors group-hover:border-primary"
              >
                {bucket.slug === "20" ? "20+" : bucket.slug}
              </span>
              <span className="text-lg font-semibold">{bucket.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
