import "dotenv/config";

import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  locationFieldObservations,
  locations,
  locationVerificationDecisions,
} from "@/server/db/schema";

const locationSlug = process.argv
  .slice(2)
  .find((argument) => argument !== "--");

async function main() {
  if (!locationSlug) {
    throw new Error(
      "Provide a location slug. Example: pnpm db:report-location-verification-decisions -- one-ayala-terminal",
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

    const decisions = await db
      .select({
        decisionId: locationVerificationDecisions.id,
        observationId: locationFieldObservations.id,
        outcome: locationFieldObservations.outcome,
        observedAt: locationFieldObservations.observedAt,
        decision: locationVerificationDecisions.decision,
        reviewer: locationVerificationDecisions.reviewerLabel,
        reviewNotes: locationVerificationDecisions.notes,
        decidedAt: locationVerificationDecisions.decidedAt,
      })
      .from(locationVerificationDecisions)
      .innerJoin(
        locationFieldObservations,
        eq(
          locationVerificationDecisions.observationId,
          locationFieldObservations.id,
        ),
      )
      .where(eq(locationFieldObservations.locationId, location.id))
      .orderBy(desc(locationVerificationDecisions.decidedAt));

    console.log(`Location: ${location.name}`);
    console.log(`Verification status: ${location.verificationStatus}`);
    console.log(`Currently active: ${location.isActive}`);
    console.log(
      `Last verified at: ${location.lastVerifiedAt?.toISOString() ?? "none"}`,
    );
    console.table(
      decisions.map((decision) => ({
        ...decision,
        observedAt: decision.observedAt.toISOString(),
        decidedAt: decision.decidedAt.toISOString(),
      })),
    );
    console.log("Read-only decision report complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
