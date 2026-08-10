import "dotenv/config";

import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import {
  journeyFixtureLocationReplacements,
  journeys,
  locations,
} from "@/server/db/schema";

const journeySlug = process.argv.slice(2).find((argument) => argument !== "--");

async function main() {
  if (!journeySlug) {
    throw new Error(
      "Provide a journey slug. Example: pnpm db:report-journey-fixture-replacements -- one-ayala-to-bgc-high-street-via-bgc-bus",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const fixtureLocations = alias(locations, "fixture_locations");
  const replacementLocations = alias(locations, "replacement_locations");

  try {
    const [journey] = await db
      .select({ id: journeys.id, title: journeys.title })
      .from(journeys)
      .where(eq(journeys.slug, journeySlug))
      .limit(1);
    if (!journey) {
      throw new Error(`Journey "${journeySlug}" was not found.`);
    }

    const replacements = await db
      .select({
        fixture: fixtureLocations.name,
        replacement: replacementLocations.name,
        replacementSource: replacementLocations.sourceType,
        replacementExternalId: replacementLocations.sourceExternalId,
        confirmedBy: journeyFixtureLocationReplacements.confirmedBy,
        notes: journeyFixtureLocationReplacements.confirmationNotes,
        evidenceUrl: journeyFixtureLocationReplacements.evidenceUrl,
        confirmedAt: journeyFixtureLocationReplacements.confirmedAt,
      })
      .from(journeyFixtureLocationReplacements)
      .innerJoin(
        fixtureLocations,
        eq(
          journeyFixtureLocationReplacements.fixtureLocationId,
          fixtureLocations.id,
        ),
      )
      .innerJoin(
        replacementLocations,
        eq(
          journeyFixtureLocationReplacements.replacementLocationId,
          replacementLocations.id,
        ),
      )
      .where(eq(journeyFixtureLocationReplacements.journeyId, journey.id))
      .orderBy(asc(journeyFixtureLocationReplacements.confirmedAt));

    console.log(`Fixture replacement audit: ${journey.title}`);
    console.table(
      replacements.map((replacement) => ({
        ...replacement,
        replacementSource: `${replacement.replacementSource}:${replacement.replacementExternalId ?? "none"}`,
        confirmedAt: replacement.confirmedAt.toISOString(),
      })),
    );
    console.log("Read-only audit complete. No records were changed.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
