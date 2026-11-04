import { describe, expect, it } from "vitest";
import { findServerMessage, showServerMessage, translateServerMessage } from "./server-errors";

describe("translateServerMessage", () => {
  it("translates a known message exactly", () => {
    expect(translateServerMessage("en", "לא נמצא")).toBe("We couldn't find that.");
    expect(translateServerMessage("en", "משהו השתבש. נסו שוב בעוד רגע.")).toBe(
      "Something went wrong. Please try again in a moment.",
    );
  });

  it("translates messages with values through a pattern", () => {
    expect(translateServerMessage("en", "יותר מדי בקשות בזמן קצר. נסו שוב בעוד 3 דקות.")).toBe(
      "Too many requests in a short time. Please try again in 3 minutes.",
    );
    expect(translateServerMessage("en", 'הקובץ גדול מדי. הגודל המרבי הוא 10 מ"ב.')).toBe(
      "The file is too big. The largest size allowed is 10 MB.",
    );
    expect(translateServerMessage("en", "האיור בעמוד 4: הקובץ אינו שייך לספר הזה")).toBe(
      "The picture on page 4: the file doesn't belong to this book.",
    );
  });

  it("translates known sentences joined together", () => {
    expect(translateServerMessage("en", "הספר מוכן! הספר נשמר בלי הקראה. אפשר להוסיף הקראה מהסטודיו.")).toBe(
      "Your book is ready! The book was saved without narration. You can add narration in the studio.",
    );
  });

  it("leaves an unknown message unchanged", () => {
    expect(translateServerMessage("en", "הודעה שאינה מוכרת")).toBe("הודעה שאינה מוכרת");
    expect(findServerMessage("en", "הודעה שאינה מוכרת")).toBeUndefined();
    expect(translateServerMessage("en", "Already English")).toBe("Already English");
  });

  it("passes Hebrew through unchanged", () => {
    expect(translateServerMessage("he", "לא נמצא")).toBe("לא נמצא");
    expect(translateServerMessage("he", "יותר מדי בקשות בזמן קצר. נסו שוב בעוד דקה.")).toBe(
      "יותר מדי בקשות בזמן קצר. נסו שוב בעוד דקה.",
    );
  });
});

describe("showServerMessage", () => {
  it("falls back for unknown Hebrew in English, and keeps English as it is", () => {
    expect(showServerMessage("en", "הודעה שאינה מוכרת", "Failed")).toBe("Failed");
    expect(showServerMessage("en", "Server said no", "Failed")).toBe("Server said no");
    expect(showServerMessage("en", undefined, "Failed")).toBe("Failed");
    expect(showServerMessage("he", "הודעה שאינה מוכרת", "Failed")).toBe("הודעה שאינה מוכרת");
  });
});
