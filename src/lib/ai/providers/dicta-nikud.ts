/**
 * Dicta Nakdan: automatic Hebrew vocalization. Selected when NIKUD_PROVIDER=dicta.
 * Endpoint override: DICTA_API_URL.
 *
 * HOW THIS WAS VERIFIED (2026-10-13). Dicta publishes no API reference that
 * could be found. The request below is the one Dicta's own web client
 * (https://nakdan.dicta.org.il, bundle /assets/index-*.js) sends, and the
 * response shape was confirmed with one live call:
 *
 *   POST https://nakdan-u2-1a.loadbalancer.dicta.org.il/api      (no API key)
 *   { "task": "nakdan", "data": "<text>", "genre": "modern", "useTokenization": true,
 *     "addmorph": false, "keepmetagim": true, "keepqq": false,
 *     "nodageshdefmem": false, "patachma": false }
 *
 *   200 { "data": [ { "str": "שלום", "sep": false,
 *                     "nakdan": { "word": "שלום", "options": [ { "w": "שָׁלוֹם", ... }, ... ] } },
 *                   { "str": "! ", "sep": true, "nakdan": { "word": "! ", "options": [] } }, ... ] }
 *
 * Tokens come back in order and their `str` values concatenate to the input.
 * `options[0].w` is the preferred vocalization; a "|" inside it marks the end
 * of a prefix letter and is not part of the word. Separators, digits and
 * latin words have `sep: true` or no options and are copied through.
 *
 * It is an unauthenticated endpoint behind Dicta's own tool, not a contracted
 * API: it can change or be rate limited without notice, and Dicta's terms of
 * use should be checked before production use.
 */
import { z } from "zod";
import { aiEnv } from "../../config";
import { countWords } from "../../hebrew";
import type { NikudProvider } from "../types";

const DEFAULT_DICTA_URL = "https://nakdan-u2-1a.loadbalancer.dicta.org.il/api";
const REQUEST_TIMEOUT_MS = 30_000;
/** Longest text sent in one request. Longer texts are split at line and sentence ends. */
const MAX_CHUNK_CHARS = 4000;

const DictaResponseSchema = z.object({
  data: z.array(
    z.object({
      str: z.string(),
      sep: z.boolean().optional(),
      nakdan: z
        .object({
          word: z.string().optional(),
          options: z.array(z.object({ w: z.string() })).optional(),
        })
        .optional(),
    }),
  ),
});

export class DictaNikudError extends Error {
  constructor(message: string) {
    super(`Dicta Nakdan: ${message}`);
    this.name = "DictaNikudError";
  }
}

const HEBREW_LETTER_RE = /[א-ת]/;
// Prefix marker used by Dicta, and meteg (a stress mark that is not wanted in children's text).
const DICTA_MARKUP_RE = /[|ֽ]/g;

/** Rebuilds the vocalized text from Dicta's token list. Exported for tests. */
export function assembleDictaText(tokens: z.infer<typeof DictaResponseSchema>["data"]): string {
  let out = "";
  for (const token of tokens) {
    const best = token.nakdan?.options?.[0]?.w;
    if (token.sep || !best) out += token.str;
    else out += best.replace(DICTA_MARKUP_RE, "");
  }
  return out;
}

/** Splits long text into pieces of at most `max` characters without cutting a word. */
export function chunkText(text: string, max: number = MAX_CHUNK_CHARS): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
    if (cut <= 0) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = max - 1;
    chunks.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}

async function vocalizeChunk(url: string, text: string): Promise<string> {
  if (!HEBREW_LETTER_RE.test(text)) return text;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        task: "nakdan",
        data: text,
        genre: "modern",
        useTokenization: true,
        addmorph: false,
        keepmetagim: true,
        keepqq: false,
        nodageshdefmem: false,
        patachma: false,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new DictaNikudError(`request failed (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new DictaNikudError(`HTTP ${response.status} ${body.slice(0, 200)}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new DictaNikudError("the response is not JSON");
  }
  const parsed = DictaResponseSchema.safeParse(json);
  if (!parsed.success) throw new DictaNikudError("the response has an unexpected shape");

  const vocalized = assembleDictaText(parsed.data.data);
  if (countWords(vocalized) !== countWords(text)) {
    throw new DictaNikudError(
      `the vocalized text has ${countWords(vocalized)} words, the input has ${countWords(text)}`,
    );
  }
  return vocalized;
}

export async function createDictaNikudProvider(): Promise<NikudProvider> {
  const url = aiEnv.dictaApiUrl() ?? DEFAULT_DICTA_URL;
  return {
    name: "dicta",
    isMock: false,
    async addNikud(text: string) {
      const parts: string[] = [];
      for (const chunk of chunkText(text)) parts.push(await vocalizeChunk(url, chunk));
      return { text: parts.join(""), isMock: false };
    },
  };
}
