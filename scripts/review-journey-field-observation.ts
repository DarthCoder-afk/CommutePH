import "dotenv/config";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  journeyFieldObservations,
  journeyFieldObservationSegments,
  journeyFieldObservationSteps,
  journeySegments,
  journeySources,
  journeySteps,
  journeys,
  locationFieldObservations,
  locations,
  locationVerificationDecisions,
  routeFieldObservations,
  routeVerificationDecisions,
  transportRoutes,
  transportRouteSchedules,
  transportRouteStops,
  journeyVerificationDecisions,
} from "@/server/db/schema";
import { assessJourneyObservationApproval } from "@/server/journeys/assess-journey-observation-approval";
import { isPublicVerificationCurrent } from "@/server/verification/verification-freshness";

const decisions = ["approved", "rejected", "needs_follow_up"] as const;
type Decision = (typeof decisions)[number];

function parseArguments(arguments_: string[]) {
  const values = arguments_.filter((argument) => argument !== "--");
  const observationId = values[0]?.trim();
  const decision = values[1]?.trim();
  const reviewerIndex = values.indexOf("--reviewer");
  const notesIndex = values.indexOf("--notes");
  const reviewerLabel =
    reviewerIndex === -1 || notesIndex === -1
      ? ""
      : values
          .slice(reviewerIndex + 1, notesIndex)
          .join(" ")
          .trim();
  const notes =
    notesIndex === -1
      ? ""
      : values
          .slice(notesIndex + 1)
          .join(" ")
          .trim();

  if (
    !observationId ||
    !decision ||
    reviewerIndex === -1 ||
    notesIndex === -1
  ) {
    throw new Error(
      'Usage: pnpm db:review-journey-field-observation -- <observation-id> <approved|rejected|needs_follow_up> --reviewer "Reviewer" --notes "Review explanation"',
    );
  }
  if (!decisions.includes(decision as Decision)) {
    throw new Error(`Decision must be one of: ${decisions.join(", ")}.`);
  }
  if (reviewerLabel.length < 2) {
    throw new Error("Reviewer label must contain at least 2 characters.");
  }
  if (notes.length < 20) {
    throw new Error("Review notes must contain at least 20 characters.");
  }
  return {
    observationId,
    decision: decision as Decision,
    reviewerLabel,
    notes,
  };
}

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not defined.");
  const input = parseArguments(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [record] = await db
      .select({
        observationId: journeyFieldObservations.id,
        journeyId: journeys.id,
        journeyTitle: journeys.title,
        journeyIsActive: journeys.isActive,
        originLocationId: journeys.originLocationId,
        destinationLocationId: journeys.destinationLocationId,
        observationOutcome: journeyFieldObservations.outcome,
        observationFinalizedAt: journeyFieldObservations.finalizedAt,
        observedAt: journeyFieldObservations.observedAt,
        observerLabel: journeyFieldObservations.observerLabel,
        observationNotes: journeyFieldObservations.notes,
        evidenceUrl: journeyFieldObservations.evidenceUrl,
        actualDurationMinutes: journeyFieldObservations.actualDurationMinutes,
        actualFareCentavos: journeyFieldObservations.actualFareCentavos,
        actualTransferCount: journeyFieldObservations.actualTransferCount,
      })
      .from(journeyFieldObservations)
      .innerJoin(journeys, eq(journeyFieldObservations.journeyId, journeys.id))
      .where(eq(journeyFieldObservations.id, input.observationId))
      .limit(1);
    if (!record) {
      throw new Error(
        `Journey field observation "${input.observationId}" was not found.`,
      );
    }

    const [existingDecision] = await db
      .select({ id: journeyVerificationDecisions.id })
      .from(journeyVerificationDecisions)
      .where(
        eq(
          journeyVerificationDecisions.journeyFieldObservationId,
          record.observationId,
        ),
      )
      .limit(1);
    if (existingDecision) {
      throw new Error(
        "This immutable observation already has a decision. Record a new journey field test for follow-up review.",
      );
    }

    const storedSegments = await db
      .select({
        id: journeySegments.id,
        position: journeySegments.position,
        kind: journeySegments.kind,
        walkingFromLocationId: journeySegments.walkingFromLocationId,
        walkingToLocationId: journeySegments.walkingToLocationId,
        boardingRouteStopId: journeySegments.boardingRouteStopId,
        alightingRouteStopId: journeySegments.alightingRouteStopId,
      })
      .from(journeySegments)
      .where(eq(journeySegments.journeyId, record.journeyId))
      .orderBy(asc(journeySegments.position));
    const observedSegments = await db
      .select({
        id: journeyFieldObservationSegments.id,
        journeySegmentId: journeyFieldObservationSegments.journeySegmentId,
        position: journeyFieldObservationSegments.position,
        kind: journeyFieldObservationSegments.kind,
        observedTransportRouteId:
          journeyFieldObservationSegments.observedTransportRouteId,
        actualDurationMinutes:
          journeyFieldObservationSegments.actualDurationMinutes,
        actualFareCentavos: journeyFieldObservationSegments.actualFareCentavos,
        pathEwkt: sql<string | null>`
          CASE
            WHEN ${journeyFieldObservationSegments.pathGeometry} IS NULL
              THEN NULL
            ELSE ST_AsEWKT(${journeyFieldObservationSegments.pathGeometry})
          END
        `,
      })
      .from(journeyFieldObservationSegments)
      .where(
        eq(
          journeyFieldObservationSegments.journeyFieldObservationId,
          record.observationId,
        ),
      )
      .orderBy(asc(journeyFieldObservationSegments.position));
    const observedSegmentIds = observedSegments.map((segment) => segment.id);
    const observedSteps =
      observedSegmentIds.length === 0
        ? []
        : await db
            .select({
              observationSegmentId:
                journeyFieldObservationSteps.journeyFieldObservationSegmentId,
              position: journeyFieldObservationSteps.position,
              instruction: journeyFieldObservationSteps.instruction,
            })
            .from(journeyFieldObservationSteps)
            .where(
              inArray(
                journeyFieldObservationSteps.journeyFieldObservationSegmentId,
                observedSegmentIds,
              ),
            )
            .orderBy(asc(journeyFieldObservationSteps.position));
    const observedSegmentsForAssessment = observedSegments.map((segment) => ({
      ...segment,
      stepCount: observedSteps.filter(
        (step) => step.observationSegmentId === segment.id,
      ).length,
    }));

    const routeStopIds = storedSegments.flatMap((segment) =>
      [segment.boardingRouteStopId, segment.alightingRouteStopId].filter(
        (id): id is string => id !== null,
      ),
    );
    const routeStops =
      routeStopIds.length === 0
        ? []
        : await db
            .select({
              id: transportRouteStops.id,
              locationId: transportRouteStops.locationId,
            })
            .from(transportRouteStops)
            .where(inArray(transportRouteStops.id, routeStopIds));
    const relatedLocationIds = [
      ...new Set([
        record.originLocationId,
        record.destinationLocationId,
        ...storedSegments.flatMap((segment) =>
          [segment.walkingFromLocationId, segment.walkingToLocationId].filter(
            (id): id is string => id !== null,
          ),
        ),
        ...routeStops.map((stop) => stop.locationId),
      ]),
    ];
    const locationRows = await db
      .select({
        id: locations.id,
        name: locations.name,
        verificationStatus: locations.verificationStatus,
        lastVerifiedAt: locations.lastVerifiedAt,
      })
      .from(locations)
      .where(inArray(locations.id, relatedLocationIds));
    const approvedLocationRows =
      relatedLocationIds.length === 0
        ? []
        : await db
            .select({
              locationId: locationFieldObservations.locationId,
              observedAt: locationFieldObservations.observedAt,
            })
            .from(locationVerificationDecisions)
            .innerJoin(
              locationFieldObservations,
              eq(
                locationVerificationDecisions.observationId,
                locationFieldObservations.id,
              ),
            )
            .where(eq(locationVerificationDecisions.decision, "approved"));
    const currentTime = new Date();
    const unapprovedLocationNames = locationRows
      .filter(
        (location) =>
          location.verificationStatus !== "verified" ||
          !isPublicVerificationCurrent(location.lastVerifiedAt, currentTime) ||
          !approvedLocationRows.some(
            (approval) =>
              approval.locationId === location.id &&
              approval.observedAt.getTime() ===
                location.lastVerifiedAt?.getTime(),
          ),
      )
      .map((location) => location.name);

    const routeIds = [
      ...new Set(
        observedSegments.flatMap((segment) =>
          segment.observedTransportRouteId
            ? [segment.observedTransportRouteId]
            : [],
        ),
      ),
    ];
    const routeRows =
      routeIds.length === 0
        ? []
        : await db
            .select({
              id: transportRoutes.id,
              name: transportRoutes.name,
              verificationStatus: transportRoutes.verificationStatus,
              lastVerifiedAt: transportRoutes.lastVerifiedAt,
            })
            .from(transportRoutes)
            .where(inArray(transportRoutes.id, routeIds));
    const routeApprovals =
      routeIds.length === 0
        ? []
        : await db
            .select({
              routeId: routeFieldObservations.transportRouteId,
              observedAt: routeFieldObservations.observedAt,
            })
            .from(routeVerificationDecisions)
            .innerJoin(
              routeFieldObservations,
              eq(
                routeVerificationDecisions.routeFieldObservationId,
                routeFieldObservations.id,
              ),
            )
            .where(eq(routeVerificationDecisions.decision, "approved"));
    const scheduleRows =
      routeIds.length === 0
        ? []
        : await db
            .select({
              transportRouteId: transportRouteSchedules.transportRouteId,
              lastVerifiedAt: transportRouteSchedules.lastVerifiedAt,
            })
            .from(transportRouteSchedules)
            .where(inArray(transportRouteSchedules.transportRouteId, routeIds));
    const unverifiedRouteNames = routeRows
      .filter(
        (route) =>
          route.verificationStatus !== "verified" ||
          !isPublicVerificationCurrent(route.lastVerifiedAt, currentTime) ||
          !routeApprovals.some(
            (approval) =>
              approval.routeId === route.id &&
              approval.observedAt.getTime() === route.lastVerifiedAt?.getTime(),
          ),
      )
      .map((route) => route.name);
    const routesWithoutCurrentSchedule = routeRows
      .filter(
        (route) =>
          !scheduleRows.some(
            (schedule) =>
              schedule.transportRouteId === route.id &&
              isPublicVerificationCurrent(schedule.lastVerifiedAt, currentTime),
          ),
      )
      .map((route) => route.name);

    if (input.decision === "approved") {
      const assessment = assessJourneyObservationApproval(
        {
          ...record,
          storedSegments: storedSegments.map(({ id, position, kind }) => ({
            id,
            position,
            kind,
          })),
          observedSegments: observedSegmentsForAssessment,
          unapprovedLocationNames,
          unverifiedRouteNames,
          routesWithoutCurrentSchedule,
        },
        currentTime,
      );
      if (!assessment.isApprovable) {
        throw new Error(
          `Journey observation cannot be approved:\n${assessment.blockers.map((blocker) => `- ${blocker}`).join("\n")}`,
        );
      }
    }

    const decidedAt = new Date();
    const result = await db.transaction(async (transaction) => {
      const [decision] = await transaction
        .insert(journeyVerificationDecisions)
        .values({
          journeyFieldObservationId: record.observationId,
          decision: input.decision,
          reviewerLabel: input.reviewerLabel,
          notes: input.notes,
          decidedAt,
        })
        .returning({
          id: journeyVerificationDecisions.id,
          decision: journeyVerificationDecisions.decision,
        });

      if (input.decision === "approved") {
        if (
          record.actualDurationMinutes === null ||
          record.actualFareCentavos === null
        ) {
          throw new Error("Approved journey evidence has incomplete totals.");
        }

        for (const observedSegment of observedSegments) {
          if (!observedSegment.pathEwkt) {
            throw new Error(
              `Approved segment ${observedSegment.position} has no path.`,
            );
          }
          await transaction
            .update(journeySegments)
            .set({
              estimatedDurationMin: observedSegment.actualDurationMinutes,
              estimatedDurationMax: observedSegment.actualDurationMinutes,
              estimatedFareMinCentavos: observedSegment.actualFareCentavos,
              estimatedFareMaxCentavos: observedSegment.actualFareCentavos,
              pathGeometry: observedSegment.pathEwkt,
              pathLastVerifiedAt: record.observedAt,
              updatedAt: decidedAt,
            })
            .where(eq(journeySegments.id, observedSegment.journeySegmentId));
        }

        const storedSegmentIds = storedSegments.map((segment) => segment.id);
        await transaction
          .delete(journeySteps)
          .where(inArray(journeySteps.journeySegmentId, storedSegmentIds));
        await transaction.insert(journeySteps).values(
          observedSteps.map((step) => {
            const observedSegment = observedSegments.find(
              (segment) => segment.id === step.observationSegmentId,
            );
            if (!observedSegment)
              throw new Error("Observed step segment is missing.");
            return {
              journeySegmentId: observedSegment.journeySegmentId,
              position: step.position,
              instruction: step.instruction,
              createdAt: decidedAt,
              updatedAt: decidedAt,
            };
          }),
        );
        await transaction.insert(journeySources).values({
          journeyId: record.journeyId,
          sourceType: "field_check",
          title: `Approved field test ${record.observedAt.toISOString()}`,
          publisher: record.observerLabel,
          url: record.evidenceUrl?.slice(0, 500) ?? null,
          checkedAt: record.observedAt,
          notes: record.observationNotes,
          createdAt: decidedAt,
          updatedAt: decidedAt,
        });
        await transaction
          .update(journeys)
          .set({
            estimatedDurationMin: record.actualDurationMinutes,
            estimatedDurationMax: record.actualDurationMinutes,
            estimatedFareMinCentavos: record.actualFareCentavos,
            estimatedFareMaxCentavos: record.actualFareCentavos,
            status: "verified",
            lastVerifiedAt: record.observedAt,
            isActive: false,
            updatedAt: decidedAt,
          })
          .where(eq(journeys.id, record.journeyId));
      }

      return decision;
    });

    console.table([
      {
        decisionId: result?.id,
        journey: record.journeyTitle,
        decision: result?.decision,
      },
    ]);
    console.log(
      input.decision === "approved"
        ? "Journey evidence approved. The journey remains inactive and unpublished."
        : "Decision recorded. Journey verification and activation state was not changed.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
