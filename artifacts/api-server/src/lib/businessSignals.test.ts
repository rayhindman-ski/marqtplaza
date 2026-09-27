import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeSignals, domainMatch, emailDomainMatch, duplicateScore, hostOf, kvkFormatOk, nameSimilarity, readSignals } from "./businessSignals";

describe("business verification signals (BVER-002, BPROF-007)", () => {
  it("checks the KvK format only", () => {
    assert.equal(kvkFormatOk("12345678"), true);
    assert.equal(kvkFormatOk(" 12345678 "), true);
    assert.equal(kvkFormatOk("1234567"), false);
    assert.equal(kvkFormatOk("1234567a"), false);
    assert.equal(kvkFormatOk(""), null);
    assert.equal(kvkFormatOk(null), null);
  });

  it("normalises hosts before comparing domains", () => {
    assert.equal(hostOf("https://www.Bakkerij-Jansen.nl/over-ons"), "bakkerij-jansen.nl");
    assert.equal(hostOf("bakkerij-jansen.nl"), "bakkerij-jansen.nl");
    assert.equal(hostOf("localhost"), null);
    assert.equal(hostOf("javascript:alert(1)"), null);
    assert.equal(domainMatch("bakkerij-jansen.nl", "https://www.bakkerij-jansen.nl/"), "match");
    assert.equal(domainMatch("shop.bakkerij-jansen.nl", "https://bakkerij-jansen.nl"), "match");
    assert.equal(domainMatch("andere-zaak.nl", "https://bakkerij-jansen.nl"), "mismatch");
    assert.equal(domainMatch(null, "https://bakkerij-jansen.nl"), "unknown");
    assert.equal(domainMatch("bakkerij-jansen.nl", null), "unknown");
  });

  it("scores duplicates by name overlap and ignores filler words", () => {
    assert.equal(nameSimilarity("Bakkerij Jansen", "bakkerij jansen b.v."), 1);
    assert.equal(nameSimilarity("De Koffiehoek", "Koffiehoek"), 1);
    assert.equal(nameSimilarity("Bakkerij Jansen", "Slagerij Pietersen"), 0);
    const result = duplicateScore("Bakkerij Jansen Centrum", [
      { name: "Slagerij Pietersen" },
      { name: "Bakkerij Jansen" },
      { name: "Jansen Fietsen" },
      { name: "Bakkerij Centrum Jansen" },
    ]);
    assert.equal(result.score, 1);
    assert.deepEqual(result.closest, ["Bakkerij Centrum Jansen", "Bakkerij Jansen", "Jansen Fietsen"]);
    assert.deepEqual(duplicateScore("Uniek", []), { score: 0, closest: [] });
  });

  it("produces a versioned, timestamped record that survives a round trip", () => {
    const now = new Date("2026-09-27T16:00:00.000Z");
    const signals = computeSignals({
      evidenceDomain: "koffiehoek.nl",
      evidenceKvk: "12345678",
      contactEmail: "eigenaar@koffiehoek.nl",
      profileName: "Koffie om de Hoek",
      profileWebsiteUrl: "https://www.koffiehoek.nl",
      websiteSelfReported: false,
      geographyBasis: null,
      candidates: [{ name: "Koffie Hoek" }],
      now,
    });
    assert.deepEqual(signals, {
      version: 1,
      domainMatch: "match",
      emailDomainMatch: "match",
      websiteSelfReported: false,
      geographyBasis: null,
      kvkFormatOk: true,
      duplicateScore: 0.67,
      duplicateCandidates: ["Koffie Hoek"],
      computedAt: now.toISOString(),
    });
    assert.deepEqual(readSignals(JSON.parse(JSON.stringify(signals))), signals);
    assert.equal(readSignals(null), null);
    assert.equal(readSignals({ version: 99 }), null);
  });

  it("treats public mailbox providers as unknown and business mailboxes as evidence", () => {
    assert.equal(emailDomainMatch("jan@gmail.com", "https://koffiehoek.nl"), "unknown");
    assert.equal(emailDomainMatch("jan@koffiehoek.nl", "https://www.koffiehoek.nl"), "match");
    assert.equal(emailDomainMatch("jan@anders.nl", "https://koffiehoek.nl"), "mismatch");
    assert.equal(emailDomainMatch("jan@koffiehoek.nl", null), "unknown");
  });
});
