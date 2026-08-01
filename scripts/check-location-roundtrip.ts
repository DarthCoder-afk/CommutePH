import "dotenv/config";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { locations } from "../src/server/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is missing. Add it to .env before checking locations.",
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
});

async function checkLocationRoundTrip() {
  const client = await pool.connect();
  const db = drizzle({ client });

  const testSlug = `temporary-location-${Date.now()}`;
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const [insertedLocation] = await db
      .insert(locations)
      .values({
        name: "Temporary Integration Test Location",
        slug: testSlug,
        kind: "landmark",
        description: "Temporary data used to test the database connection.",
        city: "Test City",
        area: "Test Area",
        coordinates: {
          x: 121,
          y: 14.6,
        },
      })
      .returning();

    if (!insertedLocation) {
      throw new Error("The location insert did not return a row.");
    }

    const [selectedLocation] = await db
      .select()
      .from(locations)
      .where(eq(locations.slug, testSlug))
      .limit(1);

    if (!selectedLocation) {
      throw new Error("The inserted location could not be read back.");
    }

    if (
      selectedLocation.coordinates.x !== 121 ||
      selectedLocation.coordinates.y !== 14.6
    ) {
      throw new Error(
        "The location coordinates changed during the round trip.",
      );
    }

    if (!selectedLocation.isActive) {
      throw new Error("The isActive database default was not applied.");
    }

    console.table([
      {
        id: selectedLocation.id,
        name: selectedLocation.name,
        longitude: selectedLocation.coordinates.x,
        latitude: selectedLocation.coordinates.y,
        isActive: selectedLocation.isActive,
      },
    ]);

    await client.query("ROLLBACK");
    transactionStarted = false;

    const remainingRows = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.slug, testSlug));

    if (remainingRows.length !== 0) {
      throw new Error("The temporary location remained after rollback.");
    }

    console.log("Location round-trip passed.");
    console.log("Temporary location was rolled back successfully.");
  } finally {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    client.release();
    await pool.end();
  }
}

checkLocationRoundTrip().catch((error: unknown) => {
  console.error("Location round-trip failed:", error);
  process.exitCode = 1;
});
