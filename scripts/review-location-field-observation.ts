import "dotenv/config";

import { and, eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  locationDuplicateReviews,
  locationFieldObservations,
  locations,
  locationVerificationDecisions,
} from "@/server/db/schema";
import { assessFieldObservationApproval } from "@/server/locations/assess-field-observation-approval";

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
      'Usage: pnpm db:review-location-field-observation -- <observation-id> <approved|rejected|needs_follow_up> --reviewer "Reviewer" --notes "Review explanation"',
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
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined.");
  }

  const input = parseArguments(process.argv.slice(2));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    const [record] = await db
      .select({
        observationId: locationFieldObservations.id,
        locationId: locations.id,
        locationName: locations.name,
        locationKind: locations.kind,
        locationCoordinates: locations.coordinates,
        sourceType: locations.sourceType,
        locationIsActive: locations.isActive,
        observationOutcome: locationFieldObservations.outcome,
        observedAt: locationFieldObservations.observedAt,
        observedName: locationFieldObservations.observedName,
        observedKind: locationFieldObservations.observedKind,
        observedCoordinates: locationFieldObservations.observedCoordinates,
        accuracyMeters: locationFieldObservations.accuracyMeters,
      })
      .from(locationFieldObservations)
      .innerJoin(
        locations,
        eq(locationFieldObservations.locationId, locations.id),
      )
      .where(eq(locationFieldObservations.id, input.observationId))
      .limit(1);

    if (!record) {
      throw new Error(
        `Field observation "${input.observationId}" was not found.`,
      );
    }

    const [existingDecision] = await db
      .select({ id: locationVerificationDecisions.id })
      .from(locationVerificationDecisions)
      .where(
        eq(locationVerificationDecisions.observationId, input.observationId),
      )
      .limit(1);

    if (existingDecision) {
      throw new Error(
        "This immutable observation already has a decision. Record a new field observation for any follow-up review.",
      );
    }

    const [pendingDuplicate] = await db
      .select({ id: locationDuplicateReviews.id })
      .from(locationDuplicateReviews)
      .where(
        and(
          eq(locationDuplicateReviews.status, "pending"),
          or(
            eq(locationDuplicateReviews.firstLocationId, record.locationId),
            eq(locationDuplicateReviews.secondLocationId, record.locationId),
          ),
        ),
      )
      .limit(1);

    if (input.decision === "approved") {
      const assessment = assessFieldObservationApproval({
        locationName: record.locationName,
        locationKind: record.locationKind,
        locationLongitude: record.locationCoordinates.x,
        locationLatitude: record.locationCoordinates.y,
        sourceType: record.sourceType,
        locationIsActive: record.locationIsActive,
        observationOutcome: record.observationOutcome,
        observedAt: record.observedAt,
        observedName: record.observedName,
        observedKind: record.observedKind,
        observedLongitude: record.observedCoordinates?.x ?? null,
        observedLatitude: record.observedCoordinates?.y ?? null,
        accuracyMeters: record.accuracyMeters,
        hasPendingDuplicateReview: Boolean(pendingDuplicate),
      });

      if (!assessment.isApprovable) {
        throw new Error(
          `Observation cannot be approved:\n${assessment.blockers.map((blocker) => `- ${blocker}`).join("\n")}`,
        );
      }
    }

    const decidedAt = new Date();
    const result = await db.transaction(async (transaction) => {
      const [decision] = await transaction
        .insert(locationVerificationDecisions)
        .values({
          observationId: input.observationId,
          decision: input.decision,
          reviewerLabel: input.reviewerLabel,
          notes: input.notes,
          decidedAt,
        })
        .returning({
          id: locationVerificationDecisions.id,
          decision: locationVerificationDecisions.decision,
          decidedAt: locationVerificationDecisions.decidedAt,
        });

      if (input.decision === "approved") {
        await transaction
          .update(locations)
          .set({
            verificationStatus: "verified",
            lastVerifiedAt: record.observedAt,
            isActive: false,
            updatedAt: decidedAt,
          })
          .where(eq(locations.id, record.locationId));
      }

      return decision;
    });

    console.table([
      {
        decisionId: result?.id,
        location: record.locationName,
        decision: result?.decision,
        decidedAt: result?.decidedAt.toISOString(),
      },
    ]);
    console.log(
      input.decision === "approved"
        ? "Evidence approved. The location is verified but remains inactive and unpublished."
        : "Decision recorded. The location verification and activation state was not changed.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
