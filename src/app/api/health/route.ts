import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { jsonNoStore } from "@/server/http/json-no-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);

    return jsonNoStore(
      {
        status: "ok",
        checks: {
          database: "ok",
        },
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error("Database health check failed:", error);

    return jsonNoStore(
      {
        status: "unavailable",
        checks: {
          database: "unavailable",
        },
      },
      {
        status: 503,
      },
    );
  }
}
