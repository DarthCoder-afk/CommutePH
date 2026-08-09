import "dotenv/config";

import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  journeyFieldObservations,
  journeyFieldObservationSegments,
  journeyFieldObservationSteps,
  journeys,
  transportRoutes,
} from "@/server/db/schema";

const journeySlug = process.argv.slice(2).find((argument) => argument !== "--");

async function main() {
  if (!journeySlug) {
    throw new Error(
      "Provide a journey slug. Example: pnpm db:report-journey-field-observations -- one-ayala-to-bgc-high-street-via-bgc-bus",
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
        isActive: journeys.isActive,
      })
      .from(journeys)
      .where(eq(journeys.slug, journeySlug))
      .limit(1);
    if (!journey) throw new Error(`Journey "${journeySlug}" was not found.`);

    const observations = await db
      .select()
      .from(journeyFieldObservations)
      .where(eq(journeyFieldObservations.journeyId, journey.id))
      .orderBy(desc(journeyFieldObservations.observedAt));
    const observationIds = observations.map((observation) => observation.id);
    const segments =
      observationIds.length === 0
        ? []
        : await db
            .select({
              id: journeyFieldObservationSegments.id,
              observationId:
                journeyFieldObservationSegments.journeyFieldObservationId,
              position: journeyFieldObservationSegments.position,
              kind: journeyFieldObservationSegments.kind,
              routeSlug: transportRoutes.slug,
              durationMinutes:
                journeyFieldObservationSegments.actualDurationMinutes,
              fareCentavos: journeyFieldObservationSegments.actualFareCentavos,
              pathGeoJson: sql<string | null>`
                CASE
                  WHEN ${journeyFieldObservationSegments.pathGeometry} IS NULL
                    THEN NULL
                  ELSE ST_AsGeoJSON(${journeyFieldObservationSegments.pathGeometry})
                END
              `,
              notes: journeyFieldObservationSegments.notes,
            })
            .from(journeyFieldObservationSegments)
            .leftJoin(
              transportRoutes,
              eq(
                journeyFieldObservationSegments.observedTransportRouteId,
                transportRoutes.id,
              ),
            )
            .where(
              inArray(
                journeyFieldObservationSegments.journeyFieldObservationId,
                observationIds,
              ),
            )
            .orderBy(asc(journeyFieldObservationSegments.position));
    const segmentIds = segments.map((segment) => segment.id);
    const steps =
      segmentIds.length === 0
        ? []
        : await db
            .select({
              segmentId:
                journeyFieldObservationSteps.journeyFieldObservationSegmentId,
              position: journeyFieldObservationSteps.position,
              instruction: journeyFieldObservationSteps.instruction,
            })
            .from(journeyFieldObservationSteps)
            .where(
              inArray(
                journeyFieldObservationSteps.journeyFieldObservationSegmentId,
                segmentIds,
              ),
            )
            .orderBy(asc(journeyFieldObservationSteps.position));

    console.log(`Journey: ${journey.title}`);
    console.log(`Status: ${journey.status}`);
    console.log(`Currently active: ${journey.isActive}`);
    console.log(`Field observations: ${observations.length}`);
    console.table(
      observations.map((observation) => ({
        observationId: observation.id,
        outcome: observation.outcome,
        observedAt: observation.observedAt.toISOString(),
        observer: observation.observerLabel,
        durationMinutes: observation.actualDurationMinutes ?? "",
        fareCentavos: observation.actualFareCentavos ?? "",
        transfers: observation.actualTransferCount ?? "",
        segments: segments.filter(
          (segment) => segment.observationId === observation.id,
        ).length,
        evidenceUrl: observation.evidenceUrl ?? "",
        notes: observation.notes,
      })),
    );

    for (const observation of observations) {
      const observationSegments = segments.filter(
        (segment) => segment.observationId === observation.id,
      );
      if (observationSegments.length > 0) {
        console.log(`Segments for observation ${observation.id}:`);
        console.table(
          observationSegments.map((segment) => ({
            ...segment,
            steps: steps.filter((step) => step.segmentId === segment.id).length,
          })),
        );
      }
    }
    console.log(
      "Read-only evidence report complete. Field tests do not verify, activate, or publish journeys.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
