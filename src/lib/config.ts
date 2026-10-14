/**
 * Server-side configuration read from environment variables.
 * Every external service is optional: when its variables are missing the
 * local / mock implementation is used.
 */
import path from "node:path";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

/** Root folder of local JSON data and media. Override with DATA_DIR (tests use a temp dir). */
export function dataDir(): string {
  return env("DATA_DIR") ? path.resolve(env("DATA_DIR") as string) : path.join(process.cwd(), "data");
}

export function supabaseConfig(): { url: string; anonKey: string; serviceRoleKey?: string } | null {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  return { url, anonKey, serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY") };
}

export function isSupabaseConfigured(): boolean {
  return supabaseConfig() !== null;
}

export function adminEmails(): string[] {
  return (env("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Books a parent may generate with AI per rolling 7 days. Default 1. */
export function aiWeeklyQuota(): number {
  const raw = Number(env("AI_WEEKLY_QUOTA"));
  return Number.isFinite(raw) && raw >= 0 ? raw : 1;
}

/** Shared secret for the scheduled daily-story endpoint. Undefined disables remote triggering. */
export function cronSecret(): string | undefined {
  return env("CRON_SECRET");
}

/** Public origin used for absolute links (share links, sitemap). */
export function siteUrl(): string {
  return (env("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
}

export const aiEnv = {
  anthropicApiKey: () => env("ANTHROPIC_API_KEY"),
  anthropicModel: () => env("ANTHROPIC_MODEL"),
  /** "dicta" enables the Dicta provider; anything else (or unset) uses the mock. */
  nikudProvider: () => env("NIKUD_PROVIDER"),
  dictaApiUrl: () => env("DICTA_API_URL"),
  /** Name of the TTS vendor implemented in providers/tts.ts; unset uses the mock. */
  ttsProvider: () => env("TTS_PROVIDER"),
  ttsApiKey: () => env("TTS_API_KEY"),
  ttsVoice: () => env("TTS_VOICE"),
  /**
   * Voice ids a caller may choose for narration, besides TTS_VOICE (comma
   * separated). Any other voice id in a request is refused, so nobody can
   * spend the account on premium voices.
   */
  ttsAllowedVoices: (): string[] =>
    [env("TTS_VOICE"), ...(env("TTS_ALLOWED_VOICES") ?? "").split(",")]
      .map((voice) => voice?.trim() ?? "")
      .filter((voice) => voice.length > 0),
  ttsRegion: () => env("TTS_REGION"),
  /** Name of the image vendor implemented in providers/image.ts; unset uses the mock. */
  imageProvider: () => env("IMAGE_PROVIDER"),
  imageApiKey: () => env("IMAGE_API_KEY"),
  imageModel: () => env("IMAGE_MODEL"),
  /** Name of the video vendor implemented in providers/video.ts ("gemini" = Veo); unset uses the mock. */
  videoProvider: () => env("VIDEO_PROVIDER"),
  /** Defaults to IMAGE_API_KEY when the image vendor is the same. */
  videoApiKey: () => env("VIDEO_API_KEY"),
  videoModel: () => env("VIDEO_MODEL"),
};
