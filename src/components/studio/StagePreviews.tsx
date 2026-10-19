"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Chip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ILLUSTRATION_STYLES, NARRATION_STYLES, RULE_PACKS } from "@/lib/generation/presets";
import { hasNikud } from "@/lib/hebrew";
import { mediaUrl } from "@/lib/media/url";
import { CATEGORIES } from "@/lib/taxonomy";
import type { DetailsStatus } from "./types";

/** One page as the stages tab shows it. */
export interface CreatedPage {
  index: number;
  text: string;
  textNikud?: string;
  /** Media path (or a local preview URL) of the illustration. */
  image?: string;
  audio?: string;
  video?: string;
}

/** Everything that was already created, shown inside the stages. */
export interface CreatedSummary {
  pages: CreatedPage[];
  title: string;
  summary: string;
  tags: string[];
  categories: string[];
}

export const EMPTY_CREATED: CreatedSummary = { pages: [], title: "", summary: "", tags: [], categories: [] };

function subscribeReducedMotion(callback: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener?.("change", callback);
  return () => query.removeEventListener?.("change", callback);
}

/** True when the visitor asked for less motion; clips then show their still picture. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false),
    () => false,
  );
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-muted">{children}</p>;
}

/** Stage 1: the hero image, large enough to judge, and the description. */
export function HeroPreview({ imageUrl, description, large }: { imageUrl: string; description: string; large: boolean }) {
  if (!imageUrl && !description.trim()) return <Empty>עוד אין גיבור.</Empty>;
  return (
    <div className="flex flex-wrap items-start gap-3">
      {imageUrl ? (
        <a href={imageUrl} target="_blank" rel="noreferrer" className="shrink-0" aria-label="פתיחת תמונת הגיבור בגודל מלא">
          <img
            src={imageUrl}
            alt="תמונת הגיבור"
            loading="lazy"
            className={cn("rounded-md border border-border bg-surface object-contain", large ? "size-48" : "size-24")}
          />
        </a>
      ) : (
        <div className="flex size-24 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-border-strong text-center text-sm text-muted">
          אין תמונה
        </div>
      )}
      {description.trim() ? (
        <p className={cn("min-w-48 flex-1 text-sm leading-relaxed", !large && "line-clamp-4")}>{description}</p>
      ) : null}
    </div>
  );
}

/** Stage 2: title-less excerpt of the first pages, rhyme lines kept as lines. */
export function StoryPreview({ pages, onSeeAll }: { pages: CreatedPage[]; onSeeAll: () => void }) {
  const withText = pages.filter((page) => page.text.trim().length > 0);
  if (withText.length === 0) return <Empty>עוד אין טקסט בעמודים.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      <ol className="grid gap-2 sm:grid-cols-3">
        {withText.slice(0, 3).map((page) => (
          <li key={page.index} className="min-w-0 rounded-md border border-border bg-surface p-3">
            <span className="text-xs font-semibold text-muted">עמוד {page.index + 1}</span>
            <p className="line-clamp-4 whitespace-pre-line text-sm leading-relaxed">{page.text.trim()}</p>
          </li>
        ))}
      </ol>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>
          {withText.length} {withText.length === 1 ? "עמוד עם טקסט" : "עמודים עם טקסט"}
        </span>
        <button type="button" onClick={onSeeAll} className="min-h-11 rounded-full px-3 font-semibold text-secondary underline">
          לראות הכול בעמודים
        </button>
      </p>
    </div>
  );
}

/** Stage 3: the chosen style and rule packs as chips, with a swatch. */
export function StylePreview({ style, chosen, packs, notes }: { style: string; chosen: boolean; packs: string[]; notes?: string }) {
  const preset = ILLUSTRATION_STYLES.find((option) => option.slug === style);
  const packOptions = packs.map((slug) => RULE_PACKS.find((pack) => pack.slug === slug)).filter((pack) => !!pack);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-14 shrink-0 items-center justify-center rounded-md border border-border bg-accent-soft text-3xl"
      >
        {preset?.emoji ?? "🖌️"}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={chosen ? "primary" : "neutral"}>{preset?.label ?? style}</Chip>
          {packOptions.map((pack) => (
            <Chip key={pack.slug} tone="secondary" icon={pack.emoji}>
              {pack.label}
            </Chip>
          ))}
          {notes?.trim() ? <Chip tone="neutral">הנחיות משלכם</Chip> : null}
        </div>
        {!chosen ? <p className="text-sm text-muted">ברירת מחדל. עוד לא בחרתם.</p> : null}
      </div>
    </div>
  );
}

