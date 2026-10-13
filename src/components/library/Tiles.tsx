import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { AGE_GROUP_INFO, READING_TIME_BUCKETS } from "@/lib/taxonomy";

const TILE =
  "group flex h-full min-h-touch-lg items-center gap-4 rounded-lg border border-border p-4 shadow-card " +
  "transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98]";

function SectionHeading({ id, emoji, children }: { id: string; emoji: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-bold sm:text-3xl">
      <span aria-hidden="true">{emoji} </span>
      {children}
    </h2>
  );
}

const AGE_TONES = ["bg-accent-soft", "bg-secondary-soft", "bg-primary-soft"];

/** Three large entry tiles, one per age group. */
export function AgeTiles({ className }: { className?: string }) {
  return (
    <section aria-labelledby="age-tiles-title" className={cn("flex flex-col gap-4", className)}>
      <SectionHeading id="age-tiles-title" emoji="🎂">
        בוחרים לפי גיל
      </SectionHeading>
      <ul className="grid gap-3 sm:grid-cols-3">
        {AGE_GROUP_INFO.map((age, index) => (
          <li key={age.slug}>
            <Link href={routes.age(age.slug)} className={cn(TILE, AGE_TONES[index % AGE_TONES.length])}>
              <span aria-hidden="true" className="text-5xl leading-none">
                {age.emoji}
              </span>
              <span className="flex flex-col">
                <span className="text-xl font-extrabold">{age.label}</span>
                <span className="text-muted">{age.description}</span>
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
      <SectionHeading id="time-tiles-title" emoji="⏱️">
        כמה זמן יש לנו?
      </SectionHeading>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {READING_TIME_BUCKETS.map((bucket) => (
          <li key={bucket.slug}>
            <Link href={routes.time(bucket.slug)} className={cn(TILE, "flex-col justify-center gap-1 bg-surface text-center")}>
              <span className="text-4xl font-extrabold leading-none text-primary" aria-hidden="true">
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
