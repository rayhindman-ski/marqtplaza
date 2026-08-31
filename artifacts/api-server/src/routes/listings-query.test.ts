import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allowsExternalQueries,
  normalizeNeighborhoods,
  normalizedListingsKey,
  parseAnonymousId,
  parseListingsMode,
  prepareEventsForMode,
} from "./listings";

describe("listings query persistence inputs", () => {
  it("defaults to live and only permits stored_only explicitly", () => {
    assert.equal(parseListingsMode(undefined), "live");
    assert.equal(parseListingsMode("live"), "live");
    assert.equal(parseListingsMode("stored_only"), "stored_only");
    assert.equal(parseListingsMode("unexpected"), "live");
  });

  it("never allows external provider work in stored-only mode", () => {
    assert.equal(allowsExternalQueries("live"), true);
    assert.equal(allowsExternalQueries("stored_only"), false);
  });

  it("accepts only bounded anonymous browser identifiers", () => {
    assert.equal(parseAnonymousId(" browser-id-123 "), "browser-id-123");
    assert.equal(parseAnonymousId("short"), undefined);
    assert.equal(parseAnonymousId("x".repeat(101)), undefined);
  });

  it("does not enqueue or call event translation in stored-only mode", async () => {
    const storedEvent = {
      id: 42,
      titleEn: "Stored event",
      descriptionEn: "Already translated and stored.",
    } as Parameters<typeof prepareEventsForMode>[0][number];
    let ensureCalls = 0;
    const prepared = await prepareEventsForMode(
      [storedEvent],
      "en",
      "stored_only",
      async () => {
        ensureCalls += 1;
        throw new Error("stored-only mode must not invoke translation");
      },
    );
    assert.equal(ensureCalls, 0);
    assert.deepEqual(prepared, [storedEvent]);
  });

  it("normalizes scope independently from neighborhood input order and casing", () => {
    const first = normalizeNeighborhoods(" Centrum, Scheveningen,centrum ");
    const second = normalizeNeighborhoods("scheveningen,CENTRUM");
    assert.deepEqual(first.map((value) => value.toLowerCase()), second.map((value) => value.toLowerCase()));
    assert.equal(
      normalizedListingsKey(" DHG ", "businesses", "nl", first),
      normalizedListingsKey("dhg", "businesses", "nl", second),
    );
  });
});