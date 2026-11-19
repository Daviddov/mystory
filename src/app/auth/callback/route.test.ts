/**
 * Where the emailed-link callback sends the visitor. A verified link whose code
 * cannot be exchanged in this browser, or a link opened a second time, must not
 * look like a failure: the address is already confirmed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  authMode: () => "supabase",
}));
vi.mock("@/lib/auth/supabase", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const { GET } = await import("./route");

async function landing(query: string): Promise<string> {
  try {
    await GET(new Request(`https://example.test/auth/callback${query}`));
  } catch (e) {
    const match = /^REDIRECT (.*)$/.exec((e as Error).message);
    if (match) return match[1]!;
    throw e;
  }
  throw new Error("no redirect");
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  verifyOtp.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("GET /auth/callback", () => {
  it("continues to next when the code exchange works", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    expect(await landing("?code=abc&next=%2Fstudio")).toBe("/studio");
  });

  it("says the address is confirmed when the code exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "code verifier missing" } });
    expect(await landing("?code=abc&next=%2Fstudio")).toBe("/auth/sign-in?notice=confirmed&next=%2Fstudio");
  });

  it("says the link was already used when Supabase sent no code", async () => {
    expect(await landing("?error=access_denied&error_code=otp_expired")).toBe("/auth/sign-in?notice=used");
    expect(await landing("")).toBe("/auth/sign-in?notice=used");
  });

  it("still reports a bad token_hash link as an error", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    expect(await landing("?token_hash=t&type=email")).toBe("/auth/sign-in?error=link");
  });
});
