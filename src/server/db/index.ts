import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined.");
}

const globalForDatabase = globalThis as typeof globalThis & {
  commuteMapDatabasePool?: Pool;
};

const pool =
  globalForDatabase.commuteMapDatabasePool ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.commuteMapDatabasePool = pool;
}

export const db = drizzle(pool, {
  schema,
});
