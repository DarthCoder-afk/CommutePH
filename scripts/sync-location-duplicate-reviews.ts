import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { locationDuplicateReviews, locations } from "@/server/db/schema";
import { findLikelyLocationDuplicates } from "@/server/locations/find-likely-location-duplicates";
import { canonicalizeLocationPair } from "@/server/locations/location-duplicate-review";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const locationRows = await db
      .select({
        id: locations.id,
        name: locations.name,
        slug: locations.slug,
        coordinates: locations.coordinates,
      })
      .from(locations)
      .where(
        and(
          eq(locations.verificationStatus, "unverified"),
          eq(locations.isActive, false),
        ),
      );

    const candidates = findLikelyLocationDuplicates(
      locationRows.map((location) => ({
        id: location.id,
        name: location.name,
        slug: location.slug,
        longitude: location.coordinates.x,
        latitude: location.coordinates.y,
      })),
    );
    const existingReviews = await db.select().from(locationDuplicateReviews);
    const existingByPair = new Map(
      existingReviews.map((review) => [
        `${review.firstLocationId}:${review.secondLocationId}`,
        review,
      ]),
    );
    const detectedAt = new Date();
    let inserted = 0;
    let refreshedPending = 0;
    let preservedDecisions = 0;

    await db.transaction(async (transaction) => {
      for (const candidate of candidates) {
        const pair = canonicalizeLocationPair(
          candidate.first.id,
          candidate.second.id,
        );
        const key = `${pair.firstLocationId}:${pair.secondLocationId}`;
        const existing = existingByPair.get(key);
        const detection = {
          detectionReason: candidate.reason,
          detectedDistanceMeters: Math.round(candidate.distanceMeters),
          lastDetectedAt: detectedAt,
          updatedAt: detectedAt,
        } as const;

        if (!existing) {
          await transaction.insert(locationDuplicateReviews).values({
            ...pair,
            ...detection,
          });
          inserted += 1;
          continue;
        }

        await transaction
          .update(locationDuplicateReviews)
          .set(detection)
          .where(eq(locationDuplicateReviews.id, existing.id));

        if (existing.status === "pending") {
          refreshedPending += 1;
        } else {
          preservedDecisions += 1;
        }
      }
    });

    console.table({
      provisionalLocationsScanned: locationRows.length,
      duplicatePairsDetected: candidates.length,
      pendingReviewsInserted: inserted,
      pendingReviewsRefreshed: refreshedPending,
      existingDecisionsPreserved: preservedDecisions,
    });
    console.log(
      "Duplicate review queue synchronized. No locations were modified, activated, merged, or deleted.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
