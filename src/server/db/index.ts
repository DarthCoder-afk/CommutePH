import "server-only";

import { serverEnv } from "@/server/env";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const globalForDatabase = globalThis as typeof globalThis & {
  commuteMapDatabasePool?: Pool;
};

const pool =
  globalForDatabase.commuteMapDatabasePool ??
  new Pool({
    connectionString: serverEnv.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.commuteMapDatabasePool = pool;
}

export const db = drizzle(pool, {
  schema,
});
