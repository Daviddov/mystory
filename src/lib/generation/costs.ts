/**
 * Estimated cost of every AI action in the book workbench ("שלבי היצירה").
 *
 * Pure functions, no server-only imports: the server builds a serialisable
 * CostContext (provider names, models, prices; NEVER keys) with
 * buildCostContext() and passes it to the client, which calls the estimate*()
 * functions with the real size of the book.
 *
 * ONE PRICE TABLE (PRICE_TABLE below). Every number has the date it was read
 * and its source. Prices Google announced to change on 2027-01-01 are stored as
 * `from2027` and picked by the date. Override from the environment (USD):
 *   COST_TEXT_IN_PER_M, COST_TEXT_OUT_PER_M   text model, per 1M tokens
 *   COST_IMAGE_USD                            one 1K picture
 *   COST_TTS_PER_1K_CHARS                     narration, per 1000 characters
 *   COST_VIDEO_PER_SECOND                     animation, per second of clip
 *   COST_USD_TO_ILS                           exchange rate (default 3.7)
 * (VIDEO_COST_PER_SECOND_USD, used by the animation pipeline, is honoured too.)
 *
 * ASSUMPTIONS (estimates, never invoices; retries are not included):
 *  - Hebrew text: 1 token ~ 2.5 characters (conservative; the real figure is
 *    near 3 with Gemini tokenizers).
 *  - Pictures are requested at 1K, one grid picture per call (3x3 = 9 pages,
 *    4x4 = 16); input tokens for the reference image are ignored (cents/1000).
 *  - Gemini voice: 25 audio tokens per second; speech ~ 12 characters per
 *    second of audio. Text input tokens at 1 per 2.5 characters.
 *  - Story writing: outline + pages + review + one revision = 4 text calls.
 */

export const COSTS_AS_OF = "2026-10-19";
export const DEFAULT_USD_TO_ILS = 3.7;
export const HEBREW_CHARS_PER_TOKEN = 2.5;
export const SPEECH_CHARS_PER_SECOND = 12;
export const AUDIO_TOKENS_PER_SECOND = 25;
export const GRID_CELLS = { "3x3": 9, "4x4": 16 } as const;
export const DEFAULT_CLIP_SECONDS_FOR_COST = 8; // = DEFAULT_CLIP_SECONDS in src/lib/animation/pipeline.ts
const PRICES_CHANGE_ON = "2027-01-01";

interface Rate {
  /** USD. */
  now: number;
  /** USD from 2027-01-01, when Google announced a change. */
  from2027?: number;
}
const r = (now: number, from2027?: number): Rate => ({ now, from2027 });

/** Source: https://ai.google.dev/gemini-api/docs/pricing (read 2026-10-19, page updated 2026-10-16). */
export const PRICE_TABLE = {
  asOf: COSTS_AS_OF,
  /** USD per 1M tokens: [input, output incl. thinking]. */
  text: {
    "gemini-3.8-flash": { in: r(0.75, 1.5), out: r(3.75, 7.5), confirmed: true },
    // Anthropic list price for a mid-size Claude model; not verified here.
    claude: { in: r(3), out: r(15), confirmed: false },
  },
  /** USD per 1K picture (output image tokens). Source: same pricing page. */
  image: {
    "gemini-nano-banana-2.1": { usd: r(0.0336), confirmed: true },
    "gemini-3.1-flash-lite-image": { usd: r(0.0336), confirmed: true },
    "gemini-3.1-flash-image": { usd: r(0.067), confirmed: true },
    "gemini-3-pro-image": { usd: r(0.134), confirmed: true },
  },
  /** Gemini TTS, USD per 1M tokens [text in, audio out]. Source: same pricing page. */
  geminiTts: {
    "gemini-3.8-flash-tts": { in: r(0.5, 1), out: r(9, 18), confirmed: true },
    "gemini-3.8-flash-lite-tts": { in: r(0.5, 1), out: r(6, 12), confirmed: true },
    "gemini-3.1-flash-tts-preview": { in: r(1), out: r(20), confirmed: true },
    "gemini-2.5-flash-preview-tts": { in: r(0.5), out: r(10), confirmed: true },
  },
  /** Veo 3.1 at 720p, USD per second. Source: same Gemini pricing page. */
  veoPerSecond720p: {
    "veo-3.1-lite-generate-preview": 0.05,
    "veo-3.1-fast-generate-preview": 0.1,
    "veo-3.1-generate-preview": 0.4,
  } as Record<string, number>,
  /** Dicta Nakdan: public web service, no key, no charge (see providers/dicta-nikud.ts). */
  nikudUsd: 0,
} as const;

