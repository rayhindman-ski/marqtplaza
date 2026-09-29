import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("OPS-004 / PRIV-019 static leakage scan", () => {
  it("never introduces sensitive GET query parameters without explicit review", () => {
    const spec = readFileSync("../../lib/api-spec/openapi.yaml", "utf8");
    let path = "";
    let method = "";
    let name = "";
    const allowed = new Set([
      "/consumer-registration/verify:token",
      "/listings:searchLat", "/listings:searchLng",
    ]);
    const violations: string[] = [];
    for (const line of spec.split("\n")) {
      const route = /^  (\/[^:]+):/.exec(line);
      if (route) { path = route[1]!; method = ""; }
      if (/^    (get|post|put|patch|delete):/.test(line)) method = line.trim().slice(0, -1);
      const parameter = /^\s+- name: (\S+)/.exec(line);
      if (parameter) name = parameter[1]!;
      if (/^\s+in: query\s*$/.test(line) && method === "get" &&
        /(?:email|phone|token|lat|lng|userId)/i.test(name) && !allowed.has(`${path}:${name}`)) {
        violations.push(`${path}:${name}`);
      }
    }
    assert.deepEqual(violations, []);
  });
  it("web app has no analytics or telemetry emitter without a privacy review", () => {
    const root = "../../artifacts/buurtgids/src";
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) :
        /\.[jt]sx?$/.test(entry.name) ? [join(dir, entry.name)] : []);
    const emitters = walk(root).filter((file) =>
      /\b(?:gtag|plausible|analytics|telemetry|trackEvent)\s*(?:\(|\.|\[)|\.track\s*\(|(?:window\.)?dataLayer\.push\s*\(/i
        .test(readFileSync(file, "utf8")));
    assert.deepEqual(emitters, [], "new telemetry must be reviewed for sensitive payload fields first");
  });
});