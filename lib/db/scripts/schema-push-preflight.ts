import { generateDrizzleJson } from "drizzle-kit/api";
import pg from "pg";
import * as schema from "../src/schema/index.ts";
import {
  checkSchemaPush,
  type SchemaColumn,
} from "./schema-push-guard.ts";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const snapshot = generateDrizzleJson(schema);
const desired: SchemaColumn[] = Object.values(snapshot.tables).flatMap(
  (table) =>
    Object.values(table.columns).map((column) => ({
      schema: table.schema || "public",
      table: table.name,
      column: column.name,
      type: column.type,
      notNull: column.notNull,
      hasDefault: typeof column.default !== "undefined",
      primaryKey:
        column.primaryKey ||
        Object.values(table.compositePrimaryKeys).some((key) =>
          key.columns.includes(column.name),
        ),
    })),
);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const result = await client.query<{
    schema: string;
    table: string;
    column: string;
    type: string;
    notNull: boolean;
    hasDefault: boolean;
    primaryKey: boolean;
  }>(`
    SELECT
      namespace.nspname AS schema,
      relation.relname AS table,
      attribute.attname AS column,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS type,
      attribute.attnotnull AS "notNull",
      attribute.atthasdef AS "hasDefault",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index
        WHERE index.indrelid = relation.oid
          AND index.indisprimary
          AND attribute.attnum = ANY(index.indkey)
      ) AS "primaryKey"
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE relation.relkind IN ('r', 'p')
      AND namespace.nspname = 'public'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    ORDER BY namespace.nspname, relation.relname, attribute.attnum
  `);

  const populatedTables = new Set<string>();
  for (const table of new Set(result.rows.map(({ schema, table }) => `${schema}.${table}`))) {
    const [schemaName, tableName] = table.split(".", 2);
    const populated = await client.query<{ populated: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM ${pg.escapeIdentifier(schemaName)}.${pg.escapeIdentifier(tableName)} LIMIT 1
      ) AS populated`,
    );
    if (populated.rows[0]?.populated) populatedTables.add(table);
  }

  const guard = checkSchemaPush(result.rows, desired, populatedTables);
  if (!guard.safe) {
    console.error(
      "Unsafe development schema change blocked before drizzle-kit push:",
    );
    for (const error of guard.errors) {
      console.error(`- ${error}`);
    }
    console.error(
      "Apply destructive changes through a reviewed migration instead of post-merge setup.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      "Schema preflight passed: no drops, type changes, or ambiguous renames detected.",
    );
  }
} finally {
  await client.end();
}