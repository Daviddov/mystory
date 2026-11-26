// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GuestLimit } from "@/components/reader/GuestLimit";
import { GUEST_BOOK_LIMIT, guestMayRead, loadGuestBooks, rememberGuestBook } from "./guest-limit";

describe("guest book limit", () => {
  afterEach(() => window.localStorage.clear());

  it("allows new books until the limit, and books already opened after it", () => {
    expect(GUEST_BOOK_LIMIT).toBe(3);
    expect(guestMayRead([], "a")).toBe(true);
    expect(guestMayRead(["a", "b"], "c")).toBe(true);
    expect(guestMayRead(["a", "b", "c"], "d")).toBe(false);
    expect(guestMayRead(["a", "b", "c"], "b")).toBe(true);
  });

  it("remembers each book once and survives corrupt storage", () => {
    rememberGuestBook("a");
    rememberGuestBook("a");
    rememberGuestBook("b");
    expect(loadGuestBooks()).toEqual(["a", "b"]);
    window.localStorage.setItem("mystory:guest-books", "{not json");
    expect(loadGuestBooks()).toEqual([]);
  });
});

describe("<GuestLimit>", () => {
  afterEach(() => window.localStorage.clear());

  it("shows the book while under the limit and remembers it", () => {
    render(
      <GuestLimit bookId="a" loginHref="/login?next=%2Fread%2Fa" backHref="/book/a">
        <p>the story</p>
      </GuestLimit>,
    );
    expect(screen.getByText("the story")).toBeInTheDocument();
    expect(loadGuestBooks()).toEqual(["a"]);
  });

  it("asks a guest who opened three other books to sign in", () => {
    window.localStorage.setItem("mystory:guest-books", JSON.stringify(["a", "b", "c"]));
    render(
      <GuestLimit bookId="d" loginHref="/login?next=%2Fread%2Fd" backHref="/book/d">
        <p>the story</p>
      </GuestLimit>,
    );
    expect(screen.queryByText("the story")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "רוצים עוד סיפורים?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "כניסה או הרשמה" })).toHaveAttribute("href", "/login?next=%2Fread%2Fd");
  });
});
