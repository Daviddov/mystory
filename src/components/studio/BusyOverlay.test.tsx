// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BusyOverlay } from "./BusyOverlay";
import { NoticeToast, SUCCESS_DISMISS_MS } from "./NoticeToast";

describe("BusyOverlay", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders an accessible determinate progress bar", () => {
    render(<BusyOverlay busy={{ label: "מקריא עמוד 2 מתוך 4…", steps: { done: 1, total: 4 }, expectedSeconds: 10 }} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    expect(bar.getAttribute("aria-valuetext")).toContain("25 אחוז");
    expect(screen.getByRole("status")).toHaveTextContent("מקריא עמוד 2 מתוך 4…");
  });

  it("moves with time, shows the remaining seconds, then admits it takes longer", () => {
    render(<BusyOverlay busy={{ label: "כותבים את הסיפור…", expectedSeconds: 20 }} />);
    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBe(0);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeGreaterThan(30);
    expect(screen.getByText(/נשארו בערך/)).toBeInTheDocument();
    expect(screen.getByText("עברו 8 שניות")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(screen.getByText("לוקח יותר מהצפוי…")).toBeInTheDocument();
    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeLessThanOrEqual(92);
  });

  it("is indeterminate without any information", () => {
    render(<BusyOverlay busy={{ label: "עובדים…" }} />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });
});

describe("NoticeToast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("dismisses a success after a while but keeps an error", () => {
    const onClose = vi.fn();
    const { rerender } = render(<NoticeToast notice={{ tone: "success", text: "בוצע" }} onClose={onClose} />);
    expect(screen.getByRole("status")).toHaveTextContent("בוצע");
    act(() => {
      vi.advanceTimersByTime(SUCCESS_DISMISS_MS + 10);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    rerender(<NoticeToast notice={{ tone: "error", text: "נכשל" }} onClose={onClose} />);
    expect(screen.getByRole("alert")).toHaveTextContent("נכשל");
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
