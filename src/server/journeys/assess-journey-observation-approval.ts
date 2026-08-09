import { isPublicVerificationCurrent } from "@/server/verification/verification-freshness";

export type JourneyObservationApprovalRecord = {
  journeyIsActive: boolean;
  observationOutcome: "confirmed" | "not_found" | "needs_follow_up";
  observationFinalizedAt: Date | null;
  observedAt: Date;
  actualDurationMinutes: number | null;
  actualFareCentavos: number | null;
  actualTransferCount: number | null;
  storedSegments: Array<{
    id: string;
    position: number;
    kind: "walking" | "transit";
  }>;
  observedSegments: Array<{
    journeySegmentId: string;
    position: number;
    kind: "walking" | "transit";
    actualDurationMinutes: number;
    actualFareCentavos: number | null;
    pathEwkt: string | null;
    stepCount: number;
  }>;
  unapprovedLocationNames: string[];
  unverifiedRouteNames: string[];
  routesWithoutCurrentSchedule: string[];
};

export function assessJourneyObservationApproval(
  record: JourneyObservationApprovalRecord,
  currentTime = new Date(),
) {
  const blockers: string[] = [];

  if (record.journeyIsActive) {
    blockers.push("This approval workflow only handles inactive journeys.");
  }
  if (record.observationOutcome !== "confirmed") {
    blockers.push('The journey observation outcome must be "confirmed".');
  }
  if (record.observationFinalizedAt === null) {
    blockers.push("The journey observation has not been finalized.");
  }
  if (!isPublicVerificationCurrent(record.observedAt, currentTime)) {
    blockers.push(
      "The journey field test is missing, stale, invalid, or future-dated.",
    );
  }
  if (
    record.actualDurationMinutes === null ||
    record.actualDurationMinutes < 1 ||
    record.actualFareCentavos === null ||
    record.actualFareCentavos < 0 ||
    record.actualTransferCount === null ||
    record.actualTransferCount < 0
  ) {
    blockers.push(
      "The field test needs valid duration, fare, and transfer totals.",
    );
  }
  if ((record.actualTransferCount ?? 0) > 1) {
    blockers.push("The journey exceeds the MVP limit of one transfer.");
  }

  const storedSegments = [...record.storedSegments].sort(
    (first, second) => first.position - second.position,
  );
  const observedSegments = [...record.observedSegments].sort(
    (first, second) => first.position - second.position,
  );

  if (
    storedSegments.length === 0 ||
    storedSegments.length !== observedSegments.length
  ) {
    blockers.push("The field test must include every stored journey segment.");
  } else {
    for (const [index, storedSegment] of storedSegments.entries()) {
      const observedSegment = observedSegments[index];
      if (
        !observedSegment ||
        storedSegment.position !== index + 1 ||
        observedSegment.position !== storedSegment.position ||
        observedSegment.journeySegmentId !== storedSegment.id ||
        observedSegment.kind !== storedSegment.kind
      ) {
        blockers.push(
          `Observed segment ${index + 1} does not match the stored journey segment.`,
        );
        continue;
      }
      if (!observedSegment.pathEwkt) {
        blockers.push(`Observed segment ${index + 1} needs a path.`);
      }
      if (observedSegment.stepCount < 1) {
        blockers.push(`Observed segment ${index + 1} needs instructions.`);
      }
      if (
        observedSegment.actualDurationMinutes < 1 ||
        (observedSegment.kind === "transit" &&
          (observedSegment.actualFareCentavos === null ||
            observedSegment.actualFareCentavos < 0)) ||
        (observedSegment.kind === "walking" &&
          observedSegment.actualFareCentavos !== null)
      ) {
        blockers.push(`Observed segment ${index + 1} has invalid estimates.`);
      }
    }
  }

  if (record.unapprovedLocationNames.length > 0) {
    blockers.push(
      `Journey locations need approved current verification: ${record.unapprovedLocationNames.join(", ")}.`,
    );
  }
  if (record.unverifiedRouteNames.length > 0) {
    blockers.push(
      `Journey routes need approved current verification: ${record.unverifiedRouteNames.join(", ")}.`,
    );
  }
  if (record.routesWithoutCurrentSchedule.length > 0) {
    blockers.push(
      `Journey routes need a current verified schedule: ${record.routesWithoutCurrentSchedule.join(", ")}.`,
    );
  }

  return { isApprovable: blockers.length === 0, blockers };
}
