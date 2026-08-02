import "dotenv/config";
import { parseDatabaseUrl } from "@/config/database-url";

import { defineConfig } from "drizzle-kit";

const databaseUrl = parseDatabaseUrl(process.env.DATABASE_URL);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
});
