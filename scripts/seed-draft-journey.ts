import "dotenv/config";

import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { journeys, locations } from "@/server/db/schema";

const requiredLocationSlugs = ["one-ayala-terminal", "bgc-high-street"];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    const journey = await db.transaction(async (transaction) => {
      const locationRows = await transaction
        .select({
          id: locations.id,
          slug: locations.slug,
        })
        .from(locations)
        .where(inArray(locations.slug, requiredLocationSlugs));

      const locationsBySlug = new Map(
        locationRows.map((location) => [location.slug, location]),
      );

      const origin = locationsBySlug.get("one-ayala-terminal");
      const destination = locationsBySlug.get("bgc-high-street");

      if (!origin) {
        throw new Error('Required location "one-ayala-terminal" is missing.');
      }

      if (!destination) {
        throw new Error('Required location "bgc-high-street" is missing.');
      }

      const [seededJourney] = await transaction
        .insert(journeys)
        .values({
          slug: "one-ayala-to-bgc-high-street-via-bgc-bus",
          title: "One Ayala to BGC High Street via BGC Bus",
          summary:
            "Inactive draft journey using the BGC Bus North Route and the HSBC stop.",
          originLocationId: origin.id,
          destinationLocationId: destination.id,
          estimatedDurationMin: null,
          estimatedDurationMax: null,
          estimatedFareMinCentavos: null,
          estimatedFareMaxCentavos: null,
          status: "draft",
          lastVerifiedAt: null,
          isActive: false,
        })
        .onConflictDoUpdate({
          target: journeys.slug,
          set: {
            title: "One Ayala to BGC High Street via BGC Bus",
            summary:
              "Inactive draft journey using the BGC Bus North Route and the HSBC stop.",
            originLocationId: origin.id,
            destinationLocationId: destination.id,
            estimatedDurationMin: null,
            estimatedDurationMax: null,
            estimatedFareMinCentavos: null,
            estimatedFareMaxCentavos: null,
            status: "draft",
            lastVerifiedAt: null,
            isActive: false,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: journeys.id,
          slug: journeys.slug,
          title: journeys.title,
          status: journeys.status,
          isActive: journeys.isActive,
        });

      if (!seededJourney) {
        throw new Error("Failed to seed the draft journey.");
      }

      return seededJourney;
    });

    console.table([journey]);
    console.log(`Seeded inactive draft journey: ${journey.title}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
