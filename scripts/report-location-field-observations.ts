import "dotenv/config";

import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { locationFieldObservations, locations } from "@/server/db/schema";
import { getDistanceMeters } from "@/lib/geolocation/find-nearest-location";
import { isPublicVerificationCurrent } from "@/server/verification/verification-freshness";

const locationSlug = process.argv
  .slice(2)
  .find((argument) => argument !== "--");

async function main() {
  if (!locationSlug) {
    throw new Error(
      "Provide a location slug. Example: pnpm db:report-location-field-observations -- one-ayala-terminal",
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [location] = await db
      .select({
        id: locations.id,
        name: locations.name,
        kind: locations.kind,
        coordinates: locations.coordinates,
        verificationStatus: locations.verificationStatus,
        lastVerifiedAt: locations.lastVerifiedAt,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(eq(locations.slug, locationSlug))
      .limit(1);

    if (!location) {
      throw new Error(`Location "${locationSlug}" was not found.`);
    }

    const observations = await db
      .select()
      .from(locationFieldObservations)
      .where(eq(locationFieldObservations.locationId, location.id))
      .orderBy(desc(locationFieldObservations.observedAt));
    const currentTime = new Date();

    console.log(`Location: ${location.name}`);
    console.log(`Verification status: ${location.verificationStatus}`);
    console.log(`Currently active: ${location.isActive}`);
    console.log(`Field observations: ${observations.length}`);
    console.table(
      observations.map((observation) => {
        const distanceMeters = observation.observedCoordinates
          ? getDistanceMeters(
              {
                longitude: location.coordinates.x,
                latitude: location.coordinates.y,
              },
              {
                longitude: observation.observedCoordinates.x,
                latitude: observation.observedCoordinates.y,
              },
            )
          : null;

        return {
          observationId: observation.id,
          outcome: observation.outcome,
          observedAt: observation.observedAt.toISOString(),
          current: isPublicVerificationCurrent(
            observation.observedAt,
            currentTime,
          ),
          observer: observation.observerLabel,
          observedName: observation.observedName ?? "",
          nameMatches: observation.observedName
            ? observation.observedName.trim().toLocaleLowerCase() ===
              location.name.trim().toLocaleLowerCase()
            : "",
          observedKind: observation.observedKind ?? "",
          kindMatches: observation.observedKind
            ? observation.observedKind === location.kind
            : "",
          coordinateDifferenceMeters:
            distanceMeters === null ? "" : Math.round(distanceMeters),
          accuracyMeters: observation.accuracyMeters ?? "",
          evidenceUrl: observation.evidenceUrl ?? "",
          notes: observation.notes,
        };
      }),
    );
    console.log(
      "Read-only evidence report complete. Observations do not automatically verify or activate this location.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
