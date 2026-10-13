// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FavoriteButtonSlot, favoriteApiUrl } from "./FavoriteButtonSlot";

function mockFetch(status: number) {
  const fetchMock = vi.fn(async () => new Response(status === 204 ? null : "{}", { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FavoriteButtonSlot", () => {
  it("renders a login link when nobody is signed in", () => {
    const fetchMock = mockFetch(200);
    render(<FavoriteButtonSlot bookId="bk_1" signedIn={false} loginHref="/login?next=%2Fbook%2Fx" />);
    expect(screen.getByRole("link", { name: "שמירה במועדפים" })).toHaveAttribute("href", "/login?next=%2Fbook%2Fx");
    expect(screen.queryByRole("button")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds with POST and removes with DELETE", async () => {
    const fetchMock = mockFetch(200);
    const user = userEvent.setup();
    render(<FavoriteButtonSlot bookId="bk_1" loginHref="/login" />);
    const button = screen.getByRole("button", { name: "שמירה במועדפים" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);
    await waitFor(() => expect(screen.getByRole("button", { name: "במועדפים שלי" })).toHaveAttribute("aria-pressed", "true"));
    expect(fetchMock).toHaveBeenLastCalledWith(favoriteApiUrl("bk_1"), expect.objectContaining({ method: "POST" }));

    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button", { name: "שמירה במועדפים" })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith("/api/favorites/bk_1", expect.objectContaining({ method: "DELETE" }));
  });

  it("starts filled when the server says the book is a favorite", () => {
    mockFetch(200);
    render(<FavoriteButtonSlot bookId="bk_1" initialFavorite loginHref="/login" />);
    expect(screen.getByRole("button", { name: "במועדפים שלי" })).toHaveAttribute("aria-pressed", "true");
  });

  it("asks to sign in on 401 and does not pretend the book was saved", async () => {
    mockFetch(401);
    const user = userEvent.setup();
    render(<FavoriteButtonSlot bookId="bk_1" loginHref="/login?next=x" />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("link", { name: "להתחבר" })).toHaveAttribute("href", "/login?next=x"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("says favorites are unavailable on 404", async () => {
    mockFetch(404);
    const user = userEvent.setup();
    render(<FavoriteButtonSlot bookId="bk_1" loginHref="/login" />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("המועדפים לא זמינים כרגע"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("reports a failure on a server error or a network error", async () => {
    mockFetch(500);
    const user = userEvent.setup();
    const { unmount } = render(<FavoriteButtonSlot bookId="bk_1" initialFavorite loginHref="/login" />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("לא הצלחנו לעדכן"));
    // Still a favorite: the removal was not confirmed.
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    render(<FavoriteButtonSlot bookId="bk_1" loginHref="/login" />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("לא הצלחנו לעדכן"));
  });
});
