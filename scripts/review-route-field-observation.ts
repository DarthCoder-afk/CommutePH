import "dotenv/config";

import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  locations,
  routeFieldObservations,
  routeFieldObservationStops,
  routeVerificationDecisions,
  transportRoutes,
  transportRouteSchedules,
  transportRouteStops,
} from "@/server/db/schema";
import { assessRouteObservationApproval } from "@/server/routes/assess-route-observation-approval";

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
      'Usage: pnpm db:review-route-field-observation -- <observation-id> <approved|rejected|needs_follow_up> --reviewer "Reviewer" --notes "Review explanation"',
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
        observationId: routeFieldObservations.id,
        transportRouteId: transportRoutes.id,
        routeName: transportRoutes.name,
        routeMode: transportRoutes.mode,
        routeOperator: transportRoutes.operator,
        routeSignboard: transportRoutes.signboard,
        routeIsActive: transportRoutes.isActive,
        observationOutcome: routeFieldObservations.outcome,
        observationFinalizedAt: routeFieldObservations.finalizedAt,
        observedAt: routeFieldObservations.observedAt,
        observedName: routeFieldObservations.observedName,
        observedMode: routeFieldObservations.observedMode,
        observedOperator: routeFieldObservations.observedOperator,
        observedSignboard: routeFieldObservations.observedSignboard,
        observedServiceDays: routeFieldObservations.serviceDays,
        observedOperatingHours: routeFieldObservations.operatingHours,
      })
      .from(routeFieldObservations)
      .innerJoin(
        transportRoutes,
        eq(routeFieldObservations.transportRouteId, transportRoutes.id),
      )
      .where(eq(routeFieldObservations.id, input.observationId))
      .limit(1);

    if (!record) {
      throw new Error(
        `Route field observation "${input.observationId}" was not found.`,
      );
    }

    const [existingDecision] = await db
      .select({ id: routeVerificationDecisions.id })
      .from(routeVerificationDecisions)
      .where(
        eq(
          routeVerificationDecisions.routeFieldObservationId,
          input.observationId,
        ),
      )
      .limit(1);
    if (existingDecision) {
      throw new Error(
        "This immutable observation already has a decision. Record a new route observation for follow-up review.",
      );
    }

    const observedStops = await db
      .select({
        position: routeFieldObservationStops.position,
        locationId: routeFieldObservationStops.locationId,
        canBoard: routeFieldObservationStops.canBoard,
        canAlight: routeFieldObservationStops.canAlight,
      })
      .from(routeFieldObservationStops)
      .where(
        eq(
          routeFieldObservationStops.routeFieldObservationId,
          record.observationId,
        ),
      )
      .orderBy(asc(routeFieldObservationStops.position));
    const storedStops = await db
      .select({
        position: transportRouteStops.position,
        locationId: transportRouteStops.locationId,
        canBoard: transportRouteStops.canBoard,
        canAlight: transportRouteStops.canAlight,
        locationVerificationStatus: locations.verificationStatus,
      })
      .from(transportRouteStops)
      .innerJoin(locations, eq(transportRouteStops.locationId, locations.id))
      .where(eq(transportRouteStops.transportRouteId, record.transportRouteId))
      .orderBy(asc(transportRouteStops.position));
    const storedSchedules = await db
      .select({
        id: transportRouteSchedules.id,
        serviceDays: transportRouteSchedules.serviceDays,
        operatingHours: transportRouteSchedules.operatingHours,
        isActive: transportRouteSchedules.isActive,
      })
      .from(transportRouteSchedules)
      .where(
        eq(transportRouteSchedules.transportRouteId, record.transportRouteId),
      );

    let matchingScheduleId: string | null = null;
    if (input.decision === "approved") {
      const assessment = assessRouteObservationApproval({
        ...record,
        observedStops,
        storedStops,
        storedSchedules,
      });
      if (!assessment.isApprovable) {
        throw new Error(
          `Route observation cannot be approved:\n${assessment.blockers.map((blocker) => `- ${blocker}`).join("\n")}`,
        );
      }
      matchingScheduleId = assessment.matchingScheduleId;
    }

    const decidedAt = new Date();
    const result = await db.transaction(async (transaction) => {
      const [decision] = await transaction
        .insert(routeVerificationDecisions)
        .values({
          routeFieldObservationId: record.observationId,
          decision: input.decision,
          reviewerLabel: input.reviewerLabel,
          notes: input.notes,
          decidedAt,
        })
        .returning({
          id: routeVerificationDecisions.id,
          decision: routeVerificationDecisions.decision,
        });

      if (input.decision === "approved") {
        if (!matchingScheduleId) {
          throw new Error("The approved observation has no matching schedule.");
        }
        await transaction
          .update(transportRoutes)
          .set({
            verificationStatus: "verified",
            lastVerifiedAt: record.observedAt,
            isActive: false,
            updatedAt: decidedAt,
          })
          .where(eq(transportRoutes.id, record.transportRouteId));
        await transaction
          .update(transportRouteSchedules)
          .set({
            lastVerifiedAt: record.observedAt,
            isActive: false,
            updatedAt: decidedAt,
          })
          .where(eq(transportRouteSchedules.id, matchingScheduleId));
      }

      return decision;
    });

    console.table([
      {
        decisionId: result?.id,
        route: record.routeName,
        decision: result?.decision,
      },
    ]);
    console.log(
      input.decision === "approved"
        ? "Route evidence approved. The route and matching schedule remain inactive and unpublished."
        : "Decision recorded. Route verification and activation state was not changed.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
