import assert from "node:assert/strict";
import test from "node:test";

import { parseDatabaseUrl } from "./database-url";

test("accepts a PostgreSQL connection URL", () => {
  const value = "postgresql://commutemap:password@localhost:5432/commutemap_ph";

  assert.equal(parseDatabaseUrl(value), value);
});

test("accepts the postgres protocol alias", () => {
  const value = "postgres://commutemap:password@localhost:5432/commutemap_ph";

  assert.equal(parseDatabaseUrl(value), value);
});

test("trims surrounding whitespace", () => {
  const value = "postgresql://commutemap:password@localhost:5432/commutemap_ph";

  assert.equal(parseDatabaseUrl(`  ${value}  `), value);
});

test("rejects a missing database URL", () => {
  assert.throws(() => parseDatabaseUrl(undefined), /DATABASE_URL is required/);
});

test("rejects a non-PostgreSQL protocol", () => {
  assert.throws(
    () => parseDatabaseUrl("https://localhost:5432/commutemap_ph"),
    /must use the postgresql: or postgres: protocol/,
  );
});

test("rejects a URL without a database name", () => {
  assert.throws(
    () => parseDatabaseUrl("postgresql://commutemap:password@localhost:5432"),
    /must include a database name/,
  );
});
