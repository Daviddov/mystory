"use client";

/**
 * The book grid of a listing with infinite scroll.
 *
 * The server renders the first page (the one in ?page=, usually 1) into the
 * HTML. In the browser a sentinel under the grid, watched by an
 * IntersectionObserver, loads the following pages from GET /api/library and
 * appends them until the last page.
 *
 * Without JavaScript (and for crawlers) the sentinel is a plain link to
 * ?page=<next> with rel="next", so every page stays reachable; on a deep
 * link (?page=3) a rel="prev" link leads back. With JavaScript the same link
 * is a manual "load more" button for when the observer does not fire.
 *
 * The parent gives it a `key` per listing (scope + query without the page),
 * so a change of filter, sort or search text starts over from fresh props.
 */
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { BookCard } from "@/components/BookCard";
import { BOOK_GRID_CLASSES } from "@/components/BookGrid";
import { Button, Spinner, buttonClasses } from "@/components/ui";
import { cn } from "@/lib/cn";
import { buildHref } from "./filters";
import {
  appendItems,
  isListingPageResponse,
  listingApiUrl,
  type ListingItem,
  type ListingScope,
} from "./infinite";

export interface InfiniteBookGridProps {
  scope: ListingScope;
  /** Path of the listing page, for the ?page= links. */
  path: string;
  /** Query-string values of the listing without the page (toParams()). */
  params: Record<string, string | number | undefined>;
  /** Cards of the page rendered on the server. */
  initialItems: ListingItem[];
  /** That page, 1-based. */
  page: number;
  pages: number;
  /** Card options, as BookCard's. */
  showTags?: boolean;
  hideTag?: string;
  className?: string;
}

type Status = "idle" | "loading" | "error";

/** How far below the viewport the next page starts loading. */
const PRELOAD_MARGIN = "800px 0px";

export function InfiniteBookGrid({
  scope,
  path,
  params,
  initialItems,
  page,
  pages: initialPages,
  showTags,
  hideTag,
  className,
}: InfiniteBookGridProps) {
  const [items, setItems] = useState(initialItems);
  const [lastPage, setLastPage] = useState(page);
  const [pages, setPages] = useState(initialPages);
  const [status, setStatus] = useState<Status>("idle");
  const sentinel = useRef<HTMLDivElement>(null);
  const visible = useRef(false);
  const inFlight = useRef<AbortController | null>(null);

  const hasMore = lastPage < pages;
  const nextPage = lastPage + 1;

  const loadMore = useCallback(async () => {
    if (inFlight.current || !hasMore) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setStatus("loading");
    try {
      const response = await fetch(listingApiUrl(scope, params, nextPage), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body: unknown = await response.json();
      if (!isListingPageResponse(body)) throw new Error("bad response");
      setItems((shown) => appendItems(shown, body.items));
      setPages(body.pages);
      // Past the end (books were removed meanwhile): stop here.
      setLastPage(body.items.length === 0 ? Math.max(nextPage, body.pages) : body.page);
      setStatus("idle");
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn("[library] loading more books failed", err);
      setStatus("error");
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, [hasMore, nextPage, params, scope]);

  // Leaving the page (or a new listing): drop the request in flight.
  useEffect(() => () => inFlight.current?.abort(), []);

  // Watch the sentinel while there is more to load.
  useEffect(() => {
    const target = sentinel.current;
    if (!hasMore || !target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        visible.current = entries.some((entry) => entry.isIntersecting);
        if (visible.current) void loadMore();
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // A page that did not fill the screen leaves the sentinel in view, and the
  // observer only reports changes: keep going while it is still visible.
  useEffect(() => {
    if (status === "idle" && hasMore && visible.current) void loadMore();
  }, [status, hasMore, lastPage, loadMore]);

  const onMoreClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    void loadMore();
  };

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      {page > 1 ? (
        <p className="flex justify-center">
          <a
            href={buildHref(path, { ...params, page: page > 2 ? page - 1 : undefined })}
            rel="prev"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
            לספרים הקודמים
          </a>
        </p>
      ) : null}

      <ul className={BOOK_GRID_CLASSES}>
        {items.map((item, index) => (
          <li key={item.book.id}>
            <BookCard
              book={item.book}
              priority={index < 6}
              showTags={showTags}
              hideTag={hideTag}
              {...(item.isNew ? { badge: "חדש" } : {})}
              {...(item.read ? { read: true } : {})}
            />
          </li>
        ))}
      </ul>

      <div ref={sentinel} className="flex min-h-touch flex-col items-center justify-center gap-3" aria-live="polite">
        {hasMore ? (
          status === "error" ? (
            <>
              <p className="text-muted">לא הצלחנו לטעון עוד ספרים.</p>
              <Button variant="outline" size="sm" onClick={() => void loadMore()}>
                <RotateCcw aria-hidden="true" className="size-4" />
                נסו שוב
              </Button>
            </>
          ) : status === "loading" ? (
            <p className="flex items-center gap-2 text-muted">
              <Spinner size="sm" label="" />
              טוענים עוד ספרים…
            </p>
          ) : (
            <a
              href={buildHref(path, { ...params, page: nextPage })}
              rel="next"
              onClick={onMoreClick}
              className={buttonClasses({ variant: "outline", size: "md" })}
            >
              עוד ספרים
              <ChevronLeft aria-hidden="true" className="size-5" />
            </a>
          )
        ) : lastPage > 1 || page > 1 ? (
          <p className="text-muted">
            <span aria-hidden="true">📚 </span>
            זהו, ראיתם את כל הספרים
          </p>
        ) : null}
      </div>
    </div>
  );
}
