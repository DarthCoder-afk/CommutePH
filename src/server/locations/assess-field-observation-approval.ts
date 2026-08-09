import { getDistanceMeters } from "@/lib/geolocation/find-nearest-location";
import { isPublicVerificationCurrent } from "@/server/verification/verification-freshness";

export type FieldObservationApprovalRecord = {
  locationName: string;
  locationKind:
    "area" | "landmark" | "station" | "terminal" | "stop" | "entrance";
  locationLongitude: number;
  locationLatitude: number;
  sourceType: "manual" | "openstreetmap" | "gtfs" | "development_fixture";
  locationIsActive: boolean;
  observationOutcome: "confirmed" | "not_found" | "needs_follow_up";
  observedAt: Date;
  observedName: string | null;
  observedKind:
    "area" | "landmark" | "station" | "terminal" | "stop" | "entrance" | null;
  observedLongitude: number | null;
  observedLatitude: number | null;
  accuracyMeters: number | null;
  hasPendingDuplicateReview: boolean;
};

function normalizeName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function assessFieldObservationApproval(
  record: FieldObservationApprovalRecord,
  currentTime = new Date(),
) {
  const blockers: string[] = [];

  if (record.sourceType === "development_fixture") {
    blockers.push("Development fixtures cannot receive production approval.");
  }

  if (record.locationIsActive) {
    blockers.push("This approval workflow only handles inactive locations.");
  }

  if (record.observationOutcome !== "confirmed") {
    blockers.push('The field observation outcome must be "confirmed".');
  }

  if (!isPublicVerificationCurrent(record.observedAt, currentTime)) {
    blockers.push(
      "The field observation is missing, stale, invalid, or future-dated.",
    );
  }

  if (
    !record.observedName ||
    normalizeName(record.observedName) !== normalizeName(record.locationName)
  ) {
    blockers.push("The observed name does not match the stored location name.");
  }

  if (record.observedKind !== record.locationKind) {
    blockers.push("The observed location type does not match the stored type.");
  }

  if (
    record.accuracyMeters === null ||
    !Number.isInteger(record.accuracyMeters) ||
    record.accuracyMeters < 1 ||
    record.accuracyMeters > 100
  ) {
    blockers.push("Approval requires GPS accuracy between 1 and 100 meters.");
  }

  const coordinateDifferenceMeters =
    record.observedLongitude === null || record.observedLatitude === null
      ? null
      : getDistanceMeters(
          {
            longitude: record.locationLongitude,
            latitude: record.locationLatitude,
          },
          {
            longitude: record.observedLongitude,
            latitude: record.observedLatitude,
          },
        );
  const maximumDifferenceMeters = Math.max(record.accuracyMeters ?? 0, 25);

  if (
    coordinateDifferenceMeters === null ||
    coordinateDifferenceMeters > maximumDifferenceMeters
  ) {
    blockers.push(
      `The observed coordinates must be within ${maximumDifferenceMeters} meters of the stored coordinates.`,
    );
  }

  if (record.hasPendingDuplicateReview) {
    blockers.push(
      "A likely-duplicate review is still pending for this location.",
    );
  }

  return {
    isApprovable: blockers.length === 0,
    blockers,
    coordinateDifferenceMeters,
    maximumDifferenceMeters,
  };
}
