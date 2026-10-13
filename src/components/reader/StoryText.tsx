"use client";

import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { cn } from "@/lib/cn";
import { layoutWords } from "@/lib/reader/logic";

export interface StoryTextProps {
  text: string;
  /** Index (in splitWords order) of the word being narrated, or -1. */
  activeWord: number;
  /** When given, every word can be tapped to hear it. */
  onWordTap?: (index: number) => void;
  className?: string;
  /** Language of the text. Default 'he'. An imported book that was not translated yet is left-to-right. */
  lang?: "he" | "en";
}

/**
 * The text of one page. Each word is its own span so the narrated word can be
 * highlighted and tapped; screen readers still read whole lines.
 */
export function StoryText({ text, activeWord, onWordTap, className, lang = "he" }: StoryTextProps) {
  const lines = useMemo(() => layoutWords(text), [text]);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the narrated word visible when a long page scrolls.
  useEffect(() => {
    if (activeWord < 0) return;
    const word = rootRef.current?.querySelector<HTMLElement>(`[data-word="${activeWord}"]`);
    word?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeWord]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!onWordTap) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-word]");
    if (!target) return;
    const index = Number(target.dataset.word);
    if (Number.isInteger(index)) onWordTap(index);
  }

  return (
    <div
      ref={rootRef}
      lang={lang}
      dir={lang === "he" ? "rtl" : "ltr"}
      onClick={handleClick}
      className={cn("story-text text-center text-foreground", className)}
    >
      {lines.map((line, lineIndex) => (
        <p key={lineIndex} className="m-0">
          {line.words.map((word, position) => (
            <span key={word.index}>
              {position > 0 ? " " : null}
              <span
                data-word={word.index}
                className={cn(
                  "rounded-[0.35em] transition-colors duration-100",
                  onWordTap && "cursor-pointer hover:bg-accent-soft",
                  word.index === activeWord && "word-highlight",
                )}
              >
                {word.text}
              </span>
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
