import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { locationFieldObservations, locations } from "@/server/db/schema";
import { validateLocationFieldObservation } from "@/server/locations/validate-location-field-observation";

const inputPath = process.argv.slice(2).find((argument) => argument !== "--");

async function main() {
  if (!inputPath) {
    throw new Error(
      "Provide a JSON observation file. Example: pnpm db:record-location-field-observation -- ./field-observation.json",
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const input = validateLocationFieldObservation(
    JSON.parse(await readFile(resolve(inputPath), "utf8")),
  );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [location] = await db
      .select({
        id: locations.id,
        name: locations.name,
        slug: locations.slug,
        sourceType: locations.sourceType,
        verificationStatus: locations.verificationStatus,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(eq(locations.slug, input.locationSlug))
      .limit(1);

    if (!location) {
      throw new Error(`Location "${input.locationSlug}" was not found.`);
    }

    if (location.sourceType === "development_fixture") {
      throw new Error(
        "Development fixtures cannot receive production field-verification evidence.",
      );
    }

    const createdAt = new Date();
    const [observation] = await db
      .insert(locationFieldObservations)
      .values({
        locationId: location.id,
        outcome: input.outcome,
        observedAt: input.observedAt,
        observerLabel: input.observerLabel,
        notes: input.notes,
        observedName: input.observedName,
        observedKind: input.observedKind,
        observedCoordinates:
          input.longitude === null || input.latitude === null
            ? null
            : { x: input.longitude, y: input.latitude },
        accuracyMeters: input.accuracyMeters,
        evidenceUrl: input.evidenceUrl,
        createdAt,
      })
      .returning({
        id: locationFieldObservations.id,
        outcome: locationFieldObservations.outcome,
        observedAt: locationFieldObservations.observedAt,
        createdAt: locationFieldObservations.createdAt,
      });

    console.table([
      {
        observationId: observation?.id,
        location: location.name,
        outcome: observation?.outcome,
        observedAt: observation?.observedAt.toISOString(),
      },
    ]);
    console.log(
      `Location remains ${location.verificationStatus} and ${location.isActive ? "active" : "inactive"}.`,
    );
    console.log(
      "Evidence recorded. This command did not verify, activate, update, merge, or publish the location.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
