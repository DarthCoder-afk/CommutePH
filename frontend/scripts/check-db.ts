import "dotenv/config";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is missing. Add it to frontend/.env before checking the database.",
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
});

const db = drizzle({ client: pool });

async function checkDatabase() {
  try {
    const result = await db.execute(sql`
      SELECT
        current_database() AS database_name,
        current_user AS database_user,
        PostGIS_Version() AS postgis_version
    `);

    console.table(result.rows);
  } finally {
    await pool.end();
  }
}

checkDatabase().catch((error: unknown) => {
  console.error("Database check failed:", error);
  process.exitCode = 1;
});
