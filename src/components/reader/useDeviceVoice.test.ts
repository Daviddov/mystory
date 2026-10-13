import { describe, expect, it } from "vitest";
import { splitWords } from "@/lib/hebrew";
import { pickHebrewVoice, wordIndexAtChar } from "./useDeviceVoice";

function voice(lang: string, localService: boolean, name = lang): SpeechSynthesisVoice {
  return { lang, localService, name, default: false, voiceURI: name } as SpeechSynthesisVoice;
}

describe("pickHebrewVoice", () => {
  it("returns null when the device has no Hebrew voice", () => {
    expect(pickHebrewVoice([voice("en-US", true), voice("hi-IN", false)])).toBeNull();
  });

  it("prefers a local Hebrew voice over a network one", () => {
    const picked = pickHebrewVoice([voice("en-US", true), voice("he-IL", false, "online"), voice("he-IL", true, "local")]);
    expect(picked?.name).toBe("local");
  });

  it("accepts the legacy code and an underscore", () => {
    expect(pickHebrewVoice([voice("iw-IL", false)])?.lang).toBe("iw-IL");
    expect(pickHebrewVoice([voice("he_IL", false)])?.lang).toBe("he_IL");
  });
});

describe("wordIndexAtChar", () => {
  const text = "הכוכב הקטן  הלך לישון.";

  it("maps the first character of every word to its splitWords index", () => {
    const words = splitWords(text);
    let from = 0;
    words.forEach((word, index) => {
      const start = text.indexOf(word, from);
      expect(wordIndexAtChar(text, start)).toBe(index);
      from = start + word.length;
    });
  });

  it("maps a character inside a word to that word", () => {
    expect(wordIndexAtChar(text, 2)).toBe(0);
    expect(wordIndexAtChar(text, text.length - 1)).toBe(3);
  });
});
