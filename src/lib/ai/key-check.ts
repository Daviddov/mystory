/**
 * Checks that each configured API key is accepted by its vendor, for the admin
 * health page. Server only. Each check lists models (free, no generation), so it
 * proves the key is valid but not that a given model still has quota left.
 * Keys are never returned.
 */
import "server-only";

export type KeyState = "ok" | "invalid" | "quota" | "error" | "missing";

export interface KeyCheckResult {
  /** The env var that holds the key. */
  envVar: string;
  /** What the key is used for, in Hebrew. */
  label: string;
  vendor: "gemini" | "anthropic";
  state: KeyState;
  /** Short detail for a failure, never the key. */
  detail?: string;
  ms?: number;
}

const KEYS: { envVar: string; label: string; vendor: "gemini" | "anthropic" }[] = [
  { envVar: "TEXT_API_KEY", label: "טקסט וניקוד (Gemini)", vendor: "gemini" },
  { envVar: "IMAGE_API_KEY", label: "איורים (Gemini)", vendor: "gemini" },
  { envVar: "TTS_API_KEY", label: "הקראה (Gemini)", vendor: "gemini" },
  { envVar: "VIDEO_API_KEY", label: "הנפשה (Veo)", vendor: "gemini" },
  { envVar: "ANTHROPIC_API_KEY", label: "Claude", vendor: "anthropic" },
];

const TIMEOUT_MS = 10_000;

function stateForStatus(status: number): KeyState {
  if (status >= 200 && status < 300) return "ok";
  if (status === 400 || status === 401 || status === 403) return "invalid";
  if (status === 429) return "quota";
  return "error";
}

async function ping(vendor: "gemini" | "anthropic", key: string): Promise<{ status: number; detail?: string }> {
  const request =
    vendor === "gemini"
      ? fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
          headers: { "x-goog-api-key": key },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      : fetch("https://api.anthropic.com/v1/models?limit=1", {
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
  const response = await request;
  if (response.ok) return { status: response.status };
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } | string } | null;
  const message = typeof body?.error === "string" ? body.error : body?.error?.message;
  return { status: response.status, detail: message?.slice(0, 160) ?? `HTTP ${response.status}` };
}

async function checkOne(entry: (typeof KEYS)[number]): Promise<KeyCheckResult> {
  const base = { envVar: entry.envVar, label: entry.label, vendor: entry.vendor };
  const key = process.env[entry.envVar]?.trim();
  if (!key) return { ...base, state: "missing" };
  const started = Date.now();
  try {
    const { status, detail } = await ping(entry.vendor, key);
    return { ...base, state: stateForStatus(status), detail, ms: Date.now() - started };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ...base, state: "error", detail: timedOut ? "timeout" : "no connection", ms: Date.now() - started };
  }
}

export async function checkApiKeys(): Promise<KeyCheckResult[]> {
  return Promise.all(KEYS.map(checkOne));
}
