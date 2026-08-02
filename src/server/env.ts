import "server-only";

import { parseDatabaseUrl } from "@/config/database-url";

export const serverEnv = Object.freeze({
  DATABASE_URL: parseDatabaseUrl(process.env.DATABASE_URL),
});
