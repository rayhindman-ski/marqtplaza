import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request } from "express";
import { isRecentAuthentication, isRecentSession, RECENT_AUTH_WINDOW_MS, requireRecentAuth } from "./recentAuth";

const now = 1_800_000_000_000;

test("fva proves factor verification age, never refreshed token iat", () => {
  assert.equal(isRecentAuthentication({ fva: [0, -1], iat: now / 1000 }, now), true);
  assert.equal(isRecentAuthentication({ fva: [10, -1] }, now), true);
  assert.equal(isRecentAuthentication({ fva: [11, -1] }, now), false);
  assert.equal(isRecentAuthentication({ fva: [-1, -1] }, now), false);
  assert.equal(isRecentAuthentication({ fva: [30, -1], iat: now / 1000 }, now), false);
  assert.equal(isRecentAuthentication({ iat: now / 1000 }, now), false);
  assert.equal(isRecentSession(now - RECENT_AUTH_WINDOW_MS, now), true);
  assert.equal(isRecentSession(now - RECENT_AUTH_WINDOW_MS - 1, now), false);
});

async function result(claims: unknown, createdAt: number | null): Promise<number> {
  let loadCount = 0;
  const middleware = requireRecentAuth({
    now: () => now,
    claims: () => claims,
    loadSession: async (sid) => {
      assert.equal(sid, "session-1");
      loadCount++;
      return createdAt === null ? null : { createdAt };
    },
  });
  const status = await new Promise<number>((resolve, reject) => {
    middleware({} as Request, {
      status(code: number) { return { json: () => resolve(code) }; },
    } as never, (error) => error ? reject(error) : resolve(200));
  });
  if (claims && typeof claims === "object" && "fva" in claims) assert.equal(loadCount, 0);
  return status;
}

test("middleware uses fva first, including refreshed tokens and invalid fva", async () => {
  assert.equal(await result({ fva: [0, -1], iat: now / 1000 }, null), 200);
  assert.equal(await result({ fva: [11, -1], iat: now / 1000, sid: "session-1" }, now), 401);
  assert.equal(await result({ fva: [-1, -1], sid: "session-1" }, now), 401);
});
test("without fva, only backend session creation proves authentication", async () => {
  assert.equal(await result({ sid: "session-1", iat: now / 1000 }, now - RECENT_AUTH_WINDOW_MS - 1), 401);
  assert.equal(await result({ sid: "session-1" }, now - 1000), 200);
  assert.equal(await result({ sid: "session-1" }, null), 401);
  assert.equal(await result({ iat: now / 1000 }, now), 401);
});