import { describe, expect, it } from "vitest";
import { bookDashWebUrl, fetchBookDashWebImage, parseBookDashWebPage } from "./bookdash-web";

const UPLOADS = "https://bookdash.org/wp-content/uploads/2016/03";
const link = (file: string) => `<a href="${UPLOADS}/${file}" target="_blank"><img src="x.svg"></a>`;
const credit = (name: string, role: string) => `<h3><span class="txt-bold">${name}</span> (${role})</h3>`;

describe("Book Dash page on bookdash.org", () => {
  it("takes the story spreads, skipping the cover, the front matter and the back cover", () => {
    const files = ["01", "02", "03", "04", "05", "06", "07", "08"].map((n) => `sock_english_20160324_Page_${n}.jpg`);
    const html = files.map(link).join("") + `<img src="${UPLOADS}/sock_english_20160324_Page_05-300x150.jpg">`;
    const page = parseBookDashWebPage(html, "https://bookdash.org/books/sock/", 3);
    expect(page.cover).toBe(`${UPLOADS}/${files[0]}`);
    expect(page.spreads).toEqual([4, 5, 6].map((i) => `${UPLOADS}/${files[i]}`));
  });

  it("starts one picture earlier in the newer exports", () => {
    const files = [
      "hugs_english_20161230_cover.jpg",
      ...[4, 5, 6, 17].map((n) => `hugs_english_20161230_page${n}.jpg`),
    ];
    const page = parseBookDashWebPage(files.map(link).join(""), "u", 2);
    expect(page.cover).toBe(`${UPLOADS}/${files[0]}`);
    expect(page.spreads).toEqual([`${UPLOADS}/${files[1]}`, `${UPLOADS}/${files[2]}`]);
  });

  it("reads who did what", () => {
    const html = [
      credit("Megan Andrews", "Illustrator"),
      credit("Sam Beckbessinger", "Writer"),
      credit("Marisa Steyn", "Designer"),
      credit("Jacqui L&#039;Ange", "Editor"),
      credit("Someone", "Printer"),
    ].join("");
    expect(parseBookDashWebPage(html, "u", 12).credits).toEqual({
      illustrator: "Megan Andrews",
      author: "Sam Beckbessinger",
      designer: "Marisa Steyn",
      editor: "Jacqui L'Ange",
    });
  });

  it("knows the books whose page has another name", () => {
    expect(bookDashWebUrl("mrs-penguins-palace")).toBe("https://bookdash.org/books/mrs-penguins-perfect-palace/");
    expect(bookDashWebUrl("little-sock")).toBe("https://bookdash.org/books/little-sock/");
  });

  it("downloads pictures only from the site's uploads folder", async () => {
    const never = () => Promise.reject(new Error("must not be requested"));
    await expect(fetchBookDashWebImage("https://example.com/a.jpg", never)).rejects.toThrow("not a Book Dash upload");
    await expect(fetchBookDashWebImage(`${UPLOADS}/../../x.jpg`, never)).rejects.toThrow("not a Book Dash upload");
  });
});
