import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";
import { createTempData, type TempData } from "@/test/temp-data";
import { POST } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost:3000/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

let data: TempData;
beforeEach(async () => {
  data = await createTempData({ setEnv: true });
  resetRateLimits();
});
afterEach(async () => {
  await data.cleanup();
});

describe("POST /api/waitlist", () => {
  it("stores a lower-cased e-mail and merges interests on a second sign-up", async () => {
    expect((await POST(req({ email: " Mom@Example.com ", interests: ["credits"] }))).status).toBe(200);
    expect((await POST(req({ email: "mom@example.com", interests: ["print", "credits"] }))).status).toBe(200);
    const list = await data.repo.listWaitlist();
    expect(list).toHaveLength(1);
    expect(list[0].email).toBe("mom@example.com");
    expect([...list[0].interests].sort()).toEqual(["credits", "print"]);
  });

  it("rejects a bad address and unknown interests", async () => {
    expect((await POST(req({ email: "nope", interests: ["credits"] }))).status).toBe(400);
    expect((await POST(req({ email: "a@b.co", interests: ["gold"] }))).status).toBe(400);
    expect((await POST(req({ email: "a@b.co", interests: [] }))).status).toBe(400);
    expect(await data.repo.listWaitlist()).toHaveLength(0);
  });

  it("limits sign-ups per address of the caller", async () => {
    let last = 200;
    for (let i = 0; i < 12; i++) last = (await POST(req({ email: `u${i}@b.co`, interests: ["print"] }))).status;
    expect(last).toBe(429);
  });
});
