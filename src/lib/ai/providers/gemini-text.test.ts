import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildGeminiTextRequest, extractGeminiText, GeminiTextError } from "./gemini-text";

const schema = z.object({ title: z.string() });

describe("gemini text provider", () => {
  it("sends the schema, the system prompt and the images", () => {
    const body = buildGeminiTextRequest({ system: "sys", prompt: "write", schema }, [
      { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" },
    ]) as {
      systemInstruction: { parts: { text: string }[] };
      contents: { parts: Record<string, unknown>[] }[];
      generationConfig: { responseMimeType: string; responseJsonSchema: { properties: Record<string, unknown> } };
    };
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.contents[0].parts).toHaveLength(2);
    expect(body.contents[0].parts[0]).toHaveProperty("inlineData.mimeType", "image/png");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(Object.keys(body.generationConfig.responseJsonSchema.properties)).toEqual(["title"]);
  });

  it("refuses image types the API does not take", () => {
    expect(() =>
      buildGeminiTextRequest({ prompt: "x", schema }, [{ bytes: new Uint8Array(1), contentType: "image/svg+xml" }]),
    ).toThrow(GeminiTextError);
  });

  it("reads the JSON text, and reports blocks and cut-offs", () => {
    expect(extractGeminiText({ candidates: [{ content: { parts: [{ text: '{"title":"a"}' }] } }] })).toBe('{"title":"a"}');
    expect(() => extractGeminiText({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(/declined/);
    expect(() => extractGeminiText({ candidates: [{ finishReason: "MAX_TOKENS" }] })).toThrow(/cut off/);
    expect(() => extractGeminiText({ candidates: [{ content: { parts: [] } }] })).toThrow(/no output/);
  });
});