export const DEFAULT_TEXT_MODEL = "gemini-3.8-flash";
export const DEFAULT_IMAGE_MODEL = "gemini-nano-banana-2.1";
export const DEFAULT_GEMINI_TTS = "gemini-3.8-flash-tts";
export const DEFAULT_VIDEO_MODEL = "veo-3.1-lite-generate-preview";

function pick(rate: Rate, now: Date): number {
  return rate.from2027 !== undefined && now.toISOString().slice(0, 10) >= PRICES_CHANGE_ON ? rate.from2027 : rate.now;
}

function envNumber(env: Record<string, string | undefined>, key: string): number | undefined {
  const raw = env[key]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// Context (serialisable; built on the server)
// ---------------------------------------------------------------------------

export interface CostContext {
  asOf: string;
  usdToIls: number;
  text: { mock: boolean; model: string; inPerM: number; outPerM: number; confirmed: boolean };
  image: { mock: boolean; model: string; perImage: number; confirmed: boolean };
  tts: { mock: boolean; provider: string; model: string; per1kChars: number; confirmed: boolean };
  nikud: { mock: boolean };
  video: { mock: boolean; model: string; perSecond: number; confirmed: boolean; clipSeconds: number };
}

export interface CostStatusInput {
  text: { name: string; isMock: boolean };
  nikud: { name: string; isMock: boolean };
  tts: { name: string; isMock: boolean };
  image: { name: string; isMock: boolean };
  video: { name: string; isMock: boolean };
}

/** Builds the context from the provider status and env. Contains no secrets. */
export function buildCostContext(
  status: CostStatusInput,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): CostContext {
  const model = (key: string, fallback: string) => env[key]?.trim() || fallback;

  // Text
  const textModel = status.text.name === "claude" ? "claude" : model("TEXT_MODEL", DEFAULT_TEXT_MODEL);
  const textRow = (PRICE_TABLE.text as Record<string, { in: Rate; out: Rate; confirmed: boolean }>)[textModel];
  const textIn = envNumber(env, "COST_TEXT_IN_PER_M");
  const textOut = envNumber(env, "COST_TEXT_OUT_PER_M");
  const textFallback = PRICE_TABLE.text[DEFAULT_TEXT_MODEL];
  const text = {
    mock: status.text.isMock,
    model: textModel,
    inPerM: textIn ?? pick((textRow ?? textFallback).in, now),
    outPerM: textOut ?? pick((textRow ?? textFallback).out, now),
    confirmed: textIn !== undefined || textOut !== undefined || (textRow?.confirmed ?? false),
  };

  // Image
  const imageModel = model("IMAGE_MODEL", DEFAULT_IMAGE_MODEL);
  const imageRow = (PRICE_TABLE.image as Record<string, { usd: Rate; confirmed: boolean }>)[imageModel];
  const imageOverride = envNumber(env, "COST_IMAGE_USD");
  const image = {
    mock: status.image.isMock,
    model: imageModel,
    perImage: imageOverride ?? pick((imageRow ?? PRICE_TABLE.image[DEFAULT_IMAGE_MODEL]).usd, now),
    confirmed: imageOverride !== undefined || (imageRow?.confirmed ?? false),
  };

  // Narration
  const ttsProvider = status.tts.name.toLowerCase();
  const ttsOverride = envNumber(env, "COST_TTS_PER_1K_CHARS");
  const ttsModel = model("TTS_MODEL", DEFAULT_GEMINI_TTS);
  const row = (PRICE_TABLE.geminiTts as Record<string, { in: Rate; out: Rate; confirmed: boolean }>)[ttsModel];
  const use = row ?? PRICE_TABLE.geminiTts[DEFAULT_GEMINI_TTS];
  const ttsPer1k = geminiTtsPer1kChars(pick(use.in, now), pick(use.out, now));
  const ttsConfirmed = row?.confirmed ?? false;
  const tts = {
    mock: status.tts.isMock,
    provider: status.tts.isMock ? "mock" : ttsProvider,
    model: ttsModel,
    per1kChars: ttsOverride ?? ttsPer1k,
    confirmed: ttsOverride !== undefined || ttsConfirmed,
  };

  // Video
  const videoModel = model("VIDEO_MODEL", DEFAULT_VIDEO_MODEL);
  const videoOverride = envNumber(env, "COST_VIDEO_PER_SECOND") ?? envNumber(env, "VIDEO_COST_PER_SECOND_USD");
  const veo = PRICE_TABLE.veoPerSecond720p[videoModel];
  const video = {
    mock: status.video.isMock,
    model: videoModel,
    perSecond: videoOverride ?? veo ?? PRICE_TABLE.veoPerSecond720p[DEFAULT_VIDEO_MODEL],
    confirmed: videoOverride !== undefined || veo !== undefined,
    clipSeconds: DEFAULT_CLIP_SECONDS_FOR_COST,
  };

  return {
    asOf: PRICE_TABLE.asOf,
    usdToIls: envNumber(env, "COST_USD_TO_ILS") || DEFAULT_USD_TO_ILS,
    text,
    image,
    tts,
    nikud: { mock: status.nikud.isMock },
    video,
  };
}

/** Gemini TTS: text tokens in plus audio tokens out, for 1000 characters of speech. */
export function geminiTtsPer1kChars(inPerM: number, outPerM: number): number {
  const inTokens = 1000 / HEBREW_CHARS_PER_TOKEN;
  const seconds = 1000 / SPEECH_CHARS_PER_SECOND;
  return (inTokens * inPerM + seconds * AUDIO_TOKENS_PER_SECOND * outPerM) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------

export interface CostEstimate {
  usd: number;
  /** Provider is a demo mock: nothing is charged. */
  mock: boolean;
  /** Always free (no AI, or a free service). */
  free: boolean;
  /** False when a price in the calculation is a guess. */
  confirmed: boolean;
  /** Plain Hebrew: what the number covers. */
  covers: string;
  /** The same in English, for the English interface. */
  coversEn?: string;
}

/** Interface language of the formatted lines (same values as Locale in src/lib/i18n/locale.ts). */
type CostLocale = "he" | "en";

const NONE = (covers: string, coversEn: string, free = true): CostEstimate => ({ usd: 0, mock: false, free, confirmed: true, covers, coversEn });

export function tokensOf(chars: number): number {
  return Math.ceil(Math.max(0, chars) / HEBREW_CHARS_PER_TOKEN);
}

function textCallUsd(ctx: CostContext, inTokens: number, outTokens: number): number {
  return (inTokens * ctx.text.inPerM + outTokens * ctx.text.outPerM) / 1_000_000;
}

export function gridCalls(pages: number, layout: "3x3" | "4x4"): number {
  return pages <= 0 ? 0 : Math.ceil(pages / GRID_CELLS[layout]);
}

/** Stage 1: a description from the story (only when there is none) and one picture. */
export function estimateHero(ctx: CostContext, o: { hasDescription: boolean; storyChars: number }): CostEstimate {
  const imageMock = ctx.image.mock;
  const textMock = !o.hasDescription || ctx.text.mock;
  if (imageMock && textMock) return { ...NONE("תמונה אחת של הגיבור", "One picture of the hero", false), mock: true };
  const textUsd = o.hasDescription || ctx.text.mock ? 0 : textCallUsd(ctx, 400 + tokensOf(Math.min(o.storyChars, 6000)), 300);
  const imageUsd = imageMock ? 0 : ctx.image.perImage;
  return {
    usd: textUsd + imageUsd,
    mock: false,
    free: false,
    confirmed: ctx.image.confirmed && (o.hasDescription || ctx.text.confirmed),
    covers: o.hasDescription
      ? "ציור תמונת הגיבור אחת לפי התיאור שכתבתם."
      : "כתיבת תיאור לגיבור לפי הסיפור, וציור תמונה אחת שלו.",
    coversEn: o.hasDescription
      ? "Drawing one picture of the hero from the description you wrote."
      : "Writing a description of the hero from the story, and drawing one picture of them.",
  };
}

/** Stage 2: outline, pages, review and a probable revision = 4 text calls. */
export function estimateStory(ctx: CostContext): CostEstimate {
  if (ctx.text.mock) return { ...NONE("כתיבת סיפור", "Writing a story", false), mock: true };
  const calls = 4;
  return {
    usd: calls * textCallUsd(ctx, 3000, 2500),
    mock: false,
    free: false,
    confirmed: ctx.text.confirmed,
    covers: "ארבע פניות לכותב: תכנון העלילה, כתיבת העמודים, בדיקה ותיקון.",
    coversEn: "Four calls to the writer: planning the plot, writing the pages, review and revision.",
  };
}

export function estimateStyle(): CostEstimate {
  return NONE(
    "בחירת סגנון היא בחינם: אין בה בינה מלאכותית. העלות באה רק כשמציירים.",
    "Choosing a style is free: it uses no AI. The cost comes only when drawing.",
  );
}

/** Stage 4: one text call for the scenes plus ceil(pages / cells) grid pictures. */
export function estimatePictures(
  ctx: CostContext,
  o: { missingPages: number; layout: "3x3" | "4x4"; textChars: number },
): CostEstimate {
  const calls = gridCalls(o.missingPages, o.layout);
  if (calls === 0) return NONE("אין עמודים לאייר", "No pages to illustrate", true);
  if (ctx.image.mock) return { ...NONE("איורים", "Illustrations", false), mock: true };
  const textUsd = ctx.text.mock ? 0 : textCallUsd(ctx, 1500 + tokensOf(o.textChars), 2000 + o.missingPages * 120);
  return {
    usd: textUsd + calls * ctx.image.perImage,
    mock: false,
    free: false,
    confirmed: ctx.image.confirmed && ctx.text.confirmed,
    covers: `${calls === 1 ? "תמונת רשת אחת" : `${calls} תמונות רשת`} (${o.layout === "3x3" ? "3×3" : "4×4"}) שנחתכות לעמודים, ופנייה אחת לכותב לתיאור הסצנות.`,
    coversEn: `${calls === 1 ? "One grid picture" : `${calls} grid pictures`} (${o.layout === "3x3" ? "3×3" : "4×4"}) cut into pages, and one call to the writer to describe the scenes.`,
  };
}

/** Stage 5: characters of text still without narration. */
export function estimateNarration(ctx: CostContext, o: { chars: number }): CostEstimate {
  if (ctx.tts.mock) return { ...NONE("הקראה", "Narration", false), mock: true };
  if (o.chars <= 0) return NONE("אין טקסט להקריא", "No text to narrate", true);
  return {
    usd: (o.chars / 1000) * ctx.tts.per1kChars,
    mock: false,
    free: false,
    confirmed: ctx.tts.confirmed,
    covers: `הקראה של כ-${o.chars} תווים בקול של Gemini, לפי אורך הטקסט והאודיו שנוצר.`,
    coversEn: `Narrating about ${o.chars} characters in a Gemini voice, priced by text and audio length.`,
  };
}

/** Stage 6: Dicta Nakdan is a free public service. */
export function estimateNikud(ctx: CostContext): CostEstimate {
  if (ctx.nikud.mock) return { ...NONE("ניקוד", "Nikud", false), mock: true };
  return NONE("הניקוד האוטומטי (דיקטה) הוא שירות חינמי.", "Automatic nikud (Dicta) is a free service.");
}

/** Stage 7: clips x seconds x price per second. */
export function estimateAnimation(ctx: CostContext, o: { clips: number; seconds?: number }): CostEstimate {
  if (o.clips <= 0) return NONE("אין איורים להנפיש", "No pictures to animate", true);
  if (ctx.video.mock) return { ...NONE("הנפשה", "Animation", false), mock: true };
  const seconds = o.seconds ?? ctx.video.clipSeconds;
  return {
    usd: o.clips * seconds * ctx.video.perSecond,
    mock: false,
    free: false,
    confirmed: ctx.video.confirmed,
    covers: `${o.clips === 1 ? "קליפ אחד" : `${o.clips} קליפים`} של ${seconds} שניות, לפי מחיר לשנייה.`,
    coversEn: `${o.clips === 1 ? "One clip" : `${o.clips} clips`} of ${seconds} seconds, priced per second.`,
  };
}

/** Stage 8: one small text call that reads the story and writes the details. */
export function estimateDetails(ctx: CostContext, o: { textChars: number }): CostEstimate {
  if (ctx.text.mock) return { ...NONE("פרטי הספר", "Book details", false), mock: true };
  return {
    usd: textCallUsd(ctx, 600 + tokensOf(Math.min(o.textChars, 12000)), 400),
    mock: false,
    free: false,
    confirmed: ctx.text.confirmed,
    covers: "פנייה אחת לכותב: קריאת הסיפור וכתיבת כותרת, תקציר, תגיות ושאלות לשיחה.",
    coversEn: "One call to the writer: reading the story and writing a title, summary, tags and discussion questions.",
  };
}

/** Sum of the estimates that are still to be done. */
export function sumEstimates(list: CostEstimate[]): { usd: number; confirmed: boolean; allMock: boolean } {
  const paid = list.filter((e) => !e.mock && !e.free);
  return {
    usd: list.reduce((total, e) => total + (e.mock ? 0 : e.usd), 0),
    confirmed: paid.every((e) => e.confirmed),
    allMock: paid.length === 0 && list.some((e) => e.mock),
  };
}

// ---------------------------------------------------------------------------
// Formatting (Hebrew by default; English for the English interface)
// ---------------------------------------------------------------------------

const FORMAT = {
  he: {
    underCent: "פחות מסנט",
    about: (usd: string, ils: string) => `כ-$${usd} (כ-${ils} ₪)`,
    freeDemo: "ללא עלות (מצב הדגמה)",
    free: "ללא עלות",
    estimate: (text: string) => `עלות משוערת: ${text}`,
    unconfirmed: "המחיר של המודל הזה לא אומת, ולכן ההערכה פחות מדויקת.",
    noRetries: "ההערכה לא כוללת ניסיונות חוזרים.",
    total: (text: string) => `עלות משוערת לכל הספר: ${text}`,
  },
  en: {
    underCent: "under a cent",
    about: (usd: string, ils: string) => `about $${usd} (about ₪${ils})`,
    freeDemo: "free (demo mode)",
    free: "free",
    estimate: (text: string) => `Estimated cost: ${text}`,
    unconfirmed: "This model's price is not verified, so the estimate is less precise.",
    noRetries: "The estimate does not include retries.",
    total: (text: string) => `Estimated cost for the whole book: ${text}`,
  },
} satisfies Record<CostLocale, unknown>;

/** "כ-$0.04 (כ-0.15 ₪)"; under half a cent: "פחות מסנט". */
export function formatUsdIls(usd: number, usdToIls: number, locale: CostLocale = "he"): string {
  const t = FORMAT[locale];
  if (usd < 0.005) return t.underCent;
  const ils = usd * usdToIls;
  return t.about(usd.toFixed(2), ils.toFixed(2));
}

export function formatEstimate(e: CostEstimate, ctx: Pick<CostContext, "usdToIls">, locale: CostLocale = "he"): string {
  const t = FORMAT[locale];
  if (e.mock) return t.freeDemo;
  if (e.free && e.usd === 0) return t.free;
  return formatUsdIls(e.usd, ctx.usdToIls, locale);
}

/** The muted line under an AI action. */
export function costLine(e: CostEstimate, ctx: Pick<CostContext, "usdToIls">, locale: CostLocale = "he"): string {
  return FORMAT[locale].estimate(formatEstimate(e, ctx, locale));
}

/** Tooltip / aria-description text. */
export function costDescription(e: CostEstimate, locale: CostLocale = "he"): string {
  const t = FORMAT[locale];
  const parts = [locale === "en" && e.coversEn ? e.coversEn : e.covers];
  if (!e.confirmed) parts.push(t.unconfirmed);
  parts.push(t.noRetries);
  return parts.join(" ");
}

export function totalLine(
  sum: { usd: number; allMock: boolean },
  ctx: Pick<CostContext, "usdToIls">,
  locale: CostLocale = "he",
): string {
  const t = FORMAT[locale];
  if (sum.allMock) return t.total(t.freeDemo);
  if (sum.usd === 0) return t.total(t.free);
  return t.total(formatUsdIls(sum.usd, ctx.usdToIls, locale));
}
