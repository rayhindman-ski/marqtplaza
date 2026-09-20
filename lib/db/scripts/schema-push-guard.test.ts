import assert from "node:assert/strict";
import test from "node:test";
import {
  checkSchemaPush,
  type SchemaColumn,
} from "./schema-push-guard.ts";

const column = (
  name: string,
  type = "text",
  table = "businesses",
  options: Partial<SchemaColumn> = {},
): SchemaColumn => ({
  schema: "public",
  table,
  column: name,
  type,
  ...options,
});

test("allows additive tables and columns", () => {
  const current = [column("id", "integer")];
  const desired = [
    column("id", "serial"),
    column("name"),
    column("id", "serial", "categories"),
  ];

  assert.deepEqual(checkSchemaPush(current, desired), {
    safe: true,
    errors: [],
  });
});

test("rejects table and column drops", () => {
  const current = [
    column("id", "integer"),
    column("legacy"),
    column("id", "integer", "obsolete"),
  ];
  const desired = [column("id", "serial")];
  const result = checkSchemaPush(current, desired);

  assert.equal(result.safe, false);
  assert.match(result.errors.join("\n"), /column public\.businesses\.legacy/);
  assert.match(result.errors.join("\n"), /table public\.obsolete/);
});

test("rejects type changes", () => {
  const result = checkSchemaPush(
    [column("rating", "integer")],
    [column("rating", "text")],
  );

  assert.equal(result.safe, false);
  assert.match(result.errors[0], /type would change from integer to text/);
});

test("rejects remove-and-add changes as an ambiguous rename", () => {
  const result = checkSchemaPush(
    [column("old_name")],
    [column("new_name")],
  );

  assert.equal(result.safe, false);
  assert.match(result.errors.join("\n"), /possible rename explicitly/);
});

test("rejects a required column without a default on a populated table", () => {
  const current = [column("id", "integer")];
  const desired = [
    column("id", "serial"),
    column("required_value", "text", "businesses", { notNull: true }),
  ];

  const result = checkSchemaPush(
    current,
    desired,
    new Set(["public.businesses"]),
  );

  assert.equal(result.safe, false);
  assert.match(result.errors.join("\n"), /would truncate the populated table/);
});

test("allows a required column with a default on a populated table", () => {
  const current = [column("id", "integer")];
  const desired = [
    column("id", "serial"),
    column("status", "text", "businesses", {
      notNull: true,
      hasDefault: true,
    }),
  ];

  assert.equal(
    checkSchemaPush(
      current,
      desired,
      new Set(["public.businesses"]),
    ).safe,
    true,
  );
});

test("allows a required column without a default on an empty table", () => {
  const current = [column("id", "integer")];
  const desired = [
    column("id", "serial"),
    column("required_value", "text", "businesses", { notNull: true }),
  ];

  assert.equal(checkSchemaPush(current, desired).safe, true);
});

test("rejects nullability tightening and primary-key removal", () => {
  const current = [
    column("id", "integer", "businesses", { primaryKey: true }),
    column("name"),
  ];
  const desired = [
    column("id", "serial"),
    column("name", "text", "businesses", { notNull: true }),
  ];
  const result = checkSchemaPush(current, desired);

  assert.equal(result.safe, false);
  assert.match(result.errors.join("\n"), /primary key/);
  assert.match(result.errors.join("\n"), /would become NOT NULL/);
});