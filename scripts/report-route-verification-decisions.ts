import "dotenv/config";

import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  routeFieldObservations,
  routeVerificationDecisions,
  transportRoutes,
} from "@/server/db/schema";

const routeSlug = process.argv.slice(2).find((argument) => argument !== "--");

async function main() {
  if (!routeSlug) {
    throw new Error(
      "Provide a route slug. Example: pnpm db:report-route-verification-decisions -- bgc-bus-north-route",
    );
  }
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not defined.");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [route] = await db
      .select({
        id: transportRoutes.id,
        name: transportRoutes.name,
        verificationStatus: transportRoutes.verificationStatus,
        lastVerifiedAt: transportRoutes.lastVerifiedAt,
        isActive: transportRoutes.isActive,
      })
      .from(transportRoutes)
      .where(eq(transportRoutes.slug, routeSlug))
      .limit(1);
    if (!route)
      throw new Error(`Transport route "${routeSlug}" was not found.`);

    const decisions = await db
      .select({
        decisionId: routeVerificationDecisions.id,
        observationId: routeFieldObservations.id,
        outcome: routeFieldObservations.outcome,
        observedAt: routeFieldObservations.observedAt,
        decision: routeVerificationDecisions.decision,
        reviewer: routeVerificationDecisions.reviewerLabel,
        notes: routeVerificationDecisions.notes,
        decidedAt: routeVerificationDecisions.decidedAt,
      })
      .from(routeVerificationDecisions)
      .innerJoin(
        routeFieldObservations,
        eq(
          routeVerificationDecisions.routeFieldObservationId,
          routeFieldObservations.id,
        ),
      )
      .where(eq(routeFieldObservations.transportRouteId, route.id))
      .orderBy(desc(routeVerificationDecisions.decidedAt));

    console.log(`Route: ${route.name}`);
    console.log(`Verification status: ${route.verificationStatus}`);
    console.log(`Currently active: ${route.isActive}`);
    console.log(
      `Last verified at: ${route.lastVerifiedAt?.toISOString() ?? "none"}`,
    );
    console.table(
      decisions.map((decision) => ({
        ...decision,
        observedAt: decision.observedAt.toISOString(),
        decidedAt: decision.decidedAt.toISOString(),
      })),
    );
    console.log("Read-only route decision report complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
