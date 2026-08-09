import "dotenv/config";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { locations } from "@/server/db/schema";
import { assessLocationReadiness } from "@/server/locations/assess-location-readiness";

const locationSlug = process.argv
  .slice(2)
  .find((argument) => argument !== "--");

async function main() {
  if (!locationSlug) {
    throw new Error(
      "Provide a location slug. Example: pnpm db:check-location-readiness -- one-ayala-terminal",
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [row] = await db
      .select({
        name: locations.name,
        slug: locations.slug,
        kind: locations.kind,
        city: locations.city,
        coordinates: locations.coordinates,
        verificationStatus: locations.verificationStatus,
        lastVerifiedAt: locations.lastVerifiedAt,
        sourceType: locations.sourceType,
        sourceExternalId: locations.sourceExternalId,
        sourceUrl: locations.sourceUrl,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(eq(locations.slug, locationSlug))
      .limit(1);

    if (!row) {
      throw new Error(`Location "${locationSlug}" was not found.`);
    }

    const result = assessLocationReadiness({
      ...row,
      longitude: row.coordinates.x,
      latitude: row.coordinates.y,
    });

    console.log(`Location: ${row.name}`);
    console.log(`Verification status: ${row.verificationStatus}`);
    console.log(`Currently active: ${row.isActive}`);

    if (!result.isReady) {
      console.error(
        `\nNot ready to activate. Found ${result.blockers.length} blocker(s):`,
      );

      for (const blocker of result.blockers) {
        console.error(`- ${blocker}`);
      }

      process.exitCode = 1;
      return;
    }

    console.log(
      "\nLocation readiness passed. This command did not modify the location.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
