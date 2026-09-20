export type SchemaColumn = {
  schema: string;
  table: string;
  column: string;
  type: string;
  notNull?: boolean;
  hasDefault?: boolean;
  primaryKey?: boolean;
};

export type SchemaGuardResult = {
  safe: boolean;
  errors: string[];
};

const typeAliases = new Map([
  ["serial", "integer"],
  ["serial4", "integer"],
  ["bigserial", "bigint"],
  ["serial8", "bigint"],
  ["smallserial", "smallint"],
  ["serial2", "smallint"],
  ["varchar", "character varying"],
  ["timestamp", "timestamp without time zone"],
  ["timestamptz", "timestamp with time zone"],
  ["int", "integer"],
  ["int4", "integer"],
  ["int8", "bigint"],
  ["bool", "boolean"],
  ["float8", "double precision"],
]);

export function normalizePostgresType(type: string): string {
  const normalized = type.toLowerCase().replace(/\s+/g, " ").trim();
  const base = normalized.replace(/\(.+\)$/, "");
  const suffix = normalized.slice(base.length);
  return `${typeAliases.get(base) ?? base}${suffix}`;
}

const tableKey = (column: SchemaColumn) => `${column.schema}.${column.table}`;
const columnKey = (column: SchemaColumn) =>
  `${tableKey(column)}.${column.column}`;

export function checkSchemaPush(
  current: SchemaColumn[],
  desired: SchemaColumn[],
  populatedTables: ReadonlySet<string> = new Set(),
): SchemaGuardResult {
  const desiredByColumn = new Map(
    desired.map((column) => [columnKey(column), column]),
  );
  const currentByColumn = new Map(
    current.map((column) => [columnKey(column), column]),
  );
  const currentTables = new Set(current.map(tableKey));
  const desiredTables = new Set(desired.map(tableKey));
  const errors: string[] = [];

  for (const table of currentTables) {
    if (!desiredTables.has(table)) {
      errors.push(`table ${table} would be dropped`);
    }
  }

  for (const column of current) {
    const desiredColumn = desiredByColumn.get(columnKey(column));
    if (!desiredColumn) {
      if (desiredTables.has(tableKey(column))) {
        errors.push(`column ${columnKey(column)} would be dropped or renamed`);
      }
      continue;
    }

    const currentType = normalizePostgresType(column.type);
    const desiredType = normalizePostgresType(desiredColumn.type);
    if (currentType !== desiredType) {
      errors.push(
        `column ${columnKey(column)} type would change from ${currentType} to ${desiredType}`,
      );
    }
    if (!column.notNull && desiredColumn.notNull) {
      errors.push(`column ${columnKey(column)} would become NOT NULL`);
    }
    if (column.primaryKey && !desiredColumn.primaryKey) {
      errors.push(`primary key on ${columnKey(column)} would be removed`);
    }
  }

  for (const column of desired) {
    const isAddedToExistingTable =
      currentTables.has(tableKey(column)) &&
      !currentByColumn.has(columnKey(column));
    if (
      isAddedToExistingTable &&
      column.notNull &&
      !column.hasDefault &&
      populatedTables.has(tableKey(column))
    ) {
      errors.push(
        `required column ${columnKey(column)} has no default; Drizzle would truncate the populated table`,
      );
    }
    if (
      isAddedToExistingTable &&
      current.some(
        (existing) =>
          tableKey(existing) === tableKey(column) &&
          !desiredByColumn.has(columnKey(existing)),
      )
    ) {
      errors.push(
        `table ${tableKey(column)} has both removed and added columns; resolve the possible rename explicitly`,
      );
      break;
    }
  }

  return { safe: errors.length === 0, errors: [...new Set(errors)] };
}