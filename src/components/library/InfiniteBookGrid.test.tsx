// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicBook } from "@/lib/public-book";
import { InfiniteBookGrid } from "./InfiniteBookGrid";
import type { ListingItem, ListingPageResponse } from "./infinite";

function book(id: string): PublicBook {
  return {
    id,
    slug: id,
    title: `ספר ${id}`,
    ageGroup: "3-5",
    readingMinutes: 5,
    categories: [],
    themes: [],
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as PublicBook;
}
const items = (...ids: string[]): ListingItem[] => ids.map((id) => ({ book: book(id), isNew: false }));

/** IntersectionObserver stand-in: tests decide when the sentinel comes into view. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
  observe = vi.fn();
  disconnect = vi.fn(() => {
    FakeObserver.instances = FakeObserver.instances.filter((instance) => instance !== this);
  });
  unobserve = vi.fn();
  takeRecords = () => [];
  fire(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}
const scrollIntoView = (isIntersecting = true) =>
  act(() => {
    for (const observer of [...FakeObserver.instances]) observer.fire(isIntersecting);
  });

function respond(body: ListingPageResponse, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const baseProps = {
  scope: { kind: "category", value: "animals" } as const,
  path: "/category/animals",
  params: { sort: "popular" },
};

describe("InfiniteBookGrid", () => {
  it("renders the server page with a crawlable rel=next link", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<InfiniteBookGrid {...baseProps} initialItems={items("a", "b")} page={1} pages={3} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    const next = screen.getByRole("link", { name: "עוד ספרים" });
    expect(next).toHaveAttribute("rel", "next");
    expect(next).toHaveAttribute("href", "/category/animals?sort=popular&page=2");
    expect(screen.queryByRole("link", { name: "לספרים הקודמים" })).toBeNull();
  });

  it("links back from a deep page", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<InfiniteBookGrid {...baseProps} initialItems={items("a")} page={2} pages={3} />);
    expect(screen.getByRole("link", { name: "לספרים הקודמים" })).toHaveAttribute("href", "/category/animals?sort=popular");
    expect(screen.getByRole("link", { name: "עוד ספרים" })).toHaveAttribute("href", "/category/animals?sort=popular&page=3");
  });

  it("loads the next pages when the sentinel shows, without duplicates, until the end", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond({ items: items("b", "c"), page: 2, pages: 3, total: 5 }))
      .mockResolvedValueOnce(respond({ items: items("d", "e"), page: 3, pages: 3, total: 5 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<InfiniteBookGrid {...baseProps} initialItems={items("a", "b")} page={1} pages={3} />);

    await scrollIntoView();
    // The sentinel stays in view after page 2, so page 3 follows by itself.
    await waitFor(() => expect(screen.getByText("זהו, ראיתם את כל הספרים")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/library?sort=popular&scope=category%3Aanimals&page=2");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/library?sort=popular&scope=category%3Aanimals&page=3");
    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(screen.queryByRole("link", { name: "עוד ספרים" })).toBeNull();
  });

  it("shows the error and retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(respond({ items: items("b"), page: 2, pages: 2, total: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(<InfiniteBookGrid {...baseProps} initialItems={items("a")} page={1} pages={2} />);

    await scrollIntoView();
    const retry = await screen.findByRole("button", { name: "נסו שוב" });
    expect(screen.getByText("לא הצלחנו לטעון עוד ספרים.")).toBeInTheDocument();

    await userEvent.setup().click(retry);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(screen.getByText("זהו, ראיתם את כל הספרים")).toBeInTheDocument();
  });

  it("loads more on a click of the link instead of navigating", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond({ items: items("b"), page: 2, pages: 3, total: 3 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<InfiniteBookGrid {...baseProps} initialItems={items("a")} page={1} pages={3} />);

    await userEvent.setup().click(screen.getByRole("link", { name: "עוד ספרים" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(screen.getByRole("link", { name: "עוד ספרים" })).toHaveAttribute("href", "/category/animals?sort=popular&page=3");
  });

  it("stops when the server says the list ended early", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respond({ items: [], page: 2, pages: 1, total: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<InfiniteBookGrid {...baseProps} initialItems={items("a")} page={1} pages={2} />);

    await scrollIntoView();
    await waitFor(() => expect(screen.queryByRole("link", { name: "עוד ספרים" })).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders no footer for a single page", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<InfiniteBookGrid {...baseProps} initialItems={items("a")} page={1} pages={1} />);
    expect(screen.queryByRole("link", { name: "עוד ספרים" })).toBeNull();
    expect(screen.queryByText("זהו, ראיתם את כל הספרים")).toBeNull();
    expect(FakeObserver.instances).toHaveLength(0);
  });
});
