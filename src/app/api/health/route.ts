import { sql } from "drizzle-orm";

import { db } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  try {
    await db.execute(sql`select 1`);

    return Response.json(
      {
        status: "ok",
        checks: {
          database: "ok",
        },
      },
      {
        status: 200,
        headers: responseHeaders,
      },
    );
  } catch (error) {
    console.error("Database health check failed:", error);

    return Response.json(
      {
        status: "unavailable",
        checks: {
          database: "unavailable",
        },
      },
      {
        status: 503,
        headers: responseHeaders,
      },
    );
  }
}
