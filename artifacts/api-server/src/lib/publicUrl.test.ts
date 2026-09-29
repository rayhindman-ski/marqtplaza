import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePublicUrl, validPublicUrl } from "./businessRevisions";

describe("normalizePublicUrl", () => {
  it("implies https for a scheme-less website", () => {
    assert.equal(normalizePublicUrl("www.softknowledge.io"), "https://www.softknowledge.io/");
    assert.equal(normalizePublicUrl("  voorbeeld.nl/pad?x=1 "), "https://voorbeeld.nl/pad?x=1");
  });
  it("keeps explicit http(s) schemes", () => {
    assert.equal(normalizePublicUrl("http://voorbeeld.nl"), "http://voorbeeld.nl/");
    assert.equal(normalizePublicUrl("https://Voorbeeld.nl/A"), "https://voorbeeld.nl/A");
  });
  it("rejects other schemes, credentials, spaces and bare words", () => {
    for (const value of ["javascript:alert(1)", "ftp://voorbeeld.nl", "https://user:pw@voorbeeld.nl", "voorbeeld nl", "localhost", "voorbeeld.", "mailto:a@b.nl"]) {
      assert.equal(normalizePublicUrl(value), null, value);
      assert.equal(validPublicUrl(value), false, value);
    }
  });
  it("treats empty as valid but null", () => {
    assert.equal(normalizePublicUrl(""), null);
    assert.equal(validPublicUrl(""), true);
    assert.equal(validPublicUrl(null), true);
  });
});
