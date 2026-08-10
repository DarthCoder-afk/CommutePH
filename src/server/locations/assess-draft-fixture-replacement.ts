export type DraftFixtureReplacementRecord = {
  journeyStatus: "draft" | "verified" | "outdated";
  journeyIsActive: boolean;
  fixtureId: string;
  fixtureSourceType:
    "manual" | "openstreetmap" | "gtfs" | "development_fixture";
  fixtureIsActive: boolean;
  replacementId: string;
  replacementSourceType:
    "manual" | "openstreetmap" | "gtfs" | "development_fixture";
  replacementSourceExternalId: string | null;
  replacementSourceUrl: string | null;
  distanceMeters: number;
  walkingReferenceCount: number;
  routeStopReferenceCount: number;
  relatedRoutes: readonly {
    name: string;
    isActive: boolean;
    verificationStatus: "unverified" | "verified" | "outdated";
  }[];
  hasJourneyFieldEvidence: boolean;
  hasRouteFieldEvidence: boolean;
};

export const maximumFixtureReplacementDistanceMeters = 500;

function hasText(value: string | null) {
  return Boolean(value?.trim());
}

export function assessDraftFixtureReplacement(
  record: DraftFixtureReplacementRecord,
) {
  const blockers: string[] = [];

  if (record.journeyStatus !== "draft" || record.journeyIsActive) {
    blockers.push("Fixture replacement only supports inactive draft journeys.");
  }
  if (
    record.fixtureSourceType !== "development_fixture" ||
    record.fixtureIsActive
  ) {
    blockers.push("The old location must be an inactive development fixture.");
  }
  if (record.fixtureId === record.replacementId) {
    blockers.push("The replacement must be a different location.");
  }
  if (record.replacementSourceType === "development_fixture") {
    blockers.push("The replacement cannot be another development fixture.");
  }
  if (
    (record.replacementSourceType === "openstreetmap" ||
      record.replacementSourceType === "gtfs") &&
    (!hasText(record.replacementSourceExternalId) ||
      !hasText(record.replacementSourceUrl))
  ) {
    blockers.push("The sourced replacement needs stable provenance metadata.");
  }
  if (
    !Number.isFinite(record.distanceMeters) ||
    record.distanceMeters < 0 ||
    record.distanceMeters > maximumFixtureReplacementDistanceMeters
  ) {
    blockers.push(
      `The replacement must be within ${maximumFixtureReplacementDistanceMeters} meters of the fixture.`,
    );
  }
  if (record.walkingReferenceCount + record.routeStopReferenceCount === 0) {
    blockers.push("The fixture is not used by this journey.");
  }
  if (
    record.relatedRoutes.some(
      (route) => route.isActive || route.verificationStatus !== "unverified",
    )
  ) {
    blockers.push(
      "Every affected route must remain inactive and unverified during replacement.",
    );
  }
  if (record.hasJourneyFieldEvidence) {
    blockers.push(
      "The journey already has immutable field evidence; create a new draft instead of changing its dependencies.",
    );
  }
  if (record.hasRouteFieldEvidence) {
    blockers.push(
      "An affected route already has immutable field evidence; create a new route draft instead of changing its stops.",
    );
  }

  return { isAllowed: blockers.length === 0, blockers };
}
