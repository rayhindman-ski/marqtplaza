import assert from "node:assert/strict";
import { test } from "node:test";
import { isRecentAuthentication, RECENT_AUTH_WINDOW_MS } from "./recentAuth";

test("only a session issued in the previous ten minutes proves recent authentication", () => {
  const now = 1_800_000_000_000;
  assert.equal(isRecentAuthentication({ iat: now / 1000 }, now), true);
  assert.equal(isRecentAuthentication({ iat: (now - RECENT_AUTH_WINDOW_MS) / 1000 }, now), true);
  assert.equal(isRecentAuthentication({ iat: (now - RECENT_AUTH_WINDOW_MS - 1000) / 1000 }, now), false);
  assert.equal(isRecentAuthentication({ iat: (now + 1000) / 1000 }, now), false);
  assert.equal(isRecentAuthentication({}, now), false);
});