/** Stage 4: every page picture; a dashed placeholder with the page number where it is missing. */
export function PicturesPreview({
  pages,
  version,
  onOpen,
}: {
  pages: CreatedPage[];
  version?: string;
  onOpen: (index: number) => void;
}) {
  if (!pages.some((page) => page.image || page.text.trim())) return <Empty>עוד אין עמודים לאייר.</Empty>;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,5.5rem))] gap-2" aria-label="תמונות העמודים">
      {pages.map((page) => {
        const src = mediaUrl(page.image, version);
        return (
          <li key={page.index}>
            <button
              type="button"
              onClick={() => onOpen(page.index)}
              aria-label={src ? `עמוד ${page.index + 1}: פתיחה בעמודים` : `עמוד ${page.index + 1}: אין תמונה, פתיחה בעמודים`}
              data-testid={src ? "page-thumb" : "page-thumb-missing"}
              className={cn(
                "relative flex aspect-square min-h-11 w-full items-center justify-center overflow-hidden rounded-md",
                src ? "border border-border bg-surface" : "border-2 border-dashed border-border-strong text-muted hover:bg-surface",
              )}
            >
              {src ? (
                <>
                  <img src={src} alt="" loading="lazy" className="size-full object-cover" />
                  <span className="absolute start-1 top-1 rounded-full bg-overlay px-1.5 text-xs font-semibold text-white">
                    {page.index + 1}
                  </span>
                </>
              ) : (
                <span className="text-lg font-semibold">{page.index + 1}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Stage 5: a play button per narrated page, and the voice and style that are set. */
export function NarrationPreview({
  pages,
  version,
  styleSlug,
  voiceLabel,
}: {
  pages: CreatedPage[];
  version?: string;
  styleSlug: string;
  voiceLabel?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );
  const narrated = pages.filter((page) => page.audio);
  if (narrated.length === 0) return <Empty>עוד אין הקראה.</Empty>;
  const styleLabel = NARRATION_STYLES.find((option) => option.slug === styleSlug)?.label ?? styleSlug;

  const toggle = (page: CreatedPage) => {
    if (playing === page.index) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(mediaUrl(page.audio, version));
    audio.onended = () => setPlaying((current) => (current === page.index ? null : current));
    audio.onerror = () => setPlaying(null);
    audioRef.current = audio;
    setPlaying(page.index);
    void Promise.resolve(audio.play()).catch(() => setPlaying(null));
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-2" aria-label="הקראה לפי עמוד">
        {narrated.map((page) => (
          <li key={page.index}>
            <button
              type="button"
              onClick={() => toggle(page)}
              aria-pressed={playing === page.index}
              aria-label={`${playing === page.index ? "עצירת" : "השמעת"} ההקראה של עמוד ${page.index + 1}`}
              className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border-2 border-border-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-2"
            >
              {playing === page.index ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
              {page.index + 1}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        {narrated.length} עמודים מוקראים. הגדרה נוכחית: {styleLabel}
        {voiceLabel ? `, ${voiceLabel}` : ""}.
      </p>
    </div>
  );
}

/** Stage 6: one vocalized line. */
export function NikudPreview({ pages }: { pages: CreatedPage[] }) {
  const sample = pages.find((page) => page.text.trim() && page.textNikud && hasNikud(page.textNikud));
  if (!sample?.textNikud) return <Empty>עוד אין ניקוד.</Empty>;
  const line = sample.textNikud.split("\n").find((entry) => entry.trim()) ?? sample.textNikud;
  return (
    <p className="min-w-0 rounded-md border border-border bg-surface p-3 text-lg leading-loose">
      <span className="line-clamp-2">{line.trim()}</span>
      <span className="text-xs text-muted">עמוד {sample.index + 1}</span>
    </p>
  );
}

/** Stage 7: tiny looping muted clips; the still picture when motion is reduced. */
export function AnimationPreview({ pages, version }: { pages: CreatedPage[]; version?: string }) {
  const reduced = usePrefersReducedMotion();
  const clips = pages.filter((page) => page.video);
  if (clips.length === 0) return <Empty>עוד אין קליפים.</Empty>;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,7rem))] gap-2" aria-label="קליפים">
      {clips.map((page) => {
        const poster = mediaUrl(page.image, version);
        return (
          <li key={page.index} className="relative aspect-square overflow-hidden rounded-md border border-border bg-surface">
            {reduced && poster ? (
              <img src={poster} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <video
                src={mediaUrl(page.video, version)}
                poster={poster || undefined}
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
                aria-label={`קליפ של עמוד ${page.index + 1}`}
                className="size-full object-cover"
              />
            )}
            <span className="absolute start-1 top-1 rounded-full bg-overlay px-1.5 text-xs font-semibold text-white">
              {page.index + 1}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Stage 8: title, summary, tags and categories. */
export function DetailsPreview({ created, details }: { created: CreatedSummary; details: DetailsStatus }) {
  const categories = created.categories.map((slug) => CATEGORIES.find((category) => category.slug === slug));
  if (!created.title.trim() && !created.summary.trim() && created.tags.length === 0 && categories.length === 0) {
    return <Empty>עוד אין פרטים.</Empty>;
  }
  return (
    <div className="flex flex-col gap-2">
      {created.title.trim() ? <p className="font-semibold">{created.title}</p> : null}
      {created.summary.trim() ? <p className="line-clamp-3 text-sm leading-relaxed">{created.summary}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {categories.map((category, i) => (
          <Chip key={category?.slug ?? i} tone="secondary" icon={category?.emoji}>
            {category?.label ?? created.categories[i]}
          </Chip>
        ))}
        {created.tags.slice(0, 8).map((tag) => (
          <Chip key={tag}>{tag}</Chip>
        ))}
      </div>
      <p className="text-sm text-muted">
        {details.done} מתוך {details.total} פרטים מולאו.
      </p>
    </div>
  );
}

/** One page's picture, or its muted looping clip (a still picture when the user prefers reduced motion). */
export function PageClipThumb({ image, video, version, index }: { image?: string; video?: string; version?: string; index: number }) {
  const reduced = usePrefersReducedMotion();
  const poster = mediaUrl(image, version);
  return (
    <div className="relative size-20 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2">
      {video && !reduced ? (
        <video
          src={mediaUrl(video, version)}
          poster={poster || undefined}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          aria-label={`קליפ של עמוד ${index + 1}`}
          className="size-full object-cover"
        />
      ) : poster ? (
        <img src={poster} alt={`איור של עמוד ${index + 1}`} loading="lazy" className="size-full object-cover" />
      ) : null}
    </div>
  );
}
