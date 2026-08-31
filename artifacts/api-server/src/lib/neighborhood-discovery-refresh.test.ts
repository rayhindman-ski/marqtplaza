import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchCityListingsFromOverpass,
  retryDelayMs,
  SCHEDULED_DISCOVERY_PROVIDERS,
  withBoundedBackoff,
} from "../routes/listings";
import {
  loadEligibleRefreshScopes,
  refreshEligibleScopes,
  runScheduledNeighborhoodDiscoveryRefresh,
  selectEligibleRefreshScopes,
} from "./neighborhood-discovery-refresh";

describe("neighborhood discovery refresh", () => {
  it("preserves the permanent Google allowance by scheduling only OpenStreetMap", () => {
    assert.deepEqual(SCHEDULED_DISCOVERY_PROVIDERS, ["openstreetmap"]);
  });

  it("deduplicates normalized scopes and excludes unsupported sections", () => {
    const scopes = selectEligibleRefreshScopes([
      { cityId: "dhg", section: "businesses", language: "nl", neighborhoods: ["Centrum"], normalizedKey: "one" },
      { cityId: "dhg", section: "businesses", language: "nl", neighborhoods: ["Centrum"], normalizedKey: "one" },
      { cityId: "dhg", section: "events", language: "nl", neighborhoods: [], normalizedKey: "events" },
    ]);
    assert.deepEqual(scopes, [{
      cityId: "dhg",
      section: "businesses",
      language: "nl",
      neighborhoods: ["Centrum"],
      normalizedKey: "one",
    }]);
  });

  it("uses bounded exponential backoff and honors Retry-After", () => {
    assert.equal(retryDelayMs(0), 1_000);
    assert.equal(retryDelayMs(8), 30_000);
    assert.equal(retryDelayMs(0, "5"), 5_000);
    assert.equal(retryDelayMs(0, "120"), 30_000);
  });

  it("retries provider failures without exceeding the attempt bound", async () => {
    let calls = 0;
    const value = await withBoundedBackoff(async () => {
      calls += 1;
      if (calls < 2) throw new Error("temporary");
      return "ok";
    }, 2);
    assert.equal(value, "ok");
    assert.equal(calls, 2);
  });

  it("selects only latest stale Den Haag business scopes before applying the limit", async () => {
    let statement = "";
    const cutoff = new Date("2026-08-30T00:00:00Z");
    const scopes = await loadEligibleRefreshScopes(cutoff, async (sql, values) => {
      statement = sql;
      assert.deepEqual(values, [cutoff, 20]);
      return {
        rows: [{
          cityId: "dhg",
          section: "food-drink",
          language: "en",
          neighborhoods: ["Centrum"],
          normalizedKey: "scope",
        }],
      };
    });
    assert.match(statement, /distinct on \(normalized_key\)/);
    assert.match(statement, /city_id = 'dhg'/);
    assert.match(statement, /where latest\.created_at < \$1/);
    assert.match(statement, /limit \$2/);
    assert.equal(scopes.length, 1);
  });

  it("rechecks freshness after claiming a scope and skips duplicate refreshes", async () => {
    const scope = {
      cityId: "dhg",
      section: "businesses" as const,
      language: "nl" as const,
      neighborhoods: [],
      normalizedKey: "scope",
    };
    let refreshes = 0;
    let releases = 0;
    let calls = 0;
    await refreshEligibleScopes([scope], new Date(), async () => ({
      query: async () => {
        calls += 1;
        if (calls === 1) return { rows: [{ acquired: true }] };
        if (calls === 2) return { rows: [{ exists: 1 }] };
        return { rows: [] };
      },
      release: () => {
        releases += 1;
      },
    }), async () => {
      refreshes += 1;
      return { status: "succeeded", providers: ["openstreetmap"] };
    });
    assert.equal(refreshes, 0);
    assert.equal(releases, 1);
    assert.equal(calls, 3);
  });

  it("does not retry non-rate-limit Overpass 4xx responses", async () => {
    let requests = 0;
    await assert.rejects(() => fetchCityListingsFromOverpass(
      { s: 1, w: 2, n: 3, e: 4 },
      {
        fetch: async () => {
          requests += 1;
          return new Response("", { status: 400 });
        },
        waitForSlot: async () => undefined,
        sleep: async () => undefined,
      },
    ), /Overpass HTTP 400/);
    assert.equal(requests, 1);
  });

  it("caps transient Overpass retries at three total requests", async () => {
    let requests = 0;
    await assert.rejects(() => fetchCityListingsFromOverpass(
      { s: 1, w: 2, n: 3, e: 4 },
      {
        fetch: async () => {
          requests += 1;
          return new Response("", { status: 503 });
        },
        waitForSlot: async () => undefined,
        sleep: async () => undefined,
      },
    ), /Overpass HTTP 503/);
    assert.equal(requests, 3);
  });

  it("contains scheduler-level database failures", async () => {
    await assert.doesNotReject(() => runScheduledNeighborhoodDiscoveryRefresh(async () => {
      throw new Error("database unavailable");
    }));
  });
});