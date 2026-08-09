import "dotenv/config";

import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  journeyFieldObservations,
  journeys,
  journeyVerificationDecisions,
} from "@/server/db/schema";

const journeySlug = process.argv.slice(2).find((argument) => argument !== "--");

async function main() {
  if (!journeySlug) {
    throw new Error(
      "Provide a journey slug. Example: pnpm db:report-journey-verification-decisions -- one-ayala-to-bgc-high-street-via-bgc-bus",
    );
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not defined.");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [journey] = await db
      .select({
        id: journeys.id,
        title: journeys.title,
        status: journeys.status,
        lastVerifiedAt: journeys.lastVerifiedAt,
        isActive: journeys.isActive,
      })
      .from(journeys)
      .where(eq(journeys.slug, journeySlug))
      .limit(1);
    if (!journey) throw new Error(`Journey "${journeySlug}" was not found.`);

    const decisions = await db
      .select({
        decisionId: journeyVerificationDecisions.id,
        observationId: journeyFieldObservations.id,
        outcome: journeyFieldObservations.outcome,
        observedAt: journeyFieldObservations.observedAt,
        decision: journeyVerificationDecisions.decision,
        reviewer: journeyVerificationDecisions.reviewerLabel,
        notes: journeyVerificationDecisions.notes,
        decidedAt: journeyVerificationDecisions.decidedAt,
      })
      .from(journeyVerificationDecisions)
      .innerJoin(
        journeyFieldObservations,
        eq(
          journeyVerificationDecisions.journeyFieldObservationId,
          journeyFieldObservations.id,
        ),
      )
      .where(eq(journeyFieldObservations.journeyId, journey.id))
      .orderBy(desc(journeyVerificationDecisions.decidedAt));

    console.log(`Journey: ${journey.title}`);
    console.log(`Status: ${journey.status}`);
    console.log(`Currently active: ${journey.isActive}`);
    console.log(
      `Last verified at: ${journey.lastVerifiedAt?.toISOString() ?? "none"}`,
    );
    console.table(
      decisions.map((decision) => ({
        ...decision,
        observedAt: decision.observedAt.toISOString(),
        decidedAt: decision.decidedAt.toISOString(),
      })),
    );
    console.log("Read-only journey decision report complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
